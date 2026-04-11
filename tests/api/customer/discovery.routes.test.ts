import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/discovery/service', () => ({
  getHomeFeed: vi.fn(),
  getCustomerMerchant: vi.fn(),
  getMerchantBranches: vi.fn(),
  getCustomerVoucher: vi.fn(),
  searchMerchants: vi.fn(),
  listCategories: vi.fn(),
  getCampaign: vi.fn(),
}))

import {
  getHomeFeed,
  getCustomerMerchant,
  getMerchantBranches,
  getCustomerVoucher,
  searchMerchants,
  listCategories,
  getCampaign,
} from '../../../src/api/customer/discovery/service'

const mockHomeFeed = {
  featured: [
    { id: 'm1', businessName: 'Coffee Co', tradingName: null, logoUrl: null, bannerUrl: null, description: null, primaryCategoryId: null },
  ],
  trending: [
    { id: 'm2', businessName: 'Pizza Place', tradingName: null, logoUrl: null, bannerUrl: null, description: null, primaryCategoryId: null },
  ],
  campaigns: [
    { id: 'c1', name: 'Summer Sale', description: null, bannerImageUrl: null, startDate: new Date(), endDate: new Date(), merchantCount: 3 },
  ],
}

const mockMerchant = {
  id: 'm1',
  businessName: 'Coffee Co',
  tradingName: null,
  logoUrl: null,
  bannerUrl: null,
  description: 'Great coffee',
  primaryCategoryId: 'cat1',
  status: 'ACTIVE',
  branches: [],
  tags: [],
  categories: [],
  isFavourited: false,
}

const mockBranches = [
  {
    id: 'b1',
    merchantId: 'm1',
    name: 'Main Branch',
    isMainBranch: true,
    addressLine1: '1 Main St',
    city: 'London',
    postcode: 'EC1A 1BB',
    isActive: true,
    openingHours: [],
    amenities: [],
  },
]

const mockVoucher = {
  id: 'v1',
  merchantId: 'm1',
  code: 'RMV-001',
  title: '50% Off',
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  merchant: { id: 'm1', businessName: 'Coffee Co', tradingName: null, logoUrl: null, status: 'ACTIVE' },
  isRedeemedThisCycle: false,
  isFavourited: false,
}

const mockSearchResult = {
  merchants: [
    { id: 'm1', businessName: 'Pizza Palace', tradingName: null, logoUrl: null, bannerUrl: null, description: null, primaryCategoryId: null },
  ],
  total: 1,
}

const mockCategories = [
  { id: 'cat1', name: 'Food & Drink', iconUrl: null, illustrationUrl: null, parentId: null, sortOrder: 0 },
  { id: 'cat2', name: 'Coffee', iconUrl: null, illustrationUrl: null, parentId: 'cat1', sortOrder: 1 },
]

