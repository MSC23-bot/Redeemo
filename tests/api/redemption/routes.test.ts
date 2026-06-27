import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/redemption/service', () => ({
  createRedemption:       vi.fn(),
  verifyRedemption:       vi.fn(),
  listMyRedemptions:      vi.fn(),
  getMyRedemption:        vi.fn(),
  listBranchRedemptions:  vi.fn(),
}))

import {
  createRedemption,
  verifyRedemption,
  listMyRedemptions,
  getMyRedemption,
  listBranchRedemptions,
} from '../../../src/api/redemption/service'

describe('redemption routes', () => {
  let app: FastifyInstance
  let customerToken: string
  let branchToken: string
  let merchantToken: string

  const BRANCH_USER_ID  = 'branch-user-1'
  const MERCHANT_ADMIN_ID = 'merchant-admin-1'
  const BRANCH_ID       = 'branch-1'
  const MERCHANT_ID     = 'merchant-1'

  beforeEach(async () => {
    app = await buildApp()

    app.decorate('prisma', {
      // Staff & Access PR-B (B6): the merchant-actor verify + branch-redemptions
      // routes now resolveMerchantContext (getActiveMembership -> findMany) to enforce
      // branch scope. MERCHANT_ADMIN_ID is an OWNER + allBranches member here, so the
      // assertBranchAllowed guard passes by construction (existing behaviour preserved).
      merchantMembership: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([{
          id: 'mm1', merchantId: MERCHANT_ID, merchantAdminId: MERCHANT_ADMIN_ID, role: 'OWNER',
          allBranches: true, canManageVouchers: false,
          merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [],
        }]),
      },
      voucherRedemption: {
        create:     vi.fn(),
        findUnique: vi.fn(),
        findMany:   vi.fn(),
        update:     vi.fn(),
        count:      vi.fn(),
      },
      subscription:          { findUnique: vi.fn() },
      voucher:               { findUnique: vi.fn() },
      branch:                { findUnique: vi.fn() },
      userVoucherCycleState: { findUnique: vi.fn(), upsert: vi.fn() },
      auditLog:              { create: vi.fn().mockResolvedValue({}) },
      $transaction:          vi.fn(),
    } as any)

    // Redis returns branch session for BRANCH_USER_ID and merchant session for MERCHANT_ADMIN_ID
    app.decorate('redis', {
      get: vi.fn().mockImplementation((key: string) => {
        if (key === `auth:branch:${BRANCH_USER_ID}`) {
          return Promise.resolve(JSON.stringify({ branchId: BRANCH_ID, merchantId: MERCHANT_ID, isActive: true }))
        }
        if (key === `auth:merchant:${MERCHANT_ADMIN_ID}`) {
          return Promise.resolve(JSON.stringify({ merchantId: MERCHANT_ID, approvalStatus: 'APPROVED', isSuspended: false }))
        }
        return Promise.resolve(null)
      }),
      // The merchant-actor redemption routes now assert the per-session refresh token is
      // live (session-revocation), via redis.exists(refresh:merchant:<id>:<sessionId>).
      // Default: the merchant session (sessionId 's3') is live; tests override to 0 to
      // simulate logout/revoke.
      exists: vi.fn().mockImplementation((key: string) =>
        Promise.resolve(key === `refresh:merchant:${MERCHANT_ADMIN_ID}:s3` ? 1 : 0)
      ),
      set:  vi.fn().mockResolvedValue('OK'),
      del:  vi.fn().mockResolvedValue(1),
      incr: vi.fn().mockResolvedValue(1),
    } as any)

    await app.ready()

    const jwtAny = app.jwt as any
    customerToken = jwtAny.customer.sign(
      { sub: 'user-1', role: 'customer', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
    branchToken = jwtAny.branch.sign(
      { sub: BRANCH_USER_ID, role: 'branch_staff', deviceId: 'd2', sessionId: 's2' },
      { expiresIn: '1h' }
    )
    merchantToken = jwtAny.merchant.sign(
      { sub: MERCHANT_ADMIN_ID, role: 'merchant', deviceId: 'd3', sessionId: 's3' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  // ------------------------------------------------------------------ //
  // POST /api/v1/redemption — customer creates a redemption
  // ------------------------------------------------------------------ //

  it('POST /api/v1/redemption returns 201 on success (customer token)', async () => {
    const mockRedemption = {
      id: 'r1', redemptionCode: 'A7K2P9X4', isValidated: false, redeemedAt: new Date().toISOString(),
    }
    vi.mocked(createRedemption).mockResolvedValue(mockRedemption as any)

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { voucherId: 'v1', branchId: BRANCH_ID, pin: '1234' },
    })

    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body).redemptionCode).toBe('A7K2P9X4')
    expect(createRedemption).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'user-1',
      { voucherId: 'v1', branchId: BRANCH_ID, pin: '1234' },
      expect.objectContaining({ ipAddress: expect.any(String) })
    )
  })

  it('POST /api/v1/redemption returns 401 without token', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption',
      payload: { voucherId: 'v1', branchId: BRANCH_ID, pin: '1234' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('POST /api/v1/redemption returns 400 when body missing required fields', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { voucherId: 'v1' }, // missing branchId and pin
    })

    expect(res.statusCode).toBe(400)
  })

  it('POST /api/v1/redemption returns 400 when pin is not 4 digits', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { voucherId: 'v1', branchId: BRANCH_ID, pin: '12' },
    })

    expect(res.statusCode).toBe(400)
  })

  // ------------------------------------------------------------------ //
  // GET /api/v1/redemption/my
  // ------------------------------------------------------------------ //

  it('GET /api/v1/redemption/my returns 200 list (customer token)', async () => {
    const mockList = [
      { id: 'r1', redemptionCode: 'AAA', voucher: { id: 'v1', title: 'Test' }, branch: { id: BRANCH_ID, name: 'HQ' } },
    ]
    vi.mocked(listMyRedemptions).mockResolvedValue(mockList as any)

    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/redemption/my',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
  })

  it('GET /api/v1/redemption/my returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/redemption/my' })
    expect(res.statusCode).toBe(401)
  })

  // ------------------------------------------------------------------ //
  // GET /api/v1/redemption/my/:id
  // ------------------------------------------------------------------ //

  it('GET /api/v1/redemption/my/:id returns 200 for own redemption', async () => {
    const mockRedemption = {
      id: 'r1', redemptionCode: 'AAA', isValidated: false,
      voucher: { id: 'v1', title: 'Test', terms: 'T&C', merchant: { businessName: 'Biz' } },
      branch:  { id: BRANCH_ID, name: 'HQ', addressLine1: '1 St', city: 'London', postcode: 'SW1A' },
    }
    vi.mocked(getMyRedemption).mockResolvedValue(mockRedemption as any)

    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/redemption/my/r1',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).id).toBe('r1')
    expect(getMyRedemption).toHaveBeenCalledWith(expect.anything(), 'user-1', 'r1')
  })

  // ------------------------------------------------------------------ //
  // POST /api/v1/redemption/verify
  // ------------------------------------------------------------------ //

  it('POST /api/v1/redemption/verify returns 200 for branch_staff (branch token)', async () => {
    const mockResult = {
      id: 'r1', isValidated: true, validatedAt: new Date().toISOString(),
      validationMethod: 'MANUAL', customer: { name: 'John Smith' },
    }
    vi.mocked(verifyRedemption).mockResolvedValue(mockResult as any)

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${branchToken}` },
      payload: { code: 'A7K2P9X4', method: 'MANUAL' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.isValidated).toBe(true)
    expect(verifyRedemption).toHaveBeenCalledWith(
      expect.anything(),
      'A7K2P9X4',
      'MANUAL',
      expect.objectContaining({ role: 'branch', branchId: BRANCH_ID, merchantId: MERCHANT_ID }),
      expect.objectContaining({ ipAddress: expect.any(String) }),
      // Staff & Access B6: branch-actor path passes NO merchantCtx (undefined) — the
      // scoped-merchant guard never applies to a BranchUser.
      undefined,
    )
  })

  it('POST /api/v1/redemption/verify returns 200 for merchant admin (merchant token)', async () => {
    const mockResult = {
      id: 'r1', isValidated: true, validatedAt: new Date().toISOString(),
      validationMethod: 'QR_SCAN', customer: { name: 'Jane Doe' },
    }
    vi.mocked(verifyRedemption).mockResolvedValue(mockResult as any)

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { code: 'XYZ123', method: 'QR_SCAN' },
    })

    expect(res.statusCode).toBe(200)
    expect(verifyRedemption).toHaveBeenCalledWith(
      expect.anything(),
      'XYZ123',
      'QR_SCAN',
      expect.objectContaining({ role: 'merchant', branchId: null, merchantId: MERCHANT_ID }),
      expect.any(Object),
      // Staff & Access B6: merchant-actor path passes the resolved MerchantContext so
      // the service can enforce branch scope. OWNER + allBranches here.
      expect.objectContaining({ merchantId: MERCHANT_ID, role: 'OWNER', allBranches: true }),
    )
  })

  it('POST /api/v1/redemption/verify still works when the auth:merchant CACHE is gone but the session is LIVE (regression: do not depend on the expiring cache)', async () => {
    // The bug: the route hard-required the cached `auth:merchant:<id>` permission cache
    // (EX 3600, never renewed by token refresh) and 403'd once it expired, even though the
    // JWT was still valid AND the session (refresh token) was still live — so a merchant
    // admin logged in past 1h could not validate codes. Here the auth:merchant GET returns
    // null (cache gone) while the session refresh-key stays live (exists default = 1); the
    // route must authorize from the JWT + the live session + resolveMerchantContext.
    vi.mocked(app.redis.get as any).mockResolvedValue(null)
    vi.mocked(verifyRedemption).mockResolvedValue({ id: 'r1', isValidated: true, validationMethod: 'MANUAL' } as any)

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { code: 'XYZ123', method: 'MANUAL' },
    })

    expect(res.statusCode).toBe(200)
    expect(verifyRedemption).toHaveBeenCalledWith(
      expect.anything(),
      'XYZ123',
      'MANUAL',
      expect.objectContaining({ role: 'merchant', branchId: null, merchantId: MERCHANT_ID }),
      expect.any(Object),
      expect.objectContaining({ merchantId: MERCHANT_ID, role: 'OWNER', allBranches: true }),
    )
  })

  it('POST /api/v1/redemption/verify returns 403 for customer role (customer token rejected)', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { code: 'A7K2P9X4', method: 'MANUAL' },
    })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_ACCESS_DENIED')
  })

  it('POST /api/v1/redemption/verify returns 403 without any token', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      payload: { code: 'A7K2P9X4', method: 'MANUAL' },
    })

    expect(res.statusCode).toBe(403)
  })

  it('POST /api/v1/redemption/verify returns 401 for a merchant token whose membership was revoked', async () => {
    // Valid JWT but NO active membership (deactivated / removed admin): resolveMerchantContext
    // throws INVALID_CREDENTIALS (401) — the SAME outcome every /merchant/* route gives, so the
    // verify route is now consistent with the rest of the portal. (Pre-fix this returned 403 via
    // the now-removed cached-session gate.) The web BFF's single refresh-then-retry (no loop)
    // surfaces this as a logout, which is correct for an admin whose access was revoked.
    vi.mocked(app.prisma.merchantMembership.findMany as any).mockResolvedValue([])

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { code: 'XYZ123', method: 'MANUAL' },
    })

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error.code).toBe('INVALID_CREDENTIALS')
  })

  it('POST /api/v1/redemption/verify returns 401 SESSION_REVOKED when the per-session refresh token is gone (logout / password-reset / suspension)', async () => {
    // Session-revocation guard: a still-valid access token whose session was revoked
    // (the refresh key was deleted) must NOT validate — it short-circuits before the
    // service is ever called. Mirrors authenticateMerchant for these raw-merchantVerify
    // routes, keyed on the durable refresh token, not the expiring auth:merchant cache.
    vi.mocked(app.redis.exists as any).mockResolvedValue(0)
    vi.mocked(verifyRedemption).mockClear() // module mock is not auto-cleared between tests

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { code: 'XYZ123', method: 'MANUAL' },
    })

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error.code).toBe('SESSION_REVOKED')
    expect(verifyRedemption).not.toHaveBeenCalled()
  })

  // ------------------------------------------------------------------ //
  // GET /api/v1/branch/:branchId/redemptions
  // ------------------------------------------------------------------ //

  it('GET /api/v1/branch/:branchId/redemptions returns 200 for branch_staff accessing own branch', async () => {
    const mockResult = { total: 1, items: [{ id: 'r1', redemptionCode: 'AAA' }] }
    vi.mocked(listBranchRedemptions).mockResolvedValue(mockResult as any)

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/branch/${BRANCH_ID}/redemptions`,
      headers: { authorization: `Bearer ${branchToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.total).toBe(1)
    expect(listBranchRedemptions).toHaveBeenCalledWith(expect.anything(), BRANCH_ID, expect.objectContaining({ limit: 10, offset: 0 }))
  })

  it('GET /api/v1/branch/:branchId/redemptions returns 403 when staff accesses wrong branch', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/branch/wrong-branch-id/redemptions',
      headers: { authorization: `Bearer ${branchToken}` },
    })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_ACCESS_DENIED')
  })

  it('GET /api/v1/branch/:branchId/redemptions returns 200 for merchant admin (branch owned by same merchant)', async () => {
    const mockResult = { total: 2, items: [] }
    vi.mocked(listBranchRedemptions).mockResolvedValue(mockResult as any)
    vi.mocked(app.prisma.branch.findUnique as any).mockResolvedValue({ merchantId: MERCHANT_ID, merchant: { status: 'ACTIVE' } })

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/branch/${BRANCH_ID}/redemptions`,
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).total).toBe(2)
  })

  it('GET /api/v1/branch/:branchId/redemptions still works when the auth:merchant CACHE is gone but the session is LIVE (regression)', async () => {
    // Same fix as the verify route: authorize from the JWT + the live session +
    // resolveMerchantContext, not the expiring auth:merchant cache (null here; refresh-key
    // session live via exists default = 1).
    vi.mocked(app.redis.get as any).mockResolvedValue(null)
    vi.mocked(listBranchRedemptions).mockResolvedValue({ total: 1, items: [] } as any)
    vi.mocked(app.prisma.branch.findUnique as any).mockResolvedValue({ merchantId: MERCHANT_ID, merchant: { status: 'ACTIVE' } })

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/branch/${BRANCH_ID}/redemptions`,
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).total).toBe(1)
  })

  it('GET /api/v1/branch/:branchId/redemptions returns 403 MERCHANT_SUSPENDED for a suspended merchant (H1/G2 live-status backstop)', async () => {
    // The cached merchant-session snapshot says isSuspended:false (set at login),
    // but the merchant is SUSPENDED now. The live `branch.merchant.status` read
    // blocks it regardless of the stale cached flag.
    vi.mocked(app.prisma.branch.findUnique as any).mockResolvedValue({ merchantId: MERCHANT_ID, merchant: { status: 'SUSPENDED' } })

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/branch/${BRANCH_ID}/redemptions`,
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_SUSPENDED')
  })

  it('GET /api/v1/branch/:branchId/redemptions returns 403 for merchant admin accessing branch owned by different merchant', async () => {
    // The branch belongs to another merchant but is ACTIVE — so the ONLY thing that can
    // produce the 403 is the ownership guard (`branch.merchantId !== ctx.merchantId`),
    // not an accidental crash on a missing `merchant` relation. The mock mirrors the real
    // Prisma `select` shape ({ merchantId, merchant: { status } }) used by the route.
    vi.mocked(app.prisma.branch.findUnique as any).mockResolvedValue({ merchantId: 'other-merchant-id', merchant: { status: 'ACTIVE' } })
    vi.mocked(listBranchRedemptions).mockClear() // module mock is not auto-cleared between tests

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/branch/${BRANCH_ID}/redemptions`,
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_ACCESS_DENIED')
    // Tenant isolation: an out-of-tenant request must never reach the data layer.
    expect(listBranchRedemptions).not.toHaveBeenCalled()
  })

  it('GET /api/v1/branch/:branchId/redemptions returns 403 without token', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/branch/${BRANCH_ID}/redemptions`,
    })

    expect(res.statusCode).toBe(403)
  })

  it('GET /api/v1/branch/:branchId/redemptions returns 401 SESSION_REVOKED when the per-session refresh token is gone', async () => {
    // Same session-revocation guard as the verify route: a revoked session short-circuits
    // before resolveMerchantContext / the service is reached.
    vi.mocked(app.redis.exists as any).mockResolvedValue(0)
    vi.mocked(listBranchRedemptions).mockClear() // module mock is not auto-cleared between tests

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/branch/${BRANCH_ID}/redemptions`,
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error.code).toBe('SESSION_REVOKED')
    expect(listBranchRedemptions).not.toHaveBeenCalled()
  })
})
