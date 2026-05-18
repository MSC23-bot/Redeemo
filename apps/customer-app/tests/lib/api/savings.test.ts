import { api } from '@/lib/api'
import { savingsApi } from '@/lib/api/savings'

jest.spyOn(api, 'get')

// §Savings Rebaseline (PR-B, Revision 2 — 2026-05-17).  Pins the
// `byBranch` contract shipped via PR #104 against the customer-app
// client. Three regression pins:
//   1. The full Revision-2 shape parses (branchId/branchName/merchantId/
//      merchantName/merchantLogoUrl/saving/count on every byBranch entry).
//   2. `byMerchant` is NOT a legal field — if the backend ever drifts
//      back to merchant-level, the schema rejects it.
//   3. `offset=0` makes it into the query string (defensive: ref-branch
//      used `if (params.offset)` which silently omitted the 0 case).

// Live-captured shape mirroring `getSavingsSummary` post PR #104.
// Includes multi-branch merchant (Covelum Brightlingsea + Colchester)
// to confirm distinct entries with shared merchantId/merchantName.
const SUMMARY_FIXTURE = {
  lifetimeSaving: '247.50',                // STRING — Prisma Decimal
  thisMonthSaving: 32.0,                   // NUMBER — mirror works either way
  thisMonthRedemptionCount: 5,
  monthlyBreakdown: [
    { month: '2026-05', saving: '32.00', count: 5 },
    { month: '2026-04', saving:  19.50,  count: 3 },
  ],
  byBranch: [
    {
      branchId: 'br-bright',
      branchName: 'Covelum — Brightlingsea',
      merchantId: 'cov',
      merchantName: 'Covelum',
      merchantLogoUrl: null,
      saving: '15.00',
      count: 2,
    },
    {
      branchId: 'br-colch',
      branchName: 'Colchester',
      merchantId: 'cov',
      merchantName: 'Covelum',
      merchantLogoUrl: 'https://cdn.example.com/covelum.png',
      saving: '10.00',
      count: 1,
    },
  ],
  byCategory: [
    { categoryId: 'food', name: 'Food & Drink', saving: '20.00' },
  ],
}

const REDEMPTIONS_FIXTURE = {
  redemptions: [
    {
      id: 'red-1',
      redeemedAt: '2026-05-17T10:30:00.000Z',
      estimatedSaving: '12.00',
      isValidated: false,
      validatedAt: null,
      merchant: { id: 'cov', businessName: 'Covelum', logoUrl: null },
      voucher: { id: 'v-1', title: 'BOGO Karaara', voucherType: 'BOGO' as const },
      branch:  { id: 'br-bright', name: 'Covelum — Brightlingsea' },
    },
  ],
  total: 1,
}

const MONTHLY_DETAIL_FIXTURE = {
  totalSaving: '32.00',
  redemptionCount: 5,
  byBranch: [
    {
      branchId: 'br-bright',
      branchName: 'Covelum — Brightlingsea',
      merchantId: 'cov',
      merchantName: 'Covelum',
      merchantLogoUrl: null,
      saving: '15.00',
      count: 2,
    },
  ],
  byCategory: [{ categoryId: 'food', name: 'Food & Drink', saving: '20.00' }],
}

describe('savingsApi.getSummary', () => {
  beforeEach(() => { (api.get as jest.Mock).mockReset() })

  it('parses the Revision-2 byBranch shape (multi-branch merchant produces TWO entries)', async () => {
    (api.get as jest.Mock).mockResolvedValue(SUMMARY_FIXTURE)
    const result = await savingsApi.getSummary()

    // Decimal strings coerced to numbers.
    expect(result.lifetimeSaving).toBe(247.5)
    expect(typeof result.lifetimeSaving).toBe('number')
    expect(result.thisMonthSaving).toBe(32)

    // Multi-branch split: shared merchantId, distinct branchIds.
    expect(result.byBranch).toHaveLength(2)
    expect(result.byBranch[0]!.branchId).toBe('br-bright')
    expect(result.byBranch[1]!.branchId).toBe('br-colch')
    expect(result.byBranch[0]!.merchantId).toBe('cov')
    expect(result.byBranch[1]!.merchantId).toBe('cov')
    expect(result.byBranch[0]!.merchantName).toBe('Covelum')
    expect(result.byBranch[1]!.merchantName).toBe('Covelum')

    // merchantLogoUrl nullable — first row null, second populated.
    expect(result.byBranch[0]!.merchantLogoUrl).toBeNull()
    expect(result.byBranch[1]!.merchantLogoUrl).toBe('https://cdn.example.com/covelum.png')

    // saving coerced to number on each entry.
    expect(result.byBranch[0]!.saving).toBe(15)
    expect(result.byBranch[1]!.saving).toBe(10)
  })

  it('hits the correct endpoint (no query params)', async () => {
    (api.get as jest.Mock).mockResolvedValue(SUMMARY_FIXTURE)
    await savingsApi.getSummary()
    expect(api.get).toHaveBeenCalledWith('/api/v1/customer/savings/summary')
  })

  it('regression: schema rejects a `byMerchant` payload (Revision-1 contract)', async () => {
    const REVISION_1_FIXTURE = {
      ...SUMMARY_FIXTURE,
      byMerchant: SUMMARY_FIXTURE.byBranch.map((b) => ({
        merchantId:   b.merchantId,
        businessName: b.merchantName,
        logoUrl:      b.merchantLogoUrl,
        saving:       b.saving,
        count:        b.count,
      })),
    }
    delete (REVISION_1_FIXTURE as { byBranch?: unknown }).byBranch

    ;(api.get as jest.Mock).mockResolvedValue(REVISION_1_FIXTURE)

    // `parse` throws on missing required field — `byBranch`.
    await expect(savingsApi.getSummary()).rejects.toThrow()
  })

  it('regression: parsed result does NOT carry a `byMerchant` field', async () => {
    (api.get as jest.Mock).mockResolvedValue(SUMMARY_FIXTURE)
    const result = await savingsApi.getSummary()
    expect(result).not.toHaveProperty('byMerchant')
  })
})

