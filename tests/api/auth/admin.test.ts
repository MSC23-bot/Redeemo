import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('admin auth routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      adminUser: { findUnique: vi.fn() },
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

  it('POST /api/v1/admin/auth/login always returns OTP_REQUIRED on valid credentials', async () => {
    const { hashPassword } = await import('../../../src/api/shared/password')
    const hash = await hashPassword('AdminPass1!')

    app.prisma.adminUser.findUnique = vi.fn().mockResolvedValue({
      id: 'a1', email: 'admin@redeemo.com', passwordHash: hash,
      isActive: true, role: 'SUPER_ADMIN',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: {
        email: 'admin@redeemo.com', password: 'AdminPass1!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000', deviceType: 'web',
      },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('OTP_REQUIRED')
    expect(JSON.parse(res.body).sessionChallenge).toBeDefined()
  })

  it('POST /api/v1/admin/auth/login returns 401 for wrong password', async () => {
    const { hashPassword } = await import('../../../src/api/shared/password')
    const hash = await hashPassword('AdminPass1!')

    app.prisma.adminUser.findUnique = vi.fn().mockResolvedValue({
      id: 'a1', email: 'admin@redeemo.com', passwordHash: hash, isActive: true,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: {
        email: 'admin@redeemo.com', password: 'WrongPass1!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000', deviceType: 'web',
      },
    })
    expect(res.statusCode).toBe(401)
  })
})
