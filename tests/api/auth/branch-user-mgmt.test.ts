import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('branch user management routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()

    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1', merchantId: 'm1' }), update: vi.fn() },
      branchUser: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'bu1', email: 'staff@test.com' }), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
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

  it('POST /api/v1/merchant/branches/:branchId/user requires auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/branches/b1/user',
      payload: { contactName: 'Jane', email: 'j@test.com', password: 'MyPass123!' },
    })
    expect(res.statusCode).toBe(401)
  })
})