const mockCampaign = {
  id: 'c1',
  name: 'Summer Sale',
  description: null,
  bannerImageUrl: null,
  startDate: new Date(),
  endDate: new Date(),
  status: 'ACTIVE',
  merchants: [
    { id: 'm1', businessName: 'Coffee Co', tradingName: null, logoUrl: null, bannerUrl: null, description: null, primaryCategoryId: null },
  ],
}

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
      review:                { aggregate: vi.fn() },
      auditLog:              { create: vi.fn().mockResolvedValue({}) },
    } as any)

    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any)

    await app.ready()

    // Sign a customer token for optional-auth tests
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

  it('GET /api/v1/customer/home returns 200', async () => {
    vi.mocked(getHomeFeed).mockResolvedValueOnce(mockHomeFeed as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/home',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('featured')
    expect(body).toHaveProperty('trending')
    expect(body).toHaveProperty('campaigns')
    expect(getHomeFeed).toHaveBeenCalledOnce()
  })

  it('GET /api/v1/customer/home passes lat/lng to service', async () => {
    vi.mocked(getHomeFeed).mockResolvedValueOnce({ featured: [], trending: [], campaigns: [] } as any)

    await app.inject({
      method: 'GET',
      url: '/api/v1/customer/home?lat=51.5&lng=-0.1',
    })

    expect(getHomeFeed).toHaveBeenCalledWith(expect.anything(), 51.5, -0.1)
  })

  // ────────────────────────────────────────────────
  // Merchant detail
  // ────────────────────────────────────────────────

  it('GET /api/v1/customer/merchants/:id returns 200 without token', async () => {
    vi.mocked(getCustomerMerchant).mockResolvedValueOnce(mockMerchant as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/merchants/m1',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe('m1')
    expect(body.isFavourited).toBe(false)
    expect(getCustomerMerchant).toHaveBeenCalledWith(expect.anything(), 'm1', null)
  })

  it('GET /api/v1/customer/merchants/:id returns 200 with token and isFavourited present', async () => {
    const merchantWithFav = { ...mockMerchant, isFavourited: true }
    vi.mocked(getCustomerMerchant).mockResolvedValueOnce(merchantWithFav as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/merchants/m1',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('isFavourited')
    // userId should be extracted from token and passed to service
    expect(getCustomerMerchant).toHaveBeenCalledWith(expect.anything(), 'm1', 'user-test-1')
  })

  it('GET /api/v1/customer/merchants/:id returns 404 for unavailable merchant', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    vi.mocked(getCustomerMerchant).mockRejectedValueOnce(new AppError('MERCHANT_UNAVAILABLE'))

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/merchants/nonexistent',
    })

    expect(res.statusCode).toBe(404)
  })

  // ────────────────────────────────────────────────
  // Branch list
  // ────────────────────────────────────────────────

  it('GET /api/v1/customer/merchants/:id/branches returns 200', async () => {
    vi.mocked(getMerchantBranches).mockResolvedValueOnce(mockBranches as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/merchants/m1/branches',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].id).toBe('b1')
    expect(getMerchantBranches).toHaveBeenCalledWith(expect.anything(), 'm1')
  })

  // ────────────────────────────────────────────────
  // Voucher detail
  // ────────────────────────────────────────────────

  it('GET /api/v1/customer/vouchers/:id returns 200', async () => {
    vi.mocked(getCustomerVoucher).mockResolvedValueOnce(mockVoucher as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/vouchers/v1',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe('v1')
    expect(body).toHaveProperty('isRedeemedThisCycle')
    expect(body).toHaveProperty('isFavourited')
    expect(getCustomerVoucher).toHaveBeenCalledWith(expect.anything(), 'v1', null)
  })

  it('GET /api/v1/customer/vouchers/:id passes userId when token present', async () => {
    vi.mocked(getCustomerVoucher).mockResolvedValueOnce({ ...mockVoucher, isRedeemedThisCycle: true, isFavourited: true } as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/vouchers/v1',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(getCustomerVoucher).toHaveBeenCalledWith(expect.anything(), 'v1', 'user-test-1')
  })

  // ────────────────────────────────────────────────
  // Search
  // ────────────────────────────────────────────────

  it('GET /api/v1/customer/search returns 400 without q or category', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    vi.mocked(searchMerchants).mockRejectedValueOnce(new AppError('SEARCH_QUERY_REQUIRED'))

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/search',
    })

    expect(res.statusCode).toBe(400)
  })

  it('GET /api/v1/customer/search?q=pizza returns 200', async () => {
    vi.mocked(searchMerchants).mockResolvedValueOnce(mockSearchResult as any)

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
      'pizza',
      undefined,
      undefined,
      undefined,
      10,
      0,
    )
  })

  it('GET /api/v1/customer/search?category=cat1 returns 200', async () => {
    vi.mocked(searchMerchants).mockResolvedValueOnce({ merchants: [], total: 0 } as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/search?category=cat1',
    })

    expect(res.statusCode).toBe(200)
    expect(searchMerchants).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      'cat1',
      undefined,
      undefined,
      10,
      0,
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
      'coffee',
      undefined,
      undefined,
      undefined,
      20,
      40,
    )
  })

  // ────────────────────────────────────────────────
  // Categories
  // ────────────────────────────────────────────────

  it('GET /api/v1/customer/categories returns 200', async () => {
    vi.mocked(listCategories).mockResolvedValueOnce(mockCategories as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/categories',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].id).toBe('cat1')
    expect(listCategories).toHaveBeenCalledOnce()
  })

  // ────────────────────────────────────────────────
  // Campaign detail
  // ────────────────────────────────────────────────

  it('GET /api/v1/customer/campaigns/:id returns 200', async () => {
    vi.mocked(getCampaign).mockResolvedValueOnce(mockCampaign as any)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/campaigns/c1',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe('c1')
    expect(body).toHaveProperty('merchants')
    expect(getCampaign).toHaveBeenCalledWith(expect.anything(), 'c1')
  })

  it('GET /api/v1/customer/campaigns/:id returns 404 for unavailable campaign', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    vi.mocked(getCampaign).mockRejectedValueOnce(new AppError('CAMPAIGN_NOT_FOUND'))

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/campaigns/nonexistent',
    })

    expect(res.statusCode).toBe(404)
  })
})
