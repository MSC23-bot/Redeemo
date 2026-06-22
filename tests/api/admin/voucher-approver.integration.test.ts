import 'dotenv/config'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Day-2 Vouchers A5/A6: the VOUCHER AdminApproval lane (review context + approve
// Model 1 + reject + request-changes concierge) + the VOUCHER_APPROVAL_UPDATE
// in-app producer. Mock notify so the decisions don't enqueue real email jobs;
// the in-app row is asserted via the notify call shape (notify is mocked).
const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }))
vi.mock('../../../src/api/shared/notify', () => ({ notify: notifyMock }))

import {
  getVoucherReviewContext,
  approveVoucher,
  rejectVoucher,
  requestVoucherChanges,
} from '../../../src/api/admin/approvals/voucherApprover'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const PREFIX = 'a5-voucher-approver'
const ctx = { ipAddress: '127.0.0.1', userAgent: 'a5-voucher-approver-test' }
const dummyRedis = {} as any
let ADMIN_ID = ''
let seq = 0

/** A merchant + ACTIVE OWNER membership so the after-commit owner notify can resolve. */
async function makeMerchant(businessName: string, status: 'ACTIVE' | 'PENDING_APPROVAL' = 'ACTIVE') {
  const m = await prisma.merchant.create({
    data: { businessName: `${PREFIX} ${businessName}`, status, isTestData: true },
  })
  const admin = await prisma.merchantAdmin.create({
    data: { email: `${PREFIX}-${Date.now()}-${seq++}@example.com`, firstName: 'O', lastName: 'W' },
  })
  await prisma.merchantMembership.create({
    data: { merchantId: m.id, merchantAdminId: admin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' },
  })
  return { merchantId: m.id, ownerAdminId: admin.id }
}

/** A custom (non-RMV) DRAFT->PENDING_APPROVAL voucher + its VOUCHER approval row. */
async function makeSubmittedVoucher(
  merchantId: string,
  overrides: Partial<{ status: string; approvalStatus: string; merchantFields: Record<string, unknown> }> = {},
) {
  const v = await prisma.voucher.create({
    data: {
      merchantId,
      code: `RCV-${PREFIX}-${seq++}`,
      isRmv: false,
      isMandatory: false,
      type: 'DISCOUNT_FIXED' as any,
      title: `${PREFIX} Lunch deal`,
      description: 'Two for one',
      terms: 'Dine in only',
      estimatedSaving: 12.5,
      status: (overrides.status ?? 'PENDING_APPROVAL') as any,
      approvalStatus: (overrides.approvalStatus ?? 'PENDING') as any,
      merchantFields: (overrides.merchantFields ?? { askHelp: false }) as any,
    },
  })
  const approval = await prisma.adminApproval.create({
    data: { type: 'VOUCHER', status: 'PENDING', referenceId: v.id, referenceType: 'voucher' },
  })
  return { voucherId: v.id, approvalId: approval.id }
}

/** A flagship RMV in a given status (ACTIVE = flagship live; else not). */
async function makeRmv(merchantId: string, status: 'ACTIVE' | 'PENDING_APPROVAL' | 'DRAFT' = 'ACTIVE') {
  await prisma.voucher.create({
    data: {
      merchantId,
      code: `RMV-${PREFIX}-${seq++}`,
      isRmv: true,
      isMandatory: true,
      type: 'BOGO' as any,
      title: `${PREFIX} Flagship`,
      estimatedSaving: 5,
      status: status as any,
      approvalStatus: status === 'ACTIVE' ? ('APPROVED' as any) : ('PENDING' as any),
      merchantFields: {} as any,
    },
  })
}

beforeAll(async () => {
  const a = await prisma.adminUser.create({
    data: { email: `${PREFIX}-admin-${Date.now()}@example.com`, passwordHash: 'x', firstName: 'A5', lastName: 'Approver', role: 'OPERATIONS' },
  })
  ADMIN_ID = a.id
})

beforeEach(() => {
  notifyMock.mockReset()
  notifyMock.mockResolvedValue({ queued: true, communicationLogId: 'c1', enqueued: true })
})

afterAll(async () => {
  const merchantIds = (
    await prisma.merchant.findMany({ where: { businessName: { startsWith: PREFIX } }, select: { id: true } })
  ).map((m) => m.id)
  if (merchantIds.length) {
    const voucherIds = (await prisma.voucher.findMany({ where: { merchantId: { in: merchantIds } }, select: { id: true } })).map((v) => v.id)
    await prisma.auditLog.deleteMany({ where: { entityId: { in: merchantIds } } })
    if (voucherIds.length) await prisma.adminApproval.deleteMany({ where: { referenceId: { in: voucherIds } } })
    await prisma.voucher.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.merchantMembership.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } })
  }
  await prisma.merchantAdmin.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await prisma.$disconnect()
}, 60000)

