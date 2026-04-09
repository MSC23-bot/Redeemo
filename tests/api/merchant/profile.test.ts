import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('merchant profile routes', () => {
  let app: FastifyInstance
  let merchantToken: string

  beforeEach(async () => {
    app = await buildApp()
    // Decorate before ready() so plugins don't conflict in test mode
    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchant: { findUnique: vi.fn(), update: vi.fn() },
      merchantPendingEdit: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
      branch: { count: vi.fn() },
      voucher: { count: vi.fn() },
      adminApproval: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any)
    // Call ready() to initialize plugins, then sign via the merchant namespace.
    // app.jwt is typed as JWT but the namespace key is added at runtime by @fastify/jwt.
    await app.ready()
    const jwtAny = app.jwt as any
    merchantToken = jwtAny.merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  it('GET /api/v1/merchant/profile returns 200 with profile', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({
      id: 'm1',
      businessName: 'Test Co',
      tradingName: null,
      companyNumber: null,
      vatNumber: null,
      websiteUrl: null,
      logoUrl: null,
      bannerUrl: null,
      description: null,
      status: 'REGISTERED',
      onboardingStep: 'REGISTERED',
      primaryCategoryId: null,
      contractStatus: 'NOT_SIGNED',
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/profile',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).businessName).toBe('Test Co')
  })

  it('GET /api/v1/merchant/profile returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/profile' })
    expect(res.statusCode).toBe(401)
  })

  it('PATCH /api/v1/merchant/profile returns 400 when sensitive fields are included', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/profile',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { businessName: 'Should Be Rejected' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST')
  })

  it('PATCH /api/v1/merchant/profile updates non-sensitive fields', async () => {
    app.prisma.merchant.update = vi.fn().mockResolvedValue({ id: 'm1', websiteUrl: 'https://test.com' })

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/profile',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { websiteUrl: 'https://test.com' },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ websiteUrl: 'https://test.com' }) })
    )
  })

  it('POST /api/v1/merchant/profile/edit-request creates pending edit', async () => {
    app.prisma.merchantPendingEdit.findFirst = vi.fn().mockResolvedValue(null)
    app.prisma.merchantPendingEdit.create = vi.fn().mockResolvedValue({ id: 'pe1', merchantId: 'm1', status: 'PENDING', createdAt: new Date() })
    app.prisma.adminApproval.create = vi.fn().mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/profile/edit-request',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { businessName: 'New Name Ltd' },
    })

    expect(res.statusCode).toBe(201)
    expect(app.prisma.merchantPendingEdit.create).toHaveBeenCalled()
    expect(app.prisma.adminApproval.create).toHaveBeenCalled()
  })

  it('POST /api/v1/merchant/profile/edit-request returns 409 when pending edit exists', async () => {
    const existingEdit = { id: 'pe1', merchantId: 'm1', status: 'PENDING', createdAt: new Date('2026-04-09') }
    app.prisma.merchantPendingEdit.findFirst = vi.fn().mockResolvedValue(existingEdit)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/profile/edit-request',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { businessName: 'Another Name' },
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('PENDING_EDIT_EXISTS')
  })

  it('GET /api/v1/merchant/profile/edit-requests returns list', async () => {
    app.prisma.merchantPendingEdit.findMany = vi.fn().mockResolvedValue([{ id: 'pe1', status: 'PENDING' }])

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/profile/edit-requests',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })

  it('DELETE /api/v1/merchant/profile/edit-requests/:id withdraws pending edit', async () => {
    app.prisma.merchantPendingEdit.findFirst = vi.fn().mockResolvedValue({ id: 'pe1', merchantId: 'm1', status: 'PENDING' })
    app.prisma.merchantPendingEdit.update = vi.fn().mockResolvedValue({ id: 'pe1', status: 'WITHDRAWN' })

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/merchant/profile/edit-requests/pe1',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.merchantPendingEdit.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'WITHDRAWN' }) })
    )
  })
})
