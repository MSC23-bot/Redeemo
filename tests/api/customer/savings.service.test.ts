// §Savings Rebaseline (PR-A, Revision 2 — 2026-05-17): service-level pins
// for the byMerchant → byBranch aggregation swap.
//
// The existing `savings.routes.test.ts` mocks the SERVICE layer entirely
// and only verifies route plumbing.  This file targets the actual service
// implementation by mocking the Prisma client and calling the real
// `getSavingsSummary` / `getMonthlyDetail` to verify the aggregation
// logic produces the right shape AND correctly handles:
//
//   - Multi-branch merchant split (Covelum Brightlingsea + Covelum
//     Colchester → TWO byBranch entries, NOT one merged Covelum entry).
//   - REUSABLE voucher redemptions counted once per redemption (a
//     REUSABLE voucher redeemed 3× contributes 3× to saving + count).
//   - TIME_LIMITED voucher redemptions counted normally on each
//     redemption.
//   - Ordering: byBranch descending by saving.
//   - Single-branch merchant: one entry, not collapsed.
//
// The mock-Prisma pattern mirrors `tests/api/customer/discovery.service.test.ts`.

import 'dotenv/config'
import { describe, it, expect, vi } from 'vitest'

// ── Mock @prisma/adapter-pg so new PrismaPg(...) doesn't need a real DB ──────
vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class PrismaPg {
    constructor(_opts: { connectionString: string }) {}
  },
}))

// ── Mock the Prisma client with VoucherRedemption methods ────────────────────
//
// Each test builds a Prisma instance via `makePrismaWithRows(rows)` —
// no shared mutable module-scope state.  `getSavingsSummary` makes:
//   - 1 lifetime aggregate (sum only)
//   - 1 this-month aggregate (sum + count)
//   - 12 monthly-window aggregates (sum + count)
//   - 2 findMany calls (byBranch + byCategory)
// `makePrismaWithRows` sequences the aggregate responses by call order
// (see the call-index dispatch inside) and returns the same `rows` for
// both findMany calls; the service reads only the fields it `select`-ed,
// so extra fields are harmless.

type Row = {
  estimatedSaving: number
  branch: { id: string; name: string }
  voucher: {
    // `voucherType` is fixture-readability ONLY — documents per-row
    // intent (REUSABLE / TIME_LIMITED / BOGO) so the test reader can
    // see what mix is being exercised.  The service sums redemption
    // rows directly and does NOT branch on voucher type, so the field
    // is never read by the production code; including it in the
    // fixture just makes assertions like "REUSABLE + TIME_LIMITED +
    // BOGO mix all count" self-documenting.
    voucherType?: string
    merchant: {
      id:           string
      businessName: string
      tradingName?: string | null
      logoUrl:      string | null
      primaryCategory?: { id: string; name: string } | null
    }
  }
}

vi.mock('../../../generated/prisma/client', () => {
  class PrismaClient {
    voucherRedemption = {
      aggregate: vi.fn().mockImplementation(async () => ({
        _sum:   { estimatedSaving: 0 },
        _count: { id: 0 },
      })),
      findMany: vi.fn().mockImplementation(async () => [] as Row[]),
      count:    vi.fn().mockImplementation(async () => 0),
    }
    constructor(_opts?: any) {}
  }
  return { PrismaClient }
})

import { getSavingsSummary, getMonthlyDetail } from '../../../src/api/customer/savings/service'
import { PrismaClient } from '../../../generated/prisma/client'

// These suites are pure method-stub mock harnesses — every Prisma query method is
// overridden per-test and no real connection is ever opened. Prisma 7's constructor
// requires a driver adapter, so we bypass the constructor type with
// `new (PrismaClient as any)()` rather than constructing a real adapter.

