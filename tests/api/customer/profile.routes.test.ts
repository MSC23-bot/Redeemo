import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/profile/service', () => ({
  getCustomerProfile:      vi.fn(),
  updateCustomerProfile:   vi.fn(),
  updateCustomerInterests: vi.fn(),
  changeCustomerPassword:  vi.fn(),
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

import {
  getCustomerProfile,
  updateCustomerProfile,
  updateCustomerInterests,
  changeCustomerPassword,
} from '../../../src/api/customer/profile/service'

describe('customer profile routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()

    app.decorate('prisma', {
      user:         { findUnique: vi.fn(), update: vi.fn() },
      interest:     { findMany: vi.fn(), count: vi.fn() },
      userInterest: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
      auditLog:     { create: vi.fn().mockResolvedValue({}) },
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

  afterEach(async () => {
    await app.close()
  })

  // ── GET /api/v1/customer/profile ──────────────────────────────────────────

  it('GET /api/v1/customer/profile returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/profile' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /api/v1/customer/profile returns 200 with valid token', async () => {
    ;(getCustomerProfile as any).mockResolvedValue({
      id: 'user-1',
      firstName: 'Jane',
      email: 'jane@example.com',
      profileCompleteness: 44,
    })
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/profile',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).firstName).toBe('Jane')
    expect(JSON.parse(res.body).profileCompleteness).toBe(44)
  })

  // ── PATCH /api/v1/customer/profile ────────────────────────────────────────

  it('PATCH /api/v1/customer/profile returns 200 on valid update', async () => {
    ;(updateCustomerProfile as any).mockResolvedValue({
      id: 'user-1',
      city: 'London',
      profileCompleteness: 55,
    })
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/customer/profile',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { city: 'London' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).city).toBe('London')
  })

  // ── PUT /api/v1/customer/profile/interests ────────────────────────────────

  it('PUT /api/v1/customer/profile/interests returns 200 with valid interestIds', async () => {
    ;(updateCustomerInterests as any).mockResolvedValue({
      interests: [{ id: 'i1', name: 'Food' }, { id: 'i2', name: 'Fitness' }],
    })
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/customer/profile/interests',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { interestIds: ['i1', 'i2'] },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).interests).toHaveLength(2)
  })

  it('PUT /api/v1/customer/profile/interests returns 400 when service throws INVALID_INTERESTS', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    ;(updateCustomerInterests as any).mockRejectedValue(new AppError('INVALID_INTERESTS'))
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/customer/profile/interests',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { interestIds: ['unknown-id'] },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('INVALID_INTERESTS')
  })

  // ── POST /api/v1/customer/profile/change-password ─────────────────────────

  it('POST /api/v1/customer/profile/change-password returns 200 with valid passwords', async () => {
    ;(changeCustomerPassword as any).mockResolvedValue({ success: true })
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/profile/change-password',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).success).toBe(true)
  })

  it('POST /api/v1/customer/profile/change-password returns 400 when service throws CURRENT_PASSWORD_INCORRECT', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    ;(changeCustomerPassword as any).mockRejectedValue(new AppError('CURRENT_PASSWORD_INCORRECT'))
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/profile/change-password',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { currentPassword: 'WrongPass1!', newPassword: 'NewPass1!' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('CURRENT_PASSWORD_INCORRECT')
  })

  it('POST /api/v1/customer/profile/change-password returns 400 when newPassword missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/profile/change-password',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { currentPassword: 'OldPass1!' },
    })
    expect(res.statusCode).toBe(400)
  })
})
