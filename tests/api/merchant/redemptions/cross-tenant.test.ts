import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// B5: multi-tenant (IDOR) denial guard, one assertion per endpoint. Merchant B
// (the session merchant) can NEVER see, look up, or export merchant A's
// redemptions: every query carries `branch.merchantId === sessionMerchantId`,
// and a lookup of A's code under B's session is masked as REDEMPTION_NOT_FOUND.
// The scoping is built into buildRedemptionWhere + the lookup ownership check
// (B1/B2); these are guard tests that prove the boundary holds.

describe('merchant redemptions cross-tenant denial (B5 IDOR)', () => {
  let app: FastifyInstance
  let merchantBToken: string

  // The authenticated session resolves to merchant B (mB).
  beforeEach(async () => {
    app = await buildApp()
    const prismaMock: any = {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'maB', merchantId: 'mB' }) },
      merchantMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: 'mmB', merchantId: 'mB', merchantAdminId: 'maB', merchant: { status: 'ACTIVE', businessName: 'Merchant B' } }),
        // Staff & Access PR-B: redemption routes resolve via resolveMerchantContext.
        // OWNER + allBranches -> allowedBranchIds null -> the client branchId is NOT
        // intersected away (the IDOR boundary is still branch.merchantId = mB).
        findMany: vi.fn().mockResolvedValue([{ id: 'mmB', merchantId: 'mB', merchantAdminId: 'maB', role: 'OWNER', allBranches: true, canManageVouchers: false, merchant: { status: 'ACTIVE', businessName: 'Merchant B' }, branches: [] }]),
      },
      voucherRedemption: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    }
    app.decorate('prisma', prismaMock as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    merchantBToken = (app.jwt as any).merchant.sign(
      { sub: 'maB', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  function get(url: string) {
    return app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${merchantBToken}` } })
  }

  it('LIST: the where always carries branch.merchantId = the session merchant (mB), never a client value', async () => {
    // Even if the caller tries to target merchant A's branch, the relation
    // filter pins merchantId to mB so the cross-tenant branch yields nothing.
    await get('/api/v1/merchant/redemptions?branchId=branch-of-mA')
    const where = (app.prisma.voucherRedemption.findMany as any).mock.calls[0][0].where
    expect(where.branch).toEqual({ merchantId: 'mB' })
    expect(where.branchId).toBe('branch-of-mA')
    const countWhere = (app.prisma.voucherRedemption.count as any).mock.calls[0][0].where
    expect(countWhere.branch).toEqual({ merchantId: 'mB' })
  })

  it("LOOKUP: merchant A's code under merchant B's session is masked as REDEMPTION_NOT_FOUND", async () => {
    // The code exists but belongs to merchant A; the ownership check fails ->
    // masked not-found (existence never leaked).
    app.prisma.voucherRedemption.findUnique = vi.fn().mockResolvedValue({
      id: 'rA', redemptionCode: 'A7K2P9X4', redeemedAt: new Date(), isValidated: false,
      validatedAt: null, validationMethod: null, estimatedSaving: 5,
      voucher: { id: 'vA', title: 'A voucher', type: 'BOGO', merchantId: 'mA' },
      branch: { id: 'bA', name: 'A branch' }, user: { firstName: 'Al', lastName: 'Adams' }, validatedBy: null,
    })
    const res = await get('/api/v1/merchant/redemptions/lookup?code=A7K2P9X4')
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('REDEMPTION_NOT_FOUND')
    // No write attempted on a cross-tenant lookup.
    expect(app.prisma.voucherRedemption.update).not.toHaveBeenCalled()
  })

  it('EXPORT: the where always carries branch.merchantId = the session merchant (mB)', async () => {
    await get('/api/v1/merchant/redemptions/export.csv?branchId=branch-of-mA')
    const where = (app.prisma.voucherRedemption.findMany as any).mock.calls[0][0].where
    expect(where.branch).toEqual({ merchantId: 'mB' })
    expect(where.branchId).toBe('branch-of-mA')
  })
})
