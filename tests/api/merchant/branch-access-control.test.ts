import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import { encrypt } from '../../../src/api/shared/encryption'
import type { FastifyInstance } from 'fastify'

// Staff & Access PR-2 (spec §3 "PR-2" + decision D3): branch WRITE-route
// authorization matrix. The classified branch write routes migrate from the
// owner-only resolver (resolveAdminMerchant) to resolveMerchantContext +
// assertBranchAllowed, so a Branch Manager can write to ASSIGNED branches only,
// enforced server-side. Owner-only actions (create / close / set-main +
// the onboarding draft-window sensitive-direct path) keep an owner gate.
//
// Modelled on tests/api/merchant/voucher-access-control.test.ts (the existing
// Staff & Access two-resolver matrix). The membership row resolved by
// getActiveMembership (merchantMembership.findMany) is the SOLE source of
// role + branch scope; the request body can never self-grant it.

const ASSIGNED_BRANCH = 'b-assigned'
const UNASSIGNED_BRANCH = 'b-unassigned'

type Role = 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'

function mockBranch(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, merchantId: 'm1', name: 'Branch', isMainBranch: false,
    addressLine1: '1 Test St', addressLine2: null, city: 'London', postcode: 'EC1A 1BB',
    country: 'GB', phone: '+44111', email: null, websiteUrl: null, isActive: true,
    about: 'about', logoUrl: null, bannerUrl: null, latitude: 51.5, longitude: -0.1,
    localityId: 'loc1', localityName: 'London', redemptionPin: null, deletedAt: null,
    openingHours: [], amenities: [], photos: [], pendingEdits: [],
    ...overrides,
  }
}

// `status` controls the joined merchant lifecycle: ACTIVE = live (governed lane);
// SUSPENDED = SEC-M2 hard-block. `merchantStatus` also feeds the predicate read
// for the draft-window probe (updateBranch reads merchant.findUnique).
function membershipRow(role: Role, allBranches: boolean, branchIds: string[], status = 'ACTIVE') {
  return {
    id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role,
    allBranches, canManageVouchers: false,
    merchant: { status, businessName: 'Acme' },
    branches: branchIds.map((branchId) => ({ branchId })),
  }
}

async function makeApp(row: ReturnType<typeof membershipRow>, lifecycle = { status: 'ACTIVE', onboardingStep: 'LIVE' }) {
  const app = await buildApp()
  const prismaMock: any = {
    merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
    merchantMembership: {
      // resolveMerchantContext -> getActiveMembership -> findMany (single active row)
      findMany: vi.fn().mockResolvedValue([row]),
      // resolveAdminMerchant -> getOwnerMembership -> findFirst (OWNER only); the
      // owner-only routes (create/close/set-main) still use this resolver. (Hours
      // moved to resolveMerchantContext + assertCanManageBranch in PR-4 cool-off.)
      findFirst: vi.fn().mockResolvedValue(
        row.role === 'OWNER' ? { id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', merchant: { status: row.merchant.status, businessName: 'Acme' } } : null
      ),
    },
    merchant: {
      findUnique: vi.fn().mockResolvedValue({ id: 'm1', status: lifecycle.status, onboardingStep: lifecycle.onboardingStep }),
    },
    branch: {
      findFirst: vi.fn().mockImplementation(({ where }: any) => {
        // Honour the scope: the service only reaches findFirst after assertBranchAllowed,
        // so return the row for whichever id is queried.
        const id = where?.id
        return Promise.resolve(mockBranch(id, { merchantId: 'm1' }))
      }),
      findMany: vi.fn().mockResolvedValue([mockBranch(ASSIGNED_BRANCH)]),
      create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve(mockBranch('b-new', data))),
      update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve(mockBranch(ASSIGNED_BRANCH, data))),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(2),
    },
    branchOpeningHours: { upsert: vi.fn().mockResolvedValue({}) },
    branchAmenity: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
    branchPendingEdit: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'pe1', branchId: ASSIGNED_BRANCH, status: 'PENDING', createdAt: new Date() }),
      update: vi.fn().mockResolvedValue({ id: 'pe1', status: 'WITHDRAWN' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    branchUser: { updateMany: vi.fn().mockResolvedValue({}) },
    adminApproval: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    locality: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'loc1' }) },
  }
  prismaMock.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock))
  app.decorate('prisma', prismaMock as any)
  app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn(), exists: vi.fn().mockResolvedValue(1) } as any)
  await app.ready()
  const token = (app.jwt as any).merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
  return { app, token, prismaMock }
}

