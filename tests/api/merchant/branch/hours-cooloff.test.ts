import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

// Branches PR-4 (umbrella D4): the opening-hours 2-hour customer cool-off STAGE +
// CANCEL backend. setOpeningHours becomes STAGE-not-apply (writes a durable
// BranchOpeningHoursPending row + effectiveAt = now + 2h + enqueues a delayed
// nudge; does NOT upsert the live BranchOpeningHours), and a new
// cancelPendingHours withdraws a staged change before it promotes. Authz on BOTH
// is resolveMerchantContext + assertCanManageBranch (OWNER any / assigned
// BRANCH_MANAGER / STAFF denied; suspended -> MERCHANT_SUSPENDED), a deliberate
// widening from the old OWNER-only setOpeningHours (D3), mirroring setAmenities.
//
// The promotion worker handler + the repeatable sweep are a SEPARATE dispatch
// (PR-4 §4c) and are intentionally NOT exercised here. enqueue is mocked so no
// test touches Redis/BullMQ; MAINTENANCE_QUEUE stays real.

const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn().mockResolvedValue({ id: 'job-1' }) }))
vi.mock('../../../../src/api/queues', () => ({ MAINTENANCE_QUEUE: 'maintenance', enqueue: enqueueMock }))

import { buildApp } from '../../../../src/api/app'
import type { FastifyInstance } from 'fastify'
import { PROMOTION_WINDOW_MS } from '../../../../src/api/merchant/branch/service'

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
    openingHours: [], amenities: [], photos: [], pendingEdits: [], pendingHours: [],
    ...overrides,
  }
}

// merchantMembership.findMany row resolved by resolveMerchantContext ->
// getActiveMembership. The SOLE source of role + branch scope (the body can never
// self-grant it).
function membershipRow(role: Role, allBranches: boolean, branchIds: string[], status = 'ACTIVE') {
  return {
    id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role,
    allBranches, canManageVouchers: false,
    merchant: { status, businessName: 'Acme' },
    branches: branchIds.map((branchId) => ({ branchId })),
  }
}

async function makeApp(row: ReturnType<typeof membershipRow>) {
  enqueueMock.mockClear()
  const app = await buildApp()
  const prismaMock: any = {
    merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
    merchantMembership: {
      findMany: vi.fn().mockResolvedValue([row]),
      // resolveAdminMerchant is no longer the hours resolver, but keep it wired so
      // any incidental owner-only path in buildApp behaves.
      findFirst: vi.fn().mockResolvedValue(
        row.role === 'OWNER'
          ? { id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', merchant: { status: row.merchant.status, businessName: 'Acme' } }
          : null,
      ),
    },
    merchant: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', status: 'ACTIVE', onboardingStep: 'LIVE' }) },
    branch: {
      findFirst: vi.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(mockBranch(where?.id, { merchantId: 'm1' }))),
    },
    branchOpeningHours: { upsert: vi.fn().mockResolvedValue({}) },
    branchOpeningHoursPending: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'ph-new', status: 'PENDING', createdAt: new Date(), ...data })),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
  prismaMock.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock))
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
const bm = (status = 'ACTIVE') => membershipRow('BRANCH_MANAGER', false, [ASSIGNED_BRANCH], status)
const staff = (status = 'ACTIVE') => membershipRow('STAFF', false, [ASSIGNED_BRANCH], status)

const goodWeek = [
  { dayOfWeek: 0, isClosed: true },
  { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false },
]

