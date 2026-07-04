import { describe, it, expect, vi } from 'vitest'
import {
  buildRedemptionWhere,
  buildRedemptionOrderBy,
  getMerchantRedemptionsForExport,
} from '../../../../src/api/merchant/redemptions/service'

// Redemptions fidelity slice: sort param + code-or-voucher-title search.
// The OR search must sit INSIDE the tenant/branch-scoped where (top-level keys
// AND together in Prisma), and list/export must share identical ordering.

describe('buildRedemptionOrderBy - deterministic total order (Codex round 2)', () => {
  it("recency is redeemedAt desc THEN the unique id tie-breaker", () => {
    expect(buildRedemptionOrderBy(undefined)).toEqual([{ redeemedAt: 'desc' }, { id: 'desc' }])
    expect(buildRedemptionOrderBy('recent')).toEqual([{ redeemedAt: 'desc' }, { id: 'desc' }])
  })
  it("'saving' is estimatedSaving desc THEN redeemedAt desc THEN the unique id tie-breaker", () => {
    expect(buildRedemptionOrderBy('saving')).toEqual([
      { estimatedSaving: 'desc' },
      { redeemedAt: 'desc' },
      { id: 'desc' },
    ])
  })
  it('every branch ends in the unique primary key (offset paging is a total order)', () => {
    for (const sort of [undefined, 'recent', 'saving'] as const) {
      const order = buildRedemptionOrderBy(sort)
      expect(order[order.length - 1]).toEqual({ id: 'desc' })
    }
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

describe('CSV export sort parity - exact same order array as the list', () => {
  it.each([undefined, 'recent', 'saving'] as const)('export orderBy === buildRedemptionOrderBy(%s)', async (sort) => {
    const findMany = vi.fn().mockResolvedValue([])
    const prisma: any = { voucherRedemption: { findMany } }
    await getMerchantRedemptionsForExport(prisma, 'm1', { sort })
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: buildRedemptionOrderBy(sort) }),
    )
  })
})
