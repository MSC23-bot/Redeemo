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
    merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }) },
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
    const prisma = mockPrisma({ merchantMembership: { findFirst: vi.fn().mockResolvedValue(null) } })
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
})