function makePrismaWithRows(rows: Row[], opts?: { lifetimeSum?: number; thisMonthSum?: number; thisMonthCount?: number }) {
  const prisma = new (PrismaClient as any)()
  const lifetimeSum    = opts?.lifetimeSum    ?? rows.reduce((s, r) => s + r.estimatedSaving, 0)
  const thisMonthSum   = opts?.thisMonthSum   ?? lifetimeSum
  const thisMonthCount = opts?.thisMonthCount ?? rows.length

  // Aggregate calls — ORDER-SENSITIVE.  `getSavingsSummary` issues them
  // in this exact sequence:
  //   1. lifetime              (sum only, no date filter)
  //   2. this-month            (sum + count, current month window)
  //   3. monthly-window[0]     (sum + count, current month)
  //   4..14. monthly-window[1..11]  (sum + count, past 11 months)
  // `getMonthlyDetail` issues a single aggregate (idx 1).
  // If the service reorders these in the future, the call-index
  // dispatch below needs updating in lockstep.  See
  // `src/api/customer/savings/service.ts` for the canonical order.
  let aggCallIdx = 0
  prisma.voucherRedemption.aggregate = vi.fn().mockImplementation(async () => {
    aggCallIdx++
    if (aggCallIdx === 1) return { _sum: { estimatedSaving: lifetimeSum }, _count: { id: rows.length } }
    if (aggCallIdx === 2) return { _sum: { estimatedSaving: thisMonthSum }, _count: { id: thisMonthCount } }
    // monthly-window aggregates: idx 3 = current month (matches this-month),
    // idx 4-14 = past 11 months (zero-filled).
    if (aggCallIdx === 3) return { _sum: { estimatedSaving: thisMonthSum }, _count: { id: thisMonthCount } }
    return { _sum: { estimatedSaving: 0 }, _count: { id: 0 } }
  })

  // findMany: first call is byBranch (rows include branch + merchant),
  // second call is byCategory (rows include merchant.primaryCategory).
  // The select shapes differ but we hand the same fixture to both —
  // the service only reads the fields it asked for, so extra fields
  // are harmless.
  prisma.voucherRedemption.findMany = vi.fn().mockImplementation(async () => rows)
  prisma.voucherRedemption.count    = vi.fn().mockResolvedValue(rows.length)

  return prisma
}

function row(
  branchId: string,
  branchName: string,
  merchantId: string,
  merchantName: string,
  estimatedSaving: number,
  voucherType: string = 'BOGO',
  tradingName: string | null = null,
): Row {
  return {
    estimatedSaving,
    branch: { id: branchId, name: branchName },
    voucher: {
      voucherType,
      merchant: {
        id:           merchantId,
        businessName: merchantName,
        tradingName,
        logoUrl:      null,
        primaryCategory: { id: 'cat-food', name: 'Food & Drink' },
      },
    },
  }
}

