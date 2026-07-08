import { PrismaClient } from '../../../../generated/prisma/client'
import type { Redis } from 'ioredis'
import { AppError } from '../../shared/errors'
import { writeAuditLogTx } from '../../shared/audit'
import { isBranchLocationConfirmed } from '../../shared/location'
import { getMerchantOwner } from './service'
import { notify } from '../../shared/notify'
import { revokeAllSessionsForEntity, revokeAllUserSessionRecords } from '../../shared/session'
import {
  branchCreateApprovedEmail,
  branchCreateRejectedEmail,
  branchCloseApprovedEmail,
  branchCloseRejectedEmail,
} from '../../shared/merchantEmails'

// Branches PR-5 (D5) — the admin branch-lifecycle APPLIER. Makes the
// BRANCH_CREATE / BRANCH_CLOSE AdminApproval rows (written by the merchant
// create/close-request services in backend-1) actionable.
//
// Mirrors editApplier.ts: dispatch on approval.type (NEVER referenceType), one
// $transaction per action, exactly-once compare-and-set status flips, an
// in-transaction ADMIN-actor audit with before/after, and a best-effort owner
// notify AFTER commit. A branch-lifecycle approval's referenceId IS the branch
// id directly (no PendingEdit indirection).
//
// CREATE-approve reuses the location-confirm gate (isBranchLocationConfirmed):
// an admin must have moved the branch POSTCODE_CENTROID -> MANUALLY_CONFIRMED via
// the SEPARATE confirm-location flow (src/api/admin/branches/service.ts) before
// the branch can go LIVE. We do NOT build a second confirmation mechanism.
//
// CREATE-reject (recorded default — the mini-spec §4 is silent on the exact
// reject status): the approval -> CHANGES_REQUESTED with the reason, the branch
// STAYS PENDING_CREATE (customer-invisible). We do NOT delete the branch on
// reject — the merchant OWNS the cancel path (cancelPendingCreate). The merchant
// is notified to fix-and-resubmit or cancel. CHANGES_REQUESTED (not REJECTED) is
// chosen because the create is reopenable: the merchant can update the branch and
// the admin can re-approve the same row, mirroring the onboarding actioner's
// reopenable CHANGES_REQUESTED semantics.
//
// CLOSE-approve: re-check not-main / not-last-active (defence; checked at request
// time too), run the softDeleteBranchCore deactivation semantics (deactivate
// BranchUser staff + deletedAt + isActive=false + BRANCH_DELETED audit) AND set
// lifecycleStatus = CLOSED, flip the approval APPROVED.
//
// CLOSE-reject: revert lifecycleStatus = LIVE + clear closeReason (the branch was
// live throughout), approval -> REJECTED + reason.

type AuditCtx = { ipAddress: string; userAgent: string }

type LifecycleKind = 'create' | 'close'

/** Map a branch-lifecycle approval type to its kind. Returns null otherwise. */
function branchLifecycleKindOf(type: string): LifecycleKind | null {
  if (type === 'BRANCH_CREATE') return 'create'
  if (type === 'BRANCH_CLOSE') return 'close'
  return null
}

/**
 * Best-effort owner notify, mirroring editApplier.safeNotify: a notify/enqueue
 * failure must NEVER fail an already-committed apply/reject.
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
      `[branch-lifecycle-applier] best-effort notify '${input.type}' (recipient ${input.recipientId}) failed: action committed, NOT rolled back:`,
      err,
    )
  }
}

/**
 * Approve a branch-lifecycle approval (BRANCH_CREATE -> go LIVE, BRANCH_CLOSE ->
 * deactivate + CLOSED). One $transaction; exactly-once compare-and-set; ADMIN
 * audit; best-effort owner notify after commit.
 *
 * Idempotent: a double-approve is a safe no-op (the conditional updateMany matches
 * 0 rows once the branch has already transitioned, and the now-APPROVED approval
 * short-circuits the actionable-status guard).
 */
