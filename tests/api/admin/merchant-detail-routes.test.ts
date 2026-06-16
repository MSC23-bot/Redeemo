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

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchant: { findUnique: vi.fn().mockResolvedValue(detailRow) },
      // B2.3-read: getMerchantDetail counts submitted/live RMVs for categoryLocked.
      voucher: { count: vi.fn().mockResolvedValue(0) },
      // B2.5: getMerchantDetail checks for a PENDING identity edit.
      merchantPendingEdit: { findFirst: vi.fn().mockResolvedValue(null) },
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
