import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Team & Roles S4 (spec §5.3) — surfacing the self-approval flag derived by S1
// (`deriveSelfOnboarded` / the MERCHANT_GO_LIVE `metadata.selfOnboarded` stamp)
// onto the two read surfaces the admin-web badge/filter actually consume:
// GET /admin/approvals (queue History rows) and
// GET /admin/merchants/:id/timeline (merchant timeline action rows).
//
// `deriveSelfOnboarded` itself (the derivation + the approve-time stamp) is
// already pinned by tests/api/admin/self-approval-stamp.test.ts — these tests
// cover ONLY the new batching/wiring onto the two list/feed reads, including
// the deliberate status-gate that stops a REJECTED row from ever being
// mislabelled "Self-approved" via deriveSelfOnboarded's single-row fallback
// (which compares whoever actioned the approval — including a rejecter — to
// the draft creator).

const signAdmin = (app: FastifyInstance, adminRole = 'OPERATIONS') =>
  (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })

// ─────────────────────────────────────────────────────────────────────────
// GET /admin/approvals — queue History rows
// ─────────────────────────────────────────────────────────────────────────

describe('Team & Roles S4: listApprovals surfaces selfOnboarded', () => {
  let app: FastifyInstance

  function baseRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'appr-1',
      type: 'MERCHANT_ONBOARDING',
      referenceId: 'm-1',
      referenceType: 'merchant',
      status: 'APPROVED',
      adminUserId: 'admin-approver',
      comment: null,
      submittedAt: new Date('2026-07-01T10:00:00.000Z'),
      actionedAt: new Date('2026-07-02T10:00:00.000Z'),
      claimedById: null,
      claimedAt: null,
      ...overrides,
    }
  }

  function makePrisma(rows: ReturnType<typeof baseRow>[], auditRows: Array<Record<string, unknown>> = []) {
    return {
      adminApproval: {
        count: vi.fn().mockResolvedValue(rows.length),
        findMany: vi.fn().mockResolvedValue(rows),
      },
      merchant: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'm-1', businessName: 'Self Co', status: 'ACTIVE', onboardingStep: 'LIVE', verificationStatus: 'VERIFIED', contractStatus: 'SIGNED' },
        ]),
      },
      voucher: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      adminUser: { findMany: vi.fn().mockResolvedValue([]) },
      merchantPendingEdit: { findMany: vi.fn().mockResolvedValue([]) },
      branchPendingEdit: { findMany: vi.fn().mockResolvedValue([]) },
      branch: { findMany: vi.fn().mockResolvedValue([]) },
      voucherPendingEdit: { findMany: vi.fn().mockResolvedValue([]) },
      auditLog: { findMany: vi.fn().mockResolvedValue(auditRows) },
    } as any
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
  })
  afterEach(async () => {
    await app.close()
  })

  async function list() {
    await app.ready()
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals',
      headers: { authorization: `Bearer ${signAdmin(app)}` },
    })
    expect(res.statusCode).toBe(200)
    return JSON.parse(res.body).approvals as any[]
  }

  it('APPROVED row: stamped selfOnboarded:true on MERCHANT_GO_LIVE wins', async () => {
    app.decorate(
      'prisma',
      makePrisma([baseRow()], [
        { entityId: 'm-1', event: 'MERCHANT_GO_LIVE', actorId: 'admin-approver', metadata: { selfOnboarded: true } },
        { entityId: 'm-1', event: 'MERCHANT_DRAFT_CREATED', actorId: 'someone-else', metadata: null },
      ]),
    )
    const [row] = await list()
    expect(row.selfOnboarded).toBe(true)
  })

  it('APPROVED row: stamped selfOnboarded:false wins even though the actor ids would otherwise match', async () => {
    app.decorate(
      'prisma',
      makePrisma([baseRow()], [
        { entityId: 'm-1', event: 'MERCHANT_GO_LIVE', actorId: 'admin-approver', metadata: { selfOnboarded: false } },
        { entityId: 'm-1', event: 'MERCHANT_DRAFT_CREATED', actorId: 'admin-approver', metadata: null },
      ]),
    )
    const [row] = await list()
    expect(row.selfOnboarded).toBe(false)
  })

  it('APPROVED row with no stamp (pre-S4 row): falls back to draft-creator == approver -> true', async () => {
    app.decorate(
      'prisma',
      makePrisma([baseRow()], [
        { entityId: 'm-1', event: 'MERCHANT_DRAFT_CREATED', actorId: 'admin-approver', metadata: null },
      ]),
    )
    const [row] = await list()
    expect(row.selfOnboarded).toBe(true)
  })

  it('APPROVED row with no stamp: falls back to draft-creator != approver -> false', async () => {
    app.decorate(
      'prisma',
      makePrisma([baseRow()], [
        { entityId: 'm-1', event: 'MERCHANT_DRAFT_CREATED', actorId: 'a-different-admin', metadata: null },
      ]),
    )
    const [row] = await list()
    expect(row.selfOnboarded).toBe(false)
  })

  it('REJECTED row actioned by the merchant draft-creator, with NO MERCHANT_GO_LIVE row at all, is never mislabelled Self-approved', async () => {
    // The merchant never went live (no MERCHANT_GO_LIVE audit row) — only a
    // draft-creator row exists, and it happens to match the rejecting admin.
    // deriveSelfOnboarded's own single-row fallback would say "true" here if
    // asked; listApprovals must not ask it for a non-APPROVED row.
    app.decorate(
      'prisma',
      makePrisma([baseRow({ status: 'REJECTED', adminUserId: 'admin-approver' })], [
        { entityId: 'm-1', event: 'MERCHANT_DRAFT_CREATED', actorId: 'admin-approver', metadata: null },
      ]),
    )
    const [row] = await list()
    expect(row.selfOnboarded).toBe(false)
  })

  it('PENDING (not yet actioned) row: selfOnboarded false', async () => {
    app.decorate(
      'prisma',
      makePrisma([baseRow({ status: 'PENDING', adminUserId: null, actionedAt: null })], [
        { entityId: 'm-1', event: 'MERCHANT_DRAFT_CREATED', actorId: 'admin-approver', metadata: null },
      ]),
    )
    const [row] = await list()
    expect(row.selfOnboarded).toBe(false)
  })

  it('VOUCHER-type row: selfOnboarded always false, never computed from merchant audit rows', async () => {
    const prisma = makePrisma(
      [
        {
          id: 'appr-v1', type: 'VOUCHER', referenceId: 'v-1', referenceType: 'voucher',
          status: 'APPROVED', adminUserId: 'admin-approver', comment: null,
          submittedAt: new Date('2026-07-01T10:00:00.000Z'), actionedAt: new Date('2026-07-02T10:00:00.000Z'),
          claimedById: null, claimedAt: null,
        },
      ],
      [],
    )
    prisma.voucher.findMany = vi.fn().mockResolvedValue([
      { id: 'v-1', title: 'Deal', type: 'BOGO', status: 'ACTIVE', approvalStatus: 'APPROVED', merchantId: 'm-1' },
    ])
    app.decorate('prisma', prisma)
    const [row] = await list()
    expect(row.selfOnboarded).toBe(false)
  })

  it('batches self-approval resolution in exactly ONE auditLog.findMany call (no N+1) scoped to the page onboarding merchantIds + both event names', async () => {
    const prisma = makePrisma([baseRow()], [
      { entityId: 'm-1', event: 'MERCHANT_GO_LIVE', actorId: 'admin-approver', metadata: { selfOnboarded: true } },
    ])
    app.decorate('prisma', prisma)
    await list()
    expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(1)
    const args = prisma.auditLog.findMany.mock.calls[0][0]
    expect(args.where).toEqual({
      entityType: 'merchant',
      entityId: { in: ['m-1'] },
      event: { in: ['MERCHANT_GO_LIVE', 'MERCHANT_DRAFT_CREATED'] },
    })
  })

  it('skips the auditLog batch entirely when the page has no MERCHANT_ONBOARDING rows', async () => {
    const prisma = makePrisma([], [])
    prisma.adminApproval.findMany = vi.fn().mockResolvedValue([
      {
        id: 'appr-e', type: 'MERCHANT_IDENTITY_EDIT', referenceId: 'pe-1', referenceType: 'MerchantPendingEdit',
        status: 'PENDING', adminUserId: null, comment: null,
        submittedAt: new Date('2026-07-01T10:00:00.000Z'), actionedAt: null, claimedById: null, claimedAt: null,
      },
    ])
    prisma.adminApproval.count = vi.fn().mockResolvedValue(1)
    prisma.merchantPendingEdit.findMany = vi.fn().mockResolvedValue([{ id: 'pe-1', merchantId: 'm-edit' }])
    prisma.merchant.findMany = vi.fn().mockResolvedValue([{ id: 'm-edit', businessName: 'Edit Co', status: 'ACTIVE' }])
    app.decorate('prisma', prisma)
    const [row] = await list()
    expect(row.selfOnboarded).toBe(false)
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// GET /admin/merchants/:id/timeline — merchant timeline action rows
// ─────────────────────────────────────────────────────────────────────────

describe('Team & Roles S4: getMerchantTimeline surfaces selfOnboarded on the go-live row only', () => {
  let app: FastifyInstance

  function makePrisma(auditRows: Array<Record<string, unknown>>, goLiveFindFirst?: Record<string, unknown> | null, draftFindFirst?: Record<string, unknown> | null) {
    return {
      merchant: {
        findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE', onboardingStep: 'LIVE', verificationStatus: 'VERIFIED' }),
      },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue(null) }, // no owner -> no email rows, simplest fixture
      auditLog: {
        findMany: vi.fn().mockResolvedValue(auditRows),
        // Backing deriveSelfOnboarded's own two lookups (called at most once
        // per timeline load — see the O(1) doc comment in service.ts).
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          if (where.event === 'MERCHANT_GO_LIVE') return goLiveFindFirst ?? null
          if (where.event === 'MERCHANT_DRAFT_CREATED') return draftFindFirst ?? null
          return null
        }),
      },
      communicationLog: { findMany: vi.fn().mockResolvedValue([]) },
      adminUser: { findMany: vi.fn().mockResolvedValue([]) },
    } as any
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
  })
  afterEach(async () => {
    await app.close()
  })

  async function timeline(merchantId = 'm-1') {
    await app.ready()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/merchants/${merchantId}/timeline`,
      headers: { authorization: `Bearer ${signAdmin(app)}` },
    })
    expect(res.statusCode).toBe(200)
    return JSON.parse(res.body).items as any[]
  }

  it('stamped selfOnboarded:true on the MERCHANT_GO_LIVE row surfaces true on that item only', async () => {
    const auditRows = [
      { id: 'r-golive', event: 'MERCHANT_GO_LIVE', createdAt: new Date('2026-07-02T10:00:00.000Z'), actorType: 'ADMIN', actorId: 'admin-approver', reason: null },
      { id: 'r-draft', event: 'MERCHANT_DRAFT_CREATED', createdAt: new Date('2026-07-01T10:00:00.000Z'), actorType: 'ADMIN', actorId: 'admin-approver', reason: null },
    ]
    app.decorate('prisma', makePrisma(auditRows, { metadata: { selfOnboarded: true } }))
    const items = await timeline()
    const goLive = items.find((i) => i.event === 'MERCHANT_GO_LIVE')
    const draft = items.find((i) => i.event === 'MERCHANT_DRAFT_CREATED')
    expect(goLive.selfOnboarded).toBe(true)
    // Only the go-live row ever carries true — the draft-created row (same
    // actor) must stay false; the flag is about the GO-LIVE action, not the
    // actor identity generally.
    expect(draft.selfOnboarded).toBe(false)
  })

  it('stamped selfOnboarded:false on the MERCHANT_GO_LIVE row surfaces false', async () => {
    const auditRows = [
      { id: 'r-golive', event: 'MERCHANT_GO_LIVE', createdAt: new Date('2026-07-02T10:00:00.000Z'), actorType: 'ADMIN', actorId: 'admin-approver', reason: null },
    ]
    app.decorate('prisma', makePrisma(auditRows, { metadata: { selfOnboarded: false } }))
    const items = await timeline()
    expect(items[0].selfOnboarded).toBe(false)
  })

  it('unstamped (legacy) MERCHANT_GO_LIVE row falls back to comparing the go-live actor to the draft creator', async () => {
    const auditRows = [
      { id: 'r-golive', event: 'MERCHANT_GO_LIVE', createdAt: new Date('2026-07-02T10:00:00.000Z'), actorType: 'ADMIN', actorId: 'admin-approver', reason: null },
    ]
    app.decorate('prisma', makePrisma(auditRows, null, { actorId: 'admin-approver' }))
    const items = await timeline()
    expect(items[0].selfOnboarded).toBe(true)
  })

  it('no MERCHANT_GO_LIVE row at all: every action item is selfOnboarded:false and deriveSelfOnboarded is never invoked', async () => {
    const auditRows = [
      { id: 'r-claim', event: 'MERCHANT_APPROVAL_CLAIMED', createdAt: new Date('2026-07-01T10:00:00.000Z'), actorType: 'ADMIN', actorId: 'admin-approver', reason: null },
    ]
    const prisma = makePrisma(auditRows)
    app.decorate('prisma', prisma)
    const items = await timeline()
    expect(items.every((i) => i.selfOnboarded === false)).toBe(true)
    expect(prisma.auditLog.findFirst).not.toHaveBeenCalled()
  })
})
