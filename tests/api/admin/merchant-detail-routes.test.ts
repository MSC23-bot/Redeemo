import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Option B B2.1-read + B2.2: auth + capability gate + redaction on GET
// /admin/merchants/:id. The gate (authenticateAdmin then
// requireAdminCapability('merchant:read')) fires in preHandlers before the
// service, so a tiny prisma mock suffices. The positive case pins that the
// merchant select exposes the read-only registered-identity fields
// (vatNumber/companyNumber, B2.2) while still redacting branch secrets (no
// redemptionPin; soft-deleted branches filtered) at the prisma-call level.
describe('B2.1-read + B2.2: GET /admin/merchants/:id (auth + capability + shape)', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })
  const url = '/api/v1/admin/merchants/m1'

  const detailRow = {
    id: 'm1', businessName: 'Acme', tradingName: 'Acme Co', status: 'ACTIVE',
    verificationStatus: 'VERIFIED', onboardingStep: 'LIVE', websiteUrl: 'https://acme.example.com',
    contractStatus: 'SIGNED',
    // A4: the contract window dates + the (nullable) contract relation + the
    // documents _count that getMerchantDetail now selects.
    contractStartDate: new Date('2025-11-12T00:00:00.000Z'),
    contractEndDate: new Date('2026-11-12T00:00:00.000Z'),
    contract: { signatureMethod: 'CLICK_TO_AGREE', signedAt: new Date('2025-11-12T00:00:00.000Z') },
    _count: { documents: 3 },
    vatNumber: 'GB123456789', companyNumber: '12345678',
    primaryCategoryId: 'cat-1', description: 'We sell coffee',
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

  // A4: the primary OWNER membership getMerchantDetail resolves for the owner
  // contact block (curated: name/email/phone/emailVerified — never passwordHash).
  const ownerMembership = {
    merchantAdmin: {
      firstName: 'Marta', lastName: 'Okafor', email: 'marta@acme.example.com',
      phone: '0117 496 0000', emailVerified: true,
    },
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchant: { findUnique: vi.fn().mockResolvedValue(detailRow) },
      // B2.3-read: getMerchantDetail counts submitted/live RMVs for categoryLocked
      // (call[0]); A4 adds an ACTIVE-voucher count for the header (call[1]).
      voucher: { count: vi.fn().mockResolvedValue(0) },
      // B2.5: getMerchantDetail checks for a PENDING identity edit.
      merchantPendingEdit: { findFirst: vi.fn().mockResolvedValue(null) },
      // A4: owner contact (findFirst) + owner count.
      merchantMembership: {
        findFirst: vi.fn().mockResolvedValue(ownerMembership),
        count: vi.fn().mockResolvedValue(1),
      },
      // A4: total-redemptions header count (join via branch.merchantId).
      voucherRedemption: { count: vi.fn().mockResolvedValue(42) },
    } as any)
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
    // B2.2: the registered-identity fields are now returned read-only.
    expect(body.merchant.vatNumber).toBe('GB123456789')
    expect(body.merchant.companyNumber).toBe('12345678')
    // B2.3-read: the category id (for preselection) + categoryLocked (false here).
    expect(body.merchant.primaryCategoryId).toBe('cat-1')
    expect(body.merchant.categoryLocked).toBe(false)
    // B2.5: description (for the propose dialog) + hasPendingIdentityEdit (false here).
    expect(body.merchant.description).toBe('We sell coffee')
    expect(body.merchant.hasPendingIdentityEdit).toBe(false)
    expect(body.merchant).not.toHaveProperty('primaryCategory')
    expect(body.branches[0]).toMatchObject({ id: 'b1', phone: '+44111', email: 'b@x.com', isActive: true })
    expect(body.branches[0]).not.toHaveProperty('redemptionPin')
    // Pin the redaction at the query level: branches filtered to deletedAt:null,
    // the branch select never includes redemptionPin / secrets. The merchant
    // select DOES include the read-only identity fields (B2.2).
    const findArgs = (app as any).prisma.merchant.findUnique.mock.calls[0][0]
    expect(findArgs.select.branches.where).toEqual({ deletedAt: null })
    expect(findArgs.select.branches.select).not.toHaveProperty('redemptionPin')
    expect(findArgs.select.branches.select).not.toHaveProperty('logoUrl')
    expect(findArgs.select.vatNumber).toBe(true)
    expect(findArgs.select.companyNumber).toBe(true)
    expect(findArgs.select.primaryCategoryId).toBe(true)
    expect(findArgs.select.description).toBe(true)
    // B3: contractStatus is selected to feed the submit checklist, but NOT spread
    // into the response (consumed only by submitChecklist.contract_signed).
    expect(findArgs.select.contractStatus).toBe(true)
    expect(body.merchant).not.toHaveProperty('contractStatus')
    // B3: submit readiness derived inline from the already-fetched data. contract
    // SIGNED + 1 branch, but 0 RMVs (voucher.count mock) → not all_complete. The
    // merchant is ACTIVE/LIVE → not in a submittable state.
    expect(body.merchant.submitChecklist).toEqual({ branch_created: true, contract_signed: true, rmv_configured: false, all_complete: false })
    expect(body.merchant.canSubmitOnBehalf).toBe(false)
  })

  it('A4: enriches with owner contact, agreement block, header counts, and documents count (curated, no secrets)', async () => {
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(200)
    const m = JSON.parse(res.body).merchant

    // Owner contact: exactly the curated key set (no passwordHash / login fields).
    expect(Object.keys(m.owner).sort()).toEqual(['email', 'emailVerified', 'name', 'phone'])
    expect(m.owner).toEqual({
      name: 'Marta Okafor', email: 'marta@acme.example.com', phone: '0117 496 0000', emailVerified: true,
    })
    expect(m.ownerCount).toBe(1)

    // Agreement/contract block: exactly the curated key set (no ipAddress /
    // tcVersion / zohoSignRequestId).
    expect(Object.keys(m.agreement).sort()).toEqual([
      'contractEndDate', 'contractStartDate', 'contractStatus', 'signatureMethod', 'signedAt',
    ])
    expect(m.agreement.contractStatus).toBe('SIGNED')
    expect(m.agreement.signatureMethod).toBe('CLICK_TO_AGREE')

    // Header stat strip counts + documents count.
    expect(m.headerCounts).toEqual({ branches: 1, activeVouchers: 0, totalRedemptions: 42 })
    expect(m.documentsCount).toBe(3)

    // The owner-contact read uses the EXACT getReviewContext select pattern
    // (active OWNER membership -> merchantAdmin, curated).
    const ownerArgs = (app as any).prisma.merchantMembership.findFirst.mock.calls[0][0]
    expect(ownerArgs.where).toMatchObject({ role: 'OWNER', status: 'ACTIVE' })
    expect(ownerArgs.select.merchantAdmin.select).not.toHaveProperty('passwordHash')
    // totalRedemptions joins via branch.merchantId (no merchantId column on the row).
    const redArgs = (app as any).prisma.voucherRedemption.count.mock.calls[0][0]
    expect(redArgs.where).toEqual({ branch: { merchantId: 'm1' } })
    // The findUnique select carries the agreement + documents-count additions but
    // still never selects a branch redemptionPin / secret.
    const findArgs = (app as any).prisma.merchant.findUnique.mock.calls[0][0]
    expect(findArgs.select.contractStartDate).toBe(true)
    expect(findArgs.select.contract.select).toEqual({ signatureMethod: true, signedAt: true })
    expect(findArgs.select._count.select).toEqual({ documents: true })
  })

  it('A4: owner is null (ownerCount 0) for a merchant with no active owner membership', async () => {
    ;(app as any).prisma.merchantMembership.findFirst.mockResolvedValueOnce(null)
    ;(app as any).prisma.merchantMembership.count.mockResolvedValueOnce(0)
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(200)
    const m = JSON.parse(res.body).merchant
    expect(m.owner).toBeNull()
    expect(m.ownerCount).toBe(0)
  })

  it('A4: agreement signatureMethod/signedAt are null when no contract relation exists', async () => {
    ;(app as any).prisma.merchant.findUnique.mockResolvedValueOnce({
      ...detailRow, contractStatus: 'NOT_SIGNED', contract: null,
      contractStartDate: null, contractEndDate: null,
    })
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(200)
    const m = JSON.parse(res.body).merchant
    expect(m.agreement).toMatchObject({
      contractStatus: 'NOT_SIGNED', signatureMethod: null, signedAt: null,
      contractStartDate: null, contractEndDate: null,
    })
  })

  it('B3: canSubmitOnBehalf + all_complete true for a REGISTERED merchant with every gate met', async () => {
    ;(app as any).prisma.merchant.findUnique.mockResolvedValueOnce({
      ...detailRow, status: 'REGISTERED', onboardingStep: 'REGISTERED', contractStatus: 'SIGNED',
    })
    ;(app as any).prisma.voucher.count.mockResolvedValueOnce(2) // 2 RMVs → rmv_configured
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(200)
    const m = JSON.parse(res.body).merchant
    expect(m.submitChecklist).toEqual({ branch_created: true, contract_signed: true, rmv_configured: true, all_complete: true })
    expect(m.canSubmitOnBehalf).toBe(true)
  })

  it('B3: canSubmitOnBehalf true for the PENDING_APPROVAL + NEEDS_CHANGES resubmit state', async () => {
    ;(app as any).prisma.merchant.findUnique.mockResolvedValueOnce({
      ...detailRow, status: 'PENDING_APPROVAL', onboardingStep: 'NEEDS_CHANGES', contractStatus: 'SIGNED',
    })
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).merchant.canSubmitOnBehalf).toBe(true)
  })

  it('hasPendingIdentityEdit is true when a PENDING identity edit exists', async () => {
    ;(app as any).prisma.merchantPendingEdit.findFirst.mockResolvedValueOnce({ id: 'pe-1' })
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).merchant.hasPendingIdentityEdit).toBe(true)
    const peArgs = (app as any).prisma.merchantPendingEdit.findFirst.mock.calls[0][0]
    expect(peArgs.where).toMatchObject({ status: 'PENDING' })
  })

  it('categoryLocked is true when the merchant has a submitted/live RMV', async () => {
    ;(app as any).prisma.voucher.count.mockResolvedValueOnce(1)
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).merchant.categoryLocked).toBe(true)
    // The count query is exactly the CATEGORY_CHANGE_BLOCKED condition.
    const countArgs = (app as any).prisma.voucher.count.mock.calls[0][0]
    expect(countArgs.where).toMatchObject({ isRmv: true, status: { in: ['PENDING_APPROVAL', 'ACTIVE'] } })
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
