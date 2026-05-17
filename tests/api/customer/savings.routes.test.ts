import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/savings/service', () => ({
  getSavingsSummary: vi.fn(),
  getSavingsRedemptions: vi.fn(),
  getMonthlyDetail: vi.fn(),
}))
vi.mock('../../../src/api/customer/discovery/service', () => ({
  getHomeFeed: vi.fn(), getCustomerMerchant: vi.fn(), getCustomerMerchantBranches: vi.fn(),
  getCustomerVoucher: vi.fn(), searchMerchants: vi.fn(), listActiveCategories: vi.fn(),
  getActiveCampaigns: vi.fn(), getCampaignMerchants: vi.fn(),
}))
vi.mock('../../../src/api/customer/profile/service', () => ({
  getCustomerProfile: vi.fn(), updateCustomerProfile: vi.fn(),
  updateCustomerInterests: vi.fn(), changeCustomerPassword: vi.fn(),
}))
vi.mock('../../../src/api/customer/favourites/service', () => ({
  listFavouriteMerchants: vi.fn(), addFavouriteMerchant: vi.fn(), removeFavouriteMerchant: vi.fn(),
  listFavouriteVouchers: vi.fn(), addFavouriteVoucher: vi.fn(), removeFavouriteVoucher: vi.fn(),
}))
vi.mock('../../../src/api/customer/reviews/service', () => ({
  listMerchantReviews: vi.fn(), listBranchReviews: vi.fn(),
  upsertBranchReview: vi.fn(), deleteBranchReview: vi.fn(), reportReview: vi.fn(),
}))

import { getSavingsSummary, getSavingsRedemptions, getMonthlyDetail } from '../../../src/api/customer/savings/service'

