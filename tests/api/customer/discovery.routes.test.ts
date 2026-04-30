import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/discovery/service', () => ({
  getHomeFeed:                 vi.fn(),
  getCustomerMerchant:         vi.fn(),
  getCustomerMerchantBranches: vi.fn(),
  getCustomerVoucher:          vi.fn(),
  searchMerchants:             vi.fn(),
  listActiveCategories:        vi.fn(),
  getActiveCampaigns:          vi.fn(),
  getCampaignMerchants:        vi.fn(),
  getCategoryMerchants:        vi.fn(),
}))

vi.mock('../../../src/api/customer/reviews/service', () => ({
  listMerchantReviews: vi.fn(),
  listBranchReviews:   vi.fn(),
  upsertBranchReview:  vi.fn(),
  deleteBranchReview:  vi.fn(),
  reportReview:        vi.fn(),
}))

vi.mock('../../../src/api/customer/savings/service', () => ({
  getSavingsSummary:      vi.fn(),
  getSavingsRedemptions:  vi.fn(),
}))

import {
  getHomeFeed,
  getCustomerMerchant,
  getCustomerMerchantBranches,
  getCustomerVoucher,
  searchMerchants,
  listActiveCategories,
  getActiveCampaigns,
  getCampaignMerchants,
  getCategoryMerchants,
} from '../../../src/api/customer/discovery/service'