export async function approveBranchLifecycle(
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

    const kind = branchLifecycleKindOf(approval.type)
    if (kind === null) throw new AppError('APPROVAL_NOT_ACTIONABLE')

    // Idempotency: a branch-lifecycle approval is only actionable while PENDING.
    // A duplicate/concurrent approve that finds the approval already APPROVED is a
    // safe no-op signalled via alreadyDone (no re-flip, no re-notify).
    if (approval.status !== 'PENDING') {
      return { alreadyDone: true as const }
    }

    const now = new Date()

    if (kind === 'create') {
      // The referenceId IS the branch id directly.
      const branch = await tx.branch.findUnique({
        where: { id: approval.referenceId },
        select: {
          id: true, name: true, merchantId: true,
          lifecycleStatus: true, isActive: true, locationConfidence: true,
        },
      })
      if (!branch) throw new AppError('BRANCH_NOT_FOUND')

      // CREATE location gate (reuse the confirm-location flow): the admin must have
      // moved POSTCODE_CENTROID -> MANUALLY_CONFIRMED via confirmBranchLocation
      // before the branch can go live. Mirrors the onboarding go-live gate.
      if (!isBranchLocationConfirmed(branch)) throw new AppError('MAIN_BRANCH_LOCATION_UNCONFIRMED')

      // Win the LIVE flip EXACTLY ONCE (concurrency-safe). Conditional updateMany:
      // only a still-PENDING_CREATE branch transitions. If a concurrent approve
      // already flipped it LIVE this matches 0 rows -> idempotent no-op.
      const won = await tx.branch.updateMany({
        where: { id: branch.id, lifecycleStatus: 'PENDING_CREATE' },
        data: { lifecycleStatus: 'LIVE', isActive: true },
      })
      if (won.count === 0) {
        return { alreadyDone: true as const }
      }

      await tx.adminApproval.update({
        where: { id: approvalId },
        data: { status: 'APPROVED', adminUserId: adminId, actionedAt: now, claimedById: null, claimedAt: null },
      })
      await writeAuditLogTx(tx, {
        entityId: branch.id,
        entityType: 'branch',
        event: 'BRANCH_CREATE_APPROVED',
        actorId: adminId,
        actorType: 'ADMIN',
        before: { lifecycleStatus: 'PENDING_CREATE', isActive: branch.isActive },
        after: { lifecycleStatus: 'LIVE', isActive: true },
        metadata: { merchantId: branch.merchantId },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
      return {
        kind: 'create' as const,
        merchantId: branch.merchantId,
        branchName: branch.name,
      }
    }

    // kind === 'close'
    const branch = await tx.branch.findUnique({
      where: { id: approval.referenceId },
      select: {
        id: true, name: true, merchantId: true,
        lifecycleStatus: true, isMainBranch: true, isActive: true, deletedAt: true,
      },
    })
    if (!branch) throw new AppError('BRANCH_NOT_FOUND')

    // Win the CLOSE flip EXACTLY ONCE: only a still-PENDING_CLOSE branch closes.
    // A concurrent approve that already closed it matches 0 rows -> idempotent.
    // (Checked here before the defensive guards so a double-close is a clean no-op
    // rather than tripping a guard on the now-deleted/already-closed row.)
    if (branch.lifecycleStatus !== 'PENDING_CLOSE') {
      return { alreadyDone: true as const }
    }

    // Defence-in-depth: re-check the not-main / not-last-active invariants at
    // approval time (they were checked at request time too — reuse the same
    // BRANCH_IS_MAIN / BRANCH_LAST_ACTIVE semantics/messages).
    if (branch.isMainBranch) throw new AppError('BRANCH_IS_MAIN')
    const merchant = await tx.merchant.findUnique({ where: { id: branch.merchantId }, select: { status: true } })
    if (merchant?.status === 'ACTIVE') {
      const activeBranchCount = await tx.branch.count({
        where: { merchantId: branch.merchantId, isActive: true, deletedAt: null },
      })
      if (activeBranchCount <= 1) throw new AppError('BRANCH_LAST_ACTIVE')
    }

    // softDeleteBranchCore-equivalent deactivation (run inline so the CLOSED flip,
    // the soft-delete, and the audit all commit atomically with the approval flip):
    // deactivate staff logins + set deletedAt + isActive=false + lifecycleStatus=CLOSED.
    // Capture the ACTIVE staff being deactivated so their live sessions can be revoked
    // AFTER commit (Redis is not transactional) — H4: a branch close must terminate
    // branch-staff sessions, not leave them refreshing for the 90-day refresh TTL.
    const closedStaff = await tx.branchUser.findMany({
      where: { branchId: branch.id, status: 'ACTIVE' },
      select: { id: true },
    })
    await tx.branchUser.updateMany({ where: { branchId: branch.id }, data: { status: 'INACTIVE' } })
    await tx.branch.update({
      where: { id: branch.id },
      data: { lifecycleStatus: 'CLOSED', deletedAt: now, isActive: false },
    })
    await tx.adminApproval.update({
      where: { id: approvalId },
      data: { status: 'APPROVED', adminUserId: adminId, actionedAt: now, claimedById: null, claimedAt: null },
    })
    await writeAuditLogTx(tx, {
      entityId: branch.id,
      entityType: 'branch',
      event: 'BRANCH_CLOSE_APPROVED',
      actorId: adminId,
      actorType: 'ADMIN',
      before: { lifecycleStatus: 'PENDING_CLOSE', isActive: branch.isActive, deletedAt: branch.deletedAt },
      after: { lifecycleStatus: 'CLOSED', isActive: false, deletedAt: now },
      metadata: { merchantId: branch.merchantId },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return {
      kind: 'close' as const,
      merchantId: branch.merchantId,
      branchName: branch.name,
      branchUserIds: closedStaff.map((s) => s.id),
    }
  })

  if ('alreadyDone' in result) return { approved: true as const, alreadyDone: true as const }

  // H4: after commit, revoke the deactivated branch staff's live sessions
  // (best-effort; mirrors deactivateBranchUser). The refresh-time branch status
  // re-check already blocks re-auth (BranchUser.status = INACTIVE); revoking the
  // refresh keys here ensures no device can obtain a new access token. The current
  // access token expires within its ≤15-minute TTL.
  if (result.kind === 'close') {
    for (const branchUserId of result.branchUserIds) {
      // Isolate the two cleanups: a Redis outage on the session-key revoke must
      // NOT skip the DB UserSession-record revoke (and vice-versa). Both are
      // best-effort — a revoke failure must not fail the (committed) approval.
      try {
        await revokeAllSessionsForEntity(redis, { role: 'branch', entityId: branchUserId })
      } catch { /* best-effort */ }
      try {
        await revokeAllUserSessionRecords(prisma, { entityId: branchUserId, entityType: 'branch', reason: 'BRANCH_CLOSED' })
      } catch { /* best-effort */ }
    }
  }

  // After commit (best-effort): notify the merchant owner. branch-lifecycle is not
  // strictly a MERCHANT_VERIFICATION_UPDATE, but there is no branch-specific in-app
  // type; reuse MERCHANT_VERIFICATION_UPDATE (the actioner/editApplier pattern) +
  // branch-lifecycle-specific copy. The bell deep-links to the merchant.
  const owner = await getMerchantOwner(prisma, result.merchantId)
  if (owner) {
    const isCreate = result.kind === 'create'
    await safeNotify(prisma, redis, {
      to: owner.email,
      recipientType: 'MERCHANT_ADMIN',
      recipientId: owner.adminId,
      type: isCreate ? 'branch_create_approved' : 'branch_close_approved',
      email: {
        ...(isCreate ? branchCreateApprovedEmail(result.branchName) : branchCloseApprovedEmail(result.branchName)),
        sender: 'merchant',
      },
      inApp: {
        notificationType: 'MERCHANT_VERIFICATION_UPDATE',
        title: isCreate ? 'Your new branch is live' : 'Your branch has been closed',
        body: isCreate
          ? 'The new branch you requested has been reviewed and is now live on Redeemo.'
          : 'Your request to close the branch has been approved.',
        referenceId: result.merchantId,
        referenceType: 'merchant',
      },
      ip: ctx.ipAddress,
    })
  } else {
    console.warn(
      `[branch-lifecycle-applier] approve committed for merchant ${result.merchantId} but no ACTIVE OWNER membership found: merchant NOT notified`,
    )
  }
  return { approved: true as const, alreadyDone: false as const }
}

/**
 * Reject a branch-lifecycle approval. One $transaction; ADMIN audit; best-effort
 * owner notify after commit.
 *
 * BRANCH_CREATE reject (recorded default): approval -> CHANGES_REQUESTED + reason;
 * the branch STAYS PENDING_CREATE (customer-invisible) — it is NOT deleted (the
 * merchant owns the cancel path). The merchant is notified to fix/resubmit or cancel.
 *
 * BRANCH_CLOSE reject: revert lifecycleStatus = LIVE + clear closeReason (the branch
 * was live throughout); approval -> REJECTED + reason; the merchant is notified.
 */
export async function rejectBranchLifecycle(
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

    const kind = branchLifecycleKindOf(approval.type)
    if (kind === null) throw new AppError('APPROVAL_NOT_ACTIONABLE')
    if (approval.status !== 'PENDING') throw new AppError('APPROVAL_NOT_ACTIONABLE')

    const now = new Date()

    const branch = await tx.branch.findUnique({
      where: { id: approval.referenceId },
      select: { id: true, name: true, merchantId: true, lifecycleStatus: true, closeReason: true },
    })
    if (!branch) throw new AppError('BRANCH_NOT_FOUND')

    if (kind === 'create') {
      // CREATE-reject default: branch STAYS PENDING_CREATE (NOT deleted — merchant
      // owns cancel); approval -> CHANGES_REQUESTED + reason (reopenable).
      await tx.adminApproval.update({
        where: { id: approvalId },
        data: {
          status: 'CHANGES_REQUESTED',
          comment: reason,
          claimedById: null,
          claimedAt: null,
          adminUserId: adminId,
          actionedAt: now,
        },
      })
      await writeAuditLogTx(tx, {
        entityId: branch.id,
        entityType: 'branch',
        event: 'BRANCH_CREATE_CHANGES_REQUESTED',
        actorId: adminId,
        actorType: 'ADMIN',
        reason,
        metadata: { merchantId: branch.merchantId },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
      return { kind: 'create' as const, merchantId: branch.merchantId, branchName: branch.name }
    }

    // kind === 'close'. Revert PENDING_CLOSE -> LIVE + clear closeReason; the branch
    // was live throughout. Approval -> REJECTED + reason.
    await tx.branch.update({
      where: { id: branch.id },
      data: { lifecycleStatus: 'LIVE', closeReason: null },
    })
    await tx.adminApproval.update({
      where: { id: approvalId },
      data: {
        status: 'REJECTED',
        comment: reason,
        claimedById: null,
        claimedAt: null,
        adminUserId: adminId,
        actionedAt: now,
      },
    })
    await writeAuditLogTx(tx, {
      entityId: branch.id,
      entityType: 'branch',
      event: 'BRANCH_CLOSE_REJECTED',
      actorId: adminId,
      actorType: 'ADMIN',
      reason,
      before: { lifecycleStatus: branch.lifecycleStatus, closeReason: branch.closeReason },
      after: { lifecycleStatus: 'LIVE', closeReason: null },
      metadata: { merchantId: branch.merchantId },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return { kind: 'close' as const, merchantId: branch.merchantId, branchName: branch.name }
  })

  // After commit (best-effort): notify the merchant owner.
  const owner = await getMerchantOwner(prisma, result.merchantId)
  if (owner) {
    const isCreate = result.kind === 'create'
    await safeNotify(prisma, redis, {
      to: owner.email,
      recipientType: 'MERCHANT_ADMIN',
      recipientId: owner.adminId,
      type: isCreate ? 'branch_create_rejected' : 'branch_close_rejected',
      email: {
        ...(isCreate
          ? branchCreateRejectedEmail(result.branchName, reason)
          : branchCloseRejectedEmail(result.branchName, reason)),
        sender: 'merchant',
      },
      inApp: {
        notificationType: 'MERCHANT_VERIFICATION_UPDATE',
        title: isCreate ? 'Changes requested on your new branch' : 'Update on your branch close request',
        body: isCreate
          ? 'We need a few changes before your new branch can go live. Open the portal to update or cancel it.'
          : 'We were unable to approve your branch close request. Your branch is still live.',
        referenceId: result.merchantId,
        referenceType: 'merchant',
      },
      ip: ctx.ipAddress,
    })
  } else {
    console.warn(
      `[branch-lifecycle-applier] reject committed for merchant ${result.merchantId} but no ACTIVE OWNER membership found: merchant NOT notified`,
    )
  }
  return { rejected: true as const }
}

// ── Branch-lifecycle review context (the actioner review screen) ─────────────

export interface BranchLifecycleReviewContext {
  kind: LifecycleKind
  merchant: { id: string; businessName: string }
  branch: {
    id: string
    name: string
    addressLine1: string
    addressLine2: string | null
    city: string
    postcode: string
    localityName: string | null
    phone: string | null
    email: string | null
    websiteUrl: string | null
    isMainBranch: boolean
    isActive: boolean
    lifecycleStatus: string
    locationConfidence: string
    latitude: number | null
    longitude: number | null
  }
  closeReason: string | null
}

/**
 * Build the admin actioner review context for a branch-lifecycle approval
 * (gated approval:read). Mirrors getEditReviewContext / getVoucherReviewContext:
 * dispatch on approval.type (NEVER referenceType), throw APPROVAL_NOT_ACTIONABLE
 * for a non-BRANCH_CREATE / non-BRANCH_CLOSE type, and resolve the target via the
 * approval.referenceId (which IS the branch id directly — no PendingEdit
 * indirection). `kind` derives from the type.
 *
 * SECRET EXCLUSION (load-bearing): redemptionPin (and every encrypted/secret
 * field) is NEVER selected — this is a CURATED select, not a blind branch spread,
 * mirroring getReviewContext's branch select (service.ts §"Branches"). lat/lng are
 * Prisma Decimals; normalised to Number (or null) for a JSON-safe payload.
 */
export async function getBranchLifecycleReviewContext(
  prisma: PrismaClient,
  approvalId: string,
): Promise<BranchLifecycleReviewContext> {
  const approval = await prisma.adminApproval.findUnique({
    where: { id: approvalId },
    select: { id: true, type: true, referenceId: true },
  })
  if (!approval) throw new AppError('APPROVAL_NOT_FOUND')

  const kind = branchLifecycleKindOf(approval.type)
  if (kind === null) throw new AppError('APPROVAL_NOT_ACTIONABLE')

  // The referenceId IS the branch id. Curated select — redemptionPin and any
  // other secret/encrypted field is NEVER selected. Resolve the merchant via the
  // branch's merchant relation.
  const branch = await prisma.branch.findUnique({
    where: { id: approval.referenceId },
    select: {
      id: true,
      name: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      postcode: true,
      localityName: true,
      phone: true,
      email: true,
      websiteUrl: true,
      isMainBranch: true,
      isActive: true,
      lifecycleStatus: true,
      locationConfidence: true,
      latitude: true,
      longitude: true,
      closeReason: true,
      // redemptionPin is intentionally omitted — NEVER expose it
      merchant: { select: { id: true, businessName: true } },
    },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')

  return {
    kind,
    merchant: { id: branch.merchant.id, businessName: branch.merchant.businessName },
    branch: {
      id: branch.id,
      name: branch.name,
      addressLine1: branch.addressLine1,
      addressLine2: branch.addressLine2,
      city: branch.city,
      postcode: branch.postcode,
      localityName: branch.localityName,
      phone: branch.phone,
      email: branch.email,
      websiteUrl: branch.websiteUrl,
      isMainBranch: branch.isMainBranch,
      isActive: branch.isActive,
      lifecycleStatus: branch.lifecycleStatus as unknown as string,
      locationConfidence: branch.locationConfidence as unknown as string,
      latitude: normaliseDecimal(branch.latitude),
      longitude: normaliseDecimal(branch.longitude),
    },
    closeReason: branch.closeReason,
  }
}

/**
 * Prisma Decimal (lat/lng) serialises as an object; coerce to a Number (or null).
 * Mirrors editApplier.normaliseDecimal (re-declared here so the applier owns its
 * own helper).
 */
function normaliseDecimal(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number((value as { toString(): string }).toString())
  return Number.isNaN(n) ? null : n
}