describe('savings.service — Revision 2 byBranch aggregation', () => {
  // Load-bearing pin: multi-branch merchant splits into TWO byBranch
  // entries with shared merchantId / merchantName.  Per the branch-as-
  // PRIMARY-unit locked rule, a user who redeemed at Covelum
  // Brightlingsea and Covelum Colchester must see two distinct rows in
  // Top branches — not one merged "Covelum: £25" row.
  it('getSavingsSummary: multi-branch merchant splits into TWO byBranch entries (Covelum Brightlingsea + Covelum Colchester)', async () => {
    const rows = [
      row('br-bright', 'Brightlingsea', 'covelum-id', 'Covelum', 15.00),
      row('br-colch',  'Colchester',    'covelum-id', 'Covelum', 10.00),
    ]
    const prisma = makePrismaWithRows(rows)
    const result = await getSavingsSummary(prisma, 'user-1')

    expect(result.byBranch).toHaveLength(2)
    expect(result.byBranch[0]).toMatchObject({
      branchId:     'br-bright',
      branchName:   'Brightlingsea',
      merchantId:   'covelum-id',
      merchantName: 'Covelum',
      saving:       15.00,
      count:        1,
    })
    expect(result.byBranch[1]).toMatchObject({
      branchId:     'br-colch',
      branchName:   'Colchester',
      merchantId:   'covelum-id',
      merchantName: 'Covelum',
      saving:       10.00,
      count:        1,
    })
    // Both entries share the same merchantId — the rebaseline rule is
    // branch-split, NOT merchant-de-duplication.
    expect(result.byBranch[0].merchantId).toBe(result.byBranch[1].merchantId)
  })

  // Ordering pin: descending by saving regardless of insertion order.
  it('getSavingsSummary: byBranch sorted descending by saving', async () => {
    const rows = [
      row('br-low',  'LowSaving',  'm1', 'Merchant', 3.00),
      row('br-high', 'HighSaving', 'm1', 'Merchant', 20.00),
      row('br-mid',  'MidSaving',  'm1', 'Merchant', 11.00),
    ]
    const prisma = makePrismaWithRows(rows)
    const result = await getSavingsSummary(prisma, 'user-1')

    expect(result.byBranch.map(b => b.branchName)).toEqual(['HighSaving', 'MidSaving', 'LowSaving'])
    expect(result.byBranch.map(b => b.saving)).toEqual([20.00, 11.00, 3.00])
  })

  // Single-branch merchant: one byBranch entry, not collapsed away.
  it('getSavingsSummary: single-branch merchant produces one byBranch entry', async () => {
    const rows = [row('br-only', 'Only Branch', 'm1', 'Karaara', 8.00)]
    const prisma = makePrismaWithRows(rows)
    const result = await getSavingsSummary(prisma, 'user-1')

    expect(result.byBranch).toHaveLength(1)
    expect(result.byBranch[0]).toMatchObject({
      branchId:   'br-only',
      branchName: 'Only Branch',
      merchantId: 'm1',
      saving:     8.00,
      count:      1,
    })
  })

  // Trading-name fallback pin (Kraft Store defect fix): `merchantName`
  // on byBranch rows must prefer a non-blank `tradingName` over the
  // legal `businessName`. Server-side resolution: no customer-app
  // schema/wire-shape change needed for this field.
  it('getSavingsSummary: byBranch merchantName prefers a non-blank tradingName over businessName', async () => {
    const rows = [
      row('br-1', 'Branch One', 'm1', 'The Kraft Store Pvt Ltd', 10.00, 'BOGO', 'The Kraft Store'),
    ]
    const prisma = makePrismaWithRows(rows)
    const result = await getSavingsSummary(prisma, 'user-1')

    expect(result.byBranch[0]?.merchantName).toBe('The Kraft Store')
  })

  it('getSavingsSummary: byBranch merchantName falls back to businessName when tradingName is null', async () => {
    const rows = [row('br-1', 'Branch One', 'm1', 'The Kraft Store Pvt Ltd', 10.00, 'BOGO', null)]
    const prisma = makePrismaWithRows(rows)
    const result = await getSavingsSummary(prisma, 'user-1')

    expect(result.byBranch[0]?.merchantName).toBe('The Kraft Store Pvt Ltd')
  })

  it('getSavingsSummary: byBranch merchantName falls back to businessName when tradingName is blank/whitespace', async () => {
    const rows = [row('br-1', 'Branch One', 'm1', 'The Kraft Store Pvt Ltd', 10.00, 'BOGO', '   ')]
    const prisma = makePrismaWithRows(rows)
    const result = await getSavingsSummary(prisma, 'user-1')

    expect(result.byBranch[0]?.merchantName).toBe('The Kraft Store Pvt Ltd')
  })

  // §Voucher type handling rule (Revision 2 spec amendment): REUSABLE
  // and TIME_LIMITED redemptions count toward all aggregates the same
  // as any other voucher type.  This pin guards against a future filter
  // regression (e.g., someone adding `where: { voucher: { voucherType:
  // { not: 'REUSABLE' } } }` thinking REUSABLE shouldn't count).
  it('getSavingsSummary: REUSABLE + TIME_LIMITED + BOGO redemptions ALL contribute to byBranch totals', async () => {
    const rows = [
      // REUSABLE voucher used 3× at the same branch (cooldown cycles
      // make multiple redemptions of the same voucher legitimate).
      row('br-x', 'Branch X', 'm1', 'Merchant', 4.00, 'REUSABLE'),
      row('br-x', 'Branch X', 'm1', 'Merchant', 4.00, 'REUSABLE'),
      row('br-x', 'Branch X', 'm1', 'Merchant', 4.00, 'REUSABLE'),
      // TIME_LIMITED redemption.
      row('br-x', 'Branch X', 'm1', 'Merchant', 6.00, 'TIME_LIMITED'),
      // Regular BOGO for comparison.
      row('br-x', 'Branch X', 'm1', 'Merchant', 8.00, 'BOGO'),
    ]
    const prisma = makePrismaWithRows(rows)
    const result = await getSavingsSummary(prisma, 'user-1')

    // All 5 redemptions roll up into the same branch entry.
    expect(result.byBranch).toHaveLength(1)
    expect(result.byBranch[0]).toMatchObject({
      branchId:   'br-x',
      branchName: 'Branch X',
      saving:     26.00,  // 4+4+4+6+8
      count:      5,
    })
    // Lifetime sum includes ALL voucher types — no filter exclusions.
    expect(result.lifetimeSaving).toBe(26.00)
    // Monthly count + sum also include all types.
    expect(result.thisMonthRedemptionCount).toBe(5)
    expect(result.thisMonthSaving).toBe(26.00)
  })

  // No redemptions: byBranch is empty, totals zero, monthlyBreakdown
  // still produces 12 zero-filled entries.
  it('getSavingsSummary: zero redemptions → empty byBranch + zero totals + 12-month zero-fill', async () => {
    const prisma = makePrismaWithRows([], { lifetimeSum: 0, thisMonthSum: 0, thisMonthCount: 0 })
    const result = await getSavingsSummary(prisma, 'user-1')

    expect(result.byBranch).toHaveLength(0)
    expect(result.lifetimeSaving).toBe(0)
    expect(result.thisMonthSaving).toBe(0)
    expect(result.thisMonthRedemptionCount).toBe(0)
    expect(result.monthlyBreakdown).toHaveLength(12)
  })

  // Regression pin: the response object must NOT carry a `byMerchant`
  // field.  If a future change reintroduces merchant-level rollup, this
  // test fails loudly.
  it('getSavingsSummary: response shape does NOT include legacy byMerchant field', async () => {
    const rows = [row('br-x', 'Branch X', 'm1', 'Merchant', 5.00)]
    const prisma = makePrismaWithRows(rows)
    const result = await getSavingsSummary(prisma, 'user-1') as any

    expect(result.byBranch).toBeDefined()
    expect(result.byMerchant).toBeUndefined()
  })

  // ─── getMonthlyDetail mirrors the same contract ────────────────────────────
  describe('getMonthlyDetail', () => {
    it('multi-branch merchant split applies on the monthly endpoint too', async () => {
      const rows = [
        row('br-bright', 'Brightlingsea', 'covelum-id', 'Covelum', 12.00),
        row('br-colch',  'Colchester',    'covelum-id', 'Covelum', 8.00),
      ]
      const prisma = makePrismaWithRows(rows)
      const result = await getMonthlyDetail(prisma, 'user-1', '2026-04')

      expect(result.byBranch).toHaveLength(2)
      expect(result.byBranch[0].branchName).toBe('Brightlingsea')
      expect(result.byBranch[1].branchName).toBe('Colchester')
      expect(result.totalSaving).toBe(20.00)
      expect(result.redemptionCount).toBe(2)
    })

    it('REUSABLE + TIME_LIMITED redemptions contribute to monthly byBranch totals', async () => {
      const rows = [
        row('br-y', 'Branch Y', 'm1', 'Merchant', 3.00, 'REUSABLE'),
        row('br-y', 'Branch Y', 'm1', 'Merchant', 3.00, 'REUSABLE'),
        row('br-y', 'Branch Y', 'm1', 'Merchant', 5.00, 'TIME_LIMITED'),
      ]
      const prisma = makePrismaWithRows(rows)
      const result = await getMonthlyDetail(prisma, 'user-1', '2026-04')

      expect(result.byBranch).toHaveLength(1)
      expect(result.byBranch[0]).toMatchObject({
        branchName: 'Branch Y',
        saving:     11.00,  // 3+3+5
        count:      3,
      })
    })

    // Trading-name fallback pin: mirrors the getSavingsSummary pin above.
    it('byBranch merchantName prefers a non-blank tradingName over businessName', async () => {
      const rows = [
        row('br-1', 'Branch One', 'm1', 'The Kraft Store Pvt Ltd', 10.00, 'BOGO', 'The Kraft Store'),
      ]
      const prisma = makePrismaWithRows(rows)
      const result = await getMonthlyDetail(prisma, 'user-1', '2026-04')

      expect(result.byBranch[0]?.merchantName).toBe('The Kraft Store')
    })

    it('byBranch merchantName falls back to businessName when tradingName is null', async () => {
      const rows = [row('br-1', 'Branch One', 'm1', 'The Kraft Store Pvt Ltd', 10.00, 'BOGO', null)]
      const prisma = makePrismaWithRows(rows)
      const result = await getMonthlyDetail(prisma, 'user-1', '2026-04')

      expect(result.byBranch[0]?.merchantName).toBe('The Kraft Store Pvt Ltd')
    })

    it('response shape does NOT include legacy byMerchant field', async () => {
      const rows = [row('br-x', 'Branch X', 'm1', 'Merchant', 5.00)]
      const prisma = makePrismaWithRows(rows)
      const result = await getMonthlyDetail(prisma, 'user-1', '2026-04') as any

      expect(result.byBranch).toBeDefined()
      expect(result.byMerchant).toBeUndefined()
    })
  })
})

