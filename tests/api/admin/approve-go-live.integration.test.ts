import 'dotenv/config'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Phase 2 Slice 1 M5 — atomic approve / go-live (real DB).
//
// Mock notify so the post-commit "you're live" notification doesn't enqueue a
// real email job (mirrors the M3 actioner tests).
const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }))
vi.mock('../../../src/api/shared/notify', () => ({ notify: notifyMock }))

import { approveApproval } from '../../../src/api/admin/approvals/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const ctx = { ipAddress: '127.0.0.1', userAgent: 'm5-test' }
const dummyRedis = {} as any
const PREFIX = 'm5-golive-'
const createdMerchantIds: string[] = []
let ADMIN_ID = ''
let CATEGORY_ID: string | null = null
let seq = 0

type PrepareOpts = {
  contract?: 'SIGNED' | 'NOT_SIGNED'
  rmvCount?: number
  mainConfidence?: 'MANUALLY_CONFIRMED' | 'ADDRESS_GEOCODED' | 'POSTCODE_CENTROID' | null // null = no main branch
  isTestData?: boolean
}

// Build a go-live-ready merchant (fully guardrail-compliant so a concurrent
// seed-guardrail run can't fail on the transient ACTIVE window), varying ONE
// gate at a time. Returns ids for assertions + cleanup.
async function makePreparedMerchant(opts: PrepareOpts = {}) {
  const { contract = 'SIGNED', rmvCount = 2, mainConfidence = 'MANUALLY_CONFIRMED', isTestData = false } = opts
  const n = seq++
  const m = await prisma.merchant.create({
    data: {
      businessName: `${PREFIX}Co ${n}`,
      status: 'PENDING_APPROVAL',
      onboardingStep: 'SUBMITTED',
      verificationStatus: 'PENDING',
      contractStatus: contract,
      isTestData,
      ...(CATEGORY_ID ? { primaryCategoryId: CATEGORY_ID } : {}),
    },
  })
  createdMerchantIds.push(m.id)

  if (mainConfidence !== null) {
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
        redemptionPin: 'enc-test-pin', // R4 only checks non-null (value is otherwise AES-encrypted)
        latitude: 53.6463,
        longitude: -1.7809,
        locationConfidence: mainConfidence,
      },
    })
  }

  for (let i = 0; i < rmvCount; i++) {
    await prisma.voucher.create({
      data: {
        merchantId: m.id,
        code: `RMV-${Date.now()}-${n}-${i}`,
        isRmv: true,
        isMandatory: true,
        type: 'BOGO',
        title: `RMV ${i}`,
        estimatedSaving: 10,
        status: 'PENDING_APPROVAL',
        approvalStatus: 'PENDING',
      },
    })
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
  return { merchantId: m.id, ownerAdminId: admin.id, approvalId: approval.id }
}

