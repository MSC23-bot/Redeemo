import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/favourites/service', () => ({
  addFavouriteMerchant:    vi.fn(),
  removeFavouriteMerchant: vi.fn(),
  listFavouriteMerchants:  vi.fn(),
  addFavouriteVoucher:     vi.fn(),
  removeFavouriteVoucher:  vi.fn(),
  listFavouriteVouchers:   vi.fn(),
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

import {
  addFavouriteMerchant,
  removeFavouriteMerchant,
  listFavouriteMerchants,
  addFavouriteVoucher,
  removeFavouriteVoucher,
  listFavouriteVouchers,
} from '../../../src/api/customer/favourites/service'

describe('customer favourites routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      favouriteMerchant: { create: vi.fn(), delete: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
      favouriteVoucher:  { create: vi.fn(), delete: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
      auditLog:          { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any)
    await app.ready()
    const jwtAny = app.jwt as any
    customerToken = jwtAny.customer.sign(
      { sub: 'user-1', role: 'customer', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  it('GET /api/v1/customer/favourites/merchants returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/favourites/merchants' })
    expect(res.statusCode).toBe(401)
  })

  it('POST /api/v1/customer/favourites/merchants/:merchantId returns 201', async () => {
    ;(addFavouriteMerchant as any).mockResolvedValue({ id: 'fav-1' })
    const res = await app.inject({
      method: 'POST', url: '/api/v1/customer/favourites/merchants/merchant-1',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(201)
  })

  it('POST /api/v1/customer/favourites/merchants/:merchantId returns 409 when already favourited', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    ;(addFavouriteMerchant as any).mockRejectedValue(new AppError('ALREADY_FAVOURITED'))
    const res = await app.inject({
      method: 'POST', url: '/api/v1/customer/favourites/merchants/merchant-1',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('ALREADY_FAVOURITED')
  })

  it('DELETE /api/v1/customer/favourites/merchants/:merchantId returns 200', async () => {
    ;(removeFavouriteMerchant as any).mockResolvedValue({ removed: true })
    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/customer/favourites/merchants/merchant-1',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('GET /api/v1/customer/favourites/merchants returns 200 with list', async () => {
    ;(listFavouriteMerchants as any).mockResolvedValue([{ id: 'merchant-1', businessName: 'Acme' }])
    const res = await app.inject({
      method: 'GET', url: '/api/v1/customer/favourites/merchants',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })

  it('DELETE /api/v1/customer/favourites/merchants/:merchantId returns 404 when not found', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    ;(removeFavouriteMerchant as any).mockRejectedValue(new AppError('FAVOURITE_NOT_FOUND'))
    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/customer/favourites/merchants/merchant-1',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('FAVOURITE_NOT_FOUND')
  })

  it('GET /api/v1/customer/favourites/vouchers returns 200', async () => {
    ;(listFavouriteVouchers as any).mockResolvedValue([{ id: 'v1', title: 'Free coffee' }])
    const res = await app.inject({
      method: 'GET', url: '/api/v1/customer/favourites/vouchers',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })

  it('POST /api/v1/customer/favourites/vouchers/:voucherId returns 201', async () => {
    ;(addFavouriteVoucher as any).mockResolvedValue({ id: 'fav-v-1' })
    const res = await app.inject({
      method: 'POST', url: '/api/v1/customer/favourites/vouchers/v1',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(201)
  })

  it('DELETE /api/v1/customer/favourites/vouchers/:voucherId returns 200', async () => {
    ;(removeFavouriteVoucher as any).mockResolvedValue({ removed: true })
    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/customer/favourites/vouchers/v1',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
  })
})
