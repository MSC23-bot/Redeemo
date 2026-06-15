import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// WP2 — auth + capability gate on GET /api/v1/admin/merchants (cap
// `merchant:read`). The gate fires in preHandlers (authenticateAdmin →
// requireAdminCapability) before any service/prisma call, so a stub prisma
// suffices. When the gate passes we also assert the redacted list shape.
describe('WP2 — GET /admin/merchants route auth + capability gate', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchant: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'm1',
            businessName: 'Joe Diner',
            tradingName: 'Joe',
            status: 'ACTIVE',
            verificationStatus: 'VERIFIED',
            onboardingStep: 'LIVE',
            logoUrl: null,
            createdAt: new Date('2026-06-01T00:00:00.000Z'),
            primaryCategory: { name: 'Restaurants' },
            _count: { branches: 2 },
          },
        ]),
      },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/merchants' })
    expect(res.statusCode).toBe(401)
  })

  it('403 ADMIN_CAPABILITY_DENIED for a role without merchant:read (SUPPORT)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/merchants',
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('403 ADMIN_CAPABILITY_DENIED for FINANCE role (no merchant:read)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/merchants',
      headers: { authorization: `Bearer ${signAdmin('FINANCE')}` },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('200 with OPERATIONS token — gate passes, returns redacted list shape', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/merchants',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toMatchObject({ page: 1, pageSize: 20, total: 1 })
    expect(Array.isArray(body.merchants)).toBe(true)
    expect(body.merchants[0]).toMatchObject({
      id: 'm1',
      businessName: 'Joe Diner',
      status: 'ACTIVE',
      category: 'Restaurants',
      branchCount: 2,
    })
    // Redaction: no secret fields surface on the wire.
    expect(body.merchants[0]).not.toHaveProperty('redemptionPin')
    expect(body.merchants[0]).not.toHaveProperty('passwordHash')
    expect(body.merchants[0]).not.toHaveProperty('primaryCategory')
  })

  it('200 with SUPER_ADMIN token — gate passes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/merchants',
      headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('400 when status is not a valid MerchantStatus (Zod, gate already passed)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/merchants?status=NOPE',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    expect(res.statusCode).toBe(400)
  })
})
