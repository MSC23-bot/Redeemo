import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Day-2 Vouchers A8b: listApprovals enriches each VOUCHER row with the queue
// pre-open context (voucher title/type/status/approvalStatus + merchant
// businessName + goLiveHint). MERCHANT_ONBOARDING rows keep their existing
// merchant enrichment (unregressed); edit-type rows are unchanged. Driven
// end-to-end through GET /admin/approvals with a prisma mock (OPERATIONS holds
// approval:read). No PII / no redemptionPin in the enrichment.

describe('A8b: VOUCHER queue enrichment in listApprovals', () => {
  let app: FastifyInstance
  const signOps = () =>
    (app.jwt as any).admin.sign(
      { sub: 'admin-1', role: 'admin', adminRole: 'OPERATIONS', sessionId: 's1' },
      { expiresIn: '1h' },
    )

  // Three approval rows: one VOUCHER (go-live merchant), one VOUCHER (waiting
  // merchant), one MERCHANT_ONBOARDING, one MERCHANT_IDENTITY_EDIT.
  function makePrisma() {
    const rows = [
      {
        id: 'appr-v1', type: 'VOUCHER', referenceId: 'v-live', referenceType: 'voucher',
        status: 'PENDING', adminUserId: null, comment: null,
        submittedAt: new Date('2026-06-22T10:00:00.000Z'), actionedAt: null, claimedById: null, claimedAt: null,
      },
      {
        id: 'appr-v2', type: 'VOUCHER', referenceId: 'v-wait', referenceType: 'voucher',
        status: 'PENDING', adminUserId: null, comment: null,
        submittedAt: new Date('2026-06-22T10:01:00.000Z'), actionedAt: null, claimedById: null, claimedAt: null,
      },
      {
        id: 'appr-o', type: 'MERCHANT_ONBOARDING', referenceId: 'm-onb', referenceType: 'merchant',
        status: 'PENDING', adminUserId: null, comment: null,
        submittedAt: new Date('2026-06-22T10:02:00.000Z'), actionedAt: null, claimedById: null, claimedAt: null,
      },
      {
        id: 'appr-e', type: 'MERCHANT_IDENTITY_EDIT', referenceId: 'pe-1', referenceType: 'MerchantPendingEdit',
        status: 'PENDING', adminUserId: null, comment: null,
        submittedAt: new Date('2026-06-22T10:03:00.000Z'), actionedAt: null, claimedById: null, claimedAt: null,
      },
    ]
    return {
      adminApproval: {
        count: vi.fn().mockResolvedValue(rows.length),
        findMany: vi.fn().mockResolvedValue(rows),
      },
      voucher: {
        // VOUCHER referenceId batch load.
        findMany: vi.fn().mockResolvedValue([
          { id: 'v-live', title: 'Live deal', type: 'DISCOUNT_FIXED', status: 'PENDING_APPROVAL', approvalStatus: 'PENDING', merchantId: 'm-live' },
          { id: 'v-wait', title: 'Wait deal', type: 'BOGO', status: 'PENDING_APPROVAL', approvalStatus: 'PENDING', merchantId: 'm-wait' },
        ]),
        // flagship-live count per merchant: m-live has 0 non-ACTIVE, m-wait has 1.
        count: vi.fn().mockImplementation((args: any) =>
          Promise.resolve(args?.where?.merchantId === 'm-wait' ? 1 : 0),
        ),
      },
      merchant: {
        findMany: vi.fn().mockImplementation((args: any) => {
          const ids: string[] = args?.where?.id?.in ?? []
          const all = [
            { id: 'm-onb', businessName: 'Onb Co', status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED', verificationStatus: 'PENDING', contractStatus: 'SIGNED' },
            { id: 'm-live', businessName: 'Live Co', status: 'ACTIVE' },
            { id: 'm-wait', businessName: 'Wait Co', status: 'PENDING_APPROVAL' },
            { id: 'm-edit', businessName: 'Edit Co', status: 'ACTIVE' },
          ]
          return Promise.resolve(all.filter((m) => ids.includes(m.id)))
        }),
      },
      adminUser: { findMany: vi.fn().mockResolvedValue([]) },
      // WF16: MERCHANT_IDENTITY_EDIT row 'appr-e' (referenceId 'pe-1') resolves
      // its merchant via MerchantPendingEdit.merchantId.
      merchantPendingEdit: {
        findMany: vi.fn().mockResolvedValue([{ id: 'pe-1', merchantId: 'm-edit' }]),
      },
      branchPendingEdit: { findMany: vi.fn().mockResolvedValue([]) },
      branch: { findMany: vi.fn().mockResolvedValue([]) },
    } as any
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', makePrisma())
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  it('attaches voucher summary + goLiveHint to VOUCHER rows; onboarding row keeps merchant; edit row unchanged', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals',
      headers: { authorization: `Bearer ${signOps()}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const byId = Object.fromEntries(body.approvals.map((a: any) => [a.id, a]))

    // VOUCHER (go-live merchant): live-now hint.
    expect(byId['appr-v1'].voucher).toEqual({
      title: 'Live deal', type: 'DISCOUNT_FIXED', status: 'PENDING_APPROVAL', approvalStatus: 'PENDING',
    })
    expect(byId['appr-v1'].merchant).toEqual({ id: 'm-live', businessName: 'Live Co', status: 'ACTIVE' })
    expect(byId['appr-v1'].goLiveHint).toBe('live-now')

    // VOUCHER (waiting merchant): waiting-for-go-live hint.
    expect(byId['appr-v2'].voucher.title).toBe('Wait deal')
    expect(byId['appr-v2'].goLiveHint).toBe('waiting-for-go-live')

    // MERCHANT_ONBOARDING keeps its existing merchant enrichment (no voucher block).
    expect(byId['appr-o'].merchant?.businessName).toBe('Onb Co')
    expect(byId['appr-o'].voucher ?? null).toBeNull()
    expect(byId['appr-o'].goLiveHint ?? null).toBeNull()

    // WF16: an identity-edit row now carries a merchant summary (resolved via
    // MerchantPendingEdit.merchantId) instead of "Unknown merchant"; it still
    // gets no voucher block (that stays VOUCHER-only).
    expect(byId['appr-e'].voucher ?? null).toBeNull()
    expect(byId['appr-e'].merchant).toEqual({ id: 'm-edit', businessName: 'Edit Co', status: 'ACTIVE' })

    // No PII / no redemptionPin leak in the serialised queue.
    expect(res.body).not.toMatch(/redemptionPin/i)
  })

  it('does not leak PII and computes flagship-live per distinct merchant (no N+1: count called once per distinct merchant)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals',
      headers: { authorization: `Bearer ${signOps()}` },
    })
    expect(res.statusCode).toBe(200)
    // Two distinct VOUCHER merchants -> exactly two flagship-live count calls.
    expect((app.prisma.voucher.count as any).mock.calls.length).toBe(2)
  })

  // Codex review FIX 1: a VOUCHER approval pointing at a missing/deleted voucher
  // (no row in the batch load) must yield the safe null shape and NEVER throw. The
  // prior code reached the row via a fragile `v!` non-null assertion that was only
  // runtime-safe because the && chain short-circuited; an explicit null guard now
  // returns voucher:null / merchant:null / goLiveHint:null without touching the
  // flagship-live map.
  it('VOUCHER approval whose referenceId matches no voucher yields voucher:null/merchant:null/goLiveHint:null and does not throw', async () => {
    // A stale VOUCHER row (referenceId points at a voucher that no longer exists).
    const stale = {
      id: 'appr-v-stale', type: 'VOUCHER', referenceId: 'v-gone', referenceType: 'voucher',
      status: 'PENDING', adminUserId: null, comment: null,
      submittedAt: new Date('2026-06-22T10:04:00.000Z'), actionedAt: null, claimedById: null, claimedAt: null,
    }
    // findMany still returns ONLY v-live + v-wait (v-gone is absent from the batch).
    app.prisma.adminApproval.findMany = vi.fn().mockResolvedValue([stale])
    app.prisma.adminApproval.count = vi.fn().mockResolvedValue(1)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals',
      headers: { authorization: `Bearer ${signOps()}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const row = body.approvals.find((a: any) => a.id === 'appr-v-stale')
    expect(row).toBeTruthy()
    expect(row.voucher ?? null).toBeNull()
    expect(row.merchant ?? null).toBeNull()
    expect(row.goLiveHint ?? null).toBeNull()
  })
})

// Voucher governed flows: listApprovals enriches each VOUCHER_EDIT row with the
// request kind (CHANGE | END) resolved from its VoucherPendingEdit staging row,
// via ONE batched findMany over the page's VOUCHER_EDIT referenceIds (no N+1;
// curated select: id + kind only). Other row types omit the field entirely; the
// admin-web queue renders "Voucher change request" vs "Voucher end request"
// from it (generic fallback when null).
describe('governed flows: VOUCHER_EDIT queue rows carry voucherEditKind', () => {
  let app: FastifyInstance
  const signOps = () =>
    (app.jwt as any).admin.sign(
      { sub: 'admin-1', role: 'admin', adminRole: 'OPERATIONS', sessionId: 's1' },
      { expiresIn: '1h' },
    )

  function makePrisma() {
    const rows = [
      {
        id: 'appr-ve-change', type: 'VOUCHER_EDIT', referenceId: 'pe-change', referenceType: 'voucher_pending_edit',
        status: 'PENDING', adminUserId: null, comment: null,
        submittedAt: new Date('2026-07-07T10:00:00.000Z'), actionedAt: null, claimedById: null, claimedAt: null,
      },
      {
        id: 'appr-ve-end', type: 'VOUCHER_EDIT', referenceId: 'pe-end', referenceType: 'voucher_pending_edit',
        status: 'PENDING', adminUserId: null, comment: null,
        submittedAt: new Date('2026-07-07T10:01:00.000Z'), actionedAt: null, claimedById: null, claimedAt: null,
      },
      {
        id: 'appr-e', type: 'MERCHANT_IDENTITY_EDIT', referenceId: 'pe-m', referenceType: 'MerchantPendingEdit',
        status: 'PENDING', adminUserId: null, comment: null,
        submittedAt: new Date('2026-07-07T10:02:00.000Z'), actionedAt: null, claimedById: null, claimedAt: null,
      },
    ]
    return {
      adminApproval: {
        count: vi.fn().mockResolvedValue(rows.length),
        findMany: vi.fn().mockResolvedValue(rows),
      },
      voucher: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      merchant: {
        findMany: vi.fn().mockImplementation((args: any) => {
          const ids: string[] = args?.where?.id?.in ?? []
          const all = [
            { id: 'm-ve', businessName: 'Voucher Edit Co', status: 'ACTIVE' },
            { id: 'm-me', businessName: 'Merchant Edit Co', status: 'ACTIVE' },
          ]
          return Promise.resolve(all.filter((m) => ids.includes(m.id)))
        }),
      },
      adminUser: { findMany: vi.fn().mockResolvedValue([]) },
      // WF16: VoucherPendingEdit carries merchantId directly (schema.prisma),
      // so the same batch that resolves kind also resolves the merchant.
      voucherPendingEdit: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'pe-change', kind: 'CHANGE', merchantId: 'm-ve' },
          { id: 'pe-end', kind: 'END', merchantId: 'm-ve' },
        ]),
      },
      // WF16: MERCHANT_IDENTITY_EDIT row 'appr-e' (referenceId 'pe-m').
      merchantPendingEdit: {
        findMany: vi.fn().mockResolvedValue([{ id: 'pe-m', merchantId: 'm-me' }]),
      },
      branchPendingEdit: { findMany: vi.fn().mockResolvedValue([]) },
      branch: { findMany: vi.fn().mockResolvedValue([]) },
    } as any
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', makePrisma())
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  it('attaches voucherEditKind (CHANGE and END) to VOUCHER_EDIT rows via ONE batched lookup; other rows omit it', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals',
      headers: { authorization: `Bearer ${signOps()}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    const changeRow = body.approvals.find((a: any) => a.id === 'appr-ve-change')
    const endRow = body.approvals.find((a: any) => a.id === 'appr-ve-end')
    const editRow = body.approvals.find((a: any) => a.id === 'appr-e')
    expect(changeRow.voucherEditKind).toBe('CHANGE')
    expect(endRow.voucherEditKind).toBe('END')
    // Non-VOUCHER_EDIT rows omit the key entirely (optional field).
    expect('voucherEditKind' in editRow).toBe(false)

    // WF16: VOUCHER_EDIT rows now carry the resolved merchant too (via the
    // same VoucherPendingEdit.merchantId column), and the identity-edit row
    // carries its own merchant (via MerchantPendingEdit.merchantId) instead
    // of "Unknown merchant".
    expect(changeRow.merchant).toEqual({ id: 'm-ve', businessName: 'Voucher Edit Co', status: 'ACTIVE' })
    expect(endRow.merchant).toEqual({ id: 'm-ve', businessName: 'Voucher Edit Co', status: 'ACTIVE' })
    expect(editRow.merchant).toEqual({ id: 'm-me', businessName: 'Merchant Edit Co', status: 'ACTIVE' })

    // ONE batched findMany over exactly the page's VOUCHER_EDIT referenceIds,
    // curated select (kind + merchantId) - no N+1, nothing else selected.
    expect((app.prisma.voucherPendingEdit.findMany as any).mock.calls.length).toBe(1)
    const args = (app.prisma.voucherPendingEdit.findMany as any).mock.calls[0][0]
    expect(args.where).toEqual({ id: { in: ['pe-change', 'pe-end'] } })
    expect(args.select).toEqual({ id: true, kind: true, merchantId: true })
  })

  it('a VOUCHER_EDIT row whose staging row is missing carries voucherEditKind:null (never throws)', async () => {
    app.prisma.voucherPendingEdit.findMany = vi.fn().mockResolvedValue([{ id: 'pe-change', kind: 'CHANGE' }])
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals',
      headers: { authorization: `Bearer ${signOps()}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const endRow = body.approvals.find((a: any) => a.id === 'appr-ve-end')
    expect(endRow.voucherEditKind).toBeNull()
  })
})

