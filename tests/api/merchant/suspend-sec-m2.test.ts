import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { resolveAdminMerchant } from '../../../src/api/merchant/shared'
import { refreshMerchantToken } from '../../../src/api/auth/merchant/service'
import { generateRefreshToken, hashRefreshToken } from '../../../src/api/shared/tokens'

// Phase 2 Slice 1 M6a — SEC-M2: a suspended merchant is blocked from management
// (resolveAdminMerchant) and cannot renew its session (refreshMerchantToken).
// Both read live merchant.status via the membership source of truth (NOT the
// MerchantAdmin.merchantId column — that reroute is M6b).

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
const PREFIX = 'm6a-secm2-'
const merchantIds: string[] = []
let seq = 0

async function makeOwner(status: 'ACTIVE' | 'SUSPENDED') {
  const n = seq++
  const m = await prisma.merchant.create({ data: { businessName: `${PREFIX}Co ${n}`, status, onboardingStep: status === 'ACTIVE' ? 'LIVE' : 'SUSPENDED', isTestData: true } })
  merchantIds.push(m.id)
  const admin = await prisma.merchantAdmin.create({ data: { merchantId: m.id, email: `${PREFIX}${Date.now()}-${n}@example.com`, firstName: 'O', lastName: 'W' } })
  await prisma.merchantMembership.create({ data: { merchantId: m.id, merchantAdminId: admin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' } })
  return { merchantId: m.id, adminId: admin.id }
}

afterAll(async () => {
  for (const merchantId of merchantIds) {
    await prisma.merchantMembership.deleteMany({ where: { merchantId } })
    await prisma.merchantAdmin.deleteMany({ where: { merchantId } })
    await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => {})
  }
  await prisma.$disconnect()
})

describe('M6a — SEC-M2 suspended-merchant gates', () => {
  it('resolveAdminMerchant throws MERCHANT_SUSPENDED for a suspended merchant (management blocked)', async () => {
    const { adminId } = await makeOwner('SUSPENDED')
    await expect(resolveAdminMerchant(prisma, adminId)).rejects.toThrow('MERCHANT_SUSPENDED')
  })

  it('resolveAdminMerchant still resolves an ACTIVE merchant (no false positive)', async () => {
    const { merchantId, adminId } = await makeOwner('ACTIVE')
    const r = await resolveAdminMerchant(prisma, adminId)
    expect(r.merchantId).toBe(merchantId)
  })

  it('refreshMerchantToken refuses a suspended merchant (MERCHANT_SUSPENDED) even with a valid refresh token', async () => {
    const { adminId } = await makeOwner('SUSPENDED')
    const token = generateRefreshToken()
    const stored = JSON.stringify({ tokenHash: hashRefreshToken(token), deviceId: 'd1', deviceType: 'web' })
    const redis = { get: async () => stored } as any
    await expect(
      refreshMerchantToken(prisma, redis, {} as any, { refreshToken: token, sessionId: 's1', entityId: adminId, ipAddress: '127.0.0.1', userAgent: 'm6a' })
    ).rejects.toThrow('MERCHANT_SUSPENDED')
  })
})