describe('savingsApi.getRedemptions', () => {
  beforeEach(() => { (api.get as jest.Mock).mockReset() })

  it('sends limit + offset query params when provided', async () => {
    (api.get as jest.Mock).mockResolvedValue(REDEMPTIONS_FIXTURE)
    await savingsApi.getRedemptions({ limit: 20, offset: 40 })
    expect(api.get).toHaveBeenCalledWith('/api/v1/customer/savings/redemptions?limit=20&offset=40')
  })

  it('sends offset=0 explicitly (regression: ref-branch dropped 0 via falsy check)', async () => {
    (api.get as jest.Mock).mockResolvedValue(REDEMPTIONS_FIXTURE)
    await savingsApi.getRedemptions({ limit: 20, offset: 0 })
    expect(api.get).toHaveBeenCalledWith('/api/v1/customer/savings/redemptions?limit=20&offset=0')
  })

  it('omits the query string entirely when no params are passed', async () => {
    (api.get as jest.Mock).mockResolvedValue(REDEMPTIONS_FIXTURE)
    await savingsApi.getRedemptions()
    expect(api.get).toHaveBeenCalledWith('/api/v1/customer/savings/redemptions')
  })

  it('parses the redemption response and coerces estimatedSaving', async () => {
    (api.get as jest.Mock).mockResolvedValue(REDEMPTIONS_FIXTURE)
    const result = await savingsApi.getRedemptions({ limit: 20, offset: 0 })
    expect(result.total).toBe(1)
    expect(result.redemptions[0]!.estimatedSaving).toBe(12)
    expect(result.redemptions[0]!.branch.name).toBe('Covelum — Brightlingsea')
    expect(result.redemptions[0]!.voucher.voucherType).toBe('BOGO')
  })

  it('accepts all current voucher types (BOGO + TIME_LIMITED + REUSABLE coverage)', async () => {
    const ALL_TYPES = ['BOGO', 'SPEND_AND_SAVE', 'DISCOUNT_FIXED', 'DISCOUNT_PERCENT', 'FREEBIE', 'PACKAGE_DEAL', 'TIME_LIMITED', 'REUSABLE'] as const
    const fixture = {
      redemptions: ALL_TYPES.map((vt, i) => ({
        id: `red-${i}`,
        redeemedAt: '2026-05-17T10:30:00.000Z',
        estimatedSaving: '1.00',
        isValidated: false,
        validatedAt: null,
        merchant: { id: 'm', businessName: 'M', logoUrl: null },
        voucher: { id: `v-${i}`, title: 't', voucherType: vt },
        branch: { id: 'b', name: 'B' },
      })),
      total: ALL_TYPES.length,
    }
    ;(api.get as jest.Mock).mockResolvedValue(fixture)
    const result = await savingsApi.getRedemptions({ limit: 20, offset: 0 })
    expect(result.redemptions.map((r) => r.voucher.voucherType)).toEqual([...ALL_TYPES])
  })
})

describe('savingsApi.getMonthlyDetail', () => {
  beforeEach(() => { (api.get as jest.Mock).mockReset() })

  it('hits the right endpoint with the month query param', async () => {
    (api.get as jest.Mock).mockResolvedValue(MONTHLY_DETAIL_FIXTURE)
    await savingsApi.getMonthlyDetail('2026-04')
    expect(api.get).toHaveBeenCalledWith('/api/v1/customer/savings/monthly-detail?month=2026-04')
  })

  it('parses the byBranch shape on the monthly-detail response', async () => {
    (api.get as jest.Mock).mockResolvedValue(MONTHLY_DETAIL_FIXTURE)
    const result = await savingsApi.getMonthlyDetail('2026-04')
    expect(result.totalSaving).toBe(32)
    expect(result.byBranch).toHaveLength(1)
    expect(result.byBranch[0]!.branchName).toBe('Covelum — Brightlingsea')
    expect(result.byBranch[0]!.merchantId).toBe('cov')
  })

  it('regression: monthly-detail also rejects a `byMerchant` payload', async () => {
    const stale = { totalSaving: '0', redemptionCount: 0, byMerchant: [], byCategory: [] }
    ;(api.get as jest.Mock).mockResolvedValue(stale)
    await expect(savingsApi.getMonthlyDetail('2026-04')).rejects.toThrow()
  })
})