// WF16 (acceptance-walk finding): every non-onboarding, non-VOUCHER approval
// row rendered "Unknown merchant" in the queue (the frontend fallback in
// QueueTable.tsx) because listApprovals never resolved a `merchant` block for
// BRANCH_IDENTITY_EDIT / BRANCH_CREATE / BRANCH_CLOSE. Each of those types is
// one hop from a merchant (BranchPendingEdit.merchantId; Branch.merchantId for
// the lifecycle types, since their referenceId IS the branch id) — covered
// here end-to-end through GET /admin/approvals. MERCHANT_PROFILE_EDIT is
// deliberately left unresolved (no code path creates it; referenceId shape
// unverified) and must keep merchant:null.
describe('WF16: branch-edit + branch-lifecycle queue rows carry a merchant summary', () => {
  let app: FastifyInstance
  const signOps = () =>
    (app.jwt as any).admin.sign(
      { sub: 'admin-1', role: 'admin', adminRole: 'OPERATIONS', sessionId: 's1' },
      { expiresIn: '1h' },
    )

  function makePrisma() {
    const rows = [
      {
        id: 'appr-be', type: 'BRANCH_IDENTITY_EDIT', referenceId: 'bpe-1', referenceType: 'branch_pending_edit',
        status: 'PENDING', adminUserId: null, comment: null,
        submittedAt: new Date('2026-07-09T10:00:00.000Z'), actionedAt: null, claimedById: null, claimedAt: null,
      },
      {
        id: 'appr-bc', type: 'BRANCH_CREATE', referenceId: 'branch-new', referenceType: 'branch',
        status: 'PENDING', adminUserId: null, comment: null,
        submittedAt: new Date('2026-07-09T10:01:00.000Z'), actionedAt: null, claimedById: null, claimedAt: null,
      },
      {
        id: 'appr-bx', type: 'BRANCH_CLOSE', referenceId: 'branch-old', referenceType: 'branch',
        status: 'PENDING', adminUserId: null, comment: null,
        submittedAt: new Date('2026-07-09T10:02:00.000Z'), actionedAt: null, claimedById: null, claimedAt: null,
      },
      {
        id: 'appr-pe', type: 'MERCHANT_PROFILE_EDIT', referenceId: 'whatever-1', referenceType: 'unknown',
        status: 'PENDING', adminUserId: null, comment: null,
        submittedAt: new Date('2026-07-09T10:03:00.000Z'), actionedAt: null, claimedById: null, claimedAt: null,
      },
    ]
    return {
      adminApproval: {
        count: vi.fn().mockResolvedValue(rows.length),
        findMany: vi.fn().mockResolvedValue(rows),
      },
      voucher: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      merchant: {
        findMany: vi.fn().mockImplementation((args: any) => {
          const ids: string[] = args?.where?.id?.in ?? []
          const all = [
            { id: 'm-branch-edit', businessName: 'Branch Edit Co', status: 'ACTIVE' },
            { id: 'm-new', businessName: 'New Branch Co', status: 'ACTIVE' },
            { id: 'm-old', businessName: 'Old Branch Co', status: 'ACTIVE' },
          ]
          return Promise.resolve(all.filter((m) => ids.includes(m.id)))
        }),
      },
      adminUser: { findMany: vi.fn().mockResolvedValue([]) },
      voucherPendingEdit: { findMany: vi.fn().mockResolvedValue([]) },
      merchantPendingEdit: { findMany: vi.fn().mockResolvedValue([]) },
      // WF16: BranchPendingEdit carries merchantId directly (schema.prisma).
      branchPendingEdit: {
        findMany: vi.fn().mockResolvedValue([{ id: 'bpe-1', merchantId: 'm-branch-edit' }]),
      },
      // WF16: BRANCH_CREATE/BRANCH_CLOSE referenceId IS the branch id; Branch
      // carries merchantId directly.
      branch: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'branch-new', merchantId: 'm-new' },
          { id: 'branch-old', merchantId: 'm-old' },
        ]),
      },
    } as any
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', makePrisma())
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  it('resolves merchant for BRANCH_IDENTITY_EDIT/BRANCH_CREATE/BRANCH_CLOSE; MERCHANT_PROFILE_EDIT stays null', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals',
      headers: { authorization: `Bearer ${signOps()}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const byId = Object.fromEntries(body.approvals.map((a: any) => [a.id, a]))

    expect(byId['appr-be'].merchant).toEqual({ id: 'm-branch-edit', businessName: 'Branch Edit Co', status: 'ACTIVE' })
    expect(byId['appr-bc'].merchant).toEqual({ id: 'm-new', businessName: 'New Branch Co', status: 'ACTIVE' })
    expect(byId['appr-bx'].merchant).toEqual({ id: 'm-old', businessName: 'Old Branch Co', status: 'ACTIVE' })
    // MERCHANT_PROFILE_EDIT: no code path creates this type and its
    // referenceId shape is unverified — it must keep the safe null, never a
    // guessed resolution.
    expect(byId['appr-pe'].merchant ?? null).toBeNull()

    // No N+1: exactly one batched findMany per source, over exactly this
    // page's referenceIds for that type.
    expect((app.prisma.branchPendingEdit.findMany as any).mock.calls.length).toBe(1)
    expect((app.prisma.branchPendingEdit.findMany as any).mock.calls[0][0]).toEqual({
      where: { id: { in: ['bpe-1'] } },
      select: { id: true, merchantId: true },
    })
    expect((app.prisma.branch.findMany as any).mock.calls.length).toBe(1)
    expect((app.prisma.branch.findMany as any).mock.calls[0][0]).toEqual({
      where: { id: { in: ['branch-new', 'branch-old'] } },
      select: { id: true, merchantId: true },
    })
  })

  it('a BRANCH_IDENTITY_EDIT row whose staging row is missing carries merchant:null (never throws)', async () => {
    app.prisma.branchPendingEdit.findMany = vi.fn().mockResolvedValue([])
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals',
      headers: { authorization: `Bearer ${signOps()}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const row = body.approvals.find((a: any) => a.id === 'appr-be')
    expect(row.merchant ?? null).toBeNull()
  })
})
