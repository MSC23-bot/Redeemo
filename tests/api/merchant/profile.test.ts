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
      // Business Profile M1: getMerchantProfile additionally resolves the OWNER
      // contact (merchantMembership.findFirst, already mocked above with a row
      // that has no `merchantAdmin` select shape - so ownerContact resolves to
      // null by default in these pre-existing tests) and the signed agreement
      // (merchantContract.findUnique, defaulting to null/unsigned).
      merchantContract: { findUnique: vi.fn().mockResolvedValue(null) },
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

  // Business Profile M1 (Codex PII/role-boundary fix): ownerContact + agreement
  // are role-gated at the HTTP layer to OWNER | BRANCH_MANAGER only; STAFF (and
  // any future/unknown role) fail closed to null/null with the two owner/
  // contract queries never even fetched. The OWNER-resolution + no-cross-merchant
  // -leak guarantee itself is pinned at the service layer
  // (tests/api/merchant/profile.service.test.ts, which asserts the exact `where`
  // clause); these route-level pins prove the role boundary + the fields
  // actually reach the wire for privileged roles.
  it('GET /api/v1/merchant/profile exposes ownerContact + agreement for a BRANCH_MANAGER viewer', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', businessName: 'Acme', status: 'ACTIVE', onboardingStep: 'LIVE' })
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue([
      { id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'BRANCH_MANAGER', allBranches: true, canManageVouchers: false, merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [] },
    ])
    app.prisma.merchantMembership.findFirst = vi.fn().mockResolvedValue({
      merchantAdmin: { firstName: 'Priya', lastName: 'Shah', email: 'owner@acme.test', phone: '7000000001', phoneCountryCode: '+44', jobTitle: 'Founder' },
    })
    app.prisma.merchantContract.findUnique = vi.fn().mockResolvedValue({
      tcVersion: 'v2', signedAt: '2026-01-15T10:30:00.000Z', signatureMethod: 'CLICK_TO_AGREE',
    })

    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/profile', headers: { authorization: `Bearer ${merchantToken}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.ownerContact).toEqual({
      firstName: 'Priya', lastName: 'Shah', email: 'owner@acme.test', phone: '7000000001', phoneCountryCode: '+44', jobTitle: 'Founder',
    })
    expect(body.agreement).toEqual({ acceptedVersion: 'v2', acceptedAt: '2026-01-15T10:30:00.000Z', signatureMethod: 'CLICK_TO_AGREE' })
  })

  it('GET /api/v1/merchant/profile returns ownerContact: null and agreement: null for a STAFF viewer (fails closed) and NEVER fetches the owner/contract rows', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', businessName: 'Acme', status: 'ACTIVE', onboardingStep: 'LIVE' })
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue([
      { id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'STAFF', allBranches: false, canManageVouchers: false, merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [] },
    ])
    const ownerFindFirst = vi.fn().mockResolvedValue({
      merchantAdmin: { firstName: 'Priya', lastName: 'Shah', email: 'owner@acme.test', phone: '7000000001', phoneCountryCode: '+44', jobTitle: 'Founder' },
    })
    const contractFindUnique = vi.fn().mockResolvedValue({
      tcVersion: 'v2', signedAt: '2026-01-15T10:30:00.000Z', signatureMethod: 'CLICK_TO_AGREE',
    })
    app.prisma.merchantMembership.findFirst = ownerFindFirst
    app.prisma.merchantContract.findUnique = contractFindUnique

    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/profile', headers: { authorization: `Bearer ${merchantToken}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.ownerContact).toBeNull()
    expect(body.agreement).toBeNull()
    // Zero-leak proof: for a non-privileged role the queries are SKIPPED entirely,
    // not fetched-and-discarded.
    expect(ownerFindFirst).not.toHaveBeenCalled()
    expect(contractFindUnique).not.toHaveBeenCalled()
  })

  it('GET /api/v1/merchant/profile returns ownerContact: null and agreement: null for a future/unknown role (fail-closed allowlist)', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', businessName: 'Acme', status: 'ACTIVE', onboardingStep: 'LIVE' })
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue([
      { id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'AUDITOR', allBranches: false, canManageVouchers: false, merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [] },
    ])
    const ownerFindFirst = vi.fn().mockResolvedValue({
      merchantAdmin: { firstName: 'Priya', lastName: 'Shah', email: 'owner@acme.test', phone: '7000000001', phoneCountryCode: '+44', jobTitle: 'Founder' },
    })
    app.prisma.merchantMembership.findFirst = ownerFindFirst

    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/profile', headers: { authorization: `Bearer ${merchantToken}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.ownerContact).toBeNull()
    expect(body.agreement).toBeNull()
    expect(ownerFindFirst).not.toHaveBeenCalled()
  })

  it('GET /api/v1/merchant/profile returns ownerContact: null and agreement: null for OWNER when unresolvable / unsigned', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', businessName: 'Acme', status: 'REGISTERED', onboardingStep: 'REGISTERED' })
    app.prisma.merchantMembership.findFirst = vi.fn().mockResolvedValue(null)
    app.prisma.merchantContract.findUnique = vi.fn().mockResolvedValue(null)

    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/profile', headers: { authorization: `Bearer ${merchantToken}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.ownerContact).toBeNull()
    expect(body.agreement).toBeNull()
  })

  // Shell wave: viewerCapabilities is the viewer's OWN membership UX-hint block
  // { canViewInsights, canManageVouchers, role, displayName }. canViewInsights is
  // derived from the membership role (OWNER + BRANCH_MANAGER true; STAFF false) and
  // mirrors the assertInsightsAccess deny (the real boundary); canManageVouchers
  // mirrors assertCanManageVouchers (OWNER, or a BM with the grant); role/displayName
  // feed the account-menu identity line. No other member's data is ever exposed.
  // role is `string` so a test can pass a future/unknown role value (not in the
  // current union) to prove the allowlist fails closed.
  function membershipRow(role: string, canManageVouchers = false) {
    return [{ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role, allBranches: role !== 'STAFF', canManageVouchers, merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [] }]
  }
  function profileRow() {
    return { id: 'm1', businessName: 'Acme', status: 'ACTIVE', onboardingStep: 'LIVE' }
  }

  it('GET profile exposes the full viewerCapabilities block for OWNER (vouchers always manageable, displayName from the admin row)', async () => {
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue(membershipRow('OWNER'))
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue(profileRow())
    app.prisma.merchantAdmin.findUnique = vi.fn().mockResolvedValue({ firstName: 'Priya', lastName: 'Shah' })
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/profile', headers: { authorization: `Bearer ${merchantToken}` } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).viewerCapabilities).toEqual({
      canViewInsights: true,
      canManageVouchers: true,
      role: 'OWNER',
      displayName: 'Priya Shah',
    })
  })

  it('canManageVouchers is false for a BRANCH_MANAGER without the grant and true with it', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue(profileRow())
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue(membershipRow('BRANCH_MANAGER', false))
    let res = await app.inject({ method: 'GET', url: '/api/v1/merchant/profile', headers: { authorization: `Bearer ${merchantToken}` } })
    expect(JSON.parse(res.body).viewerCapabilities.canManageVouchers).toBe(false)
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue(membershipRow('BRANCH_MANAGER', true))
    res = await app.inject({ method: 'GET', url: '/api/v1/merchant/profile', headers: { authorization: `Bearer ${merchantToken}` } })
    expect(JSON.parse(res.body).viewerCapabilities.canManageVouchers).toBe(true)
  })

  it('displayName collapses missing parts and emits null when the admin row has no name', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue(profileRow())
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue(membershipRow('STAFF'))
    app.prisma.merchantAdmin.findUnique = vi.fn().mockResolvedValue({ firstName: 'Emma', lastName: '' })
    let res = await app.inject({ method: 'GET', url: '/api/v1/merchant/profile', headers: { authorization: `Bearer ${merchantToken}` } })
    expect(JSON.parse(res.body).viewerCapabilities.displayName).toBe('Emma')
    app.prisma.merchantAdmin.findUnique = vi.fn().mockResolvedValue(null)
    res = await app.inject({ method: 'GET', url: '/api/v1/merchant/profile', headers: { authorization: `Bearer ${merchantToken}` } })
    expect(JSON.parse(res.body).viewerCapabilities.displayName).toBeNull()
  })

  it('STAFF role is emitted verbatim, with canManageVouchers=false and canViewInsights=false', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue(profileRow())
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue(membershipRow('STAFF', false))
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/profile', headers: { authorization: `Bearer ${merchantToken}` } })
    const caps = JSON.parse(res.body).viewerCapabilities
    expect(caps.role).toBe('STAFF')
    expect(caps.canManageVouchers).toBe(false)
    expect(caps.canViewInsights).toBe(false)
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

  it('FAILS CLOSED for a future/unknown role (allowlist, not negation of STAFF)', async () => {
    // A hypothetical newly-added role must NOT receive Insights by default - the
    // capability is an explicit OWNER/BRANCH_MANAGER allowlist, so an unknown role is
    // false. Cast through unknown because the role is not in the current union.
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue(membershipRow('AUDITOR'))
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

  // ── BP-ADJ2: server-side type/non-null guard on the edit-request writer ──

  it('POST /api/v1/merchant/profile/edit-request rejects businessName: null', async () => {
    app.prisma.merchantPendingEdit.findFirst = vi.fn().mockResolvedValue(null)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/profile/edit-request',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { businessName: null },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_EDIT_REQUEST_INVALID_FIELD')
    expect(app.prisma.merchantPendingEdit.create).not.toHaveBeenCalled()
  })

  it('POST /api/v1/merchant/profile/edit-request rejects businessName: "" (empty string)', async () => {
    app.prisma.merchantPendingEdit.findFirst = vi.fn().mockResolvedValue(null)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/profile/edit-request',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { businessName: '   ' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_EDIT_REQUEST_INVALID_FIELD')
    expect(app.prisma.merchantPendingEdit.create).not.toHaveBeenCalled()
  })

  it('POST /api/v1/merchant/profile/edit-request rejects businessName: 123 (wrong type)', async () => {
    app.prisma.merchantPendingEdit.findFirst = vi.fn().mockResolvedValue(null)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/profile/edit-request',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { businessName: 123 },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_EDIT_REQUEST_INVALID_FIELD')
    expect(app.prisma.merchantPendingEdit.create).not.toHaveBeenCalled()
  })

  it('POST /api/v1/merchant/profile/edit-request STILL accepts tradingName: null (M4 clear preserved)', async () => {
    app.prisma.merchantPendingEdit.findFirst = vi.fn().mockResolvedValue(null)
    app.prisma.merchantPendingEdit.create = vi.fn().mockResolvedValue({ id: 'pe2', merchantId: 'm1', status: 'PENDING', createdAt: new Date() })
    app.prisma.adminApproval.create = vi.fn().mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/profile/edit-request',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { tradingName: null },
    })

    expect(res.statusCode).toBe(201)
    expect(app.prisma.merchantPendingEdit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ proposedChanges: { tradingName: null } }) })
    )
  })

  it('POST /api/v1/merchant/profile/edit-request accepts a valid businessName and stores it verbatim', async () => {
    app.prisma.merchantPendingEdit.findFirst = vi.fn().mockResolvedValue(null)
    app.prisma.merchantPendingEdit.create = vi.fn().mockResolvedValue({ id: 'pe3', merchantId: 'm1', status: 'PENDING', createdAt: new Date() })
    app.prisma.adminApproval.create = vi.fn().mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/profile/edit-request',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { businessName: 'New Name' },
    })

    expect(res.statusCode).toBe(201)
    expect(app.prisma.merchantPendingEdit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ proposedChanges: { businessName: 'New Name' } }) })
    )
  })

  it('POST /api/v1/merchant/profile/edit-request rejects tradingName: 123 and logoUrl: {} (wrong type, not null)', async () => {
    app.prisma.merchantPendingEdit.findFirst = vi.fn().mockResolvedValue(null)

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/profile/edit-request',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { tradingName: 123 },
    })
    expect(res1.statusCode).toBe(400)
    expect(JSON.parse(res1.body).error.code).toBe('MERCHANT_EDIT_REQUEST_INVALID_FIELD')

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/profile/edit-request',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { logoUrl: {} },
    })
    expect(res2.statusCode).toBe(400)
    expect(JSON.parse(res2.body).error.code).toBe('MERCHANT_EDIT_REQUEST_INVALID_FIELD')
    expect(app.prisma.merchantPendingEdit.create).not.toHaveBeenCalled()
  })

  it('MUTATION CHECK: if the businessName guard is removed, the null-rejection assertion fails', async () => {
    // Documents the mutation the fix design asks for: removing the ADJ2 guard
    // would make `{ businessName: null }` fall through to a 201/create. We
    // assert the CURRENT (correct, guarded) behaviour - a 400 with no create.
    app.prisma.merchantPendingEdit.findFirst = vi.fn().mockResolvedValue(null)
    app.prisma.merchantPendingEdit.create = vi.fn()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/profile/edit-request',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { businessName: null },
    })
    expect(res.statusCode).not.toBe(201)
    expect(app.prisma.merchantPendingEdit.create).not.toHaveBeenCalled()
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