// ─── getSavingsRedemptions response-shape pins (2026-05-17 hotfix) ──────────
//
// Backend bug shipped via PR #3ce9451 (the original savings routes
// commit, well before PR #104).  The Prisma `select` and the result
// access used `voucherType` — the actual schema field is `type`.
// Prisma caught it at JSON-validation time as a runtime error; the
// existing mock-Prisma test suite did NOT exercise this function so
// the bug was never seen until on-device QA for PR-B (#105) hit the
// `/api/v1/customer/savings/redemptions` endpoint and got 500s.
//
// Why tsc doesn't catch this: Prisma 7's generated select-arg types
// are broader than the schema (they accept any string-key object); the
// runtime validation is the source of truth.  The fix is the
// `select: { type: true }` swap in `getSavingsRedemptions` PLUS the
// response mapping `voucherType: r.voucher.type` (so the customer-app
// contract — `voucherType` — stays unchanged).
//
// These tests pin the OUTPUT shape so a future regression that
// renames the response field gets caught.  They do NOT exercise real
// Prisma (the mock accepts any select shape), so the "wrong Prisma
// field name" half of the bug would still need a real-DB integration
// test to catch.  That's a deferred follow-up — for now, tsc's
// permissive select types are a known gap and the recommendation is
// to add a dedicated integration test for getSavingsRedemptions
// once an integration-test pattern is established for this codebase.

