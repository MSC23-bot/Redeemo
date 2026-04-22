import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/merchant-requests/service', () => ({
  createMerchantRequest: vi.fn(),
}))

vi.mock('../../../src/api/customer/discovery/service', () => ({
  getHomeFeed:                 vi.fn(),
  getCustomerMerchant:         vi.fn(),
  getCustomerMerchantBranches: vi.fn(),
  getCustomerVoucher:          vi.fn(),
  searchMerchants:             vi.fn(),
  listActiveCategories:        vi.fn(),
  getActiveCampaigns:          vi.fn(),
  getCampaignMerchants:        vi.fn(),
}))

vi.mock('../../../src/api/customer/profile/service', () => ({
  getCustomerProfile:      vi.fn(),
  updateCustomerProfile:   vi.fn(),
  updateCustomerInterests: vi.fn(),
  changeCustomerPassword:  vi.fn(),
}))

vi.mock('../../../src/api/customer/favourites/service', () => ({
  addFavouriteMerchant:    vi.fn(),
  removeFavouriteMerchant: vi.fn(),
  listFavouriteMerchants:  vi.fn(),
  addFavouriteVoucher:     vi.fn(),
  removeFavouriteVoucher:  vi.fn(),
  listFavouriteVouchers:   vi.fn(),
}))

vi.mock('../../../src/api/customer/reviews/service', () => ({
  listMerchantReviews: vi.fn(),
  listBranchReviews:   vi.fn(),
  upsertBranchReview:  vi.fn(),
  deleteBranchReview:  vi.fn(),
  reportReview:        vi.fn(),
}))

vi.mock('../../../src/api/customer/savings/service', () => ({
  getSavingsSummary:     vi.fn(),
  getSavingsRedemptions: vi.fn(),
}))

import { createMerchantRequest } from '../../../src/api/customer/merchant-requests/service'

describe('customer merchant-requests routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', { auditLog: { create: vi.fn().mockResolvedValue({}) } } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any)
    await app.ready()
    const jwtAny = app.jwt as any
    customerToken = jwtAny.customer.sign(
      { sub: 'user-1', role: 'customer', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' },
    )
  })

  afterEach(async () => { await app.close() })

  it('POST /api/v1/customer/merchant-requests returns 201 on success', async () => {
    const mockRequest = {
      id: 'req-1',
      userId: 'user-1',
      businessName: 'The Craft Coffee Co.',
      location: 'Manchester',
      note: null,
      createdAt: new Date(),
    }
    ;(createMerchantRequest as any).mockResolvedValue(mockRequest)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/merchant-requests',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { businessName: 'The Craft Coffee Co.', location: 'Manchester' },
    })

    expect(res.statusCode).toBe(201)
    expect(createMerchantRequest).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      { businessName: 'The Craft Coffee Co.', location: 'Manchester', note: undefined }
    )
  })

  it('POST returns 400 when businessName is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/merchant-requests',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { location: 'Manchester' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST returns 400 when location is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/merchant-requests',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { businessName: 'Acme Burgers' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST returns 401 without auth token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/merchant-requests',
      payload: { businessName: 'Test', location: 'London' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('POST returns 400 when businessName is whitespace-only', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/merchant-requests',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { businessName: '   ', location: 'Manchester' },
    })
    expect(res.statusCode).toBe(400)
  })
})
