import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/reviews/service', () => ({
  listMerchantReviews: vi.fn(),
  listBranchReviews:   vi.fn(),
  upsertBranchReview:  vi.fn(),
  deleteBranchReview:  vi.fn(),
  reportReview:        vi.fn(),
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
vi.mock('../../../src/api/customer/savings/service', () => ({
  getSavingsSummary: vi.fn(), getSavingsRedemptions: vi.fn(),
}))

import {
  listMerchantReviews, listBranchReviews, upsertBranchReview, deleteBranchReview, reportReview,
} from '../../../src/api/customer/reviews/service'
import { AppError } from '../../../src/api/shared/errors'

describe('reviews routes', () => {
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

  const mockReview = {
    id: 'r1', branchId: 'branch-1', branchName: 'Soho Branch',
    displayName: 'Sarah M.', rating: 5, comment: 'Great!',
    isVerified: true, isOwnReview: false, createdAt: '2026-04-11T10:00:00Z', updatedAt: '2026-04-11T10:00:00Z',
  }

  it('GET /api/v1/customer/merchants/:id/reviews returns 200 without token', async () => {
    ;(listMerchantReviews as any).mockResolvedValue({ reviews: [mockReview], total: 1 })
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/merchants/m1/reviews' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.reviews).toHaveLength(1)
    expect(body.total).toBe(1)
  })

  it('GET /api/v1/customer/branches/:branchId/reviews returns 200 without token', async () => {
    ;(listBranchReviews as any).mockResolvedValue({ reviews: [mockReview], total: 1 })
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/branches/branch-1/reviews' })
    expect(res.statusCode).toBe(200)
  })

  it('POST /api/v1/customer/branches/:branchId/reviews returns 201 with token', async () => {
    ;(upsertBranchReview as any).mockResolvedValue({ ...mockReview, isOwnReview: true })
    const res = await app.inject({
      method: 'POST', url: '/api/v1/customer/branches/branch-1/reviews',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { rating: 5, comment: 'Excellent service!' },
    })
    expect(res.statusCode).toBe(201)
  })

  it('POST /api/v1/customer/branches/:branchId/reviews returns 401 without token', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/customer/branches/branch-1/reviews',
      payload: { rating: 5 },
    })
    expect(res.statusCode).toBe(401)
  })

  it('POST /api/v1/customer/branches/:branchId/reviews returns 400 for invalid rating', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/customer/branches/branch-1/reviews',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { rating: 6 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('DELETE /api/v1/customer/branches/:branchId/reviews/:reviewId returns 200 with token', async () => {
    ;(deleteBranchReview as any).mockResolvedValue({ success: true })
    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/customer/branches/branch-1/reviews/r1',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('DELETE /api/v1/customer/branches/:branchId/reviews/:reviewId returns 401 without token', async () => {
    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/customer/branches/branch-1/reviews/r1',
    })
    expect(res.statusCode).toBe(401)
  })

  it('DELETE returns 403 when service throws REVIEW_NOT_OWNED', async () => {
    ;(deleteBranchReview as any).mockRejectedValue(new AppError('REVIEW_NOT_OWNED'))
    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/customer/branches/branch-1/reviews/r1',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('POST /api/v1/customer/reviews/:reviewId/report returns 201 for new report', async () => {
    ;(reportReview as any).mockResolvedValue({ success: true, created: true })
    const res = await app.inject({
      method: 'POST', url: '/api/v1/customer/reviews/r1/report',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { reason: 'SPAM' },
    })
    expect(res.statusCode).toBe(201)
  })

  it('POST /api/v1/customer/reviews/:reviewId/report returns 200 for duplicate report', async () => {
    ;(reportReview as any).mockResolvedValue({ success: true, created: false })
    const res = await app.inject({
      method: 'POST', url: '/api/v1/customer/reviews/r1/report',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { reason: 'SPAM' },
    })
    expect(res.statusCode).toBe(200)
  })
})
