import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'
import { getOnboardingStatus } from '../../../src/api/merchant/onboarding/service'

/**
 * M2 B4 (D8c): merchant-facing read of the merchant's OWN onboarding approval
 * status + changes-requested reason (AdminApproval.comment). Scoped via
 * resolveAdminMerchant so a merchant can NEVER read another merchant's approval.
 * No-approval-yet returns a sensible empty shape, never a 500.
 */
function mockPrisma(overrides: Partial<Record<string, any>> = {}) {
  return {
    merchantMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }),
      // WF8: resolveAdminMerchant falls back to getActiveMembership (findMany) when
      // getOwnerMembership returns null, to distinguish a real non-owner (403) from no
      // membership at all (401). Default empty so the existing "no owner membership"
      // pin below stays a genuine INVALID_CREDENTIALS.
      findMany: vi.fn().mockResolvedValue([]),
    },
    merchant: { findUnique: vi.fn() },
    adminApproval: { findFirst: vi.fn() },
    ...overrides,
  } as any
}

describe('getOnboardingStatus (service, M2 B4 / D8c)', () => {
  it("returns the merchant's OWN onboarding approval status + comment", async () => {
    const prisma = mockPrisma()
    const actionedAt = new Date('2026-06-20T10:00:00.000Z')
    prisma.adminApproval.findFirst = vi.fn().mockResolvedValue({
      status: 'CHANGES_REQUESTED',
      comment: 'Please add a clearer logo and confirm your VAT number.',
      actionedAt,
    })

    const result = await getOnboardingStatus(prisma, 'ma1')

    expect(result.status).toBe('CHANGES_REQUESTED')
    expect(result.comment).toBe('Please add a clearer logo and confirm your VAT number.')
    // The approval is scoped to THIS merchant's own onboarding row.
    expect(prisma.adminApproval.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'MERCHANT_ONBOARDING', referenceId: 'm1' }),
      })
    )
  })

  it('returns an empty/null-ish shape (not a 500) when no approval row exists yet', async () => {
    const prisma = mockPrisma()
    prisma.adminApproval.findFirst = vi.fn().mockResolvedValue(null)

    const result = await getOnboardingStatus(prisma, 'ma1')

    expect(result.status).toBeNull()
    expect(result.comment).toBeNull()
  })

  it('cannot read another merchant: it resolves the CALLER own merchant only', async () => {
    // resolveAdminMerchant resolves merchant m1 from the caller's membership; the
    // approval lookup is keyed to referenceId = m1 (never an attacker-supplied id).
    const prisma = mockPrisma()
    prisma.adminApproval.findFirst = vi.fn().mockResolvedValue({
      status: 'PENDING', comment: 'Merchant submitted for onboarding approval', actionedAt: null,
    })

    await getOnboardingStatus(prisma, 'ma1')

    const where = (prisma.adminApproval.findFirst as any).mock.calls[0][0].where
    expect(where.referenceId).toBe('m1')
  })

  it('throws INVALID_CREDENTIALS when the caller has no owner membership', async () => {
    const prisma = mockPrisma({
      // Note: this override REPLACES the whole merchantMembership object (shallow
      // merge in mockPrisma), so findMany must be repeated here too — [] means no
      // active membership at all, keeping this a genuine INVALID_CREDENTIALS (WF8).
      merchantMembership: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    })
    await expect(getOnboardingStatus(prisma, 'ma-unknown')).rejects.toThrow('INVALID_CREDENTIALS')
  })
})

describe('GET /api/v1/merchant/onboarding/status (route, M2 B4 / D8c)', () => {
  let app: FastifyInstance
  let merchantToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }) },
      merchant: { findUnique: vi.fn() },
      adminApproval: { findFirst: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    merchantToken = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  it('returns 200 with status + comment for the merchant own onboarding approval', async () => {
    app.prisma.adminApproval.findFirst = vi.fn().mockResolvedValue({
      status: 'CHANGES_REQUESTED',
      comment: 'Please confirm your VAT number.',
      actionedAt: new Date('2026-06-20T10:00:00.000Z'),
    })

    const res = await app.inject({
      method: 'GET', url: '/api/v1/merchant/onboarding/status',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('CHANGES_REQUESTED')
    expect(body.comment).toBe('Please confirm your VAT number.')
  })

  it('returns 200 with a null-ish shape when no approval exists yet', async () => {
    app.prisma.adminApproval.findFirst = vi.fn().mockResolvedValue(null)

    const res = await app.inject({
      method: 'GET', url: '/api/v1/merchant/onboarding/status',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBeNull()
    expect(body.comment).toBeNull()
  })

  // WF8 route-level coverage: a valid non-owner merchant token must get 403
  // INSUFFICIENT_PERMISSIONS from this owner-only read, never 401 (a 401 here makes
  // merchant-web's client treat the session as dead and tear the whole portal down
  // to /sign-in - see apps/merchant-web/lib/api/client.ts).
  it('returns 403 INSUFFICIENT_PERMISSIONS for a BRANCH_MANAGER token (not 401)', async () => {
    app.prisma.merchantMembership.findFirst = vi.fn().mockResolvedValue(null)
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue([
      { id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'BRANCH_MANAGER', allBranches: true, canManageVouchers: false, branches: [] },
    ])

    const res = await app.inject({
      method: 'GET', url: '/api/v1/merchant/onboarding/status',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
  })

  it('returns 403 INSUFFICIENT_PERMISSIONS for a STAFF token (not 401)', async () => {
    app.prisma.merchantMembership.findFirst = vi.fn().mockResolvedValue(null)
    app.prisma.merchantMembership.findMany = vi.fn().mockResolvedValue([
      { id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'STAFF', allBranches: false, canManageVouchers: false, branches: [] },
    ])

    const res = await app.inject({
      method: 'GET', url: '/api/v1/merchant/onboarding/status',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
  })
})
