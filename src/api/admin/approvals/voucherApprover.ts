import { PrismaClient } from '../../../../generated/prisma/client'
import type { Redis } from 'ioredis'
import { AppError } from '../../shared/errors'
import { writeAuditLogTx } from '../../shared/audit'
import { getMerchantOwner } from './service'
import { notify } from '../../shared/notify'
import {
  voucherApprovedLiveEmail,
  voucherApprovedWaitingEmail,
  voucherChangesRequestedEmail,
  voucherRejectedEmail,
} from '../../shared/merchantEmails'

// Day-2 Vouchers PR-A (A5/A6): the VOUCHER AdminApproval lane. Mirrors the
// Option B editApplier.ts structure (getReviewContext / approve / reject /
// request-changes, local safeNotify, post-commit best-effort owner notify, and
// the NEVER-blind-spread allow-list for the concierge proposal).
//
// Model 1 - approve-early, activate-delayed (spec §4):
//   approveVoucher always sets approvalStatus:APPROVED. It additionally flips
//   status:ACTIVE ONLY when the merchant is ACTIVE AND every flagship RMV is
//   already ACTIVE (goLive). Otherwise the voucher is "approved-waiting"
//   (approvalStatus:APPROVED + status:PENDING_APPROVAL) and is activated later
//   by the onboarding-approve transaction (A7).
//
// §11 HONESTY-NOTE INVARIANTS pinned here (do NOT regress):
//   (1) "approved-waiting" is the NEW combination status:PENDING_APPROVAL +
//       approvalStatus:APPROVED. No existing query assumes PENDING_APPROVAL
//       implies approvalStatus:PENDING - customer queries gate on status:ACTIVE
//       (so an approved-waiting voucher is correctly invisible), and the merchant
//       edit/submit/delete paths gate on status:DRAFT (so it is correctly
//       immutable to the merchant). Pinned by
//       tests/api/merchant/voucher-approved-waiting-invariants.test.ts.
//   (2) the admin actionable queue keys "needs review" off AdminApproval.status
//       (PENDING/CLAIMED), NOT the voucher status. Every decision here flips the
//       AdminApproval to a terminal status (APPROVED / REJECTED) or
//       CHANGES_REQUESTED, so an approved-waiting voucher (its AdminApproval is
//       APPROVED) never re-surfaces in listApprovals({status:'PENDING'}).
//       Pinned by the same invariants test.

type AuditCtx = { ipAddress: string; userAgent: string }

// Actionable while PENDING (submitted/resubmitted) or CHANGES_REQUESTED (the
// merchant resubmits after a concierge round). Mirrors the actioner's
// ACTIONABLE_STATUSES (service.ts).
const ACTIONABLE_STATUSES = ['PENDING', 'CHANGES_REQUESTED'] as const

// The concierge proposal allow-list: the merchant-authored TOP-LEVEL voucher
// fields an admin may propose a change to. proposed is NEVER blind-spread into
// the bag; only these keys, present-and-type-valid, are written under
// merchantFields.adminProposed. Mirrors editApplier's pickAllowed philosophy.
const PROPOSAL_STRING_FIELDS = ['title', 'description', 'terms', 'imageUrl'] as const
// estimatedSaving is a Decimal(10,2); reject a proposal value that would overflow.
const SAVING_COLUMN_MAX = 100000000

/**
 * Best-effort owner notify, mirroring the actioner's safeNotify (service.ts):
 * a notify/enqueue failure must NEVER fail an already-committed decision. The
 * email channel for voucher decisions is dark/deferred this milestone (notify()
 * requires an email payload, so we build + pass real templates, but delivery
 * stays off) - the user-visible signal is the in-app VOUCHER_APPROVAL_UPDATE.
 */
async function safeNotify(
  prisma: PrismaClient,
  redis: Redis,
  input: Parameters<typeof notify>[2],
): Promise<void> {
  try {
    await notify(prisma, redis, input)
  } catch (err) {
    console.warn(
      `[voucher-approver] best-effort notify '${input.type}' (recipient ${input.recipientId}) failed: action committed, NOT rolled back:`,
      err,
    )
  }
}

