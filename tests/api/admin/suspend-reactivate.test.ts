import 'dotenv/config'
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { suspendMerchant, reactivateMerchant } from '../../../src/api/admin/merchants/service'
import { RedisKey } from '../../../src/api/shared/redis-keys'

// Phase 2 Slice 1 M6a — admin suspend / reactivate (real DB + mock redis).
// Mock redis captures the session-revocation del() calls; the DB parts (status
// flip, audit, cycle-refund) run against the live dev DB.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const ADMIN_ID = 'm6a-admin'
const ctx = { ipAddress: '127.0.0.1', userAgent: 'm6a-test' }
const PREFIX = 'm6a-'
const createdMerchantIds: string[] = []
const createdUserIds: string[] = []
let seq = 0

function mockRedis() {
  return { keys: vi.fn().mockResolvedValue([]), del: vi.fn().mockResolvedValue(1) } as any
}

// Build an ACTIVE merchant with an OWNER admin + membership + branch + branch user.
async function makeActiveMerchant() {
  const n = seq++
  const m = await prisma.merchant.create({
    data: { businessName: `${PREFIX}Co ${n}`, status: 'ACTIVE', onboardingStep: 'LIVE', isTestData: true },
  })
  createdMerchantIds.push(m.id)
  const admin = await prisma.merchantAdmin.create({
    data: { merchantId: m.id, email: `${PREFIX}${Date.now()}-${n}@example.com`, firstName: 'O', lastName: 'W' },
  })
  await prisma.merchantMembership.create({
    data: { merchantId: m.id, merchantAdminId: admin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' },
  })
  const branch = await prisma.branch.create({
    data: { merchantId: m.id, name: `${PREFIX}Main ${n}`, isMainBranch: true, isActive: true, addressLine1: '1 Test St', city: 'Huddersfield', postcode: 'HD1 2PY', country: 'GB' },
  })
  const branchUser = await prisma.branchUser.create({
    data: { branchId: branch.id, email: `${PREFIX}bu-${Date.now()}-${n}@example.com`, passwordHash: 'x', firstName: 'B', lastName: 'U' },
  })
  return { merchantId: m.id, ownerAdminId: admin.id, branchId: branch.id, branchUserId: branchUser.id }
}

// Add a customer + voucher (of `type`) + an in-flight (or validated) redemption +
// a consumed cycle-state, for the cycle-refund cases.
async function addInflightRedemption(merchantId: string, branchId: string, type: string, opts: { validated?: boolean } = {}) {
  const n = seq++
  const user = await prisma.user.create({ data: { email: `${PREFIX}cust-${Date.now()}-${n}@example.com` } })
  createdUserIds.push(user.id)
  const voucher = await prisma.voucher.create({
    data: { merchantId, code: `${PREFIX}V-${Date.now()}-${n}`, type: type as any, title: `V ${n}`, estimatedSaving: 10, status: 'ACTIVE', approvalStatus: 'APPROVED' },
  })
  await prisma.voucherRedemption.create({
    data: {
      userId: user.id, voucherId: voucher.id, branchId,
      redemptionCode: `${PREFIX}RC-${Date.now()}-${n}`,
      estimatedSaving: 10,
      isValidated: opts.validated ?? false,
    },
  })
  await prisma.userVoucherCycleState.create({
    data: { userId: user.id, voucherId: voucher.id, cycleStartDate: new Date(), isRedeemedInCurrentCycle: true, lastRedeemedAt: new Date() },
  })
  return { userId: user.id, voucherId: voucher.id }
}

const cycleConsumed = (userId: string, voucherId: string) =>
  prisma.userVoucherCycleState.findUnique({ where: { userId_voucherId: { userId, voucherId } } }).then((s) => s?.isRedeemedInCurrentCycle)

beforeEach(() => { seq += 100 })

afterAll(async () => {
  // Bulk prefix-sweep (FK-safe order) — far faster than a per-merchant loop.
  const M = { businessName: { startsWith: PREFIX } }
  await prisma.voucherRedemption.deleteMany({ where: { voucher: { merchant: M } } })
  await prisma.userVoucherCycleState.deleteMany({ where: { voucher: { merchant: M } } })
  await prisma.voucher.deleteMany({ where: { merchant: M } })
  await prisma.branchUser.deleteMany({ where: { branch: { merchant: M } } })
  await prisma.branch.deleteMany({ where: { merchant: M } })
  if (createdMerchantIds.length) await prisma.auditLog.deleteMany({ where: { entityId: { in: createdMerchantIds } } })
  await prisma.merchantMembership.deleteMany({ where: { merchant: M } })
  await prisma.merchantAdmin.deleteMany({ where: { merchant: M } })
  await prisma.merchant.deleteMany({ where: M })
  if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
  await prisma.$disconnect()
}, 30_000)

describe('M6a — admin suspend / reactivate (real DB)', () => {
  it('suspend → SUSPENDED/SUSPENDED + transactional MERCHANT_SUSPENDED audit (actor, reason, before/after)', async () => {
    const { merchantId } = await makeActiveMerchant()
    const res = await suspendMerchant(prisma, mockRedis(), ADMIN_ID, merchantId, 'Fraudulent vouchers', ctx)
    expect(res).toMatchObject({ suspended: true, alreadySuspended: false })

    const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(m?.status).toBe('SUSPENDED')
    expect(m?.onboardingStep).toBe('SUSPENDED')

    const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'MERCHANT_SUSPENDED' } })
    expect(audit?.actorId).toBe(ADMIN_ID)
    expect(audit?.actorType).toBe('ADMIN')
    expect(audit?.reason).toBe('Fraudulent vouchers')
    expect(audit?.before).toMatchObject({ status: 'ACTIVE' })
    expect(audit?.after).toMatchObject({ status: 'SUSPENDED' })
  })

  it('suspend revokes the owner authMerchant + branch authBranch sessions', async () => {
    const { merchantId, ownerAdminId, branchUserId } = await makeActiveMerchant()
    const redis = mockRedis()
    await suspendMerchant(prisma, redis, ADMIN_ID, merchantId, 'reason', ctx)
    const delCalls = redis.del.mock.calls.map((c: any[]) => c[0])
    expect(delCalls).toContain(RedisKey.authMerchant(ownerAdminId))
    expect(delCalls).toContain(RedisKey.authBranch(branchUserId))
  })

  it('cycle-refund: an in-flight NORMAL redemption un-consumes the cycle-state', async () => {
    const { merchantId, branchId } = await makeActiveMerchant()
    const { userId, voucherId } = await addInflightRedemption(merchantId, branchId, 'BOGO')
    expect(await cycleConsumed(userId, voucherId)).toBe(true)
    await suspendMerchant(prisma, mockRedis(), ADMIN_ID, merchantId, 'reason', ctx)
    expect(await cycleConsumed(userId, voucherId)).toBe(false) // un-penalised
  })

  it('cycle-refund: a VALIDATED redemption is NOT un-consumed (it stays historical)', async () => {
    const { merchantId, branchId } = await makeActiveMerchant()
    const { userId, voucherId } = await addInflightRedemption(merchantId, branchId, 'BOGO', { validated: true })
    await suspendMerchant(prisma, mockRedis(), ADMIN_ID, merchantId, 'reason', ctx)
    expect(await cycleConsumed(userId, voucherId)).toBe(true) // untouched
  })

  it('cycle-refund: TIME_LIMITED + REUSABLE vouchers are OUT OF SCOPE (cycle-state untouched)', async () => {
    const { merchantId, branchId } = await makeActiveMerchant()
    const tl = await addInflightRedemption(merchantId, branchId, 'TIME_LIMITED')
    const ru = await addInflightRedemption(merchantId, branchId, 'REUSABLE')
    await suspendMerchant(prisma, mockRedis(), ADMIN_ID, merchantId, 'reason', ctx)
    expect(await cycleConsumed(tl.userId, tl.voucherId)).toBe(true) // not touched
    expect(await cycleConsumed(ru.userId, ru.voucherId)).toBe(true) // not touched
  })

  it('idempotent: re-suspending an already-SUSPENDED merchant is a no-op', async () => {
    const { merchantId } = await makeActiveMerchant()
    await suspendMerchant(prisma, mockRedis(), ADMIN_ID, merchantId, 'reason', ctx)
    const res = await suspendMerchant(prisma, mockRedis(), ADMIN_ID, merchantId, 'reason', ctx)
    expect(res).toMatchObject({ suspended: true, alreadySuspended: true })
    const audits = await prisma.auditLog.count({ where: { entityId: merchantId, event: 'MERCHANT_SUSPENDED' } })
    expect(audits).toBe(1) // only the first wrote an audit row
  })

  it('reactivate: SUSPENDED → ACTIVE/LIVE + MERCHANT_REACTIVATED audit', async () => {
    const { merchantId } = await makeActiveMerchant()
    await suspendMerchant(prisma, mockRedis(), ADMIN_ID, merchantId, 'reason', ctx)
    const res = await reactivateMerchant(prisma, ADMIN_ID, merchantId, ctx)
    expect(res).toMatchObject({ reactivated: true, alreadyActive: false })
    const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(m?.status).toBe('ACTIVE')
    expect(m?.onboardingStep).toBe('LIVE')
    const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'MERCHANT_REACTIVATED' } })
    expect(audit?.actorId).toBe(ADMIN_ID)
  })

  it('reactivate: an already-ACTIVE merchant is an idempotent no-op', async () => {
    const { merchantId } = await makeActiveMerchant()
    const res = await reactivateMerchant(prisma, ADMIN_ID, merchantId, ctx)
    expect(res).toMatchObject({ reactivated: true, alreadyActive: true })
    expect((await prisma.merchant.findUnique({ where: { id: merchantId } }))?.status).toBe('ACTIVE')
  })

  it('reactivate: an existing-but-not-SUSPENDED merchant (INACTIVE) → MERCHANT_NOT_SUSPENDED, not MERCHANT_NOT_FOUND (finding 1)', async () => {
    const m = await prisma.merchant.create({ data: { businessName: `${PREFIX}Inactive ${seq++}`, status: 'INACTIVE', onboardingStep: 'REGISTERED', isTestData: true } })
    createdMerchantIds.push(m.id)
    await expect(reactivateMerchant(prisma, ADMIN_ID, m.id, ctx)).rejects.toThrow('MERCHANT_NOT_SUSPENDED')
    // never force-activated a non-approved merchant.
    expect((await prisma.merchant.findUnique({ where: { id: m.id } }))?.status).toBe('INACTIVE')
  })

  it('suspend / reactivate on an unknown merchant → MERCHANT_NOT_FOUND', async () => {
    await expect(suspendMerchant(prisma, mockRedis(), ADMIN_ID, 'no-such-merchant', 'r', ctx)).rejects.toThrow('MERCHANT_NOT_FOUND')
    await expect(reactivateMerchant(prisma, ADMIN_ID, 'no-such-merchant', ctx)).rejects.toThrow('MERCHANT_NOT_FOUND')
  })
})
