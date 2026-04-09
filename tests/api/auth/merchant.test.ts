import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('merchant auth routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn(), update: vi.fn() },
      userSession: { create: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
    } as any)
  })

  afterEach(async () => { await app.close() })

  it('POST /api/v1/merchant/auth/login returns 401 for unknown email', async () => {
    app.prisma.merchantAdmin.findUnique = vi.fn().mockResolvedValue(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/auth/login',
      payload: {
        email: 'unknown@merchant.com',
        password: 'MyPass123!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        deviceType: 'web',
      },
    })
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error.code).toBe('INVALID_CREDENTIALS')
  })

  it('POST /api/v1/merchant/auth/login returns OTP_REQUIRED for first login', async () => {
    const { hashPassword } = await import('../../../src/api/shared/password')
    const hash = await hashPassword('MyPass123!')

    app.prisma.merchantAdmin.findUnique = vi.fn().mockResolvedValue({
      id: 'ma1',
      email: 'merchant@example.com',
      passwordHash: hash,
      otpVerifiedAt: null,
      status: 'ACTIVE',
      merchant: { id: 'm1', status: 'ACTIVE', businessName: 'Test Co' },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/auth/login',
      payload: {
        email: 'merchant@example.com',
        password: 'MyPass123!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        deviceType: 'web',
      },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('OTP_REQUIRED')
  })

  it('POST /api/v1/merchant/auth/login returns 403 for suspended merchant', async () => {
    const { hashPassword } = await import('../../../src/api/shared/password')
    const hash = await hashPassword('MyPass123!')

    app.prisma.merchantAdmin.findUnique = vi.fn().mockResolvedValue({
      id: 'ma1', passwordHash: hash, otpVerifiedAt: new Date(), status: 'ACTIVE',
      merchant: { id: 'm1', status: 'SUSPENDED', businessName: 'Test Co' },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/auth/login',
      payload: {
        email: 'merchant@example.com',
        password: 'MyPass123!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        deviceType: 'web',
      },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_SUSPENDED')
  })
})
