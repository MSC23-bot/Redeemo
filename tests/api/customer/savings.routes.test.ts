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
    totalSavedPence: 5000,
    redemptionCount: 10,
    currentCycleSavedPence: 1500,
    currentCycleRedemptionCount: 3,
    allTimeRank: null,
  }

  const mockRedemption = {
    id: 'r1',
    createdAt: '2026-04-01T10:00:00Z',
    estimatedSaving: 500,
    isValidated: true,
    merchant: { id: 'm1', name: 'Pizza Place', logoUrl: null },
    voucher: { id: 'v1', title: 'Free Dessert', voucherType: 'FREEBIE' },
    branch: { id: 'b1', name: 'Central Branch' },
  }

  it('GET /savings/summary returns 200 with expected shape', async () => {
    ;(getSavingsSummary as any).mockResolvedValue(mockSummary)
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/savings/summary',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.totalSavedPence).toBe(5000)
    expect(body.redemptionCount).toBe(10)
    expect(body.currentCycleSavedPence).toBe(1500)
    expect(body.currentCycleRedemptionCount).toBe(3)
    expect(body.allTimeRank).toBeNull()
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
    expect(r.estimatedSaving).toBe(500)
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
})
