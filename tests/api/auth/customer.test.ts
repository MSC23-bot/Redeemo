import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('customer auth routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()

    // Inject mock prisma
    app.decorate('prisma', {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      userSession: { create: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)

    // Inject mock redis
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
    } as any)
  })

  afterEach(async () => { await app.close() })

  it('POST /api/v1/customer/auth/register returns 200 with valid payload', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue(null) // email not taken
    app.prisma.user.create = vi.fn().mockResolvedValue({ id: 'u1', email: 'test@example.com' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'MyPass123!',
        firstName: 'Test',
        lastName: 'User',
        marketingConsent: false,
      },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).message).toContain('email')
  })

  it('POST /api/v1/customer/auth/register returns 409 if email taken', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue({ id: 'u1' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/auth/register',
      payload: {
        email: 'taken@example.com',
        password: 'MyPass123!',
        firstName: 'Test',
        lastName: 'User',
        marketingConsent: false,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('EMAIL_ALREADY_EXISTS')
  })

  it('POST /api/v1/customer/auth/register returns 400 for weak password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'weak',
        firstName: 'Test',
        lastName: 'User',
        marketingConsent: false,
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /api/v1/customer/auth/login returns 403 for unverified account', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue({
      id: 'u1',
      email: 'test@example.com',
      passwordHash: '$2a$12$placeholder',
      emailVerified: false,
      phoneVerified: false,
      status: 'ACTIVE',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/auth/login',
      payload: {
        email: 'test@example.com',
        password: 'MyPass123!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        deviceType: 'ios',
      },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ACCOUNT_NOT_ACTIVE')
  })
})