describe('savings routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', { auditLog: { create: vi.fn().mockResolvedValue({}) } } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn(), del: vi.fn() } as any)
    await app.ready()
    const jwtAny = app.jwt as any
    customerToken = jwtAny.customer.sign(
      { sub: 'user-1', role: 'customer', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' },
    )
  })

  afterEach(() => app.close())

  // §Savings Rebaseline (Revision 2, 2026-05-17): byMerchant → byBranch.
  // Per-entry shape carries branch + merchant context so the customer-app
  // TopBranches row can render the "Brightlingsea (Covelum)" two-line
  // layout without an extra fetch.
  const mockSummary = {
    lifetimeSaving: 50.00,
    thisMonthSaving: 15.00,
    thisMonthRedemptionCount: 3,
    monthlyBreakdown: [
      { month: '2026-04', saving: 15.00, count: 3 },
      { month: '2026-03', saving: 20.00, count: 4 },
      ...Array.from({ length: 10 }, (_, i) => ({ month: `2025-${String(6 + i).padStart(2, '0')}`, saving: 0, count: 0 })),
    ],
    byBranch: [
      {
        branchId:        'b1',
        branchName:      'Central Branch',
        merchantId:      'm1',
        merchantName:    'Pizza Place',
        merchantLogoUrl: null,
        saving:          15.00,
        count:           3,
      },
    ],
    byCategory: [
      { categoryId: 'cat1', name: 'Food & Drink', saving: 15.00 },
    ],
  }

  const mockRedemption = {
    id: 'r1',
    redeemedAt: '2026-04-01T10:00:00Z',
    estimatedSaving: 5.00,
    isValidated: true,
    validatedAt: null,
    merchant: { id: 'm1', businessName: 'Pizza Place', logoUrl: null },
    voucher: { id: 'v1', title: 'Free Dessert', voucherType: 'FREEBIE' },
    branch: { id: 'b1', name: 'Central Branch' },
  }

  it('GET /savings/summary returns 200 with full contract shape', async () => {
    ;(getSavingsSummary as any).mockResolvedValue(mockSummary)
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/savings/summary',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.lifetimeSaving).toBe(50.00)
    expect(body.thisMonthSaving).toBe(15.00)
    expect(body.thisMonthRedemptionCount).toBe(3)
    expect(Array.isArray(body.monthlyBreakdown)).toBe(true)
    expect(body.monthlyBreakdown).toHaveLength(12)
    expect(body.monthlyBreakdown[0]).toMatchObject({ month: '2026-04', saving: 15.00, count: 3 })
    // Revision 2: byBranch carries branchId + branchName + merchantId +
    // merchantName + merchantLogoUrl + saving + count.
    expect(Array.isArray(body.byBranch)).toBe(true)
    expect(body.byBranch[0]).toMatchObject({
      branchId:        'b1',
      branchName:      'Central Branch',
      merchantId:      'm1',
      merchantName:    'Pizza Place',
      merchantLogoUrl: null,
      saving:          15.00,
      count:           3,
    })
    // Revision 2 regression pin: legacy `byMerchant` field must NOT be
    // present in the response — frontend consumers should fail loudly if
    // someone re-introduces the merchant-level shape.
    expect(body.byMerchant).toBeUndefined()
    expect(Array.isArray(body.byCategory)).toBe(true)
    expect(body.byCategory[0]).toMatchObject({ categoryId: 'cat1', name: 'Food & Drink' })
  })

  it('GET /savings/summary returns 401 without token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/savings/summary',
    })
    expect(res.statusCode).toBe(401)
  })

  it('GET /savings/redemptions returns 200 with redemptions array and total', async () => {
    ;(getSavingsRedemptions as any).mockResolvedValue({
      redemptions: [mockRedemption],
      total: 1,
    })
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/savings/redemptions',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body.redemptions)).toBe(true)
    expect(body.redemptions).toHaveLength(1)
    expect(body.total).toBe(1)
    const r = body.redemptions[0]
    expect(r.id).toBe('r1')
    expect(r.estimatedSaving).toBe(5.00)
    expect(r.merchant.businessName).toBe('Pizza Place')
    expect(r.voucher.voucherType).toBe('FREEBIE')
    expect(r.branch.name).toBe('Central Branch')
  })

  it('GET /savings/redemptions returns 401 without token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/savings/redemptions',
    })
    expect(res.statusCode).toBe(401)
  })

  it('GET /savings/redemptions accepts limit and offset pagination params', async () => {
    ;(getSavingsRedemptions as any).mockResolvedValue({ redemptions: [], total: 0 })
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/savings/redemptions?limit=10&offset=20',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(getSavingsRedemptions).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      { limit: 10, offset: 20 },
    )
  })

  it('GET /savings/redemptions rejects limit > 50 with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/savings/redemptions?limit=100',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('GET /savings/redemptions rejects negative offset with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/savings/redemptions?offset=-1',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('GET /savings/redemptions includes validatedAt in each redemption', async () => {
    ;(getSavingsRedemptions as any).mockResolvedValue({
      redemptions: [{
        id: 'r1',
        redeemedAt: '2026-04-01T10:00:00Z',
        estimatedSaving: 5.00,
        isValidated: true,
        validatedAt: '2026-04-01T10:30:00Z',
        merchant: { id: 'm1', businessName: 'Pizza Place', logoUrl: null },
        voucher: { id: 'v1', title: 'Free Dessert', voucherType: 'FREEBIE' },
        branch: { id: 'b1', name: 'Central Branch' },
      }],
      total: 1,
    })
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/savings/redemptions',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.redemptions[0].validatedAt).toBe('2026-04-01T10:30:00Z')
  })

  it('GET /savings/redemptions returns validatedAt as null when not validated', async () => {
    ;(getSavingsRedemptions as any).mockResolvedValue({
      redemptions: [{
        id: 'r2',
        redeemedAt: '2026-04-01T10:00:00Z',
        estimatedSaving: 5.00,
        isValidated: false,
        validatedAt: null,
        merchant: { id: 'm1', businessName: 'Pizza Place', logoUrl: null },
        voucher: { id: 'v1', title: 'Free Dessert', voucherType: 'FREEBIE' },
        branch: { id: 'b1', name: 'Central Branch' },
      }],
      total: 1,
    })
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/savings/redemptions',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.redemptions[0].validatedAt).toBeNull()
  })

  describe('GET /savings/monthly-detail', () => {
    // Revision 2: byBranch shape. Fixture demonstrates the load-bearing
    // case — a multi-branch merchant (Covelum Brightlingsea + Covelum
    // Colchester) splits into TWO byBranch entries with shared
    // merchantId / merchantName, not one merged Covelum entry.
    const mockMonthlyDetail = {
      totalSaving: 20.00,
      redemptionCount: 4,
      byBranch: [
        {
          branchId:        'b1-brightlingsea',
          branchName:      'Brightlingsea',
          merchantId:      'm1',
          merchantName:    'Covelum',
          merchantLogoUrl: null,
          saving:          12.00,
          count:           2,
        },
        {
          branchId:        'b2-colchester',
          branchName:      'Colchester',
          merchantId:      'm1',
          merchantName:    'Covelum',
          merchantLogoUrl: null,
          saving:          8.00,
          count:           2,
        },
      ],
      byCategory: [
        { categoryId: 'cat1', name: 'Food & Drink', saving: 20.00 },
      ],
    }

    it('returns 200 with monthly detail for a valid month — byBranch shape with multi-branch merchant split', async () => {
      ;(getMonthlyDetail as any).mockResolvedValue(mockMonthlyDetail)
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/savings/monthly-detail?month=2026-03',
        headers: { authorization: `Bearer ${customerToken}` },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.totalSaving).toBe(20.00)
      expect(body.redemptionCount).toBe(4)
      // Revision 2 load-bearing pin: TWO branch entries for one merchant.
      expect(body.byBranch).toHaveLength(2)
      expect(body.byBranch[0]).toMatchObject({
        branchName:   'Brightlingsea',
        merchantId:   'm1',
        merchantName: 'Covelum',
        saving:       12.00,
      })
      expect(body.byBranch[1]).toMatchObject({
        branchName:   'Colchester',
        merchantId:   'm1',
        merchantName: 'Covelum',
        saving:       8.00,
      })
      // Regression pin: legacy byMerchant field must NOT be present.
      expect(body.byMerchant).toBeUndefined()
      expect(body.byCategory).toHaveLength(1)
    })

    it('returns 400 for invalid month format', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/savings/monthly-detail?month=invalid',
        headers: { authorization: `Bearer ${customerToken}` },
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 400 when month param is missing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/savings/monthly-detail',
        headers: { authorization: `Bearer ${customerToken}` },
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 401 without token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/savings/monthly-detail?month=2026-03',
      })
      expect(res.statusCode).toBe(401)
    })
  })
})
