import 'dotenv/config'
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getOwnerMembership, assertNotLastOwner } from '../../../src/api/shared/merchantMembership'
import { resolveAdminMerchant } from '../../../src/api/merchant/shared'

// Phase 2 Slice 1 M1 — additive MerchantMembership foundation.
// Unit tests (mocked) pin the helper + reroute logic; the real-DB block proves
// the additive schema works against Neon AND that the auth-flow read shape
// (MerchantAdmin.merchantId + the merchant relation) is KEPT — the M1 auth
// non-regression pin (the auth flow is intentionally NOT rerouted until M6).

describe('M1 — MerchantMembership helpers (mocked)', () => {
  describe('getOwnerMembership', () => {
    it('queries the ACTIVE OWNER membership for an admin', async () => {
      const prisma = {
        merchantMembership: {
          findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }),
        },
      } as any
      const r = await getOwnerMembership(prisma, 'ma1')
      expect(r).toEqual({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' })
      expect(prisma.merchantMembership.findFirst).toHaveBeenCalledWith({
        where: { merchantAdminId: 'ma1', role: 'OWNER', status: 'ACTIVE' },
        // M6a (SEC-M2): the joined merchant.status lets resolveAdminMerchant /
        // token-refresh block a SUSPENDED merchant without a second query.
        // M6b (D-1): + businessName so the auth login/OTP response builds from the
        // membership instead of the dropped MerchantAdmin.merchant relation.
        select: { id: true, merchantId: true, merchantAdminId: true, merchant: { select: { status: true, businessName: true } } },
      })
    })

    it('returns null when no active OWNER membership exists', async () => {
      const prisma = { merchantMembership: { findFirst: vi.fn().mockResolvedValue(null) } } as any
      expect(await getOwnerMembership(prisma, 'ma1')).toBeNull()
    })
  })

  describe('resolveAdminMerchant — rerouted via MerchantMembership (M1)', () => {
    it('resolves merchantId from the OWNER membership and does NOT read MerchantAdmin', async () => {
      const prisma = {
        merchantMembership: {
          findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }),
        },
        merchantAdmin: { findUnique: vi.fn() },
      } as any
      const r = await resolveAdminMerchant(prisma, 'ma1')
      expect(r).toEqual({ adminId: 'ma1', merchantId: 'm1' })
      // The management-side reroute must NOT depend on MerchantAdmin.merchantId.
      expect(prisma.merchantAdmin.findUnique).not.toHaveBeenCalled()
    })

    it('throws INVALID_CREDENTIALS when the admin has no OWNER membership', async () => {
      const prisma = { merchantMembership: { findFirst: vi.fn().mockResolvedValue(null) } } as any
      await expect(resolveAdminMerchant(prisma, 'ghost')).rejects.toThrow('INVALID_CREDENTIALS')
    })
  })

  describe('assertNotLastOwner', () => {
    it('throws LAST_OWNER_PROTECTED when no other ACTIVE OWNER remains', async () => {
      const prisma = { merchantMembership: { count: vi.fn().mockResolvedValue(0) } } as any
      await expect(assertNotLastOwner(prisma, 'm1', 'mm1')).rejects.toThrow('LAST_OWNER_PROTECTED')
      expect(prisma.merchantMembership.count).toHaveBeenCalledWith({
        where: { merchantId: 'm1', role: 'OWNER', status: 'ACTIVE', id: { not: 'mm1' } },
      })
    })

    it('passes when another ACTIVE OWNER exists', async () => {
      const prisma = { merchantMembership: { count: vi.fn().mockResolvedValue(2) } } as any
      await expect(assertNotLastOwner(prisma, 'm1', 'mm1')).resolves.toBeUndefined()
    })
  })
})

describe('M1 — MerchantMembership end-to-end (real DB)', () => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })
  let merchantId: string
  let adminId: string

  beforeAll(async () => {
    const m = await prisma.merchant.create({
      data: { businessName: 'TEST §M1-membership', status: 'ACTIVE', isTestData: true },
    })
    merchantId = m.id
    const a = await prisma.merchantAdmin.create({
      data: {
        merchantId,
        email: `m1-membership-${Date.now()}@example.com`,
        passwordHash: 'p',
        firstName: 'T',
        lastName: 'M1',
      },
    })
    adminId = a.id
    await prisma.merchantMembership.create({
      data: { merchantId, merchantAdminId: adminId, role: 'OWNER', allBranches: true, status: 'ACTIVE' },
    })
  })

  afterAll(async () => {
    await prisma.merchantMembership.deleteMany({ where: { merchantId } })
    await prisma.merchantAdmin.deleteMany({ where: { merchantId } })
    await prisma.merchant.delete({ where: { id: merchantId } })
    await prisma.$disconnect()
  })

  it('resolveAdminMerchant resolves the OWNER membership to the right merchantId', async () => {
    const r = await resolveAdminMerchant(prisma, adminId)
    expect(r).toEqual({ adminId, merchantId })
  })

  it('assertNotLastOwner protects the sole OWNER against removal', async () => {
    const membership = await getOwnerMembership(prisma, adminId)
    await expect(assertNotLastOwner(prisma, merchantId, membership!.id)).rejects.toThrow('LAST_OWNER_PROTECTED')
  })

  it('AUTH NON-REGRESSION: MerchantAdmin.merchantId + the merchant relation are KEPT (M1 additive)', async () => {
    // The merchant auth flow (login/OTP/refresh/reactivate) reads these directly
    // and is NOT rerouted in M1. Proving they still exist proves M1 did not drop
    // the column or the relation.
    const admin = await prisma.merchantAdmin.findUnique({ where: { id: adminId }, include: { merchant: true } })
    expect(admin?.merchantId).toBe(merchantId) // column kept
    expect(admin?.merchant?.id).toBe(merchantId) // relation kept
    expect(admin?.merchant?.status).toBe('ACTIVE')
  })
})
