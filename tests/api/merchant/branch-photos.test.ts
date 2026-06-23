import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// Branches PR-3 (mini-spec §6a/§6b/§6c + §11): backend merchant routes/auth for the
// photos review lane.
//   - §6c branch-scoped photo-asset upload: gated by BRANCH ASSIGNMENT
//     (resolveMerchantContext + assertBranchAllowed), NOT by canManageVouchers; the
//     existing voucher kind:'photo' upload (assertCanManageVouchers) stays UNCHANGED.
//   - §6a createBranchPhotoEditRequest migrated to resolveMerchantContext +
//     assertBranchAllowed (OWNER any / BM assigned) + remove-by-ID branch-scope
//     validation.
//   - §6b instant photo-removal DELETE: OWNER-ONLY in v1, APPROVED-only, remove-by-ID.
//
// Modelled on branch-access-control.test.ts (the PR-2 role matrix) and
// upload-access-control.test.ts (the multipart/storage harness). The membership row
// resolved by getActiveMembership (merchantMembership.findMany) is the SOLE source
// of role + branch scope; the request body can never self-grant it.

const ASSIGNED_BRANCH = 'b-assigned'
const UNASSIGNED_BRANCH = 'b-unassigned'

// ── storage mock so a SUCCESS upload path never touches real R2 ────────────────
const { putObjectMock } = vi.hoisted(() => ({ putObjectMock: vi.fn() }))
vi.mock('../../../src/api/shared/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/shared/storage')>()
  return { ...actual, putObject: putObjectMock }
})

type Role = 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'

function membershipRow(
  role: Role,
  allBranches: boolean,
  branchIds: string[],
  { canManageVouchers = false, status = 'ACTIVE' }: { canManageVouchers?: boolean; status?: string } = {},
) {
  return {
    id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role,
    allBranches, canManageVouchers,
    merchant: { status, businessName: 'Acme' },
    branches: branchIds.map((branchId) => ({ branchId })),
  }
}

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

// A valid landscape PNG header (>= 1200x600) for the §6c upload validation.
function pngBuffer(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdrLen = Buffer.alloc(4); ihdrLen.writeUInt32BE(13, 0)
  const ihdrType = Buffer.from('IHDR', 'ascii')
  const dims = Buffer.alloc(13); dims.writeUInt32BE(width, 0); dims.writeUInt32BE(height, 4)
  return Buffer.concat([sig, ihdrLen, ihdrType, dims])
}