beforeAll(async () => {
  const a = await prisma.adminUser.create({
    data: { email: `m5-actor-${Date.now()}@example.com`, passwordHash: 'x', firstName: 'M5', lastName: 'Actor', role: 'OPERATIONS' },
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
  // G1 hardening: a bulk prefix-sweep, NOT a per-merchant loop. Deletes EVERY
  // `m5-golive-*` fixture — this run's tracked ids PLUS any merchant left behind
  // by a prior run whose teardown was interrupted — with one deleteMany per table
  // in FK-safe order. No per-merchant round-trips + a 30s budget means teardown
  // can neither time out under Neon latency nor leak a discoverable merchant into
  // the dev DB (every fixture uses the `m5-golive-` businessName prefix).
  const swept = (await prisma.merchant.findMany({
    where: { businessName: { startsWith: PREFIX } }, select: { id: true },
  })).map((m) => m.id)
  const merchantIds = [...new Set([...swept, ...createdMerchantIds])]
  if (merchantIds.length) {
    const inIds = { in: merchantIds }
    // Capture owner-admin ids via membership BEFORE deleting memberships (FK RESTRICT).
    const adminIds = (await prisma.merchantMembership.findMany({
      where: { merchantId: inIds }, select: { merchantAdminId: true },
    })).map((r) => r.merchantAdminId)
    await prisma.voucherRedemption.deleteMany({ where: { voucher: { merchantId: inIds } } })
    await prisma.userVoucherCycleState.deleteMany({ where: { voucher: { merchantId: inIds } } })
    await prisma.voucherAvailabilityWindow.deleteMany({ where: { voucher: { merchantId: inIds } } })
    await prisma.voucher.deleteMany({ where: { merchantId: inIds } })
    await prisma.branchUser.deleteMany({ where: { branch: { merchantId: inIds } } })
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

describe('M5 — approve → atomic go-live (real DB)', () => {
  it('happy path: merchant → ACTIVE/LIVE/VERIFIED, 2 RMVs ACTIVE/APPROVED, approval APPROVED', async () => {
    const { merchantId, ownerAdminId, approvalId } = await makePreparedMerchant()
    const res = await approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    expect(res).toMatchObject({ approved: true, alreadyLive: false })

    const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(m?.status).toBe('ACTIVE')
    expect(m?.onboardingStep).toBe('LIVE')
    expect(m?.verificationStatus).toBe('VERIFIED')

    const rmvs = await prisma.voucher.findMany({ where: { merchantId, isRmv: true } })
    expect(rmvs).toHaveLength(2)
    for (const v of rmvs) {
      expect(v.status).toBe('ACTIVE')
      expect(v.approvalStatus).toBe('APPROVED')
      expect(v.approvedBy).toBe(ADMIN_ID)
      expect(v.approvedAt).toBeTruthy()
    }

    const ap = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(ap?.status).toBe('APPROVED')
    expect(ap?.adminUserId).toBe(ADMIN_ID)
    expect(ap?.actionedAt).toBeTruthy()
    expect(ap?.claimedById).toBeNull()

    // notify the owner — type + recipient + in-app type.
    expect(notifyMock).toHaveBeenCalledTimes(1)
    const input = notifyMock.mock.calls[0][2]
    expect(input.type).toBe('merchant_live')
    expect(input.recipientType).toBe('MERCHANT_ADMIN')
    expect(input.recipientId).toBe(ownerAdminId)
    expect(input.email.subject).toMatch(/live/i)
    expect(input.inApp.notificationType).toBe('MERCHANT_VERIFICATION_UPDATE')
  })

  it('writes both audit rows (MERCHANT_APPROVAL_APPROVED + MERCHANT_GO_LIVE) with actor + before/after', async () => {
    const { merchantId, approvalId } = await makePreparedMerchant()
    await approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)

    const approved = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'MERCHANT_APPROVAL_APPROVED' } })
    expect(approved?.actorId).toBe(ADMIN_ID)
    expect(approved?.actorType).toBe('ADMIN')

    const goLive = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'MERCHANT_GO_LIVE' } })
    expect(goLive?.actorId).toBe(ADMIN_ID)
    expect(goLive?.before).toMatchObject({ status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED', verificationStatus: 'PENDING' })
    expect(goLive?.after).toMatchObject({ status: 'ACTIVE', onboardingStep: 'LIVE', verificationStatus: 'VERIFIED' })
  })

  it('an ADDRESS_GEOCODED main branch also passes the go-live location gate (CONFIRMED_SET, not MANUALLY_CONFIRMED-only)', async () => {
    const { merchantId, approvalId } = await makePreparedMerchant({ mainConfidence: 'ADDRESS_GEOCODED' })
    await approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(m?.status).toBe('ACTIVE')
  })

  it('gate: unsigned contract → ONBOARDING_GATES_INCOMPLETE (merchant stays PENDING_APPROVAL, RMVs untouched, no notify)', async () => {
    const { merchantId, approvalId } = await makePreparedMerchant({ contract: 'NOT_SIGNED' })
    await expect(approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)).rejects.toThrow('ONBOARDING_GATES_INCOMPLETE')
    const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(m?.status).toBe('PENDING_APPROVAL')
    const rmvs = await prisma.voucher.findMany({ where: { merchantId, isRmv: true } })
    expect(rmvs.every((v) => v.status === 'PENDING_APPROVAL')).toBe(true)
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('gate: fewer than 2 RMVs → ONBOARDING_GATES_INCOMPLETE', async () => {
    const { approvalId } = await makePreparedMerchant({ rmvCount: 1 })
    await expect(approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)).rejects.toThrow('ONBOARDING_GATES_INCOMPLETE')
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('gate: main branch POSTCODE_CENTROID → MAIN_BRANCH_LOCATION_UNCONFIRMED (admin must confirm-location first)', async () => {
    const { merchantId, approvalId } = await makePreparedMerchant({ mainConfidence: 'POSTCODE_CENTROID' })
    await expect(approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)).rejects.toThrow('MAIN_BRANCH_LOCATION_UNCONFIRMED')
    const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(m?.status).toBe('PENDING_APPROVAL')
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('guard: a test-data merchant is never go-live-able → APPROVAL_NOT_ACTIONABLE', async () => {
    const { approvalId } = await makePreparedMerchant({ isTestData: true })
    await expect(approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)).rejects.toThrow('APPROVAL_NOT_ACTIONABLE')
  })

  it('idempotent: a second approve on an already-live merchant is a no-op (no error, no re-notify)', async () => {
    const { merchantId, approvalId } = await makePreparedMerchant()
    await approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx) // first → live (notify #1)
    notifyMock.mockClear()
    const res = await approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx) // second → no-op
    expect(res).toMatchObject({ approved: true, alreadyLive: true })
    expect(notifyMock).not.toHaveBeenCalled()
    const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(m?.status).toBe('ACTIVE')
  })

  it('CONCURRENT double-approve: exactly one wins — single MERCHANT_GO_LIVE audit row, no duplicate transition (finding 1)', async () => {
    const { merchantId, approvalId } = await makePreparedMerchant()
    // Fire both approves "simultaneously". The atomic compare-and-set must let
    // exactly one win; the loser returns alreadyLive before any RMV/audit/notify.
    const [r1, r2] = await Promise.all([
      approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx),
      approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx),
    ])
    // one winner, one idempotent no-op (order non-deterministic).
    expect([r1, r2].filter((r) => r.alreadyLive === false)).toHaveLength(1)
    expect([r1, r2].filter((r) => r.alreadyLive === true)).toHaveLength(1)
    // the transition + its audit ran EXACTLY ONCE — no duplicate go-live rows.
    expect(await prisma.auditLog.count({ where: { entityId: merchantId, event: 'MERCHANT_GO_LIVE' } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { entityId: merchantId, event: 'MERCHANT_APPROVAL_APPROVED' } })).toBe(1)
    // only the winner notified.
    expect(notifyMock).toHaveBeenCalledTimes(1)
    const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(m?.status).toBe('ACTIVE')
    // RMVs activated exactly once (no double-stamp anomaly).
    const rmvs = await prisma.voucher.findMany({ where: { merchantId, isRmv: true } })
    expect(rmvs.every((v) => v.status === 'ACTIVE' && v.approvalStatus === 'APPROVED')).toBe(true)
  })

  it('best-effort notify: a notify failure does NOT fail go-live (finding 2)', async () => {
    const { merchantId, approvalId } = await makePreparedMerchant()
    notifyMock.mockRejectedValueOnce(new Error('redis down')) // simulate enqueue failure
    const res = await approveApproval(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    // go-live still succeeds — safeNotify swallows + warns, never rolls back the committed action.
    expect(res).toMatchObject({ approved: true, alreadyLive: false })
    const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(m?.status).toBe('ACTIVE')
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })

  it('approve on a non-existent approval → APPROVAL_NOT_FOUND', async () => {
    await expect(approveApproval(prisma, dummyRedis, 'no-such-approval-id', ADMIN_ID, ctx)).rejects.toThrow('APPROVAL_NOT_FOUND')
  })
})
