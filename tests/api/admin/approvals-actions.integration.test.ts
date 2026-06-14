import 'dotenv/config'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Mock notify so request-changes/reject don't enqueue real email jobs.
const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }))
vi.mock('../../../src/api/shared/notify', () => ({ notify: notifyMock }))

import {
  claimApproval,
  releaseApproval,
  requestChanges,
  rejectApproval,
} from '../../../src/api/admin/approvals/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
// A real AdminUser — AdminApproval.adminUserId is an FK, so the actioning admin
// must exist (reject/request-changes set it).
let ADMIN_ID = ''
const ctx = { ipAddress: '127.0.0.1', userAgent: 'm3-test' }
const dummyRedis = {} as any
const createdMerchantIds: string[] = []
let seq = 0

async function makeSubmittedMerchant() {
  const m = await prisma.merchant.create({
    data: {
      businessName: 'M3 Actioner Co',
      status: 'PENDING_APPROVAL',
      onboardingStep: 'SUBMITTED',
      verificationStatus: 'PENDING',
      isTestData: true,
    },
  })
  const admin = await prisma.merchantAdmin.create({
    data: { email: `m3-actioner-${Date.now()}-${seq++}@example.com`, firstName: 'O', lastName: 'W' },
  })
  await prisma.merchantMembership.create({
    data: { merchantId: m.id, merchantAdminId: admin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' },
  })
  const approval = await prisma.adminApproval.create({
    data: { type: 'MERCHANT_ONBOARDING', status: 'PENDING', referenceId: m.id, referenceType: 'merchant' },
  })
  createdMerchantIds.push(m.id)
  return { merchantId: m.id, adminId: admin.id, approvalId: approval.id }
}

beforeAll(async () => {
  const a = await prisma.adminUser.create({
    data: { email: `m3-actor-${Date.now()}@example.com`, passwordHash: 'x', firstName: 'M3', lastName: 'Actor', role: 'OPERATIONS' },
  })
  ADMIN_ID = a.id
})

beforeEach(() => {
  notifyMock.mockReset()
  notifyMock.mockResolvedValue({ queued: true, communicationLogId: 'c1', enqueued: true })
})

afterAll(async () => {
  for (const merchantId of createdMerchantIds) {
    await prisma.auditLog.deleteMany({ where: { entityId: merchantId } })
    await prisma.adminApproval.deleteMany({ where: { referenceId: merchantId } })
    const adminIds = (await prisma.merchantMembership.findMany({ where: { merchantId }, select: { merchantAdminId: true } })).map((r) => r.merchantAdminId)
    await prisma.merchantMembership.deleteMany({ where: { merchantId } })
    await prisma.merchantAdmin.deleteMany({ where: { id: { in: adminIds } } })
    await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => {})
  }
  if (ADMIN_ID) await prisma.adminUser.delete({ where: { id: ADMIN_ID } }).catch(() => {})
  await prisma.$disconnect()
})

