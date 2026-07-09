import { describe, it, expect } from 'vitest'
import {
  buildAdminRedemptionWhere,
  buildAdminRedemptionOrderBy,
} from '../../../../src/api/admin/redemptions/service'
import { buildRedemptionOrderBy } from '../../../../src/api/merchant/redemptions/service'

// D67: read-only admin visibility of voucher redemptions. Mirrors
// tests/api/merchant/redemptions/sort-search.test.ts's style, but the where
// builder here is deliberately NOT tenant-scoped (D67-b: cross-merchant list).

describe('buildAdminRedemptionOrderBy - re-uses the merchant ordering (D67)', () => {
  it('is the SAME function as the merchant buildRedemptionOrderBy (no drift)', () => {
    expect(buildAdminRedemptionOrderBy).toBe(buildRedemptionOrderBy)
  })
  it("recency is redeemedAt desc THEN the unique id tie-breaker", () => {
    expect(buildAdminRedemptionOrderBy(undefined)).toEqual([{ redeemedAt: 'desc' }, { id: 'desc' }])
    expect(buildAdminRedemptionOrderBy('recent')).toEqual([{ redeemedAt: 'desc' }, { id: 'desc' }])
  })
  it("'saving' is estimatedSaving desc THEN redeemedAt desc THEN the unique id tie-breaker", () => {
    expect(buildAdminRedemptionOrderBy('saving')).toEqual([
      { estimatedSaving: 'desc' },
      { redeemedAt: 'desc' },
      { id: 'desc' },
    ])
  })
})

describe('buildAdminRedemptionWhere - NO tenancy scope (D67-b)', () => {
  it('an empty filter set produces an empty where (cross-merchant, unscoped)', () => {
    expect(buildAdminRedemptionWhere({})).toEqual({})
  })

  it('merchantId maps to the branch relation (branch.merchantId), NOT a top-level merchantId', () => {
    const where = buildAdminRedemptionWhere({ merchantId: 'm1' })
    expect(where.branch).toEqual({ merchantId: 'm1' })
    expect((where as any).merchantId).toBeUndefined()
  })

  it('branchId is an independent scalar filter, coexisting with merchantId', () => {
    const where = buildAdminRedemptionWhere({ merchantId: 'm1', branchId: 'b1' })
    expect(where.branch).toEqual({ merchantId: 'm1' })
    expect(where.branchId).toBe('b1')
  })

  it('status maps awaiting -> isValidated:false, validated -> isValidated:true', () => {
    expect(buildAdminRedemptionWhere({ status: 'awaiting' }).isValidated).toBe(false)
    expect(buildAdminRedemptionWhere({ status: 'validated' }).isValidated).toBe(true)
    expect(buildAdminRedemptionWhere({}).isValidated).toBeUndefined()
  })

  it('from/to build a redeemedAt range', () => {
    const from = new Date('2026-07-01T00:00:00.000Z')
    const to = new Date('2026-07-09T00:00:00.000Z')
    expect(buildAdminRedemptionWhere({ from, to })).toEqual({ redeemedAt: { gte: from, lte: to } })
    expect(buildAdminRedemptionWhere({ from })).toEqual({ redeemedAt: { gte: from } })
    expect(buildAdminRedemptionWhere({ to })).toEqual({ redeemedAt: { lte: to } })
  })

  it('voucherType filters the voucher relation', () => {
    expect(buildAdminRedemptionWhere({ voucherType: 'FREEBIE' }).voucher).toEqual({ is: { type: 'FREEBIE' } })
  })

  it('a code search term matches the normalized code prefix OR the voucher title (insensitive)', () => {
    const where = buildAdminRedemptionWhere({ code: 'coffee' })
    expect(where.OR).toEqual([
      { redemptionCode: { startsWith: 'COFFEE' } },
      { voucher: { is: { title: { contains: 'coffee', mode: 'insensitive' } } } },
    ])
  })

  it('the search OR coexists with a voucherType filter without clobbering it', () => {
    const where = buildAdminRedemptionWhere({ code: 'a7', voucherType: 'FREEBIE' })
    expect(where.voucher).toEqual({ is: { type: 'FREEBIE' } })
    expect(where.OR).toHaveLength(2)
  })

  it('D67-c: default (includeTest undefined) does NOT exclude test rows', () => {
    expect(buildAdminRedemptionWhere({}).isTestData).toBeUndefined()
    expect(buildAdminRedemptionWhere({ includeTest: true }).isTestData).toBeUndefined()
  })

  it('D67-c: includeTest:false excludes test rows (isTestData:false), the INVERSE default of the merchant surface', () => {
    expect(buildAdminRedemptionWhere({ includeTest: false }).isTestData).toBe(false)
  })
})
