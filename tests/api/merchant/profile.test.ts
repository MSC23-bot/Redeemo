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
      merchantMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }),
        // Staff & Access PR-B: getMerchantProfile resolves via resolveMerchantContext
        // (getActiveMembership -> findMany). OWNER row -> MEMBER-READ allowed.
        findMany: vi.fn().mockResolvedValue([{ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'OWNER', allBranches: true, canManageVouchers: false, merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [] }]),
      },
      merchant: { findUnique: vi.fn(), update: vi.fn() },
      merchantPendingEdit: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
      branch: { count: vi.fn() },
      voucher: { count: vi.fn() },
      adminApproval: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      // B2.1: the simple-DIRECT path now runs inside a transaction (writeAuditLogTx
      // is transactional + actor-aware). $transaction passes the same mock as `tx`.
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb((app as any).prisma)),
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      exists: vi.fn().mockResolvedValue(1), // authenticateMerchant session-revocation check: live by default
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

  // Insights & Reports: viewerCapabilities.canViewInsights is derived from the
  // membership role (OWNER + BRANCH_MANAGER true; STAFF false). It mirrors the
  // assertInsightsAccess deny (the real boundary) and lets merchant-web hide the
  // Insights nav for STAFF.
  function membershipRow(role: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF') {
    return [{ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role, allBranches: role !== 'STAFF', canManageVouchers: false, merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [] }]
  }
  function profileRow() {
    return { id: 'm1', businessName: 'Acme', status: 'ACTIVE', onboardingStep: 'LIVE' }
  }

  it('GET profile exposes viewerCapabilities.canViewInsights=true for OWNER', async () => {
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue(membershipRow('OWNER'))
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue(profileRow())
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/profile', headers: { authorization: `Bearer ${merchantToken}` } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).viewerCapabilities).toEqual({ canViewInsights: true })
  })

  it('GET profile exposes viewerCapabilities.canViewInsights=true for BRANCH_MANAGER', async () => {
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue(membershipRow('BRANCH_MANAGER'))
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue(profileRow())
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/profile', headers: { authorization: `Bearer ${merchantToken}` } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).viewerCapabilities.canViewInsights).toBe(true)
  })

  it('GET profile exposes viewerCapabilities.canViewInsights=false for STAFF', async () => {
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue(membershipRow('STAFF'))
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue(profileRow())
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/profile', headers: { authorization: `Bearer ${merchantToken}` } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).viewerCapabilities.canViewInsights).toBe(false)
  })

  it('PATCH /api/v1/merchant/profile returns 400 when sensitive fields are included on a live (non-draft-window) merchant', async () => {
    // M2 B1 (D1): sensitive fields are rejected outside the draft window. A live
    // (ACTIVE / LIVE) merchant keeps routing through the governed edit-request
    // lane. The service reads the lifecycle (status + onboardingStep) to decide.
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ status: 'ACTIVE', onboardingStep: 'LIVE' })

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/profile',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { businessName: 'Should Be Rejected' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST')
  })

  it('PATCH /api/v1/merchant/profile writes sensitive fields DIRECTLY in the draft window (REGISTERED)', async () => {
    // M2 B1 (D1): in the draft window the sensitive write applies directly + audits
    // + creates NO MerchantPendingEdit. findUnique serves both the lifecycle read
    // and the sensitive-core before-snapshot.
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({
      status: 'REGISTERED', onboardingStep: 'REGISTERED',
      businessName: 'Old Co', tradingName: null, logoUrl: null, bannerUrl: null, description: null,
    })
    app.prisma.merchant.update = vi.fn().mockResolvedValue({ id: 'm1', businessName: 'New Co Ltd' })

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/profile',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { businessName: 'New Co Ltd' },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ businessName: 'New Co Ltd' }) })
    )
    expect(app.prisma.merchantPendingEdit.create).not.toHaveBeenCalled()
    expect(app.prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'MERCHANT_PROFILE_UPDATED',
          actorType: 'MERCHANT_ADMIN',
          actorId: 'ma1',
        }),
      })
    )
  })

  it('PATCH /api/v1/merchant/profile updates non-sensitive fields (transactional actor audit)', async () => {
    // beforeRow read for the audit before/after snapshot.
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ websiteUrl: 'https://old.com', vatNumber: null, companyNumber: null })
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
    // B2.1: the simple-DIRECT path now writes a transactional, actor-aware audit
    // (MERCHANT_ADMIN actor) via writeAuditLogTx, NOT fire-and-forget writeAuditLog.
    expect(app.prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'MERCHANT_PROFILE_UPDATED',
          actorType: 'MERCHANT_ADMIN',
          actorId: 'ma1',
          before: { websiteUrl: 'https://old.com' },
          after: { websiteUrl: 'https://test.com' },
        }),
      })
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