describe('M3 — actioner review loop (real DB)', () => {
  it('claim → UNDER_REVIEW + claimedById + audit; a second claim loses (single winner)', async () => {
    const { merchantId, approvalId } = await makeSubmittedMerchant()
    await claimApproval(prisma, approvalId, ADMIN_ID, ctx)

    const ap = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(ap?.claimedById).toBe(ADMIN_ID)
    expect(ap?.claimedAt).toBeTruthy()
    const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(m?.onboardingStep).toBe('UNDER_REVIEW')
    const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'MERCHANT_APPROVAL_CLAIMED' } })
    expect(audit?.actorId).toBe(ADMIN_ID)
    expect(audit?.actorType).toBe('ADMIN')

    await expect(claimApproval(prisma, approvalId, 'another-admin', ctx)).rejects.toThrow('APPROVAL_ALREADY_CLAIMED')
  })

  it('release → claim cleared + back to SUBMITTED', async () => {
    const { merchantId, approvalId } = await makeSubmittedMerchant()
    await claimApproval(prisma, approvalId, ADMIN_ID, ctx)
    await releaseApproval(prisma, approvalId, ADMIN_ID, 'OPERATIONS', ctx)

    const ap = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(ap?.claimedById).toBeNull()
    const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(m?.onboardingStep).toBe('SUBMITTED')
  })

  // D1: release-owner guard cases (spec 5.2)
  describe('release-owner guard (D1)', () => {
    let ADMIN_B_ID = ''

    beforeAll(async () => {
      const b = await prisma.adminUser.create({
        data: { email: `m5-admin-b-${Date.now()}@example.com`, passwordHash: 'x', firstName: 'B', lastName: 'Admin', role: 'OPERATIONS' },
      })
      ADMIN_B_ID = b.id
    })

    afterAll(async () => {
      if (ADMIN_B_ID) await prisma.adminUser.delete({ where: { id: ADMIN_B_ID } }).catch(() => {})
    })

    it('(a) claimer releases own claim — succeeds, claim cleared, merchant back to SUBMITTED, audit written', async () => {
      const { merchantId, approvalId } = await makeSubmittedMerchant()
      await claimApproval(prisma, approvalId, ADMIN_ID, ctx)

      const result = await releaseApproval(prisma, approvalId, ADMIN_ID, 'OPERATIONS', ctx)
      expect(result).toEqual({ released: true })

      const ap = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
      expect(ap?.claimedById).toBeNull()
      expect(ap?.claimedAt).toBeNull()

      const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
      expect(m?.onboardingStep).toBe('SUBMITTED')

      const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'MERCHANT_APPROVAL_RELEASED' } })
      expect(audit?.actorId).toBe(ADMIN_ID)
      expect(audit?.actorType).toBe('ADMIN')
    })

    it('(b) ordinary non-claimer cannot release — throws APPROVAL_NOT_CLAIMER, claim unchanged', async () => {
      const { merchantId, approvalId } = await makeSubmittedMerchant()
      await claimApproval(prisma, approvalId, ADMIN_ID, ctx)

      await expect(releaseApproval(prisma, approvalId, ADMIN_B_ID, 'OPERATIONS', ctx)).rejects.toThrow('APPROVAL_NOT_CLAIMER')

      // Claim must remain intact (ADMIN_ID still holds it)
      const ap = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
      expect(ap?.claimedById).toBe(ADMIN_ID)
    })

    it('(c) SUPER_ADMIN force-release — succeeds even though actor is not the claimer', async () => {
      const { approvalId } = await makeSubmittedMerchant()
      await claimApproval(prisma, approvalId, ADMIN_ID, ctx)

      const result = await releaseApproval(prisma, approvalId, ADMIN_B_ID, 'SUPER_ADMIN', ctx)
      expect(result).toEqual({ released: true })

      const ap = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
      expect(ap?.claimedById).toBeNull()
    })

    it('(d) unclaimed approval throws APPROVAL_NOT_ACTIONABLE (not APPROVAL_NOT_CLAIMER); missing id throws APPROVAL_NOT_FOUND', async () => {
      // Unclaimed — guard order: NOT_ACTIONABLE fires before the claimer check
      const { approvalId } = await makeSubmittedMerchant()
      await expect(releaseApproval(prisma, approvalId, ADMIN_B_ID, 'OPERATIONS', ctx)).rejects.toThrow('APPROVAL_NOT_ACTIONABLE')

      // Missing id
      await expect(releaseApproval(prisma, 'no-such-id', ADMIN_ID, 'OPERATIONS', ctx)).rejects.toThrow('APPROVAL_NOT_FOUND')
    })
  })

  it('request-changes → CHANGES_REQUESTED + NEEDS_CHANGES (status stays PENDING_APPROVAL) + notifies the owner', async () => {
    const { merchantId, approvalId, adminId } = await makeSubmittedMerchant()
    await requestChanges(prisma, dummyRedis, approvalId, ADMIN_ID, 'Please add a clearer logo', ctx)

    const ap = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(ap?.status).toBe('CHANGES_REQUESTED')
    expect(ap?.comment).toBe('Please add a clearer logo')
    expect(ap?.claimedById).toBeNull()

    const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(m?.onboardingStep).toBe('NEEDS_CHANGES')
    expect(m?.status).toBe('PENDING_APPROVAL') // spec §2 — stays through the loop

    const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'MERCHANT_CHANGES_REQUESTED' } })
    expect(audit?.reason).toBe('Please add a clearer logo')
    expect(audit?.actorId).toBe(ADMIN_ID)

    expect(notifyMock).toHaveBeenCalledTimes(1)
    const input = notifyMock.mock.calls[0][2]
    expect(input.recipientType).toBe('MERCHANT_ADMIN')
    expect(input.recipientId).toBe(adminId)
    expect(input.type).toBe('merchant_changes_requested')
    expect(input.email.subject).toMatch(/changes requested/i)
    expect(input.inApp.notificationType).toBe('MERCHANT_VERIFICATION_UPDATE')
  })

  it('reject → INACTIVE / REJECTED / REJECTED + audit + notifies the owner', async () => {
    const { merchantId, approvalId } = await makeSubmittedMerchant()
    await rejectApproval(prisma, dummyRedis, approvalId, ADMIN_ID, 'Does not meet the quality bar', ctx)

    const ap = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(ap?.status).toBe('REJECTED')
    const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(m?.status).toBe('INACTIVE')
    expect(m?.onboardingStep).toBe('REJECTED')
    expect(m?.verificationStatus).toBe('REJECTED')

    const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'MERCHANT_APPROVAL_REJECTED' } })
    expect(audit?.actorId).toBe(ADMIN_ID)
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0][2].type).toBe('merchant_rejected')
  })

  it('double-action is a no-op: request-changes on an already-rejected approval → APPROVAL_NOT_ACTIONABLE', async () => {
    const { approvalId } = await makeSubmittedMerchant()
    await rejectApproval(prisma, dummyRedis, approvalId, ADMIN_ID, 'no', ctx)
    notifyMock.mockClear() // clear the reject's notify; assert the FAILED action notifies nobody
    await expect(requestChanges(prisma, dummyRedis, approvalId, ADMIN_ID, 'too late', ctx)).rejects.toThrow(
      'APPROVAL_NOT_ACTIONABLE'
    )
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('claim on a non-existent approval → APPROVAL_NOT_FOUND', async () => {
    await expect(claimApproval(prisma, 'no-such-approval-id', ADMIN_ID, ctx)).rejects.toThrow('APPROVAL_NOT_FOUND')
  })
})
