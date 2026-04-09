import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('branch user auth routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      branchUser: { findUnique: vi.fn() },
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

  it('POST /api/v1/branch/auth/login returns PASSWORD_CHANGE_REQUIRED on first login', async () => {
    const { hashPassword } = await import('../../../src/api/shared/password')
    const hash = await hashPassword('TempPass1!')

    app.prisma.branchUser.findUnique = vi.fn().mockResolvedValue({
      id: 'bu1', email: 'staff@test.com', passwordHash: hash,
      mustChangePassword: true, status: 'ACTIVE',
      branch: { id: 'b1', merchantId: 'm1', name: 'Main', merchant: { status: 'ACTIVE' } },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/branch/auth/login',
      payload: {
        email: 'staff@test.com', password: 'TempPass1!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000', deviceType: 'android',
      },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('PASSWORD_CHANGE_REQUIRED')
    expect(JSON.parse(res.body).tempToken).toBeDefined()
  })

  it('POST /api/v1/branch/auth/login returns 403 for deactivated user', async () => {
    const { hashPassword } = await import('../../../src/api/shared/password')
    const hash = await hashPassword('MyPass123!')

    app.prisma.branchUser.findUnique = vi.fn().mockResolvedValue({
      id: 'bu1', passwordHash: hash, mustChangePassword: false, status: 'INACTIVE',
      branch: { merchant: { status: 'ACTIVE' } },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/branch/auth/login',
      payload: {
        email: 'staff@test.com', password: 'MyPass123!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000', deviceType: 'android',
      },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_USER_DEACTIVATED')
  })
})
