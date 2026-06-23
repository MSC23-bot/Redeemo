import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { verifyRedemption } from '../../../src/api/redemption/service'

// Phase 2 Slice 1 M6a — SEC-M1: the verify path must decide active/suspended
// from the LIVE DB, never the cached login-snapshot session. A redemption is
// created while the merchant is ACTIVE; the merchant is then suspended (or the
// branch deactivated) in the DB; verify must fail from live state even though
// the actor's cached session still says "active".

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
const ctx = { ipAddress: '127.0.0.1', userAgent: 'm6a-secm1' }
const PREFIX = 'm6a-secm1-'
const merchantIds: string[] = []
const userIds: string[] = []
let seq = 0

async function makeRedemption() {
  const n = seq++
  const m = await prisma.merchant.create({ data: { businessName: `${PREFIX}Co ${n}`, status: 'ACTIVE', onboardingStep: 'LIVE', isTestData: true } })
  merchantIds.push(m.id)
  const branch = await prisma.branch.create({ data: { merchantId: m.id, name: `${PREFIX}Br ${n}`, isMainBranch: true, isActive: true, addressLine1: '1 St', city: 'Huddersfield', postcode: 'HD1 2PY', country: 'GB' } })
  // validatedById is an FK → BranchUser, so a successful verify needs a real one.
  const branchUser = await prisma.branchUser.create({ data: { branchId: branch.id, email: `${PREFIX}bu-${Date.now()}-${n}@example.com`, passwordHash: 'x', firstName: 'B', lastName: 'U' } })
  const user = await prisma.user.create({ data: { email: `${PREFIX}${Date.now()}-${n}@example.com` } })
  userIds.push(user.id)
  const voucher = await prisma.voucher.create({ data: { merchantId: m.id, code: `${PREFIX}V-${Date.now()}-${n}`, type: 'BOGO', title: 'V', estimatedSaving: 10, status: 'ACTIVE', approvalStatus: 'APPROVED' } })
  const code = `${PREFIX}RC${Date.now()}${n}`
  await prisma.voucherRedemption.create({ data: { userId: user.id, voucherId: voucher.id, branchId: branch.id, redemptionCode: code, estimatedSaving: 10, isValidated: false } })
  return { merchantId: m.id, branchId: branch.id, branchUserId: branchUser.id, code }
}

afterAll(async () => {
  for (const merchantId of merchantIds) {
    await prisma.voucherRedemption.deleteMany({ where: { voucher: { merchantId } } })
    await prisma.voucher.deleteMany({ where: { merchantId } })
    await prisma.branchUser.deleteMany({ where: { branch: { merchantId } } })
    await prisma.branch.deleteMany({ where: { merchantId } })
    await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => {})
  }
  for (const userId of userIds) await prisma.user.delete({ where: { id: userId } }).catch(() => {})
  await prisma.$disconnect()
})

describe('M6a — SEC-M1 verifyRedemption live status', () => {
  it('SUSPENDED merchant → verify fails MERCHANT_SUSPENDED from live DB (even though redemption was created while active)', async () => {
    const { merchantId, code } = await makeRedemption()
    await prisma.merchant.update({ where: { id: merchantId }, data: { status: 'SUSPENDED' } }) // suspend AFTER redeem
    await expect(
      verifyRedemption(prisma, code, 'QR_SCAN', { role: 'merchant', actorId: 'staff-1', merchantId } as any, ctx,
        { adminId: 'staff-1', merchantId, role: 'OWNER', allBranches: true, allowedBranchIds: [], canManageVouchers: true })
    ).rejects.toThrow('MERCHANT_SUSPENDED')
  })

  it('inactive branch → verify fails BRANCH_UNAVAILABLE from live DB', async () => {
    const { branchId, code } = await makeRedemption()
    await prisma.branch.update({ where: { id: branchId }, data: { isActive: false } })
    await expect(
      verifyRedemption(prisma, code, 'QR_SCAN', { role: 'branch', actorId: 'bu-1', branchId } as any, ctx)
    ).rejects.toThrow('BRANCH_UNAVAILABLE')
  })

  it('ACTIVE merchant + active branch → verify succeeds (no false positive)', async () => {
    const { branchId, branchUserId, code } = await makeRedemption()
    const res = await verifyRedemption(prisma, code, 'QR_SCAN', { role: 'branch', actorId: branchUserId, branchId } as any, ctx)
    expect(res.isValidated).toBe(true)
  })
})
