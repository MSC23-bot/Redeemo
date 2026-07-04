import { describe, it, expect, vi } from 'vitest'
import {
  buildRedemptionWhere,
  buildRedemptionOrderBy,
  getMerchantRedemptionsForExport,
} from '../../../../src/api/merchant/redemptions/service'

// Redemptions fidelity slice: sort param + code-or-voucher-title search.
// The OR search must sit INSIDE the tenant/branch-scoped where (top-level keys
// AND together in Prisma), and list/export must share identical ordering.

describe('buildRedemptionOrderBy', () => {
  it("defaults to recency (redeemedAt desc) when sort is absent or 'recent'", () => {
    expect(buildRedemptionOrderBy(undefined)).toEqual({ redeemedAt: 'desc' })
    expect(buildRedemptionOrderBy('recent')).toEqual({ redeemedAt: 'desc' })
  })
  it("'saving' orders by estimatedSaving desc", () => {
    expect(buildRedemptionOrderBy('saving')).toEqual({ estimatedSaving: 'desc' })
  })
})

describe('buildRedemptionWhere - code-or-voucher-title search', () => {
  it('a search term matches the normalized code prefix OR the voucher title (insensitive)', () => {
    const where = buildRedemptionWhere('m1', { code: 'coffee' })
    expect(where.OR).toEqual([
      { redemptionCode: { startsWith: 'COFFEE' } },
      { voucher: { is: { title: { contains: 'coffee', mode: 'insensitive' } } } },
    ])
    // The tenant pin is UNTOUCHED by the OR (top-level AND semantics).
    expect(where.branch).toEqual({ merchantId: 'm1' })
    expect(where.isTestData).toBe(false)
  })

  it('the search OR coexists with a voucherType filter without clobbering it', () => {
    const where = buildRedemptionWhere('m1', { code: 'a7', voucherType: 'FREEBIE' })
    expect(where.voucher).toEqual({ is: { type: 'FREEBIE' } })
    expect(where.OR).toHaveLength(2)
  })

  it('a scoped member search stays inside the allowed-branch intersection', () => {
    const where = buildRedemptionWhere('m1', { code: 'x', allowedBranchIds: ['b1'] })
    expect(where.branchId).toEqual({ in: ['b1'] })
    expect(where.OR).toHaveLength(2)
  })
})

describe('CSV export sort parity', () => {
  it('export uses the SAME orderBy as the list for sort=saving', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const prisma: any = { voucherRedemption: { findMany } }
    await getMerchantRedemptionsForExport(prisma, 'm1', { sort: 'saving' })
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { estimatedSaving: 'desc' } }),
    )
  })
})