/**
 * Build the merchantFields.adminProposed sub-object from a raw proposal,
 * type-guarded per field. NEVER blind-spreads: a key absent from the proposal,
 * or present with a malformed value (non-string string-field, non-finite or
 * out-of-range estimatedSaving), is DROPPED so a poisoned proposal can never
 * reach Prisma as a wrong-typed / overflowing value. Returns {} when nothing
 * valid was proposed (caller decides whether to write adminProposed at all).
 */
function buildAdminProposed(proposed: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of PROPOSAL_STRING_FIELDS) {
    if (field in proposed && typeof proposed[field] === 'string') {
      out[field] = proposed[field]
    }
  }
  if ('estimatedSaving' in proposed) {
    const s = proposed.estimatedSaving
    if (typeof s === 'number' && Number.isFinite(s) && s > 0) {
      // Round to scale 2 (matching what Postgres would store) and reject overflow.
      const rounded = Math.round(s * 100) / 100
      if (rounded < SAVING_COLUMN_MAX) out.estimatedSaving = rounded
    }
  }
  return out
}

// ── Voucher review context (the curated diff source) ────────────────────────

export interface VoucherReviewContext {
  voucher: {
    id: string
    title: string
    type: string
    status: string
    approvalStatus: string
    description: string | null
    terms: string | null
    estimatedSaving: number
    expiryDate: Date | null
    cooldownSeconds: number | null
    merchantFields: Record<string, unknown> | null
    availabilityWindows: { dayOfWeek: number; openTime: string; closeTime: string }[]
  }
  merchant: { id: string; businessName: string; status: string } | null
  /** Pre-computed go-live hint: merchant ACTIVE AND every flagship RMV ACTIVE. */
  goLive: boolean
}

/**
 * Resolve the VOUCHER approval -> a curated review context (gated approval:read).
 * No PII, no redemptionPin, no raw relations. estimatedSaving coerced to Number
 * (Prisma Decimal serialises as string). Throws APPROVAL_NOT_ACTIONABLE for a
 * non-VOUCHER approval type (the route also dispatches only VOUCHER here).
 */
export async function getVoucherReviewContext(prisma: PrismaClient, approvalId: string): Promise<VoucherReviewContext> {
  const approval = await prisma.adminApproval.findUnique({
    where: { id: approvalId },
    select: { id: true, type: true, referenceId: true },
  })
  if (!approval) throw new AppError('APPROVAL_NOT_FOUND')
  if (approval.type !== 'VOUCHER') throw new AppError('APPROVAL_NOT_ACTIONABLE')

  const voucher = await prisma.voucher.findFirst({
    where: { id: approval.referenceId, isRmv: false },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      approvalStatus: true,
      description: true,
      terms: true,
      estimatedSaving: true,
      expiryDate: true,
      cooldownSeconds: true,
      merchantFields: true,
      merchantId: true,
      availabilityWindows: { select: { dayOfWeek: true, openTime: true, closeTime: true } },
    },
  })
  if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')

  const merchant = await prisma.merchant.findUnique({
    where: { id: voucher.merchantId },
    select: { id: true, businessName: true, status: true },
  })

  const goLive = merchant?.status === 'ACTIVE' && (await isFlagshipLive(prisma, voucher.merchantId))

  return {
    voucher: {
      id: voucher.id,
      title: voucher.title,
      type: voucher.type as unknown as string,
      status: voucher.status as unknown as string,
      approvalStatus: voucher.approvalStatus as unknown as string,
      description: voucher.description,
      terms: voucher.terms,
      estimatedSaving: Number(voucher.estimatedSaving),
      expiryDate: voucher.expiryDate,
      cooldownSeconds: voucher.cooldownSeconds,
      merchantFields: (voucher.merchantFields as Record<string, unknown> | null) ?? null,
      availabilityWindows: voucher.availabilityWindows,
    },
    merchant,
    goLive,
  }
}

/** A merchant's flagship RMVs are "live" when NONE of them is in a non-ACTIVE status. */
async function isFlagshipLive(
  client: { voucher: { count: (args: any) => Promise<number> } },
  merchantId: string,
): Promise<boolean> {
  const notLive = await client.voucher.count({
    where: { merchantId, isRmv: true, status: { not: 'ACTIVE' } },
  })
  return notLive === 0
}

// ── Decisions ───────────────────────────────────────────────────────────────