import { getSavingsRedemptions } from '../../../src/api/customer/savings/service'

describe('savings.service — getSavingsRedemptions response shape (hotfix pin)', () => {
  function makePrismaForRedemptions(rawRows: Array<{
    id: string
    redeemedAt: Date
    estimatedSaving: number
    isValidated: boolean
    validatedAt: Date | null
    voucher: { id: string; title: string; type: string; merchant: { id: string; businessName: string; tradingName?: string | null; logoUrl: string | null } }
    branch: { id: string; name: string }
  }>) {
    const prisma = new (PrismaClient as any)()
    prisma.voucherRedemption.findMany = vi.fn().mockResolvedValue(rawRows)
    prisma.voucherRedemption.count    = vi.fn().mockResolvedValue(rawRows.length)
    return prisma
  }

  it('maps Prisma `voucher.type` → response `voucherType` (contract-rename pin)', async () => {
    const prisma = makePrismaForRedemptions([
      {
        id: 'red-1',
        redeemedAt: new Date('2026-05-15T10:00:00Z'),
        estimatedSaving: 12.5,
        isValidated: false,
        validatedAt: null,
        voucher: {
          id: 'v-1',
          title: 'Free filter coffee',
          type: 'FREEBIE',  // ← schema field is `type`, not `voucherType`
          merchant: { id: 'cov', businessName: 'Covelum', logoUrl: null },
        },
        branch: { id: 'br-1', name: 'Brightlingsea' },
      },
    ])

    const result = await getSavingsRedemptions(prisma, 'user-1', { limit: 20, offset: 0 })

    expect(result.redemptions).toHaveLength(1)
    const r = result.redemptions[0]
    expect(r).toBeDefined()
    if (!r) throw new Error('unreachable')
    // ── The contract pin: response field is `voucherType` (customer-
    //    app Zod expects this), populated from Prisma's `voucher.type`.
    expect(r.voucher).toMatchObject({
      id:          'v-1',
      title:       'Free filter coffee',
      voucherType: 'FREEBIE',
    })
    // Defensive: legacy `type` field name MUST NOT leak into the
    // response — customer-app Zod would silently drop it (passthrough)
    // but a future contract-strict mode could reject the row.
    expect((r.voucher as any).type).toBeUndefined()
  })

  // Trading-name fallback pin (Kraft Store defect fix): the response
  // `merchant.businessName` field carries the resolved display name:
  // trading name when set (non-blank), else the legal business name.
  // Server-side resolution: the customer-app schema field name is
  // UNCHANGED (`businessName`) so no client change was needed.
  it('merchant.businessName prefers a non-blank tradingName over the legal businessName', async () => {
    const prisma = makePrismaForRedemptions([
      {
        id: 'red-1',
        redeemedAt: new Date('2026-05-15T10:00:00Z'),
        estimatedSaving: 12.5,
        isValidated: false,
        validatedAt: null,
        voucher: {
          id: 'v-1',
          title: 'Free filter coffee',
          type: 'FREEBIE',
          merchant: { id: 'kraft', businessName: 'The Kraft Store Pvt Ltd', tradingName: 'The Kraft Store', logoUrl: null },
        },
        branch: { id: 'br-1', name: 'Brightlingsea' },
      },
    ])

    const result = await getSavingsRedemptions(prisma, 'user-1', { limit: 20, offset: 0 })

    expect(result.redemptions[0]?.merchant.businessName).toBe('The Kraft Store')
  })

  it('merchant.businessName falls back to the legal businessName when tradingName is null', async () => {
    const prisma = makePrismaForRedemptions([
      {
        id: 'red-1',
        redeemedAt: new Date('2026-05-15T10:00:00Z'),
        estimatedSaving: 12.5,
        isValidated: false,
        validatedAt: null,
        voucher: {
          id: 'v-1',
          title: 'Free filter coffee',
          type: 'FREEBIE',
          merchant: { id: 'kraft', businessName: 'The Kraft Store Pvt Ltd', tradingName: null, logoUrl: null },
        },
        branch: { id: 'br-1', name: 'Brightlingsea' },
      },
    ])

    const result = await getSavingsRedemptions(prisma, 'user-1', { limit: 20, offset: 0 })

    expect(result.redemptions[0]?.merchant.businessName).toBe('The Kraft Store Pvt Ltd')
  })

  it('covers all 8 voucher types end-to-end (BOGO / FREEBIE / TIME_LIMITED / REUSABLE / DISCOUNT_FIXED / DISCOUNT_PERCENT / SPEND_AND_SAVE / PACKAGE_DEAL)', async () => {
    const types = [
      'BOGO', 'FREEBIE', 'TIME_LIMITED', 'REUSABLE',
      'DISCOUNT_FIXED', 'DISCOUNT_PERCENT', 'SPEND_AND_SAVE', 'PACKAGE_DEAL',
    ]
    const rawRows = types.map((t, i) => ({
      id: `red-${i}`,
      redeemedAt: new Date('2026-05-15T10:00:00Z'),
      estimatedSaving: 5,
      isValidated: false,
      validatedAt: null,
      voucher: {
        id: `v-${i}`,
        title: `Voucher ${i}`,
        type: t,
        merchant: { id: 'm', businessName: 'M', logoUrl: null },
      },
      branch: { id: 'br', name: 'B' },
    }))
    const prisma = makePrismaForRedemptions(rawRows)

    const result = await getSavingsRedemptions(prisma, 'user-1', { limit: 20, offset: 0 })

    expect(result.redemptions.map(r => r.voucher.voucherType)).toEqual(types)
  })

  it('passes pagination offset + limit through to Prisma skip/take', async () => {
    const prisma = makePrismaForRedemptions([])

    await getSavingsRedemptions(prisma, 'user-1', { limit: 50, offset: 100 })

    expect(prisma.voucherRedemption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 100, take: 50 }),
    )
  })

  it('total reflects Prisma count, NOT rows.length (paginated case)', async () => {
    const prisma = new (PrismaClient as any)()
    prisma.voucherRedemption.findMany = vi.fn().mockResolvedValue([])
    prisma.voucherRedemption.count    = vi.fn().mockResolvedValue(247)

    const result = await getSavingsRedemptions(prisma, 'user-1', { limit: 20, offset: 0 })

    expect(result.total).toBe(247)
    expect(result.redemptions).toHaveLength(0)
  })
})