describe('discovery routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()

    app.decorate('prisma', {
      merchant:              { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
      branch:                { findMany: vi.fn() },
      voucher:               { findUnique: vi.fn() },
      userVoucherCycleState: { findUnique: vi.fn() },
      favouriteMerchant:     { findUnique: vi.fn() },
      favouriteVoucher:      { findUnique: vi.fn() },
      featuredMerchant:      { findMany: vi.fn() },
      voucherRedemption:     { groupBy: vi.fn(), findMany: vi.fn() },
      campaign:              { findMany: vi.fn(), findUnique: vi.fn() },
      campaignMerchant:      { findMany: vi.fn() },
      category:              { findMany: vi.fn() },
      auditLog:              { create: vi.fn().mockResolvedValue({}) },
    } as any)

    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any)

    await app.ready()

    const jwtAny = app.jwt as any
    customerToken = jwtAny.customer.sign(
      { sub: 'user-test-1', role: 'customer', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' },
    )
  })

  afterEach(async () => {
    await app.close()
    vi.clearAllMocks()
  })

  // ────────────────────────────────────────────────
  // Home feed
  // ────────────────────────────────────────────────

  it('GET /api/v1/customer/home returns 200 without token (guest)', async () => {
    vi.mocked(getHomeFeed).mockResolvedValueOnce({
      locationContext: { city: null, source: 'none' },
      featured: [{
        id: 'merchant-1', businessName: 'Acme', tradingName: null,
        logoUrl: null, bannerUrl: null,
        primaryCategory: { id: 'cat-1', name: 'Restaurants', pinColour: '#FF5733', pinIcon: 'fork-knife' },
        subcategory: null, avgRating: 4.2, reviewCount: 10,
        voucherCount: 3, maxEstimatedSaving: 15, isFavourited: false,
        distance: 450, nearestBranchId: 'branch-1',
      }],
      trending: [], campaigns: [], nearbyByCategory: [],
    } as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/home',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('featured')
    expect(body).toHaveProperty('trending')
    expect(body).toHaveProperty('campaigns')
    expect(body).toHaveProperty('locationContext')
    expect(body).toHaveProperty('nearbyByCategory')
    expect(getHomeFeed).toHaveBeenCalledOnce()
  })

  it('GET /api/v1/customer/home returns all sections in response shape', async () => {
    const feed = {
      locationContext: { city: 'London', source: 'coordinates' },
      featured: [{ id: 'merchant-1', businessName: 'Acme' }],
      trending: [{ id: 'merchant-2', businessName: 'Trendy' }],
      campaigns: [{ id: 'campaign-1', name: 'Summer Sale', bannerImageUrl: 'https://example.com/banner.jpg' }],
      nearbyByCategory: [{ category: { id: 'cat-1', name: 'Restaurants' }, merchants: [] }],
    }
    vi.mocked(getHomeFeed).mockResolvedValueOnce(feed as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/home?lat=51.5074&lng=-0.1278',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.featured).toHaveLength(1)
    expect(body.trending).toHaveLength(1)
    expect(body.campaigns).toHaveLength(1)
    expect(body.locationContext.city).toBe('London')
  })

  it('GET /api/v1/customer/home passes lat/lng to service', async () => {
    vi.mocked(getHomeFeed).mockResolvedValueOnce({
      locationContext: { city: null, source: 'coordinates' },
      featured: [], trending: [], campaigns: [], nearbyByCategory: [],
    } as any)

    await app.inject({
      method: 'GET',
      url: '/api/v1/customer/home?lat=51.5&lng=-0.1',
    })

    expect(getHomeFeed).toHaveBeenCalledWith(expect.anything(), { userId: null, lat: 51.5, lng: -0.1 })
  })

  // ────────────────────────────────────────────────
  // Merchant detail
  // ────────────────────────────────────────────────

  it('GET /api/v1/customer/merchants/:id returns 200 without token (guest), isFavourited=false', async () => {
    vi.mocked(getCustomerMerchant).mockResolvedValueOnce(
      { id: 'merchant-1', businessName: 'Acme', isFavourited: false, vouchers: [], branches: [] } as any,
    )

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/merchants/merchant-1',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe('merchant-1')
    expect(body.isFavourited).toBe(false)
    expect(getCustomerMerchant).toHaveBeenCalledWith(expect.anything(), 'merchant-1', null, expect.any(Object))
  })

  it('GET /api/v1/customer/merchants/:id returns isFavourited=true when authenticated and favourited', async () => {
    vi.mocked(getCustomerMerchant).mockResolvedValueOnce(
      { id: 'merchant-1', businessName: 'Acme', isFavourited: true, vouchers: [], branches: [] } as any,
    )

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/merchants/merchant-1',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.isFavourited).toBe(true)
    expect(getCustomerMerchant).toHaveBeenCalledWith(expect.anything(), 'merchant-1', 'user-test-1', expect.any(Object))
  })

  it('GET /api/v1/customer/merchants/:id returns 404 for unavailable merchant', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    vi.mocked(getCustomerMerchant).mockRejectedValueOnce(new AppError('MERCHANT_UNAVAILABLE'))

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/merchants/nonexistent',
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('MERCHANT_UNAVAILABLE')
  })

  // ────────────────────────────────────────────────
  // Branch list
  // ────────────────────────────────────────────────

  it('GET /api/v1/customer/merchants/:id/branches returns 200 without token (guest)', async () => {
    vi.mocked(getCustomerMerchantBranches).mockResolvedValueOnce([{ id: 'b1', name: 'Main' }] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/merchants/merchant-1/branches',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('b1')
    expect(getCustomerMerchantBranches).toHaveBeenCalledWith(expect.anything(), 'merchant-1')
  })

  // ────────────────────────────────────────────────
  // Voucher detail
  // ────────────────────────────────────────────────

  it('GET /api/v1/customer/vouchers/:id returns 200 without token, isRedeemedThisCycle=false, isFavourited=false', async () => {
    vi.mocked(getCustomerVoucher).mockResolvedValueOnce(
      { id: 'v1', isRedeemedThisCycle: false, isFavourited: false } as any,
    )

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/vouchers/v1',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe('v1')
    expect(body.isRedeemedThisCycle).toBe(false)
    expect(body.isFavourited).toBe(false)
    expect(getCustomerVoucher).toHaveBeenCalledWith(expect.anything(), 'v1', null)
  })

  it('GET /api/v1/customer/vouchers/:id passes userId when token present', async () => {
    vi.mocked(getCustomerVoucher).mockResolvedValueOnce(
      { id: 'v1', isRedeemedThisCycle: true, isFavourited: true } as any,
    )

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/vouchers/v1',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.isRedeemedThisCycle).toBe(true)
    expect(body.isFavourited).toBe(true)
    expect(getCustomerVoucher).toHaveBeenCalledWith(expect.anything(), 'v1', 'user-test-1')
  })

  // ────────────────────────────────────────────────
  // Search
  // ────────────────────────────────────────────────

  it('GET /api/v1/customer/search returns 400 without q or categoryId', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    vi.mocked(searchMerchants).mockRejectedValueOnce(new AppError('SEARCH_QUERY_REQUIRED'))

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/search',
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('SEARCH_QUERY_REQUIRED')
  })

  it('GET /api/v1/customer/search?q=pizza returns 200', async () => {
    vi.mocked(searchMerchants).mockResolvedValueOnce({ merchants: [
      { id: 'm1', businessName: 'Pizza Palace' },
    ], total: 1 } as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/search?q=pizza',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('merchants')
    expect(body).toHaveProperty('total')
    expect(searchMerchants).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ q: 'pizza' }),
    )
  })

  it('GET /api/v1/customer/search?categoryId=cat-1 returns 200', async () => {
    vi.mocked(searchMerchants).mockResolvedValueOnce({ merchants: [], total: 0 } as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/search?categoryId=cat-1',
    })

    expect(res.statusCode).toBe(200)
    expect(searchMerchants).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ categoryId: 'cat-1' }),
    )
  })

  it('GET /api/v1/customer/search respects limit and offset', async () => {
    vi.mocked(searchMerchants).mockResolvedValueOnce({ merchants: [], total: 0 } as any)

    await app.inject({
      method: 'GET',
      url: '/api/v1/customer/search?q=coffee&limit=20&offset=40',
    })

    expect(searchMerchants).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ q: 'coffee', limit: 20, offset: 40 }),
    )
  })

  it('GET /api/v1/customer/search?tagIds=t1,t2&scope=city passes parsed params and returns meta envelope', async () => {
    vi.mocked(searchMerchants).mockResolvedValueOnce({
      merchants: [{ id: 'm1', businessName: 'Cafe', supplyTier: 'CITY' }],
      total: 1,
      meta: {
        scope:            'city',
        resolvedArea:     'London',
        scopeExpanded:    true,
        nearbyCount:      0,
        cityCount:        1,
        distantCount:     0,
        emptyStateReason: 'none',
      },
    } as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/search?q=cafe&tagIds=t1,t2&scope=city',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.meta.scope).toBe('city')
    expect(body.meta.scopeExpanded).toBe(true)
    expect(body.meta.nearbyCount).toBeDefined()
    expect(body.meta.cityCount).toBeDefined()
    expect(body.meta.distantCount).toBeDefined()
    expect(body.meta.emptyStateReason).toBeDefined()
    expect(body.merchants[0].supplyTier).toBe('CITY')
    expect(searchMerchants).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tagIds: ['t1', 't2'], scope: 'city' }),
    )
  })

  // ────────────────────────────────────────────────
  // Categories
  // ────────────────────────────────────────────────

  it('GET /api/v1/customer/categories returns 200 without token (guest)', async () => {
    vi.mocked(listActiveCategories).mockResolvedValueOnce([
      { id: 'cat-1', name: 'Food & Drink', iconUrl: null, illustrationUrl: null },
    ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/categories',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body.categories)).toBe(true)
    expect(body.categories[0].id).toBe('cat-1')
    expect(listActiveCategories).toHaveBeenCalledOnce()
  })

  // ────────────────────────────────────────────────
  // Category merchants
  // ────────────────────────────────────────────────

  it('GET /api/v1/customer/categories/:id/merchants forwards id, scope, lat, lng and returns { merchants, total, meta }', async () => {
    vi.mocked(getCategoryMerchants).mockResolvedValueOnce({
      merchants: [{ id: 'm1', businessName: 'Pizza Palace', supplyTier: 'CITY' }],
      total: 1,
      meta: {
        scope:            'city',
        resolvedArea:     'London',
        scopeExpanded:    true,
        nearbyCount:      0,
        cityCount:        1,
        distantCount:     0,
        emptyStateReason: 'none',
      },
    } as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/categories/cat-123/merchants?scope=city&lat=51.5&lng=-0.1',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('merchants')
    expect(body).toHaveProperty('total')
    expect(body).toHaveProperty('meta')
    expect(body.meta.scope).toBe('city')
    expect(body.meta.nearbyCount).toBeDefined()
    expect(body.meta.cityCount).toBeDefined()
    expect(body.meta.distantCount).toBeDefined()
    expect(body.meta.emptyStateReason).toBeDefined()
    expect(body.merchants[0].supplyTier).toBe('CITY')
    expect(getCategoryMerchants).toHaveBeenCalledWith(
      expect.anything(),
      'cat-123',
      expect.objectContaining({ scope: 'city', lat: 51.5, lng: -0.1 }),
    )
  })

  // ────────────────────────────────────────────────
  // Campaigns
  // ────────────────────────────────────────────────

  it('GET /api/v1/customer/campaigns returns 200 without token (guest)', async () => {
    vi.mocked(getActiveCampaigns).mockResolvedValueOnce([
      { id: 'campaign-1', name: 'Summer Sale', bannerImageUrl: 'https://example.com/banner.jpg' },
    ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/campaigns',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
    expect(getActiveCampaigns).toHaveBeenCalledOnce()
  })

  it('GET /api/v1/customer/campaigns/:id/merchants returns 200', async () => {
    vi.mocked(getCampaignMerchants).mockResolvedValueOnce([
      { id: 'merchant-1', businessName: 'Acme' },
    ] as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/campaigns/campaign-1/merchants',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
    expect(getCampaignMerchants).toHaveBeenCalledWith(
      expect.anything(),
      'campaign-1',
      expect.objectContaining({ limit: 20, offset: 0 }),
    )
  })

  it('GET /api/v1/customer/campaigns/:id/merchants returns 404 when CAMPAIGN_NOT_FOUND', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    vi.mocked(getCampaignMerchants).mockRejectedValueOnce(new AppError('CAMPAIGN_NOT_FOUND'))

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/campaigns/bad-id/merchants',
    })

    expect(res.statusCode).toBe(404)
  })
})