describe('A5: getVoucherReviewContext (real DB)', () => {
  it('returns the curated voucher + merchant summary, no PII/redemptionPin, estimatedSaving as Number', async () => {
    const { merchantId } = await makeMerchant('Review Co')
    const { voucherId, approvalId } = await makeSubmittedVoucher(merchantId, {
      merchantFields: { askHelp: true, adminProposed: { title: 'Suggested' }, adminNote: 'tweak title' },
    })

    const review = await getVoucherReviewContext(prisma, approvalId)
    expect(review.voucher.id).toBe(voucherId)
    expect(review.voucher.title).toBe(`${PREFIX} Lunch deal`)
    expect(review.voucher.type).toBe('DISCOUNT_FIXED')
    expect(review.voucher.status).toBe('PENDING_APPROVAL')
    expect(review.voucher.approvalStatus).toBe('PENDING')
    expect(typeof review.voucher.estimatedSaving).toBe('number')
    expect(review.voucher.estimatedSaving).toBe(12.5)
    expect(review.voucher.merchantFields).toMatchObject({
      askHelp: true,
      adminProposed: { title: 'Suggested' },
      adminNote: 'tweak title',
    })
    expect(review.merchant).toEqual({ id: merchantId, businessName: `${PREFIX} Review Co`, status: 'ACTIVE' })
    // No PII / no redemptionPin leak anywhere in the serialised context.
    const serialised = JSON.stringify(review)
    expect(serialised).not.toMatch(/redemptionPin/i)
    expect(serialised).not.toMatch(/passwordHash/i)
  })

  it('goLive hint = true when merchant ACTIVE + flagship live; false otherwise', async () => {
    const live = await makeMerchant('GoLive Yes Co', 'ACTIVE')
    await makeRmv(live.merchantId, 'ACTIVE')
    const a = await makeSubmittedVoucher(live.merchantId)
    expect((await getVoucherReviewContext(prisma, a.approvalId)).goLive).toBe(true)

    const waiting = await makeMerchant('GoLive No Co', 'PENDING_APPROVAL')
    await makeRmv(waiting.merchantId, 'DRAFT')
    const b = await makeSubmittedVoucher(waiting.merchantId)
    expect((await getVoucherReviewContext(prisma, b.approvalId)).goLive).toBe(false)
  })

  it('non-VOUCHER approval type -> APPROVAL_NOT_ACTIONABLE', async () => {
    const { merchantId } = await makeMerchant('Wrong Type Co')
    const approval = await prisma.adminApproval.create({
      data: { type: 'MERCHANT_ONBOARDING', status: 'PENDING', referenceId: merchantId, referenceType: 'merchant' },
    })
    await expect(getVoucherReviewContext(prisma, approval.id)).rejects.toThrow('APPROVAL_NOT_ACTIONABLE')
  })
})