// ─── §BN month-scoped Redemption History (Revision-3, 2026-05-18) ──────────
//
// The customer-app Savings tab passes the currently-selected trend
// month to `getSavingsRedemptions` so the history section shows that
// month's redemptions exclusively.  Spec amendment in
// `docs/superpowers/specs/2026-04-18-savings-tab-design.md` documents
// the Revision-2 → Revision-3 flip.
//
// These tests pin:
//   1. With `month` supplied: Prisma sees the correct UTC bounds AND
//      both findMany + count share the same where clause (pagination
//      total contract).
//   2. With `month` omitted: the all-time behaviour from Revision-2
//      is preserved (regression pin — protects against accidental
//      always-filter regressions).
//   3. Pagination still operates correctly within the month-scoped
//      result set.
//   4. Empty month returns `{ redemptions: [], total: 0 }`.

describe('savings.service — §BN month-scoped getSavingsRedemptions', () => {
  function makePrismaForMonthScope(rawRows: Array<{
    id: string
    redeemedAt: Date
    estimatedSaving: number
    isValidated: boolean
    validatedAt: Date | null
    voucher: { id: string; title: string; type: string; merchant: { id: string; businessName: string; logoUrl: string | null } }
    branch: { id: string; name: string }
  }>, total: number) {
    const prisma = new (PrismaClient as any)()
    prisma.voucherRedemption.findMany = vi.fn().mockResolvedValue(rawRows)
    prisma.voucherRedemption.count    = vi.fn().mockResolvedValue(total)
    return prisma
  }

  it('month=YYYY-MM passes correct UTC date-range filter to Prisma', async () => {
    const prisma = makePrismaForMonthScope([], 0)

    await getSavingsRedemptions(prisma, 'user-1', { limit: 20, offset: 0, month: '2026-03' })

    expect(prisma.voucherRedemption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          redeemedAt: {
            gte: new Date(Date.UTC(2026, 2, 1)),  // March 1, 2026 UTC (mon-1 for 0-indexed)
            lt:  new Date(Date.UTC(2026, 3, 1)),  // April 1, 2026 UTC (boundary)
          },
        }),
      }),
    )
  })

  it('findMany + count share the SAME where clause (pagination contract pin)', async () => {
    const prisma = makePrismaForMonthScope([], 0)

    await getSavingsRedemptions(prisma, 'user-1', { limit: 20, offset: 0, month: '2026-03' })

    const findManyCall = prisma.voucherRedemption.findMany.mock.calls[0][0]
    const countCall    = prisma.voucherRedemption.count.mock.calls[0][0]

    // Both queries must filter on the same boundaries — otherwise
    // `total` could under/over-report and break the "Load more"
    // pagination contract.
    expect(countCall.where).toEqual(findManyCall.where)
  })

  it('month omitted: preserves all-time behaviour (REGRESSION pin)', async () => {
    const prisma = makePrismaForMonthScope([], 0)

    await getSavingsRedemptions(prisma, 'user-1', { limit: 20, offset: 0 })

    // findMany.where should be ONLY { userId } — no redeemedAt clause.
    expect(prisma.voucherRedemption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
      }),
    )
    expect(prisma.voucherRedemption.count).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
  })

  it('pagination operates WITHIN the month-scoped result set (skip + take preserved)', async () => {
    const prisma = makePrismaForMonthScope([], 0)

    await getSavingsRedemptions(prisma, 'user-1', { limit: 10, offset: 30, month: '2026-04' })

    expect(prisma.voucherRedemption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 30,
        take: 10,
        where: expect.objectContaining({
          userId: 'user-1',
          redeemedAt: {
            gte: new Date(Date.UTC(2026, 3, 1)),  // April 1
            lt:  new Date(Date.UTC(2026, 4, 1)),  // May 1
          },
        }),
      }),
    )
  })

  it('month with zero redemptions returns { redemptions: [], total: 0 }', async () => {
    const prisma = makePrismaForMonthScope([], 0)

    const result = await getSavingsRedemptions(prisma, 'user-1', {
      limit: 20, offset: 0, month: '2026-02',
    })

    expect(result).toEqual({ redemptions: [], total: 0 })
  })

  it('month total reflects the month-scoped Prisma count (NOT all-time)', async () => {
    // Real-world: user has 247 redemptions all-time but only 4 in March.
    // findMany returns the 4 March rows; count returns 4 (month-scoped).
    const marchRows = [
      {
        id: 'red-march-1',
        redeemedAt: new Date('2026-03-15T10:00:00Z'),
        estimatedSaving: 12.5,
        isValidated: true,
        validatedAt: new Date('2026-03-15T10:05:00Z'),
        voucher: {
          id: 'v-1', title: 'BOGO Pizza', type: 'BOGO',
          merchant: { id: 'm-1', businessName: 'Bella Italia', logoUrl: null },
        },
        branch: { id: 'br-1', name: 'Soho' },
      },
    ]
    const prisma = makePrismaForMonthScope(marchRows, 4)

    const result = await getSavingsRedemptions(prisma, 'user-1', {
      limit: 20, offset: 0, month: '2026-03',
    })

    expect(result.total).toBe(4)
    expect(result.redemptions).toHaveLength(1)
    expect(result.redemptions[0]?.id).toBe('red-march-1')
  })

  it('December → January boundary advances year correctly (UTC)', async () => {
    const prisma = makePrismaForMonthScope([], 0)

    await getSavingsRedemptions(prisma, 'user-1', { limit: 20, offset: 0, month: '2026-12' })

    expect(prisma.voucherRedemption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          redeemedAt: {
            gte: new Date(Date.UTC(2026, 11, 1)),  // Dec 1, 2026
            lt:  new Date(Date.UTC(2027, 0,  1)),  // Jan 1, 2027 — year advances
          },
        }),
      }),
    )
  })
})
