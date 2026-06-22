import 'dotenv/config'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Day-2 Vouchers A7 - Model 1 delayed activation. When onboarding-approve takes
// a merchant live, any approved-waiting CUSTOM voucher
// (isRmv:false, approvalStatus:APPROVED, status:PENDING_APPROVAL) is flipped to
// ACTIVE in the SAME transaction (after the flagship RMVs) and a now-live
// VOUCHER_APPROVAL_UPDATE fires per activated voucher. Strict no-op with none.
//
// notify is mocked so the now-live + you're-live notifications don't enqueue
// real email jobs (mirrors the M5 go-live tests).
const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }))
vi.mock('../../../src/api/shared/notify', () => ({ notify: notifyMock }))

import { approveApproval } from '../../../src/api/admin/approvals/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const ctx = { ipAddress: '127.0.0.1', userAgent: 'a7-activation-test' }
const dummyRedis = {} as any
const PREFIX = 'a7-activation-'
const createdMerchantIds: string[] = []
let ADMIN_ID = ''
let CATEGORY_ID: string | null = null
let seq = 0

// Build a fully go-live-ready merchant (signed contract, 2 RMVs, confirmed main
// branch) plus optional CUSTOM vouchers in arbitrary states.
async function makePreparedMerchant(customs: { approvalStatus: string; status: string }[] = []) {
  const n = seq++
  const m = await prisma.merchant.create({
    data: {
      businessName: `${PREFIX}Co ${n}`,
      status: 'PENDING_APPROVAL',
      onboardingStep: 'SUBMITTED',
      verificationStatus: 'PENDING',
      contractStatus: 'SIGNED',
      isTestData: false,
      ...(CATEGORY_ID ? { primaryCategoryId: CATEGORY_ID } : {}),
    },
  })
  createdMerchantIds.push(m.id)

  await prisma.branch.create({
    data: {
      merchantId: m.id,
      name: `${PREFIX}Main ${n}`,
      isMainBranch: true,
      isActive: true,
      addressLine1: '1 Test St',
      city: 'Huddersfield',
      postcode: 'HD1 2PY',
      country: 'GB',
      phone: '+441484000000',
      redemptionPin: 'enc-test-pin',
      latitude: 53.6463,
      longitude: -1.7809,
      locationConfidence: 'MANUALLY_CONFIRMED',
    },
  })

  for (let i = 0; i < 2; i++) {
    await prisma.voucher.create({
      data: {
        merchantId: m.id, code: `RMV-${Date.now()}-${n}-${i}`, isRmv: true, isMandatory: true,
        type: 'BOGO', title: `RMV ${i}`, estimatedSaving: 10, status: 'PENDING_APPROVAL', approvalStatus: 'PENDING',
      },
    })
  }

  const customIds: string[] = []
  for (let i = 0; i < customs.length; i++) {
    const c = customs[i]
    const v = await prisma.voucher.create({
      data: {
        merchantId: m.id, code: `RCV-${Date.now()}-${n}-${i}`, isRmv: false, isMandatory: false,
        type: 'DISCOUNT_FIXED', title: `Custom ${i}`, estimatedSaving: 8,
        status: c.status as any, approvalStatus: c.approvalStatus as any, merchantFields: {} as any,
      },
    })
    customIds.push(v.id)
  }

  const admin = await prisma.merchantAdmin.create({
    data: { email: `${PREFIX}${Date.now()}-${n}@example.com`, firstName: 'O', lastName: 'W' },
  })
  await prisma.merchantMembership.create({
    data: { merchantId: m.id, merchantAdminId: admin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' },
  })
  const approval = await prisma.adminApproval.create({
    data: { type: 'MERCHANT_ONBOARDING', status: 'PENDING', referenceId: m.id, referenceType: 'merchant' },
  })
  return { merchantId: m.id, ownerAdminId: admin.id, approvalId: approval.id, customIds }
}

beforeAll(async () => {
  const a = await prisma.adminUser.create({
    data: { email: `a7-actor-${Date.now()}@example.com`, passwordHash: 'x', firstName: 'A7', lastName: 'Actor', role: 'OPERATIONS' },
  })
  ADMIN_ID = a.id
  const cat = await prisma.category.findFirst({ select: { id: true } })
  CATEGORY_ID = cat?.id ?? null
})

beforeEach(() => {
  notifyMock.mockReset()
  notifyMock.mockResolvedValue({ queued: true, communicationLogId: 'c1', enqueued: true })
})

afterAll(async () => {
  const swept = (await prisma.merchant.findMany({
    where: { businessName: { startsWith: PREFIX } }, select: { id: true },
  })).map((m) => m.id)
  const merchantIds = [...new Set([...swept, ...createdMerchantIds])]
  if (merchantIds.length) {
    const inIds = { in: merchantIds }
    const adminIds = (await prisma.merchantMembership.findMany({
      where: { merchantId: inIds }, select: { merchantAdminId: true },
    })).map((r) => r.merchantAdminId)
    await prisma.voucher.deleteMany({ where: { merchantId: inIds } })
    await prisma.branch.deleteMany({ where: { merchantId: inIds } })
    await prisma.adminApproval.deleteMany({ where: { referenceId: inIds } })
    await prisma.auditLog.deleteMany({ where: { entityId: inIds } })
    await prisma.merchantMembership.deleteMany({ where: { merchantId: inIds } })
    await prisma.merchantAdmin.deleteMany({ where: { id: { in: adminIds } } })
    await prisma.merchant.deleteMany({ where: { id: inIds } })
  }
  if (ADMIN_ID) await prisma.adminUser.delete({ where: { id: ADMIN_ID } }).catch(() => {})
  await prisma.$disconnect()
}, 30_000)

describe('A7 - onboarding-approve activates approved-waiting customs (real DB)', () => {
  it('flips an approved-waiting custom to ACTIVE in the same transaction + fires a now-live notify', async () => {
    const { merchantId, ownerAdminId, approvalId, customIds } = await makePreparedMerchant([
      { approvalStatus: 'APPROVED', status: 'PENDING_APPROVAL' }, // approved-waiting
    ])
    const res = await approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    expect(res).toMatchObject({ approved: true, alreadyLive: false })

    const custom = await prisma.voucher.findUnique({ where: { id: customIds[0] } })
    expect(custom?.status).toBe('ACTIVE')
    expect(custom?.approvalStatus).toBe('APPROVED') // unchanged - already approved

    // result carries the activated customs.
    expect((res as any).activatedCustoms).toEqual([{ id: customIds[0], title: 'Custom 0' }])

    // Notifies: one merchant_live (the owner go-live) + one voucher_now_live per custom.
    const types = notifyMock.mock.calls.map((c) => c[2].type)
    expect(types).toContain('merchant_live')
    expect(types).toContain('voucher_now_live')
    const nowLive = notifyMock.mock.calls.find((c) => c[2].type === 'voucher_now_live')![2]
    expect(nowLive.recipientType).toBe('MERCHANT_ADMIN')
    expect(nowLive.recipientId).toBe(ownerAdminId)
    expect(nowLive.inApp.notificationType).toBe('VOUCHER_APPROVAL_UPDATE')
    expect(nowLive.inApp.referenceType).toBe('voucher')
    expect(nowLive.inApp.referenceId).toBe(customIds[0])
  })

  it('strict no-op when the merchant has NO approved-waiting customs (no extra updates, no extra notify)', async () => {
    const { merchantId, approvalId } = await makePreparedMerchant()
    const res = await approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    expect((res as any).activatedCustoms ?? []).toEqual([])

    // Only the merchant_live notify fired - no voucher_now_live.
    const types = notifyMock.mock.calls.map((c) => c[2].type)
    expect(types).toEqual(['merchant_live'])

    // Sanity: no custom vouchers exist to activate.
    expect(await prisma.voucher.count({ where: { merchantId, isRmv: false } })).toBe(0)
  })

  it('does NOT activate a SUBMITTED-not-approved custom (approvalStatus PENDING stays PENDING_APPROVAL)', async () => {
    const { approvalId, customIds } = await makePreparedMerchant([
      { approvalStatus: 'PENDING', status: 'PENDING_APPROVAL' }, // submitted, not yet approved
    ])
    const res = await approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    expect((res as any).activatedCustoms ?? []).toEqual([])

    const custom = await prisma.voucher.findUnique({ where: { id: customIds[0] } })
    expect(custom?.status).toBe('PENDING_APPROVAL') // NOT activated
    expect(custom?.approvalStatus).toBe('PENDING')

    const types = notifyMock.mock.calls.map((c) => c[2].type)
    expect(types).not.toContain('voucher_now_live')
  })

  it('activates ALL approved-waiting customs (ONE batched now-live notify) but leaves a DRAFT custom alone', async () => {
    const { approvalId, customIds } = await makePreparedMerchant([
      { approvalStatus: 'APPROVED', status: 'PENDING_APPROVAL' },
      { approvalStatus: 'APPROVED', status: 'PENDING_APPROVAL' },
      { approvalStatus: 'PENDING', status: 'DRAFT' }, // draft -> untouched
    ])
    const res = await approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)

    const activated = (res as any).activatedCustoms as { id: string }[]
    expect(activated.map((a) => a.id).sort()).toEqual([customIds[0], customIds[1]].sort())

    expect((await prisma.voucher.findUnique({ where: { id: customIds[0] } }))?.status).toBe('ACTIVE')
    expect((await prisma.voucher.findUnique({ where: { id: customIds[1] } }))?.status).toBe('ACTIVE')
    expect((await prisma.voucher.findUnique({ where: { id: customIds[2] } }))?.status).toBe('DRAFT')

    // Fix 2 (notification-loss): exactly ONE now-live notify fires for the whole
    // activated set (was one-per-voucher, which the 5/hour notify limit silently
    // dropped from the 6th onward). The bell still deep-links to the first id.
    const nowLive = notifyMock.mock.calls.filter((c) => c[2].type === 'voucher_now_live')
    expect(nowLive).toHaveLength(1)
    expect(nowLive[0][2].inApp.referenceType).toBe('voucher')
    expect([customIds[0], customIds[1]]).toContain(nowLive[0][2].inApp.referenceId)
  })

  // Fix 2 (notification-loss): with MANY (7) approved-waiting customs activating at
  // go-live, exactly ONE voucher_now_live in-app notification fires (not 7, which
  // would lose the 6th+ to notify()'s 5/hour per-(type,recipient) send limit before
  // the in-app row is written). The merchant_live bell still fires too.
  it('fires exactly ONE batched now-live notify when MANY approved-waiting customs activate', async () => {
    const { approvalId, customIds } = await makePreparedMerchant(
      Array.from({ length: 7 }, () => ({ approvalStatus: 'APPROVED', status: 'PENDING_APPROVAL' })),
    )
    const res = await approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)

    const activated = (res as any).activatedCustoms as { id: string }[]
    expect(activated).toHaveLength(7)
    for (const id of customIds) {
      expect((await prisma.voucher.findUnique({ where: { id } }))?.status).toBe('ACTIVE')
    }

    const nowLive = notifyMock.mock.calls.filter((c) => c[2].type === 'voucher_now_live')
    expect(nowLive).toHaveLength(1) // ONE notify for the whole set, regardless of N
    expect(nowLive[0][2].inApp.notificationType).toBe('VOUCHER_APPROVAL_UPDATE')
    expect(nowLive[0][2].inApp.referenceType).toBe('voucher')
    expect(customIds).toContain(nowLive[0][2].inApp.referenceId) // still deep-links

    // merchant_live (owner go-live) still fires alongside.
    expect(notifyMock.mock.calls.some((c) => c[2].type === 'merchant_live')).toBe(true)
  }, 45_000)
})