describe('A5/A6: approveVoucher Model 1 (real DB)', () => {
  it('merchant ACTIVE + flagship live -> voucher ACTIVE/APPROVED + approvedBy/At; approval APPROVED; live notify', async () => {
    const { merchantId, ownerAdminId } = await makeMerchant('Approve Live Co', 'ACTIVE')
    await makeRmv(merchantId, 'ACTIVE')
    const { voucherId, approvalId } = await makeSubmittedVoucher(merchantId)

    const res = await approveVoucher(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    expect(res).toEqual({ approved: true, goLive: true })

    const v = await prisma.voucher.findUnique({ where: { id: voucherId } })
    expect(v?.status).toBe('ACTIVE')
    expect(v?.approvalStatus).toBe('APPROVED')
    expect(v?.approvedBy).toBe(ADMIN_ID)
    expect(v?.approvedAt).toBeTruthy()

    const ap = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(ap?.status).toBe('APPROVED')
    expect(ap?.adminUserId).toBe(ADMIN_ID)
    expect(ap?.claimedById).toBeNull()

    expect(notifyMock).toHaveBeenCalledTimes(1)
    const input = notifyMock.mock.calls[0][2]
    expect(input.recipientType).toBe('MERCHANT_ADMIN')
    expect(input.recipientId).toBe(ownerAdminId)
    expect(input.type).toBe('voucher_approved_live')
    expect(input.inApp.notificationType).toBe('VOUCHER_APPROVAL_UPDATE')
    expect(input.inApp.referenceType).toBe('voucher')
    expect(input.inApp.referenceId).toBe(voucherId)
    expect(input.email.subject).toBeTruthy()
  })

  it('merchant NOT ACTIVE -> approved-waiting (approvalStatus APPROVED, status stays PENDING_APPROVAL); waiting notify', async () => {
    const { merchantId } = await makeMerchant('Approve Waiting Co', 'PENDING_APPROVAL')
    await makeRmv(merchantId, 'DRAFT')
    const { voucherId, approvalId } = await makeSubmittedVoucher(merchantId)

    const res = await approveVoucher(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    expect(res).toEqual({ approved: true, goLive: false })

    const v = await prisma.voucher.findUnique({ where: { id: voucherId } })
    expect(v?.approvalStatus).toBe('APPROVED')
    expect(v?.status).toBe('PENDING_APPROVAL') // approved-waiting, NOT activated
    expect(v?.approvedBy).toBe(ADMIN_ID)

    expect(notifyMock.mock.calls[0][2].type).toBe('voucher_approved_waiting')
  })

  it('flagship NOT live (merchant ACTIVE but an RMV not ACTIVE) -> approved-waiting', async () => {
    const { merchantId } = await makeMerchant('Flagship Pending Co', 'ACTIVE')
    await makeRmv(merchantId, 'ACTIVE')
    await makeRmv(merchantId, 'PENDING_APPROVAL') // one flagship not live
    const { voucherId, approvalId } = await makeSubmittedVoucher(merchantId)

    const res = await approveVoucher(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    expect(res.goLive).toBe(false)
    expect((await prisma.voucher.findUnique({ where: { id: voucherId } }))?.status).toBe('PENDING_APPROVAL')
  })

  it('cross-type / RMV voucher id -> VOUCHER_NOT_FOUND (approver is custom-only)', async () => {
    const { merchantId } = await makeMerchant('Rmv Reject Co', 'ACTIVE')
    const rmv = await prisma.voucher.create({
      data: {
        merchantId, code: `RMV-${PREFIX}-x${seq++}`, isRmv: true, isMandatory: true,
        type: 'BOGO' as any, title: `${PREFIX} R`, estimatedSaving: 5,
        status: 'PENDING_APPROVAL' as any, approvalStatus: 'PENDING' as any, merchantFields: {} as any,
      },
    })
    const approval = await prisma.adminApproval.create({
      data: { type: 'VOUCHER', status: 'PENDING', referenceId: rmv.id, referenceType: 'voucher' },
    })
    await expect(approveVoucher(prisma, dummyRedis, approval.id, ADMIN_ID, ctx)).rejects.toThrow('VOUCHER_NOT_FOUND')
  })

  it('non-actionable approval status -> APPROVAL_NOT_ACTIONABLE; the failed action notifies nobody', async () => {
    const { merchantId } = await makeMerchant('Already Done Co', 'ACTIVE')
    await makeRmv(merchantId, 'ACTIVE')
    const { approvalId } = await makeSubmittedVoucher(merchantId)
    await prisma.adminApproval.update({ where: { id: approvalId }, data: { status: 'APPROVED' } })
    notifyMock.mockClear()
    await expect(approveVoucher(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)).rejects.toThrow('APPROVAL_NOT_ACTIONABLE')
    expect(notifyMock).not.toHaveBeenCalled()
  })

  // Fix 1 (entity-status guard): the AdminApproval status (CHANGES_REQUESTED) is
  // actionable, but the voucher itself is DRAFT (the merchant has NOT resubmitted
  // yet). Approving here would force-publish a DRAFT, bypassing resubmit/re-review,
  // so the voucher status is re-validated and VOUCHER_NOT_ACTIONABLE is thrown.
  it('voucher status DRAFT (AdminApproval CHANGES_REQUESTED, not yet resubmitted) -> VOUCHER_NOT_ACTIONABLE; notifies nobody', async () => {
    const { merchantId } = await makeMerchant('Draft Force-Activate Co', 'ACTIVE')
    await makeRmv(merchantId, 'ACTIVE')
    const { voucherId, approvalId } = await makeSubmittedVoucher(merchantId, {
      status: 'DRAFT',
      approvalStatus: 'CHANGES_REQUESTED',
    })
    await prisma.adminApproval.update({ where: { id: approvalId }, data: { status: 'CHANGES_REQUESTED' } })
    notifyMock.mockClear()
    await expect(approveVoucher(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)).rejects.toThrow('VOUCHER_NOT_ACTIONABLE')
    // No write happened: the voucher stays DRAFT, never force-published.
    const v = await prisma.voucher.findUnique({ where: { id: voucherId } })
    expect(v?.status).toBe('DRAFT')
    expect(v?.approvalStatus).toBe('CHANGES_REQUESTED')
    expect(notifyMock).not.toHaveBeenCalled()
  })
})

describe('A5/A6: rejectVoucher (real DB)', () => {
  it('voucher INACTIVE/REJECTED; approval REJECTED with comment; audit reason; reject notify', async () => {
    const { merchantId } = await makeMerchant('Reject Co', 'ACTIVE')
    const { voucherId, approvalId } = await makeSubmittedVoucher(merchantId)

    const res = await rejectVoucher(prisma, dummyRedis, approvalId, ADMIN_ID, 'Saving is misleading', ctx)
    expect(res).toEqual({ rejected: true })

    const v = await prisma.voucher.findUnique({ where: { id: voucherId } })
    expect(v?.status).toBe('INACTIVE')
    expect(v?.approvalStatus).toBe('REJECTED')

    const ap = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(ap?.status).toBe('REJECTED')
    expect(ap?.comment).toBe('Saving is misleading')

    const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'VOUCHER_REJECTED' } })
    expect(audit?.reason).toBe('Saving is misleading')
    expect(audit?.actorType).toBe('ADMIN')

    expect(notifyMock.mock.calls[0][2].type).toBe('voucher_rejected')
    expect(notifyMock.mock.calls[0][2].inApp.referenceType).toBe('voucher')
  })

  // Fix 1 (entity-status guard): a DRAFT voucher (CHANGES_REQUESTED approval) is
  // not a genuinely-submitted voucher, so reject re-validates the voucher status.
  it('voucher status DRAFT (CHANGES_REQUESTED) -> VOUCHER_NOT_ACTIONABLE on reject', async () => {
    const { merchantId } = await makeMerchant('Reject Draft Co', 'ACTIVE')
    const { voucherId, approvalId } = await makeSubmittedVoucher(merchantId, {
      status: 'DRAFT',
      approvalStatus: 'CHANGES_REQUESTED',
    })
    await prisma.adminApproval.update({ where: { id: approvalId }, data: { status: 'CHANGES_REQUESTED' } })
    notifyMock.mockClear()
    await expect(rejectVoucher(prisma, dummyRedis, approvalId, ADMIN_ID, 'no', ctx)).rejects.toThrow('VOUCHER_NOT_ACTIONABLE')
    expect((await prisma.voucher.findUnique({ where: { id: voucherId } }))?.status).toBe('DRAFT')
    expect(notifyMock).not.toHaveBeenCalled()
  })

  // Fix 6 (negative): a non-VOUCHER approval id surfaces APPROVAL_NOT_ACTIONABLE
  // (the type gate runs before the voucher lookup).
  it('non-VOUCHER approval type -> APPROVAL_NOT_ACTIONABLE on reject', async () => {
    const { merchantId } = await makeMerchant('Reject Wrong Type Co', 'ACTIVE')
    const approval = await prisma.adminApproval.create({
      data: { type: 'MERCHANT_ONBOARDING', status: 'PENDING', referenceId: merchantId, referenceType: 'merchant' },
    })
    notifyMock.mockClear()
    await expect(rejectVoucher(prisma, dummyRedis, approval.id, ADMIN_ID, 'no', ctx)).rejects.toThrow('APPROVAL_NOT_ACTIONABLE')
    expect(notifyMock).not.toHaveBeenCalled()
  })
})

