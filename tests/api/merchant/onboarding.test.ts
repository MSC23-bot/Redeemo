import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('merchant onboarding routes', () => {
  let app: FastifyInstance
  let merchantToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }) },
      merchant: { findUnique: vi.fn(), update: vi.fn() },
      merchantContract: { findUnique: vi.fn(), create: vi.fn() },
      branch: { count: vi.fn() },
      voucher: { count: vi.fn() },
      adminApproval: { create: vi.fn().mockResolvedValue({}), findFirst: vi.fn().mockResolvedValue(null), update: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      // M8: submitForApproval now emits admin alerts after commit (best-effort).
      // Provide the prisma surfaces those emitters touch so the route tests stay
      // green; the alert path itself is exercised in its own integration suite.
      adminUser: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
      notification: { create: vi.fn().mockResolvedValue({}) },
      // M3: submitForApproval now runs in a $transaction; run the callback with the same mock.
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb((app as any).prisma)),
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      exists: vi.fn().mockResolvedValue(1), // authenticateMerchant session-revocation check: live by default
    } as any)
    await app.ready()
    merchantToken = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  it('GET /api/v1/merchant/onboarding/checklist returns computed state', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', contractStatus: 'NOT_SIGNED' })
    app.prisma.branch.count = vi.fn().mockResolvedValue(1)
    app.prisma.voucher.count = vi.fn().mockResolvedValue(0)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/onboarding/checklist',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.branch_created).toBe(true)
    expect(body.contract_signed).toBe(false)
    expect(body.rmv_configured).toBe(false)
    expect(body.all_complete).toBe(false)
  })

  // WF8: a valid non-owner merchant token (BRANCH_MANAGER / STAFF) must get 403
  // INSUFFICIENT_PERMISSIONS from this owner-only read, never 401 INVALID_CREDENTIALS
  // - a 401 makes merchant-web's client treat the session as dead and tear the whole
  // portal down to /sign-in (apps/merchant-web/lib/api/client.ts), which is exactly
  // the bug this fix closes (resolveAdminMerchant in src/api/merchant/shared.ts).
  it('GET /api/v1/merchant/onboarding/checklist returns 403 INSUFFICIENT_PERMISSIONS for a BRANCH_MANAGER token (not 401)', async () => {
    app.prisma.merchantMembership.findFirst = vi.fn().mockResolvedValue(null)
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue([
      { id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'BRANCH_MANAGER', allBranches: true, canManageVouchers: false, branches: [] },
    ])

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/onboarding/checklist',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
  })

  it('GET /api/v1/merchant/onboarding/checklist returns 403 INSUFFICIENT_PERMISSIONS for a STAFF token (not 401)', async () => {
    app.prisma.merchantMembership.findFirst = vi.fn().mockResolvedValue(null)
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue([
      { id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'STAFF', allBranches: false, canManageVouchers: false, branches: [] },
    ])

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/onboarding/checklist',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
  })

  it('GET /api/v1/merchant/onboarding/contract returns contract text and version', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/onboarding/contract',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    // D65 Slice 0: GET /contract now reads the current version from the agreement
    // registry (superseding the old hardcoded '1.0' constant). The current entry is
    // the v2 DRAFT.
    expect(body.version).toBe('2.0-draft')
    expect(typeof body.text).toBe('string')
    expect(body.text.length).toBeGreaterThan(10)
  })

  // Review-round S2: in PRODUCTION, while the current version is a draft, GET /contract
  // serves the legacy non-draft 1.0 (preserving pre-D65 production onboarding). This is
  // the ONE environment-dependent GET /contract pin.
  it('GET /contract serves the legacy 1.0 in production while the current version is a draft', async () => {
    const prev = process.env.REDEEMO_DEPLOY_ENV
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/merchant/onboarding/contract',
        headers: { authorization: `Bearer ${merchantToken}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.version).toBe('1.0')
      expect(body.text).toContain('Redeemo Merchant Agreement v1.0')
    } finally {
      if (prev === undefined) delete process.env.REDEEMO_DEPLOY_ENV
      else process.env.REDEEMO_DEPLOY_ENV = prev
    }
  })

  it('POST /api/v1/merchant/onboarding/contract/accept records acceptance', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', contractStatus: 'NOT_SIGNED' })
    app.prisma.merchantContract.create = vi.fn().mockResolvedValue({})
    app.prisma.merchant.update = vi.fn().mockResolvedValue({})

    // Non-production (test env): the served version is the current draft, so the honest
    // client echoes '2.0-draft' (what GET /contract returned). tcVersion is written from
    // the SERVER-selected served version, not this echo.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/onboarding/contract/accept',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { version: '2.0-draft' },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.merchantContract.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tcVersion: '2.0-draft' }) })
    )
    expect(app.prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contractStatus: 'SIGNED' }) })
    )
  })

  it('POST /contract/accept refuses a stale client version (409) and writes nothing', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', contractStatus: 'NOT_SIGNED' })
    app.prisma.merchantContract.create = vi.fn().mockResolvedValue({})
    app.prisma.merchant.update = vi.fn().mockResolvedValue({})

    // Non-production serves '2.0-draft'; a client echoing the stale '1.0' reviewed an
    // out-of-date page, so the write is refused before any contract row / status flip.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/onboarding/contract/accept',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { version: '1.0' },
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('AGREEMENT_VERSION_MISMATCH')
    expect(app.prisma.merchantContract.create).not.toHaveBeenCalled()
    expect(app.prisma.merchant.update).not.toHaveBeenCalled()
  })

  it('POST /api/v1/merchant/onboarding/contract/accept returns 409 if already signed', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', contractStatus: 'SIGNED' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/onboarding/contract/accept',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { version: '1.0' },
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('CONTRACT_ALREADY_SIGNED')
  })

  it('POST /api/v1/merchant/onboarding/submit returns 409 when gates incomplete', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', contractStatus: 'NOT_SIGNED', status: 'REGISTERED' })
    app.prisma.branch.count = vi.fn().mockResolvedValue(0)
    app.prisma.voucher.count = vi.fn().mockResolvedValue(0)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/onboarding/submit',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('ONBOARDING_GATES_INCOMPLETE')
  })

  it('POST /api/v1/merchant/onboarding/submit succeeds when all gates pass', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', contractStatus: 'SIGNED', status: 'REGISTERED' })
    app.prisma.branch.count = vi.fn().mockResolvedValue(1)
    app.prisma.voucher.count = vi.fn().mockResolvedValue(2)
    app.prisma.merchant.update = vi.fn().mockResolvedValue({ id: 'm1', status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/onboarding/submit',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    // M3 fix: verificationStatus becomes PENDING on submit (was inert).
    expect(app.prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED', verificationStatus: 'PENDING' }) })
    )
    expect(app.prisma.adminApproval.create).toHaveBeenCalled()
    // B3/D2 non-regression: the audit is now written IN-TRANSACTION and actor-
    // attributed; the merchant self-submit path carries actorType MERCHANT_ADMIN.
    expect(app.prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'MERCHANT_SUBMITTED_FOR_APPROVAL', actorType: 'MERCHANT_ADMIN', actorId: 'ma1' }) })
    )
  })

  it('POST /submit RESUBMITS (reopens the same approval) when merchant is PENDING_APPROVAL + NEEDS_CHANGES', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', status: 'PENDING_APPROVAL', onboardingStep: 'NEEDS_CHANGES', contractStatus: 'SIGNED' })
    app.prisma.branch.count = vi.fn().mockResolvedValue(1)
    app.prisma.voucher.count = vi.fn().mockResolvedValue(2)
    app.prisma.merchant.update = vi.fn().mockResolvedValue({ id: 'm1' })
    app.prisma.adminApproval.findFirst = vi.fn().mockResolvedValue({ id: 'ap1' }) // existing approval

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/onboarding/submit',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED', verificationStatus: 'PENDING' }) })
    )
    // Reopens the SAME approval (no duplicate thread); clears the prior claim.
    expect(app.prisma.adminApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ap1' }, data: expect.objectContaining({ status: 'PENDING', claimedById: null }) })
    )
    expect(app.prisma.adminApproval.create).not.toHaveBeenCalled()
    // B3/D2 non-regression: resubmit carries actorType MERCHANT_ADMIN + the
    // MERCHANT_RESUBMITTED event, written in-transaction.
    expect(app.prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'MERCHANT_RESUBMITTED', actorType: 'MERCHANT_ADMIN' }) })
    )
  })
})