/**
 * Approve a submitted custom voucher (Model 1). One transaction:
 *   - resolve + validate the approval (VOUCHER type, actionable status) and the
 *     custom voucher (isRmv:false else VOUCHER_NOT_FOUND),
 *   - compute goLive = merchant ACTIVE AND flagship RMVs live,
 *   - set approvalStatus:APPROVED (+ approvedBy/approvedAt); flip status:ACTIVE
 *     ONLY when goLive (else keep PENDING_APPROVAL -> approved-waiting),
 *   - flip the AdminApproval -> APPROVED (clear any claim),
 *   - write a transactional ADMIN audit (before/after status+approvalStatus).
 * After commit: best-effort notify the owner (live vs waiting copy).
 */
export async function approveVoucher(
  prisma: PrismaClient,
  redis: Redis,
  approvalId: string,
  adminId: string,
  ctx: AuditCtx,
) {
  const result = await prisma.$transaction(async (tx) => {
    const approval = await tx.adminApproval.findUnique({
      where: { id: approvalId },
      select: { id: true, type: true, status: true, referenceId: true },
    })
    if (!approval) throw new AppError('APPROVAL_NOT_FOUND')
    if (approval.type !== 'VOUCHER') throw new AppError('APPROVAL_NOT_ACTIONABLE')
    if (!ACTIONABLE_STATUSES.includes(approval.status as (typeof ACTIONABLE_STATUSES)[number])) {
      throw new AppError('APPROVAL_NOT_ACTIONABLE')
    }

    const voucher = await tx.voucher.findFirst({
      where: { id: approval.referenceId, isRmv: false },
      select: { id: true, merchantId: true, title: true, status: true, approvalStatus: true },
    })
    if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')
    // Fix 1 (entity-status guard): re-validate the voucher's OWN status. The
    // AdminApproval may be actionable (CHANGES_REQUESTED) while the voucher is still
    // DRAFT (merchant has not resubmitted), so approving here would force-publish a
    // DRAFT and bypass resubmit/re-review. Only a genuinely-submitted
    // (PENDING_APPROVAL) voucher can be approved. (This also guarantees publishedAt
    // is never set on a DRAFT.)
    if (voucher.status !== 'PENDING_APPROVAL') throw new AppError('VOUCHER_NOT_ACTIONABLE')

    const merchant = await tx.merchant.findUnique({
      where: { id: voucher.merchantId },
      select: { status: true },
    })
    const goLive = merchant?.status === 'ACTIVE' && (await isFlagshipLive(tx, voucher.merchantId))

    const now = new Date()
    await tx.voucher.update({
      where: { id: voucher.id },
      data: {
        approvalStatus: 'APPROVED',
        approvedBy: adminId,
        approvedAt: now,
        ...(goLive ? { status: 'ACTIVE' } : {}), // else keep PENDING_APPROVAL (approved-waiting)
      },
    })
    await tx.adminApproval.update({
      where: { id: approvalId },
      data: { status: 'APPROVED', adminUserId: adminId, actionedAt: now, claimedById: null, claimedAt: null },
    })
    await writeAuditLogTx(tx, {
      entityId: voucher.merchantId,
      entityType: 'merchant',
      event: 'VOUCHER_APPROVED',
      actorId: adminId,
      actorType: 'ADMIN',
      before: { status: voucher.status, approvalStatus: voucher.approvalStatus },
      after: { status: goLive ? 'ACTIVE' : voucher.status, approvalStatus: 'APPROVED' },
      metadata: { voucherId: voucher.id, goLive },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return { merchantId: voucher.merchantId, voucherId: voucher.id, title: voucher.title, goLive }
  })

  const owner = await getMerchantOwner(prisma, result.merchantId)
  if (owner) {
    const email = result.goLive ? voucherApprovedLiveEmail(result.title) : voucherApprovedWaitingEmail(result.title)
    await safeNotify(prisma, redis, {
      to: owner.email,
      recipientType: 'MERCHANT_ADMIN',
      recipientId: owner.adminId,
      type: result.goLive ? 'voucher_approved_live' : 'voucher_approved_waiting',
      email: { ...email, sender: 'merchant' },
      inApp: {
        notificationType: 'VOUCHER_APPROVAL_UPDATE',
        title: result.goLive ? 'Your voucher is approved and live' : 'Your voucher is approved',
        body: result.goLive
          ? 'Members in your area can find and redeem it from today.'
          : 'It will go live automatically once your business and flagship vouchers are live.',
        referenceType: 'voucher',
        referenceId: result.voucherId,
      },
      ip: ctx.ipAddress,
    })
  } else {
    console.warn(
      `[voucher-approver] approve committed for voucher ${result.voucherId} but no ACTIVE OWNER membership found: merchant NOT notified`,
    )
  }
  return { approved: true as const, goLive: result.goLive }
}

/**
 * Reject a submitted custom voucher. One transaction: validate (VOUCHER type,
 * actionable, isRmv:false), set voucher status:INACTIVE / approvalStatus:REJECTED,
 * flip the AdminApproval -> REJECTED (comment=reason, clear claim), write a
 * transactional ADMIN audit carrying the reason. After commit: notify the owner.
 */
export async function rejectVoucher(
  prisma: PrismaClient,
  redis: Redis,
  approvalId: string,
  adminId: string,
  reason: string,
  ctx: AuditCtx,
) {
  const result = await prisma.$transaction(async (tx) => {
    const approval = await tx.adminApproval.findUnique({
      where: { id: approvalId },
      select: { id: true, type: true, status: true, referenceId: true },
    })
    if (!approval) throw new AppError('APPROVAL_NOT_FOUND')
    if (approval.type !== 'VOUCHER') throw new AppError('APPROVAL_NOT_ACTIONABLE')
    if (!ACTIONABLE_STATUSES.includes(approval.status as (typeof ACTIONABLE_STATUSES)[number])) {
      throw new AppError('APPROVAL_NOT_ACTIONABLE')
    }

    const voucher = await tx.voucher.findFirst({
      where: { id: approval.referenceId, isRmv: false },
      select: { id: true, merchantId: true, title: true, status: true, approvalStatus: true },
    })
    if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')
    // Fix 1 (entity-status guard): only a genuinely-submitted (PENDING_APPROVAL)
    // voucher can be rejected. A DRAFT (CHANGES_REQUESTED approval) is not
    // submitted, so re-validate the entity status.
    if (voucher.status !== 'PENDING_APPROVAL') throw new AppError('VOUCHER_NOT_ACTIONABLE')

    const now = new Date()
    await tx.voucher.update({
      where: { id: voucher.id },
      data: { status: 'INACTIVE', approvalStatus: 'REJECTED' },
    })
    await tx.adminApproval.update({
      where: { id: approvalId },
      data: { status: 'REJECTED', comment: reason, adminUserId: adminId, actionedAt: now, claimedById: null, claimedAt: null },
    })
    await writeAuditLogTx(tx, {
      entityId: voucher.merchantId,
      entityType: 'merchant',
      event: 'VOUCHER_REJECTED',
      actorId: adminId,
      actorType: 'ADMIN',
      reason,
      before: { status: voucher.status, approvalStatus: voucher.approvalStatus },
      after: { status: 'INACTIVE', approvalStatus: 'REJECTED' },
      metadata: { voucherId: voucher.id },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return { merchantId: voucher.merchantId, voucherId: voucher.id, title: voucher.title }
  })

  const owner = await getMerchantOwner(prisma, result.merchantId)
  if (owner) {
    await safeNotify(prisma, redis, {
      to: owner.email,
      recipientType: 'MERCHANT_ADMIN',
      recipientId: owner.adminId,
      type: 'voucher_rejected',
      email: { ...voucherRejectedEmail(result.title, reason), sender: 'merchant' },
      inApp: {
        notificationType: 'VOUCHER_APPROVAL_UPDATE',
        title: 'Update on your voucher',
        body: 'We were unable to approve this voucher. Open the portal for details.',
        referenceType: 'voucher',
        referenceId: result.voucherId,
      },
      ip: ctx.ipAddress,
    })
  } else {
    console.warn(
      `[voucher-approver] reject committed for voucher ${result.voucherId} but no ACTIVE OWNER membership found: merchant NOT notified`,
    )
  }
  return { rejected: true as const }
}

/**
 * Request changes (the concierge round). One transaction: validate (VOUCHER type,
 * actionable, isRmv:false), MERGE merchantFields = { ...existing,
 * ...(proposed valid keys ? { adminProposed } : {}), adminNote: note } - proposed
 * is NEVER blind-spread (buildAdminProposed allow-lists + type-guards each key); a
 * comment-only call (no valid proposed) writes adminNote but NOT adminProposed.
 * Voucher -> status:DRAFT / approvalStatus:CHANGES_REQUESTED; AdminApproval ->
 * CHANGES_REQUESTED. Audit. After commit: notify the owner.
 */
export async function requestVoucherChanges(
  prisma: PrismaClient,
  redis: Redis,
  approvalId: string,
  adminId: string,
  input: { proposed?: Record<string, unknown>; note: string },
  ctx: AuditCtx,
) {
  const result = await prisma.$transaction(async (tx) => {
    const approval = await tx.adminApproval.findUnique({
      where: { id: approvalId },
      select: { id: true, type: true, status: true, referenceId: true },
    })
    if (!approval) throw new AppError('APPROVAL_NOT_FOUND')
    if (approval.type !== 'VOUCHER') throw new AppError('APPROVAL_NOT_ACTIONABLE')
    if (!ACTIONABLE_STATUSES.includes(approval.status as (typeof ACTIONABLE_STATUSES)[number])) {
      throw new AppError('APPROVAL_NOT_ACTIONABLE')
    }

    const voucher = await tx.voucher.findFirst({
      where: { id: approval.referenceId, isRmv: false },
      select: { id: true, merchantId: true, title: true, status: true, approvalStatus: true, merchantFields: true },
    })
    if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')
    // Fix 1 (entity-status guard): only a genuinely-submitted (PENDING_APPROVAL)
    // voucher can have changes requested. A voucher already in DRAFT
    // (CHANGES_REQUESTED approval) has not been resubmitted; re-validate the entity.
    if (voucher.status !== 'PENDING_APPROVAL') throw new AppError('VOUCHER_NOT_ACTIONABLE')

    const currentBag = (voucher.merchantFields as Record<string, unknown> | null) ?? {}
    const adminProposed = input.proposed ? buildAdminProposed(input.proposed) : {}
    const mergedBag: Record<string, unknown> = {
      ...currentBag,
      ...(Object.keys(adminProposed).length > 0 ? { adminProposed } : {}),
      adminNote: input.note,
    }

    const now = new Date()
    await tx.voucher.update({
      where: { id: voucher.id },
      data: { status: 'DRAFT', approvalStatus: 'CHANGES_REQUESTED', merchantFields: mergedBag as any },
    })
    await tx.adminApproval.update({
      where: { id: approvalId },
      data: { status: 'CHANGES_REQUESTED', comment: input.note, adminUserId: adminId, actionedAt: now, claimedById: null, claimedAt: null },
    })
    await writeAuditLogTx(tx, {
      entityId: voucher.merchantId,
      entityType: 'merchant',
      event: 'VOUCHER_CHANGES_REQUESTED',
      actorId: adminId,
      actorType: 'ADMIN',
      reason: input.note,
      before: { status: voucher.status, approvalStatus: voucher.approvalStatus },
      after: { status: 'DRAFT', approvalStatus: 'CHANGES_REQUESTED' },
      metadata: { voucherId: voucher.id, proposedKeys: Object.keys(adminProposed) },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return { merchantId: voucher.merchantId, voucherId: voucher.id, title: voucher.title }
  })

  const owner = await getMerchantOwner(prisma, result.merchantId)
  if (owner) {
    await safeNotify(prisma, redis, {
      to: owner.email,
      recipientType: 'MERCHANT_ADMIN',
      recipientId: owner.adminId,
      type: 'voucher_changes_requested',
      email: { ...voucherChangesRequestedEmail(result.title, input.note), sender: 'merchant' },
      inApp: {
        notificationType: 'VOUCHER_APPROVAL_UPDATE',
        title: 'Changes requested on your voucher',
        body: 'We need a few changes before we can approve this voucher. Open the portal to see what to update.',
        referenceType: 'voucher',
        referenceId: result.voucherId,
      },
      ip: ctx.ipAddress,
    })
  } else {
    console.warn(
      `[voucher-approver] request-changes committed for voucher ${result.voucherId} but no ACTIVE OWNER membership found: merchant NOT notified`,
    )
  }
  return { changesRequested: true as const }
}
