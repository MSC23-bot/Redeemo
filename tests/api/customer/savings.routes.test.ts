import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/savings/service', () => ({
  getSavingsSummary: vi.fn(),
  getSavingsRedemptions: vi.fn(),
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

import { getSavingsSummary, getSavingsRedemptions } from '../../../src/api/customer/savings/service'

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

  const mockSummary = {
    lifetimeSaving: 50.00,
    thisMonthSaving: 15.00,
    thisMonthRedemptionCount: 3,
    monthlyBreakdown: [
      { month: '2026-04', saving: 15.00, count: 3 },
      { month: '2026-03', saving: 20.00, count: 4 },
      ...Array.from({ length: 10 }, (_, i) => ({ month: `2025-${String(6 + i).padStart(2, '0')}`, saving: 0, count: 0 })),
    ],
    byMerchant: [
      { merchantId: 'm1', businessName: 'Pizza Place', logoUrl: null, saving: 15.00, count: 3 },
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
    merchant: { id: 'm1', name: 'Pizza Place', logoUrl: null },
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
    expect(Array.isArray(body.byMerchant)).toBe(true)
    expect(body.byMerchant[0]).toMatchObject({ merchantId: 'm1', businessName: 'Pizza Place', saving: 15.00 })
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
    expect(r.merchant.name).toBe('Pizza Place')
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
})
