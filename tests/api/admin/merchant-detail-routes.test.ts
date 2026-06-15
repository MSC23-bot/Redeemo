import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Option B B2.1-read: auth + capability gate + redaction on GET
// /admin/merchants/:id. The gate (authenticateAdmin then
// requireAdminCapability('merchant:read')) fires in preHandlers before the
// service, so a tiny prisma mock suffices. The positive case also pins that the
// query select redacts (no redemptionPin / vatNumber; soft-deleted branches
// filtered) at the prisma-call level.
describe('B2.1-read: GET /admin/merchants/:id (auth + capability + shape)', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })
  const url = '/api/v1/admin/merchants/m1'

  const detailRow = {
    id: 'm1', businessName: 'Acme', tradingName: 'Acme Co', status: 'ACTIVE',
    verificationStatus: 'VERIFIED', onboardingStep: 'LIVE', websiteUrl: 'https://acme.example.com',
    logoUrl: null, primaryCategory: { name: 'Food' },
    branches: [
      {
        id: 'b1', name: 'Main', isMainBranch: true, addressLine1: '1 St', addressLine2: null,
        city: 'London', postcode: 'EC1A 1BB', localityName: 'City of London',
        locationConfidence: 'POSTCODE_CENTROID', phone: '+44111', email: 'b@x.com',
        websiteUrl: null, isActive: true,
      },
    ],
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', { merchant: { findUnique: vi.fn().mockResolvedValue(detailRow) } } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  it('401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url })
    expect(res.statusCode).toBe(401)
  })

  it('403 ADMIN_CAPABILITY_DENIED for SUPPORT (lacks merchant:read)', async () => {
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` } })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('200 for OPERATIONS with the redacted detail shape, and the query select redacts', async () => {
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.merchant).toMatchObject({ id: 'm1', websiteUrl: 'https://acme.example.com', category: 'Food' })
    expect(body.merchant).not.toHaveProperty('vatNumber')
    expect(body.merchant).not.toHaveProperty('companyNumber')
    expect(body.merchant).not.toHaveProperty('primaryCategory')
    expect(body.branches[0]).toMatchObject({ id: 'b1', phone: '+44111', email: 'b@x.com', isActive: true })
    expect(body.branches[0]).not.toHaveProperty('redemptionPin')
    // Pin the redaction at the query level: branches filtered to deletedAt:null,
    // the branch select never includes redemptionPin, the merchant select never
    // includes vatNumber/companyNumber.
    const findArgs = (app as any).prisma.merchant.findUnique.mock.calls[0][0]
    expect(findArgs.select.branches.where).toEqual({ deletedAt: null })
    expect(findArgs.select.branches.select).not.toHaveProperty('redemptionPin')
    expect(findArgs.select.branches.select).not.toHaveProperty('logoUrl')
    expect(findArgs.select).not.toHaveProperty('vatNumber')
    expect(findArgs.select).not.toHaveProperty('companyNumber')
  })

  it('200 for SUPER_ADMIN (superuser)', async () => {
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` } })
    expect(res.statusCode).toBe(200)
  })

  it('404 MERCHANT_NOT_FOUND when the merchant is absent', async () => {
    ;(app as any).prisma.merchant.findUnique.mockResolvedValueOnce(null)
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_NOT_FOUND')
  })
})
