import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../../src/api/app'

// D67: auth + capability gate on GET /api/v1/admin/redemptions (cap
// `redemption:read`). The gate fires in preHandlers (authenticateAdmin ->
// requireAdminCapability) before any service/prisma call, so a stub prisma
// suffices. When the gate passes we also assert the cross-merchant list shape
// (mirrors tests/api/admin/merchants-list-routes.test.ts's idiom).
describe('D67: GET /admin/redemptions route auth + capability gate', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      voucherRedemption: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'r1',
            redemptionCode: 'A7K2P9X4',
            redeemedAt: new Date('2026-07-01T10:00:00.000Z'),
            isValidated: false,
            validatedAt: null,
            validationMethod: null,
            estimatedSaving: 5,
            isTestData: true,
            voucher: { id: 'v1', title: 'Half-price pizza', type: 'BOGO' },
            branch: { id: 'b1', name: 'Main Branch', merchant: { id: 'm1', businessName: 'Acme Coffee' } },
            user: { firstName: 'Sarah', lastName: 'Khan' },
            validatedBy: null,
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
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/redemptions' })
    expect(res.statusCode).toBe(401)
  })

  it('403 ADMIN_CAPABILITY_DENIED for a role without redemption:read (SUPPORT)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/redemptions',
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('403 ADMIN_CAPABILITY_DENIED for FINANCE role (no redemption:read)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/redemptions',
      headers: { authorization: `Bearer ${signAdmin('FINANCE')}` },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('200 with OPERATIONS token: gate passes, returns the cross-merchant row shape', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/redemptions',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toMatchObject({ total: 1, limit: 25, offset: 0 })
    expect(body.items[0]).toMatchObject({
      id: 'r1',
      redemptionCode: 'A7K2P9X4',
      customerName: 'Sarah K.',
      merchant: { id: 'm1', businessName: 'Acme Coffee' },
      branch: { id: 'b1', name: 'Main Branch' },
      isTestData: true,
    })
    expect(body.items[0]).not.toHaveProperty('redemptionPin')
  })

  it('200 with SUPER_ADMIN token: gate passes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/redemptions',
      headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('D67-c: includeTest defaults true (no where.isTestData clause) when the query param is absent', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/v1/admin/redemptions',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    const where = (app.prisma.voucherRedemption.findMany as any).mock.calls[0][0].where
    expect(where.isTestData).toBeUndefined()
  })

  it('D67-c: ?includeTest=false excludes test rows', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/v1/admin/redemptions?includeTest=false',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    const where = (app.prisma.voucherRedemption.findMany as any).mock.calls[0][0].where
    expect(where.isTestData).toBe(false)
  })

  it('merchantId query param maps to the branch relation', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/v1/admin/redemptions?merchantId=m1',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    const where = (app.prisma.voucherRedemption.findMany as any).mock.calls[0][0].where
    expect(where.branch).toEqual({ merchantId: 'm1' })
  })

  it('400 when status is not a valid filter value (Zod, gate already passed)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/redemptions?status=NOPE',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    expect(res.statusCode).toBe(400)
  })
})