describe('A5/A6: requestVoucherChanges concierge (real DB)', () => {
  it('writes adminProposed (present keys only) + adminNote; voucher DRAFT/CHANGES_REQUESTED; approval CHANGES_REQUESTED; notify', async () => {
    const { merchantId } = await makeMerchant('Changes Co', 'ACTIVE')
    const { voucherId, approvalId } = await makeSubmittedVoucher(merchantId, {
      merchantFields: { askHelp: true, existingKey: 'keep' },
    })

    const res = await requestVoucherChanges(prisma, dummyRedis, approvalId, ADMIN_ID, {
      proposed: { title: 'Better lunch deal', estimatedSaving: 15 },
      note: 'Please raise the saving and tighten the title.',
    }, ctx)
    expect(res).toEqual({ changesRequested: true })

    const v = await prisma.voucher.findUnique({ where: { id: voucherId } })
    expect(v?.status).toBe('DRAFT')
    expect(v?.approvalStatus).toBe('CHANGES_REQUESTED')
    const bag = v?.merchantFields as Record<string, unknown>
    expect(bag.askHelp).toBe(true) // existing keys preserved (merge, not replace)
    expect(bag.existingKey).toBe('keep')
    expect(bag.adminProposed).toEqual({ title: 'Better lunch deal', estimatedSaving: 15 })
    expect(bag.adminNote).toBe('Please raise the saving and tighten the title.')

    const ap = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(ap?.status).toBe('CHANGES_REQUESTED')

    expect(notifyMock.mock.calls[0][2].type).toBe('voucher_changes_requested')
    expect(notifyMock.mock.calls[0][2].inApp.notificationType).toBe('VOUCHER_APPROVAL_UPDATE')
  })

  it('comment-only (no proposed) does NOT write adminProposed', async () => {
    const { merchantId } = await makeMerchant('Comment Only Co', 'ACTIVE')
    const { voucherId, approvalId } = await makeSubmittedVoucher(merchantId, { merchantFields: { askHelp: false } })

    await requestVoucherChanges(prisma, dummyRedis, approvalId, ADMIN_ID, { note: 'Add clearer terms.' }, ctx)

    const bag = (await prisma.voucher.findUnique({ where: { id: voucherId } }))?.merchantFields as Record<string, unknown>
    expect(bag).not.toHaveProperty('adminProposed')
    expect(bag.adminNote).toBe('Add clearer terms.')
  })

  it('NEVER blind-spreads proposed: a malformed estimatedSaving + a non-string title are dropped, valid keys kept', async () => {
    const { merchantId } = await makeMerchant('Malformed Proposed Co', 'ACTIVE')
    const { voucherId, approvalId } = await makeSubmittedVoucher(merchantId)

    await requestVoucherChanges(prisma, dummyRedis, approvalId, ADMIN_ID, {
      proposed: {
        title: 123 as any, // non-string -> dropped
        description: 'Valid text', // string -> kept
        estimatedSaving: 'lots' as any, // non-finite -> dropped
        terms: 'Valid terms', // string -> kept
      } as any,
      note: 'Cleaned proposal.',
    }, ctx)

    const bag = (await prisma.voucher.findUnique({ where: { id: voucherId } }))?.merchantFields as Record<string, unknown>
    const proposed = bag.adminProposed as Record<string, unknown>
    expect(proposed).toEqual({ description: 'Valid text', terms: 'Valid terms' })
    expect(proposed).not.toHaveProperty('title')
    expect(proposed).not.toHaveProperty('estimatedSaving')
  })

  // Fix 6 (buildAdminProposed via the service): estimatedSaving:0 (not > 0) AND a
  // column-overflowing value (>= 1e8) are both DROPPED from adminProposed; the
  // valid string key survives.
  it('drops estimatedSaving:0 and estimatedSaving >= 1e8 from adminProposed; keeps valid string', async () => {
    const { merchantId } = await makeMerchant('Saving Edge Proposed Co', 'ACTIVE')
    const zero = await makeSubmittedVoucher(merchantId)
    await requestVoucherChanges(prisma, dummyRedis, zero.approvalId, ADMIN_ID, {
      proposed: { title: 'Kept', estimatedSaving: 0 } as any,
      note: 'Zero saving dropped.',
    }, ctx)
    const zeroBag = (await prisma.voucher.findUnique({ where: { id: zero.voucherId } }))?.merchantFields as Record<string, unknown>
    expect(zeroBag.adminProposed).toEqual({ title: 'Kept' })

    const over = await makeSubmittedVoucher(merchantId)
    await requestVoucherChanges(prisma, dummyRedis, over.approvalId, ADMIN_ID, {
      proposed: { title: 'Kept', estimatedSaving: 100000000 } as any,
      note: 'Overflow saving dropped.',
    }, ctx)
    const overBag = (await prisma.voucher.findUnique({ where: { id: over.voucherId } }))?.merchantFields as Record<string, unknown>
    expect(overBag.adminProposed).toEqual({ title: 'Kept' })
  })

  // Fix 1 (entity-status guard): a DRAFT voucher (CHANGES_REQUESTED approval) is
  // not genuinely submitted, so request-changes re-validates the voucher status.
  it('voucher status DRAFT (CHANGES_REQUESTED) -> VOUCHER_NOT_ACTIONABLE on request-changes', async () => {
    const { merchantId } = await makeMerchant('Changes Draft Co', 'ACTIVE')
    const { voucherId, approvalId } = await makeSubmittedVoucher(merchantId, {
      status: 'DRAFT',
      approvalStatus: 'CHANGES_REQUESTED',
      merchantFields: { askHelp: true },
    })
    await prisma.adminApproval.update({ where: { id: approvalId }, data: { status: 'CHANGES_REQUESTED' } })
    notifyMock.mockClear()
    await expect(
      requestVoucherChanges(prisma, dummyRedis, approvalId, ADMIN_ID, { note: 'again' }, ctx),
    ).rejects.toThrow('VOUCHER_NOT_ACTIONABLE')
    expect((await prisma.voucher.findUnique({ where: { id: voucherId } }))?.status).toBe('DRAFT')
    expect(notifyMock).not.toHaveBeenCalled()
  })

  // Fix 6 (negative): a non-VOUCHER approval id surfaces APPROVAL_NOT_ACTIONABLE.
  it('non-VOUCHER approval type -> APPROVAL_NOT_ACTIONABLE on request-changes', async () => {
    const { merchantId } = await makeMerchant('Changes Wrong Type Co', 'ACTIVE')
    const approval = await prisma.adminApproval.create({
      data: { type: 'MERCHANT_ONBOARDING', status: 'PENDING', referenceId: merchantId, referenceType: 'merchant' },
    })
    notifyMock.mockClear()
    await expect(
      requestVoucherChanges(prisma, dummyRedis, approval.id, ADMIN_ID, { note: 'x' }, ctx),
    ).rejects.toThrow('APPROVAL_NOT_ACTIONABLE')
    expect(notifyMock).not.toHaveBeenCalled()
  })
})