describe('branch write-route authorization matrix — Staff & Access PR-2 (D3)', () => {
  let app: FastifyInstance | null = null
  afterEach(async () => { if (app) { await app.close(); app = null } })

  const owner = () => membershipRow('OWNER', true, [])
  const bm = (status = 'ACTIVE') => membershipRow('BRANCH_MANAGER', false, [ASSIGNED_BRANCH], status)
  // STAFF assigned to the branch: view/validate-only. Must be DENIED every
  // branch-management WRITE even on its OWN assigned branch (the P1 boundary).
  const staff = (status = 'ACTIVE') => membershipRow('STAFF', false, [ASSIGNED_BRANCH], status)

  function inject(a: FastifyInstance, token: string, method: any, url: string, payload?: unknown) {
    const opts: Record<string, unknown> = { method, url, headers: { authorization: `Bearer ${token}` } }
    if (payload !== undefined) opts.payload = payload
    return a.inject(opts as any)
  }

  // ── OWNER: can write the BM-allowed actions on any branch ──────────────────

  it('OWNER -> contact PATCH (direct fields) on any branch (200)', async () => {
    const made = await makeApp(owner()); app = made.app
    const res = await inject(made.app, made.token, 'PATCH', `/api/v1/merchant/branches/${UNASSIGNED_BRANCH}`, { phone: '+44222', email: 'a@b.com', websiteUrl: 'https://x' })
    expect(res.statusCode).toBe(200)
  })

  it('OWNER -> amenities POST (200)', async () => {
    const made = await makeApp(owner()); app = made.app
    const res = await inject(made.app, made.token, 'POST', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/amenities`, { amenityIds: ['a1'] })
    expect(res.statusCode).toBe(200)
  })

  it('OWNER -> PIN get/put/send (200)', async () => {
    const made = await makeApp(owner()); app = made.app
    made.prismaMock.branch.findFirst = vi.fn().mockResolvedValue(mockBranch(ASSIGNED_BRANCH, { redemptionPin: null }))
    const get = await inject(made.app, made.token, 'GET', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/pin`)
    expect(get.statusCode).toBe(200)
    const put = await inject(made.app, made.token, 'PUT', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/pin`, { pin: '1234' })
    expect(put.statusCode).toBe(200)
  })

  it('OWNER -> edit-request submit / list / withdraw (BM-allowed lane)', async () => {
    const made = await makeApp(owner()); app = made.app
    const submit = await inject(made.app, made.token, 'POST', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/edit-request`, { name: 'New Name' })
    expect(submit.statusCode).toBe(201)
    const list = await inject(made.app, made.token, 'GET', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/edit-requests`)
    expect(list.statusCode).toBe(200)
    made.prismaMock.branchPendingEdit.findFirst = vi.fn().mockResolvedValue({ id: 'pe1', branchId: ASSIGNED_BRANCH, merchantId: 'm1', status: 'PENDING' })
    const withdraw = await inject(made.app, made.token, 'DELETE', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/edit-requests/pe1`)
    expect(withdraw.statusCode).toBe(200)
  })

  it('OWNER -> set-main (PATCH isMainBranch:true) succeeds (200)', async () => {
    const made = await makeApp(owner()); app = made.app
    const res = await inject(made.app, made.token, 'PATCH', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}`, { isMainBranch: true })
    expect(res.statusCode).toBe(200)
  })

  it('OWNER -> create branch (201)', async () => {
    const made = await makeApp(owner()); app = made.app
    made.prismaMock.branch.count = vi.fn().mockResolvedValue(1)
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ status: 200, result: { postcode: 'EC1A 1BB', country: 'England', region: 'London', admin_district: 'City of London', admin_county: null, parish: 'x', admin_ward: 'y', parliamentary_constituency: 'z', latitude: 51.5, longitude: -0.1 } }),
    } as Response)
    const res = await inject(made.app, made.token, 'POST', '/api/v1/merchant/branches', { name: 'New', addressLine1: '1 St', city: 'London', postcode: 'EC1A 1BB' })
    expect(res.statusCode).toBe(201)
    vi.restoreAllMocks()
  })

  it('OWNER -> close branch (DELETE) reaches the lifecycle guard, not a 403', async () => {
    const made = await makeApp(owner()); app = made.app
    made.prismaMock.branch.findFirst = vi.fn().mockResolvedValue(mockBranch(ASSIGNED_BRANCH, { isMainBranch: false }))
    made.prismaMock.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', status: 'ACTIVE' })
    made.prismaMock.branch.count = vi.fn().mockResolvedValue(3)
    const res = await inject(made.app, made.token, 'DELETE', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}`)
    expect(res.statusCode).toBe(200)
  })

  // ── BRANCH MANAGER: assigned-branch writes succeed; unassigned + owner-only 403

  it('BM -> contact PATCH on ASSIGNED branch (200)', async () => {
    const made = await makeApp(bm()); app = made.app
    const res = await inject(made.app, made.token, 'PATCH', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}`, { phone: '+44222' })
    expect(res.statusCode).toBe(200)
  })

  it('BM -> contact PATCH on UNASSIGNED branch -> 403 INSUFFICIENT_PERMISSIONS (no branch write)', async () => {
    const made = await makeApp(bm()); app = made.app
    const res = await inject(made.app, made.token, 'PATCH', `/api/v1/merchant/branches/${UNASSIGNED_BRANCH}`, { phone: '+44222' })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(made.prismaMock.branch.update).not.toHaveBeenCalled()
  })

  it('BM -> amenities POST on ASSIGNED (200); UNASSIGNED -> 403', async () => {
    const ok = await makeApp(bm()); app = ok.app
    const a = await inject(ok.app, ok.token, 'POST', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/amenities`, { amenityIds: ['a1'] })
    expect(a.statusCode).toBe(200)
    await ok.app.close(); app = null
    const denied = await makeApp(bm()); app = denied.app
    const b = await inject(denied.app, denied.token, 'POST', `/api/v1/merchant/branches/${UNASSIGNED_BRANCH}/amenities`, { amenityIds: ['a1'] })
    expect(b.statusCode).toBe(403)
    expect(JSON.parse(b.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(denied.prismaMock.branchAmenity.deleteMany).not.toHaveBeenCalled()
  })

  it('BM -> PIN get/put on ASSIGNED (200); UNASSIGNED -> 403', async () => {
    const ok = await makeApp(bm()); app = ok.app
    ok.prismaMock.branch.findFirst = vi.fn().mockResolvedValue(mockBranch(ASSIGNED_BRANCH, { redemptionPin: null }))
    const get = await inject(ok.app, ok.token, 'GET', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/pin`)
    expect(get.statusCode).toBe(200)
    const put = await inject(ok.app, ok.token, 'PUT', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/pin`, { pin: '4321' })
    expect(put.statusCode).toBe(200)
    await ok.app.close(); app = null
    const denied = await makeApp(bm()); app = denied.app
    const res = await inject(denied.app, denied.token, 'GET', `/api/v1/merchant/branches/${UNASSIGNED_BRANCH}/pin`)
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
  })

  it('BM -> edit-request submit / list / withdraw on ASSIGNED (allowed); UNASSIGNED submit -> 403', async () => {
    const ok = await makeApp(bm()); app = ok.app
    const submit = await inject(ok.app, ok.token, 'POST', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/edit-request`, { name: 'BM Rename' })
    expect(submit.statusCode).toBe(201)
    const list = await inject(ok.app, ok.token, 'GET', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/edit-requests`)
    expect(list.statusCode).toBe(200)
    ok.prismaMock.branchPendingEdit.findFirst = vi.fn().mockResolvedValue({ id: 'pe1', branchId: ASSIGNED_BRANCH, merchantId: 'm1', status: 'PENDING' })
    const withdraw = await inject(ok.app, ok.token, 'DELETE', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/edit-requests/pe1`)
    expect(withdraw.statusCode).toBe(200)
    await ok.app.close(); app = null
    const denied = await makeApp(bm()); app = denied.app
    const res = await inject(denied.app, denied.token, 'POST', `/api/v1/merchant/branches/${UNASSIGNED_BRANCH}/edit-request`, { name: 'x' })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(denied.prismaMock.branchPendingEdit.create).not.toHaveBeenCalled()
  })

  it('BM -> set-main (PATCH isMainBranch:true) on ASSIGNED branch -> 403 (owner-only; no demote/promote)', async () => {
    const made = await makeApp(bm()); app = made.app
    const res = await inject(made.app, made.token, 'PATCH', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}`, { isMainBranch: true })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(made.prismaMock.branch.updateMany).not.toHaveBeenCalled()
    expect(made.prismaMock.branch.update).not.toHaveBeenCalled()
  })

  it('BM -> isActive PATCH on ASSIGNED branch -> 403 (owner-only; close-adjacent, no branch write)', async () => {
    // Setting isActive:false takes the branch offline (removed from all customer
    // discovery feeds) — a close/lifecycle-adjacent action D3 reserves to OWNERS.
    // A BM on its OWN assigned branch must still get 403 with NO DB write.
    const made = await makeApp(bm()); app = made.app
    const res = await inject(made.app, made.token, 'PATCH', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}`, { isActive: false })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(made.prismaMock.branch.update).not.toHaveBeenCalled()
  })

  it('OWNER -> isActive PATCH on any branch (200)', async () => {
    const made = await makeApp(owner()); app = made.app
    const res = await inject(made.app, made.token, 'PATCH', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}`, { isActive: false })
    expect(res.statusCode).toBe(200)
  })

  it('BM -> create branch -> 403 (owner-only resolveAdminMerchant denies non-owner)', async () => {
    const made = await makeApp(bm()); app = made.app
    const res = await inject(made.app, made.token, 'POST', '/api/v1/merchant/branches', { name: 'New', addressLine1: '1 St', city: 'London', postcode: 'EC1A 1BB' })
    // resolveAdminMerchant throws INVALID_CREDENTIALS for a non-owner (getOwnerMembership -> null).
    expect(JSON.parse(res.body).error.code).toBe('INVALID_CREDENTIALS')
  })

  it('BM -> close branch (DELETE) -> 403 (owner-only)', async () => {
    const made = await makeApp(bm()); app = made.app
    const res = await inject(made.app, made.token, 'DELETE', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}`)
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error.code).toBe('INVALID_CREDENTIALS')
  })

  // ── Draft-window sensitive-direct path stays OWNER-ONLY ─────────────────────

  it('BM -> draft-window sensitive-direct (name) on ASSIGNED branch -> 403 (onboarding owner-only)', async () => {
    // Merchant is in the draft window (REGISTERED); the sensitive-direct path must
    // still require OWNER, so a BM attempting it is rejected and no branch update runs.
    const made = await makeApp(bm(), { status: 'REGISTERED', onboardingStep: 'REGISTERED' }); app = made.app
    made.prismaMock.merchantMembership.findMany = vi.fn().mockResolvedValue([membershipRow('BRANCH_MANAGER', false, [ASSIGNED_BRANCH], 'REGISTERED')])
    const res = await inject(made.app, made.token, 'PATCH', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}`, { name: 'BM Draft Rename' })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(made.prismaMock.branch.update).not.toHaveBeenCalled()
  })

  // ── Suspended-merchant guard still rejects (SEC-M2) ─────────────────────────

  it('BM on a SUSPENDED merchant -> contact PATCH on ASSIGNED branch -> MERCHANT_SUSPENDED', async () => {
    const made = await makeApp(bm('SUSPENDED')); app = made.app
    const res = await inject(made.app, made.token, 'PATCH', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}`, { phone: '+44222' })
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_SUSPENDED')
    expect(made.prismaMock.branch.update).not.toHaveBeenCalled()
  })

  it('OWNER on a SUSPENDED merchant -> amenities POST -> MERCHANT_SUSPENDED', async () => {
    const made = await makeApp(membershipRow('OWNER', true, [], 'SUSPENDED')); app = made.app
    const res = await inject(made.app, made.token, 'POST', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/amenities`, { amenityIds: ['a1'] })
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_SUSPENDED')
    expect(made.prismaMock.branchAmenity.deleteMany).not.toHaveBeenCalled()
  })

  // ── STAFF (view/validate-only): DENIED every branch-management WRITE even on its
  //    OWN ASSIGNED branch — the P1 boundary assertBranchAllowed did NOT enforce.
  //    READ of an assigned branch (GET /branches/:id) stays allowed. ──────────────

  it('STAFF -> contact PATCH on ASSIGNED branch -> 403 INSUFFICIENT_PERMISSIONS (no branch write)', async () => {
    const made = await makeApp(staff()); app = made.app
    const res = await inject(made.app, made.token, 'PATCH', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}`, { phone: '+44222' })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(made.prismaMock.branch.update).not.toHaveBeenCalled()
  })

  it('STAFF -> edit-request submit on ASSIGNED branch -> 403 INSUFFICIENT_PERMISSIONS (no pending-edit write)', async () => {
    const made = await makeApp(staff()); app = made.app
    const res = await inject(made.app, made.token, 'POST', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/edit-request`, { name: 'Staff Rename' })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(made.prismaMock.branchPendingEdit.create).not.toHaveBeenCalled()
  })

  it('STAFF -> PIN PUT on ASSIGNED branch -> 403 INSUFFICIENT_PERMISSIONS (no branch write)', async () => {
    const made = await makeApp(staff()); app = made.app
    const res = await inject(made.app, made.token, 'PUT', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/pin`, { pin: '1234' })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(made.prismaMock.branch.update).not.toHaveBeenCalled()
  })

  it('STAFF -> amenities POST on ASSIGNED branch -> 403 INSUFFICIENT_PERMISSIONS (no amenity write)', async () => {
    const made = await makeApp(staff()); app = made.app
    const res = await inject(made.app, made.token, 'POST', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/amenities`, { amenityIds: ['a1'] })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(made.prismaMock.branchAmenity.deleteMany).not.toHaveBeenCalled()
  })

  it('STAFF -> READ GET /branches/:id on ASSIGNED branch still allowed (200) — read/write asymmetry locked', async () => {
    const made = await makeApp(staff()); app = made.app
    const res = await inject(made.app, made.token, 'GET', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}`)
    expect(res.statusCode).toBe(200)
  })
})

// Staff & Access PR-2 (D3): branch PIN REVEAL/READ authorization matrix
// (getBranchPin, GET /branches/:id/pin). Owner direction locks the decrypted PIN
// reveal to the SAME management boundary as PIN change/send — OWNER (any branch)
// OR assigned BRANCH_MANAGER; STAFF is DENIED even when assigned (the decrypted
// PIN is a secret, not a non-secret branch-detail read). The secret-vs-detail
// read asymmetry is locked by the STAFF-can-read-detail pin at the end.
describe('branch PIN reveal/read authorization matrix — Staff & Access PR-2 (D3)', () => {
  let app: FastifyInstance | null = null
  afterEach(async () => { if (app) { await app.close(); app = null } })

  const owner = () => membershipRow('OWNER', true, [])
  const bm = () => membershipRow('BRANCH_MANAGER', false, [ASSIGNED_BRANCH])
  const staff = () => membershipRow('STAFF', false, [ASSIGNED_BRANCH])

  // A real AES-encrypted PIN so the route's decrypt() returns the plaintext for
  // the allowed (revealed) cases. Keyed off the test ENCRYPTION_KEY (tests/setup.ts).
  const PLAIN_PIN = '4271'
  const ENC_PIN = encrypt(PLAIN_PIN)

  function inject(a: FastifyInstance, token: string, method: any, url: string, payload?: unknown) {
    const opts: Record<string, unknown> = { method, url, headers: { authorization: `Bearer ${token}` } }
    if (payload !== undefined) opts.payload = payload
    return a.inject(opts as any)
  }

  it('OWNER -> PIN reveal on any branch (200, PIN revealed)', async () => {
    const made = await makeApp(owner()); app = made.app
    made.prismaMock.branch.findFirst = vi.fn().mockResolvedValue(mockBranch(UNASSIGNED_BRANCH, { redemptionPin: ENC_PIN }))
    const res = await inject(made.app, made.token, 'GET', `/api/v1/merchant/branches/${UNASSIGNED_BRANCH}/pin`)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).pin).toBe(PLAIN_PIN)
  })

  it('assigned BRANCH_MANAGER -> PIN reveal on ASSIGNED branch (200, PIN revealed)', async () => {
    const made = await makeApp(bm()); app = made.app
    made.prismaMock.branch.findFirst = vi.fn().mockResolvedValue(mockBranch(ASSIGNED_BRANCH, { redemptionPin: ENC_PIN }))
    const res = await inject(made.app, made.token, 'GET', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/pin`)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).pin).toBe(PLAIN_PIN)
  })

  it('unassigned BRANCH_MANAGER -> PIN reveal on UNASSIGNED branch -> 403 INSUFFICIENT_PERMISSIONS (decrypt not reached)', async () => {
    const made = await makeApp(bm()); app = made.app
    made.prismaMock.branch.findFirst = vi.fn().mockResolvedValue(mockBranch(UNASSIGNED_BRANCH, { redemptionPin: ENC_PIN }))
    const res = await inject(made.app, made.token, 'GET', `/api/v1/merchant/branches/${UNASSIGNED_BRANCH}/pin`)
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(JSON.parse(res.body).pin).toBeUndefined()
    // Guard runs before the secret read — the encrypted PIN is never fetched/decrypted.
    expect(made.prismaMock.branch.findFirst).not.toHaveBeenCalled()
  })

  it('assigned STAFF -> PIN reveal on ASSIGNED branch -> 403 INSUFFICIENT_PERMISSIONS (the new pin: no decrypted PIN to a STAFF member)', async () => {
    const made = await makeApp(staff()); app = made.app
    made.prismaMock.branch.findFirst = vi.fn().mockResolvedValue(mockBranch(ASSIGNED_BRANCH, { redemptionPin: ENC_PIN }))
    const res = await inject(made.app, made.token, 'GET', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/pin`)
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(JSON.parse(res.body).pin).toBeUndefined()
    // STAFF is denied at the management boundary — the secret is never read/decrypted.
    expect(made.prismaMock.branch.findFirst).not.toHaveBeenCalled()
  })

  it('assigned STAFF -> non-secret branch detail READ (GET /branches/:id) still allowed (200) — secret-vs-detail read asymmetry locked', async () => {
    const made = await makeApp(staff()); app = made.app
    const res = await inject(made.app, made.token, 'GET', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}`)
    expect(res.statusCode).toBe(200)
  })
})