describe('opening-hours STAGE-not-apply (PR-4 §4a)', () => {
  let app: FastifyInstance | null = null
  afterEach(async () => { if (app) { await app.close(); app = null } })

  it('stages a PENDING row with effectiveAt = now + 2h and does NOT upsert live hours', async () => {
    const made = await makeApp(owner()); app = made.app
    const before = Date.now()
    const res = await inject(made.app, made.token, 'POST', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/hours`, { hours: goodWeek })
    const after = Date.now()
    expect(res.statusCode).toBe(200)

    expect(made.prismaMock.branchOpeningHours.upsert).not.toHaveBeenCalled()
    expect(made.prismaMock.branchOpeningHoursPending.create).toHaveBeenCalledTimes(1)

    const createArg = made.prismaMock.branchOpeningHoursPending.create.mock.calls[0][0]
    expect(createArg.data.status).toBe('PENDING')
    expect(createArg.data.branchId).toBe(ASSIGNED_BRANCH)
    expect(createArg.data.proposedHours).toEqual(goodWeek)
    // createdBy is the MerchantAdmin actor id (audit attribution), NOT a membership id.
    expect(createArg.data.createdBy).toBe('ma1')
    const eff = createArg.data.effectiveAt.getTime()
    expect(eff).toBeGreaterThanOrEqual(before + PROMOTION_WINDOW_MS)
    expect(eff).toBeLessThanOrEqual(after + PROMOTION_WINDOW_MS)

    // Delayed nudge enqueued with the branch-keyed jobId + 2h delay.
    expect(enqueueMock).toHaveBeenCalledTimes(1)
    const [queueName, data, opts] = enqueueMock.mock.calls[0]
    expect(queueName).toBe('maintenance')
    expect(data.pendingId).toBe('ph-new')
    expect(opts.jobId).toBe(`promote-hours:${ASSIGNED_BRANCH}`)
    expect(opts.delay).toBe(PROMOTION_WINDOW_MS)
  })

  it('rejects an invalid schedule with OPENING_HOURS_INVALID before any write', async () => {
    const made = await makeApp(owner()); app = made.app
    const res = await inject(made.app, made.token, 'POST', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/hours`, {
      hours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '09:00', isClosed: false }], // zero-length
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('OPENING_HOURS_INVALID')
    expect(made.prismaMock.branchOpeningHoursPending.create).not.toHaveBeenCalled()
    expect(made.prismaMock.branchOpeningHoursPending.updateMany).not.toHaveBeenCalled()
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('re-stage SUPERSEDES the prior PENDING: cancel-then-create in one tx, at-most-one PENDING', async () => {
    const made = await makeApp(owner()); app = made.app
    const res = await inject(made.app, made.token, 'POST', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/hours`, { hours: goodWeek })
    expect(res.statusCode).toBe(200)

    // The whole supersede runs inside ONE transaction.
    expect(made.prismaMock.$transaction).toHaveBeenCalledTimes(1)
    // Prior PENDING rows are CANCELLED first...
    expect(made.prismaMock.branchOpeningHoursPending.updateMany).toHaveBeenCalledTimes(1)
    const cancelArg = made.prismaMock.branchOpeningHoursPending.updateMany.mock.calls[0][0]
    expect(cancelArg.where).toMatchObject({ branchId: ASSIGNED_BRANCH, status: 'PENDING' })
    expect(cancelArg.data.status).toBe('CANCELLED')
    expect(cancelArg.data.cancelledAt).toBeInstanceOf(Date)
    // ...then exactly one new PENDING row is created.
    expect(made.prismaMock.branchOpeningHoursPending.create).toHaveBeenCalledTimes(1)
    expect(made.prismaMock.branchOpeningHoursPending.create.mock.calls[0][0].data.status).toBe('PENDING')
  })

  // ── Authz matrix on STAGE ──────────────────────────────────────────────────
  it('OWNER stages on any branch (200)', async () => {
    const made = await makeApp(owner()); app = made.app
    const res = await inject(made.app, made.token, 'POST', `/api/v1/merchant/branches/${UNASSIGNED_BRANCH}/hours`, { hours: goodWeek })
    expect(res.statusCode).toBe(200)
    expect(made.prismaMock.branchOpeningHoursPending.create).toHaveBeenCalled()
  })

  it('assigned BRANCH_MANAGER stages on ASSIGNED branch (200)', async () => {
    const made = await makeApp(bm()); app = made.app
    const res = await inject(made.app, made.token, 'POST', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/hours`, { hours: goodWeek })
    expect(res.statusCode).toBe(200)
    expect(made.prismaMock.branchOpeningHoursPending.create).toHaveBeenCalled()
  })

  it('unassigned BRANCH_MANAGER -> 403 INSUFFICIENT_PERMISSIONS, no staging row', async () => {
    const made = await makeApp(bm()); app = made.app
    const res = await inject(made.app, made.token, 'POST', `/api/v1/merchant/branches/${UNASSIGNED_BRANCH}/hours`, { hours: goodWeek })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(made.prismaMock.branchOpeningHoursPending.create).not.toHaveBeenCalled()
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('assigned STAFF -> 403 INSUFFICIENT_PERMISSIONS, no staging row', async () => {
    const made = await makeApp(staff()); app = made.app
    const res = await inject(made.app, made.token, 'POST', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/hours`, { hours: goodWeek })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(made.prismaMock.branchOpeningHoursPending.create).not.toHaveBeenCalled()
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('SUSPENDED merchant -> MERCHANT_SUSPENDED, no staging row', async () => {
    const made = await makeApp(bm('SUSPENDED')); app = made.app
    const res = await inject(made.app, made.token, 'POST', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/hours`, { hours: goodWeek })
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_SUSPENDED')
    expect(made.prismaMock.branchOpeningHoursPending.create).not.toHaveBeenCalled()
  })
})

describe('opening-hours CANCEL pending (PR-4 §4b)', () => {
  let app: FastifyInstance | null = null
  afterEach(async () => { if (app) { await app.close(); app = null } })

  it('cancels the PENDING row (CANCELLED + cancelledAt), live hours untouched (200)', async () => {
    const made = await makeApp(owner()); app = made.app
    made.prismaMock.branchOpeningHoursPending.updateMany = vi.fn().mockResolvedValue({ count: 1 })
    const res = await inject(made.app, made.token, 'DELETE', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/hours/pending`)
    expect(res.statusCode).toBe(200)
    expect(made.prismaMock.branchOpeningHoursPending.updateMany).toHaveBeenCalledTimes(1)
    const arg = made.prismaMock.branchOpeningHoursPending.updateMany.mock.calls[0][0]
    expect(arg.where).toMatchObject({ branchId: ASSIGNED_BRANCH, status: 'PENDING' })
    expect(arg.data.status).toBe('CANCELLED')
    expect(arg.data.cancelledAt).toBeInstanceOf(Date)
    // Live hours are never touched by a cancel.
    expect(made.prismaMock.branchOpeningHours.upsert).not.toHaveBeenCalled()
  })

  it('no PENDING row -> PENDING_HOURS_NOT_FOUND (404)', async () => {
    const made = await makeApp(owner()); app = made.app
    made.prismaMock.branchOpeningHoursPending.updateMany = vi.fn().mockResolvedValue({ count: 0 })
    const res = await inject(made.app, made.token, 'DELETE', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/hours/pending`)
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('PENDING_HOURS_NOT_FOUND')
  })

  it('assigned BRANCH_MANAGER cancels on ASSIGNED branch (200)', async () => {
    const made = await makeApp(bm()); app = made.app
    made.prismaMock.branchOpeningHoursPending.updateMany = vi.fn().mockResolvedValue({ count: 1 })
    const res = await inject(made.app, made.token, 'DELETE', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/hours/pending`)
    expect(res.statusCode).toBe(200)
  })

  it('unassigned BRANCH_MANAGER -> 403, no cancel write', async () => {
    const made = await makeApp(bm()); app = made.app
    const res = await inject(made.app, made.token, 'DELETE', `/api/v1/merchant/branches/${UNASSIGNED_BRANCH}/hours/pending`)
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(made.prismaMock.branchOpeningHoursPending.updateMany).not.toHaveBeenCalled()
  })

  it('assigned STAFF -> 403, no cancel write', async () => {
    const made = await makeApp(staff()); app = made.app
    const res = await inject(made.app, made.token, 'DELETE', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/hours/pending`)
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(made.prismaMock.branchOpeningHoursPending.updateMany).not.toHaveBeenCalled()
  })

  it('SUSPENDED merchant -> MERCHANT_SUSPENDED, no cancel write', async () => {
    const made = await makeApp(bm('SUSPENDED')); app = made.app
    const res = await inject(made.app, made.token, 'DELETE', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}/hours/pending`)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_SUSPENDED')
    expect(made.prismaMock.branchOpeningHoursPending.updateMany).not.toHaveBeenCalled()
  })
})

describe('getBranch exposes the current PENDING opening-hours change (PR-4 §6-data)', () => {
  let app: FastifyInstance | null = null
  afterEach(async () => { if (app) { await app.close(); app = null } })

  it('GET /branches/:id returns pendingHours with proposedHours + effectiveAt + status', async () => {
    const made = await makeApp(owner()); app = made.app
    const eff = new Date(Date.now() + PROMOTION_WINDOW_MS).toISOString()
    made.prismaMock.branch.findFirst = vi.fn().mockResolvedValue(
      mockBranch(ASSIGNED_BRANCH, {
        pendingHours: [{ id: 'ph1', proposedHours: goodWeek, effectiveAt: eff, status: 'PENDING' }],
      }),
    )
    const res = await inject(made.app, made.token, 'GET', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}`)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.pendingHours).toHaveLength(1)
    expect(body.pendingHours[0].status).toBe('PENDING')
    expect(body.pendingHours[0].effectiveAt).toBe(eff)
    expect(body.pendingHours[0].proposedHours).toEqual(goodWeek)
  })

  it('GET /branches/:id returns an empty pendingHours array when none is staged', async () => {
    const made = await makeApp(owner()); app = made.app
    const res = await inject(made.app, made.token, 'GET', `/api/v1/merchant/branches/${ASSIGNED_BRANCH}`)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).pendingHours).toEqual([])
  })
})