function multipartPayload(content: Buffer): { body: Buffer; contentType: string } {
  const boundary = '----pr3photoboundary'
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="photo.png"\r\n` +
      `Content-Type: image/png\r\n\r\n`,
    'utf8',
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  return { body: Buffer.concat([head, content, tail]), contentType: `multipart/form-data; boundary=${boundary}` }
}

function buildPrismaMock(row: ReturnType<typeof membershipRow>) {
  const prismaMock: any = {
    merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
    merchantMembership: {
      // resolveMerchantContext -> getActiveMembership -> findMany (single active row)
      findMany: vi.fn().mockResolvedValue([row]),
      // resolveAdminMerchant -> getOwnerMembership -> findFirst (OWNER only); the
      // instant-removal route (owner-only) uses this resolver.
      findFirst: vi.fn().mockResolvedValue(
        row.role === 'OWNER'
          ? { id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', merchant: { status: row.merchant.status, businessName: 'Acme' } }
          : null,
      ),
    },
    merchant: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', status: 'ACTIVE', onboardingStep: 'LIVE' }) },
    branch: {
      findFirst: vi.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(mockBranch(where?.id ?? ASSIGNED_BRANCH, { merchantId: 'm1' })),
      ),
    },
    branchPhoto: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({}),
    },
    branchPendingEdit: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'pe1', branchId: ASSIGNED_BRANCH, status: 'PENDING', createdAt: new Date() }),
    },
    adminApproval: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
  prismaMock.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock))
  return prismaMock
}

async function makeApp(row: ReturnType<typeof membershipRow>) {
  const app = await buildApp()
  const prismaMock = buildPrismaMock(row)
  app.decorate('prisma', prismaMock as any)
  app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn(), exists: vi.fn().mockResolvedValue(1) } as any)
  await app.ready()
  const token = (app.jwt as any).merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
  return { app, token, prismaMock }
}

function inject(a: FastifyInstance, token: string, method: any, url: string, payload?: unknown) {
  const opts: Record<string, unknown> = { method, url, headers: { authorization: `Bearer ${token}` } }
  if (payload !== undefined) opts.payload = payload
  return a.inject(opts as any)
}

const owner = () => membershipRow('OWNER', true, [])
const bmNoMV = () => membershipRow('BRANCH_MANAGER', false, [ASSIGNED_BRANCH], { canManageVouchers: false })

// ─────────────────────────────────────────────────────────────────────────────
// §6c — branch-scoped photo-asset upload role matrix
// ─────────────────────────────────────────────────────────────────────────────
describe('Branches PR-3 §6c — branch-scoped photo upload role matrix', () => {
  let app: FastifyInstance | null = null
  let savedStorageEnabled: string | undefined
  let savedPublicBase: string | undefined

  beforeEach(() => {
    savedStorageEnabled = process.env.STORAGE_ENABLED
    savedPublicBase = process.env.R2_PUBLIC_BASE_URL
    process.env.STORAGE_ENABLED = 'true'
    process.env.R2_PUBLIC_BASE_URL = 'https://cdn.example'
    putObjectMock.mockReset()
    putObjectMock.mockResolvedValue({ key: 'photo/m1/abcdef0123456789.png' })
  })

  afterEach(async () => {
    if (app) { await app.close(); app = null }
    if (savedStorageEnabled === undefined) delete process.env.STORAGE_ENABLED
    else process.env.STORAGE_ENABLED = savedStorageEnabled
    if (savedPublicBase === undefined) delete process.env.R2_PUBLIC_BASE_URL
    else process.env.R2_PUBLIC_BASE_URL = savedPublicBase
  })

  function uploadTo(a: FastifyInstance, token: string, branchId: string) {
    const payload = multipartPayload(pngBuffer(1200, 600))
    return a.inject({
      method: 'POST', url: `/api/v1/merchant/branches/${branchId}/photos/upload`,
      headers: { authorization: `Bearer ${token}`, 'content-type': payload.contentType },
      payload: payload.body,
    })
  }

  it('OWNER uploads for ANY branch -> 200 { url }', async () => {
    const made = await makeApp(owner()); app = made.app
    const res = await uploadTo(made.app, made.token, UNASSIGNED_BRANCH)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).url).toMatch(/^https:\/\/cdn\.example\//)
  })

  it('BRANCH_MANAGER WITHOUT canManageVouchers uploads for an ASSIGNED branch -> 200 (the key fix)', async () => {
    const made = await makeApp(bmNoMV()); app = made.app
    const res = await uploadTo(made.app, made.token, ASSIGNED_BRANCH)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).url).toMatch(/^https:\/\/cdn\.example\//)
    // The branch-photo path does NOT require the voucher delegation.
    expect(putObjectMock).toHaveBeenCalledTimes(1)
  })

  it('BRANCH_MANAGER for an UNASSIGNED branch -> 403 (assertBranchAllowed; no upload)', async () => {
    const made = await makeApp(bmNoMV()); app = made.app
    const res = await uploadTo(made.app, made.token, UNASSIGNED_BRANCH)
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('FAIL-FAST: an UNASSIGNED-BM upload is 403 BEFORE the body is consumed (auth precedes buffering)', async () => {
    // The route now resolves the merchant context + asserts branch scope BEFORE the
    // parts()/toBuffer() loop (mirrors the voucher /uploads/:kind handler), so an
    // authenticated-but-unassigned member is rejected before any file bytes are read.
    //
    // We prove "auth ran first / body never consumed" structurally: the only path
    // that consumes the multipart body is the parts() loop, which is followed by the
    // service call uploadBranchPhotoAsset -> resolveBranch -> prisma.branch.findFirst.
    // With the early route assert firing the 403, that branch.findFirst is NEVER
    // reached. (Before the fix the body was buffered and only the SERVICE's own
    // assert produced the 403 — same status code, but after the body had been read.)
    const made = await makeApp(bmNoMV()); app = made.app
    const payload = multipartPayload(pngBuffer(1200, 600))
    const res = await made.app.inject({
      method: 'POST', url: `/api/v1/merchant/branches/${UNASSIGNED_BRANCH}/photos/upload`,
      headers: { authorization: `Bearer ${made.token}`, 'content-type': payload.contentType },
      payload: payload.body,
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    // The branch lookup lives INSIDE the service, AFTER the body-consuming parts()
    // loop — never reached because the route asserted scope before reading any bytes.
    expect(made.prismaMock.branch.findFirst).not.toHaveBeenCalled()
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('any role for an UNASSIGNED branch -> 403 (assertBranchAllowed is the locked gate)', async () => {
    // assertBranchAllowed is a branch-SCOPE check (allBranches || allowedBranchIds),
    // not a role check — the locked §6c contract. A member not scoped to the target
    // branch is denied regardless of role (here a STAFF row scoped elsewhere).
    const made = await makeApp(membershipRow('STAFF', false, ['b-elsewhere'])); app = made.app
    const res = await uploadTo(made.app, made.token, ASSIGNED_BRANCH)
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('REGRESSION: the voucher kind:photo upload STILL requires canManageVouchers (unchanged)', async () => {
    // A BRANCH_MANAGER WITHOUT canManageVouchers is BLOCKED on the VOUCHER path
    // (assertCanManageVouchers) — proving the §6c branch upload did NOT widen it.
    const made = await makeApp(bmNoMV()); app = made.app
    const payload = multipartPayload(pngBuffer(1200, 600))
    const res = await made.app.inject({
      method: 'POST', url: '/api/v1/merchant/uploads/photo',
      headers: { authorization: `Bearer ${made.token}`, 'content-type': payload.contentType },
      payload: payload.body,
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('REGRESSION: a BM WITH canManageVouchers can STILL upload on the voucher kind:photo path (200)', async () => {
    const made = await makeApp(membershipRow('BRANCH_MANAGER', true, [ASSIGNED_BRANCH], { canManageVouchers: true })); app = made.app
    const payload = multipartPayload(pngBuffer(1200, 600))
    const res = await made.app.inject({
      method: 'POST', url: '/api/v1/merchant/uploads/photo',
      headers: { authorization: `Bearer ${made.token}`, 'content-type': payload.contentType },
      payload: payload.body,
    })
    expect(res.statusCode).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §6a — createBranchPhotoEditRequest add-via-review role matrix
// ─────────────────────────────────────────────────────────────────────────────
describe('Branches PR-3 §6a — photo edit-request (add-via-review) role matrix', () => {
  let app: FastifyInstance | null = null
  afterEach(async () => { if (app) { await app.close(); app = null } })

  const editReqUrl = (b: string) => `/api/v1/merchant/branches/${b}/photos/edit-request`

  it('OWNER submits a photo edit-request for any branch -> 201', async () => {
    const made = await makeApp(owner()); app = made.app
    const res = await inject(made.app, made.token, 'POST', editReqUrl(UNASSIGNED_BRANCH), { add: ['https://cdn.example/photo/m1/x.png'] })
    expect(res.statusCode).toBe(201)
    expect(made.prismaMock.branchPendingEdit.create).toHaveBeenCalledTimes(1)
  })

  it('BRANCH_MANAGER submits for an ASSIGNED branch -> 201 (assertBranchAllowed passes; no canManageVouchers needed)', async () => {
    const made = await makeApp(bmNoMV()); app = made.app
    const res = await inject(made.app, made.token, 'POST', editReqUrl(ASSIGNED_BRANCH), { add: ['https://cdn.example/photo/m1/x.png'] })
    expect(res.statusCode).toBe(201)
    expect(made.prismaMock.branchPendingEdit.create).toHaveBeenCalledTimes(1)
  })

  it('BRANCH_MANAGER for an UNASSIGNED branch -> 403 (no edit-request created)', async () => {
    const made = await makeApp(bmNoMV()); app = made.app
    const res = await inject(made.app, made.token, 'POST', editReqUrl(UNASSIGNED_BRANCH), { add: ['https://cdn.example/photo/m1/x.png'] })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(made.prismaMock.branchPendingEdit.create).not.toHaveBeenCalled()
  })

  it('remove: a foreign/unknown BranchPhoto id is REJECTED (404 BRANCH_PHOTO_NOT_FOUND, nothing created)', async () => {
    const made = await makeApp(owner()); app = made.app
    // Photo p-foreign is NOT on this branch -> findMany returns []
    made.prismaMock.branchPhoto.findMany = vi.fn().mockResolvedValue([])
    const res = await inject(made.app, made.token, 'POST', editReqUrl(ASSIGNED_BRANCH), { remove: ['p-foreign'] })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_PHOTO_NOT_FOUND')
    expect(made.prismaMock.branchPendingEdit.create).not.toHaveBeenCalled()
  })

  it('remove: a branch-owned BranchPhoto id is ACCEPTED -> 201', async () => {
    const made = await makeApp(owner()); app = made.app
    made.prismaMock.branchPhoto.findMany = vi.fn().mockResolvedValue([{ id: 'p-owned' }])
    const res = await inject(made.app, made.token, 'POST', editReqUrl(ASSIGNED_BRANCH), { remove: ['p-owned'] })
    expect(res.statusCode).toBe(201)
    expect(made.prismaMock.branchPhoto.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['p-owned'] }, branchId: ASSIGNED_BRANCH },
      select: { id: true },
    })
  })

  it('PENDING_EDIT_EXISTS still guards (409, nothing created)', async () => {
    const made = await makeApp(owner()); app = made.app
    made.prismaMock.branchPendingEdit.findFirst = vi.fn().mockResolvedValue({ id: 'pe-open', status: 'PENDING' })
    const res = await inject(made.app, made.token, 'POST', editReqUrl(ASSIGNED_BRANCH), { add: ['https://cdn.example/photo/m1/x.png'] })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('PENDING_EDIT_EXISTS')
    expect(made.prismaMock.branchPendingEdit.create).not.toHaveBeenCalled()
  })

  it('SUSPENDED merchant -> photo edit-request blocked (SEC-M2)', async () => {
    const made = await makeApp(membershipRow('BRANCH_MANAGER', false, [ASSIGNED_BRANCH], { status: 'SUSPENDED' })); app = made.app
    const res = await inject(made.app, made.token, 'POST', editReqUrl(ASSIGNED_BRANCH), { add: ['https://cdn.example/photo/m1/x.png'] })
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_SUSPENDED')
    expect(made.prismaMock.branchPendingEdit.create).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §6b — instant photo-removal (OWNER-ONLY v1, APPROVED-only, remove-by-ID)
// ─────────────────────────────────────────────────────────────────────────────
describe('Branches PR-3 §6b — instant photo-removal endpoint', () => {
  let app: FastifyInstance | null = null
  afterEach(async () => { if (app) { await app.close(); app = null } })

  const delUrl = (branch: string, photo: string) => `/api/v1/merchant/branches/${branch}/photos/${photo}`

  it('OWNER removes an APPROVED photo -> deleted (200) + ADMIN-actor audit', async () => {
    const made = await makeApp(owner()); app = made.app
    made.prismaMock.branchPhoto.findFirst = vi.fn().mockResolvedValue({ id: 'p1', url: 'https://cdn/x.png', moderationStatus: 'APPROVED' })
    const res = await inject(made.app, made.token, 'DELETE', delUrl(ASSIGNED_BRANCH, 'p1'))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).ok).toBe(true)
    expect(made.prismaMock.branchPhoto.delete).toHaveBeenCalledWith({ where: { id: 'p1' } })
    // ADMIN-actor before-snapshot audit row.
    const auditCall = made.prismaMock.auditLog.create.mock.calls.find(
      (c: any) => c[0]?.data?.event === 'BRANCH_PHOTO_REMOVED',
    )
    expect(auditCall).toBeDefined()
    expect(auditCall[0].data.actorType).toBe('MERCHANT_ADMIN')
    expect(auditCall[0].data.before).toMatchObject({ id: 'p1', moderationStatus: 'APPROVED' })
  })

  it('OWNER removes a NON-EXISTENT / cross-branch photo -> 404 BRANCH_PHOTO_NOT_FOUND (nothing deleted)', async () => {
    const made = await makeApp(owner()); app = made.app
    made.prismaMock.branchPhoto.findFirst = vi.fn().mockResolvedValue(null)
    const res = await inject(made.app, made.token, 'DELETE', delUrl(ASSIGNED_BRANCH, 'p-gone'))
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_PHOTO_NOT_FOUND')
    expect(made.prismaMock.branchPhoto.delete).not.toHaveBeenCalled()
    // The lookup is branch-scoped (id AND branchId).
    expect(made.prismaMock.branchPhoto.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-gone', branchId: ASSIGNED_BRANCH },
      select: { id: true, url: true, moderationStatus: true },
    })
  })

  it('OWNER removes a NON-APPROVED (PENDING) photo -> 409 PHOTO_NOT_REMOVABLE (nothing deleted)', async () => {
    const made = await makeApp(owner()); app = made.app
    made.prismaMock.branchPhoto.findFirst = vi.fn().mockResolvedValue({ id: 'p2', url: 'https://cdn/y.png', moderationStatus: 'PENDING' })
    const res = await inject(made.app, made.token, 'DELETE', delUrl(ASSIGNED_BRANCH, 'p2'))
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('PHOTO_NOT_REMOVABLE')
    expect(made.prismaMock.branchPhoto.delete).not.toHaveBeenCalled()
  })

  it('OWNER removes a FLAGGED photo -> 409 PHOTO_NOT_REMOVABLE (nothing deleted)', async () => {
    const made = await makeApp(owner()); app = made.app
    made.prismaMock.branchPhoto.findFirst = vi.fn().mockResolvedValue({ id: 'p3', url: 'https://cdn/z.png', moderationStatus: 'FLAGGED' })
    const res = await inject(made.app, made.token, 'DELETE', delUrl(ASSIGNED_BRANCH, 'p3'))
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('PHOTO_NOT_REMOVABLE')
    expect(made.prismaMock.branchPhoto.delete).not.toHaveBeenCalled()
  })

  it('OWNER-ONLY: a BRANCH_MANAGER (even for an ASSIGNED branch) is DENIED, no row deleted', async () => {
    const made = await makeApp(bmNoMV()); app = made.app
    made.prismaMock.branchPhoto.findFirst = vi.fn().mockResolvedValue({ id: 'p1', url: 'https://cdn/x.png', moderationStatus: 'APPROVED' })
    const res = await inject(made.app, made.token, 'DELETE', delUrl(ASSIGNED_BRANCH, 'p1'))
    // resolveAdminMerchant (owner-only) -> getOwnerMembership -> null -> INVALID_CREDENTIALS
    expect(JSON.parse(res.body).error.code).toBe('INVALID_CREDENTIALS')
    expect(made.prismaMock.branchPhoto.delete).not.toHaveBeenCalled()
  })

  it('SUSPENDED merchant -> instant-removal blocked (SEC-M2 via resolveAdminMerchant)', async () => {
    const made = await makeApp(membershipRow('OWNER', true, [], { status: 'SUSPENDED' })); app = made.app
    made.prismaMock.branchPhoto.findFirst = vi.fn().mockResolvedValue({ id: 'p1', url: 'https://cdn/x.png', moderationStatus: 'APPROVED' })
    const res = await inject(made.app, made.token, 'DELETE', delUrl(ASSIGNED_BRANCH, 'p1'))
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_SUSPENDED')
    expect(made.prismaMock.branchPhoto.delete).not.toHaveBeenCalled()
  })
})
