import { PrismaClient } from '../../../../generated/prisma/client'
import type { Redis } from 'ioredis'
import { AppError } from '../../shared/errors'
import { writeAuditLogTx } from '../../shared/audit'
import { getMerchantOwner } from './service'
import { notify } from '../../shared/notify'
import { merchantEditAppliedEmail, merchantEditRejectedEmail } from '../../shared/merchantEmails'

// Option B B1: the admin pending-edit APPLIER. Makes the previously-dead
// MERCHANT_IDENTITY_EDIT / BRANCH_IDENTITY_EDIT AdminApproval rows actionable.
//
// "Act FOR, never AS" (spec constraint 1/4): every write audits actorType ADMIN
// with before/after (+ reason on reject). The applied change is ALWAYS restricted
// to the SENSITIVE allow-list of the target entity: proposedChanges is NEVER
// blind-spread into the update.
//
// Scope is ONLY the two wired edit types. Disambiguate by approval.type, NEVER
// by referenceType (the writers use different casings:
// 'MerchantPendingEdit' vs 'branch_pending_edit').

type AuditCtx = { ipAddress: string; userAgent: string }

// The customer-visible identity fields a merchant may request to change. These
// MIRROR the SENSITIVE_FIELDS lists in merchant/profile/service.ts (line 8) and
// merchant/branch/service.ts (line 49). Re-declared here (not imported) so the
// applier owns its own allow-list and a drift in either writer cannot silently
// widen what the applier writes. Pinned by the allow-list-safety test.
const MERCHANT_SENSITIVE_FIELDS = [
  'businessName', 'tradingName', 'logoUrl', 'bannerUrl', 'description',
] as const

const BRANCH_SENSITIVE_FIELDS = [
  'name', 'about', 'addressLine1', 'addressLine2', 'city', 'postcode',
  'latitude', 'longitude', 'logoUrl', 'bannerUrl',
] as const

// The branch-edit writer (createBranchEditRequest) eagerly resolves a postcode
// change into a full location snapshot and stashes it in proposedChanges. Those
// snapshot fields must be applied VERBATIM alongside the SENSITIVE fields (the
// pin re-anchors to the new postcode at request time, NOT at apply time). They
// are NOT re-resolved here. Kept separate from the customer-visible allow-list
// so the review diff only surfaces the fields a human chose.
const BRANCH_LOCATION_SNAPSHOT_FIELDS = [
  'latitude', 'longitude', 'localityId', 'localityName', 'postTown',
  'ladDistrict', 'adminCounty', 'region', 'locationCountry',
  'locationResolvedAt', 'locationConfidence',
] as const

type EditKind = 'merchant' | 'branch'

/** Map an edit approval type to its kind. Returns null for non-edit types. */
function editKindOf(type: string): EditKind | null {
  if (type === 'MERCHANT_IDENTITY_EDIT') return 'merchant'
  if (type === 'BRANCH_IDENTITY_EDIT') return 'branch'
  return null
}

/**
 * Best-effort owner notify, mirroring the actioner's safeNotify (service.ts):
 * a notify/enqueue failure must NEVER fail an already-committed apply/reject.
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
      `[edit-applier] best-effort notify '${input.type}' (recipient ${input.recipientId}) failed: action committed, NOT rolled back:`,
      err,
    )
  }
}

/** Pick ONLY the allow-listed keys present in `proposed`. Never blind-spread. */
function pickAllowed(proposed: Record<string, unknown>, allow: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of allow) {
    if (key in proposed) out[key] = proposed[key]
  }
  return out
}

/**
 * Branches PR-3 (§5, D-PR3-3): defensively parse a branch photo edit's
 * proposedChanges into an EXPLICIT allow-list — NEVER blind-spread. Mirrors the
 * createBranchPhotoEditRequest writer (branch/service.ts §6a):
 *   - `add`    = newly-uploaded image URLs (non-empty strings),
 *   - `remove` = BranchPhoto IDs (non-empty strings), branch-scoped on delete.
 * Any other key (a smuggled identity field, a moderationStatus override, etc.)
 * is ignored here; the photo apply only ever creates rows from `add` URLs and
 * deletes rows from `remove` IDs.
 */
function parsePhotoChanges(proposed: Record<string, unknown>): { addUrls: string[]; removeIds: string[] } {
  const addUrls = Array.isArray(proposed.add)
    ? (proposed.add as unknown[]).filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    : []
  const removeIds = Array.isArray(proposed.remove)
    ? (proposed.remove as unknown[]).filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []
  return { addUrls, removeIds }
}

/**
 * Apply a merchant-requested identity edit (Option B B1). One transaction:
 *   - resolve + validate the approval (edit type, actionable status) and its
 *     PendingEdit (must still be PENDING),
 *   - PHOTO APPLY (Branches PR-3, §5): a BranchPendingEdit with includesPhotos
 *     creates the proposed `add` URLs as APPROVED BranchPhoto rows (admin approval
 *     IS the moderation gate — never PENDING) appended after the current max
 *     sortOrder, and deletes the proposed `remove` IDs branch-scoped (an ID not on
 *     this branch is silently skipped, NEVER a cross-branch delete). Both `add` and
 *     `remove` are an explicit allow-list — proposedChanges is never blind-spread.
 *     A mixed identity+photo edit applies BOTH the pickAllowed identity fields AND
 *     the photo delta in this one transaction (in practice an edit is either
 *     identity-only or photos-only, but the apply is alongside, not instead of).
 *   - apply ONLY the entity's allow-listed fields (never blind-spread),
 *   - flip both statuses (PendingEdit → APPROVED, AdminApproval → APPROVED),
 *   - write a transactional ADMIN audit with before/after (+ the photo delta in
 *     metadata for a photo edit).
 * After commit: best-effort notify the merchant owner.
 */
export async function approveEdit(
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

    const kind = editKindOf(approval.type)
    if (kind === null) throw new AppError('APPROVAL_NOT_ACTIONABLE')
    // Actionable while PENDING or claimed (CHANGES_REQUESTED is for onboarding only).
    if (approval.status !== 'PENDING') throw new AppError('APPROVAL_NOT_ACTIONABLE')

    const now = new Date()

    if (kind === 'merchant') {
      const edit = await tx.merchantPendingEdit.findUnique({ where: { id: approval.referenceId } })
      if (!edit) throw new AppError('PENDING_EDIT_NOT_FOUND')
      if (edit.status !== 'PENDING') throw new AppError('PENDING_EDIT_NOT_ACTIONABLE')

      const proposed = (edit.proposedChanges ?? {}) as Record<string, unknown>
      const applied = pickAllowed(proposed, MERCHANT_SENSITIVE_FIELDS)

      // `before` = the live values of exactly the keys we are about to write.
      const current = await tx.merchant.findUnique({ where: { id: edit.merchantId } })
      if (!current) throw new AppError('MERCHANT_NOT_FOUND')
      const before: Record<string, unknown> = {}
      for (const key of Object.keys(applied)) before[key] = (current as Record<string, unknown>)[key]

      if (Object.keys(applied).length > 0) {
        await tx.merchant.update({ where: { id: edit.merchantId }, data: applied })
      }
      await tx.merchantPendingEdit.update({
        where: { id: edit.id },
        data: { status: 'APPROVED', reviewedBy: adminId, reviewedAt: now },
      })
      await tx.adminApproval.update({
        where: { id: approvalId },
        data: { status: 'APPROVED', adminUserId: adminId, actionedAt: now, claimedById: null, claimedAt: null },
      })
      await writeAuditLogTx(tx, {
        entityId: edit.merchantId,
        entityType: 'merchant',
        event: 'MERCHANT_EDIT_APPROVED',
        actorId: adminId,
        actorType: 'ADMIN',
        before,
        after: applied,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
      return { merchantId: edit.merchantId }
    }

    // kind === 'branch'
    const edit = await tx.branchPendingEdit.findUnique({ where: { id: approval.referenceId } })
    if (!edit) throw new AppError('PENDING_EDIT_NOT_FOUND')
    if (edit.status !== 'PENDING') throw new AppError('PENDING_EDIT_NOT_ACTIONABLE')

    const proposed = (edit.proposedChanges ?? {}) as Record<string, unknown>
    // Apply the customer-visible fields PLUS the eagerly-resolved location
    // snapshot (verbatim: already resolved at request time). Both are explicit
    // allow-lists; proposedChanges is never blind-spread. For a photos-only edit
    // both pickAllowed calls return {} (the photo keys are add/remove), so the
    // identity update below is skipped and only the photo delta applies.
    const applied = {
      ...pickAllowed(proposed, BRANCH_SENSITIVE_FIELDS),
      ...pickAllowed(proposed, BRANCH_LOCATION_SNAPSHOT_FIELDS),
    }

    const current = await tx.branch.findUnique({ where: { id: edit.branchId } })
    if (!current) throw new AppError('BRANCH_NOT_FOUND')
    const before: Record<string, unknown> = {}
    for (const key of Object.keys(applied)) before[key] = (current as Record<string, unknown>)[key]

    if (Object.keys(applied).length > 0) {
      await tx.branch.update({ where: { id: edit.branchId }, data: applied })
    }

    // Branches PR-3 (§5, D-PR3-3): a photo edit applies its photo delta ALONGSIDE
    // (not instead of) the identity apply, in this same transaction. Parsed via an
    // explicit allow-list (add URLs / remove IDs) — proposedChanges is never
    // blind-spread, so a smuggled identity field or moderationStatus override is
    // ignored here.
    let photosAdded: string[] = []
    let photosRemoved: string[] = []
    if (edit.includesPhotos === true) {
      const { addUrls, removeIds } = parsePhotoChanges(proposed)

      // ADD: append each new URL after the branch's current max sortOrder, as an
      // APPROVED row — admin approval IS the moderation gate; NEVER write PENDING.
      if (addUrls.length > 0) {
        const max = await tx.branchPhoto.aggregate({
          where: { branchId: edit.branchId },
          _max: { sortOrder: true },
        })
        let nextSort = (max._max.sortOrder ?? -1) + 1
        for (const url of addUrls) {
          await tx.branchPhoto.create({
            data: { branchId: edit.branchId, url, moderationStatus: 'APPROVED', sortOrder: nextSort },
          })
          nextSort += 1
        }
        photosAdded = addUrls
      }

      // REMOVE: branch-scoped deleteMany. An ID not on THIS branch is silently
      // skipped (never a cross-branch delete). The createBranchPhotoEditRequest
      // writer already validates `remove` IDs belong to the branch; this scope is
      // the in-applier defence-in-depth.
      if (removeIds.length > 0) {
        await tx.branchPhoto.deleteMany({ where: { id: { in: removeIds }, branchId: edit.branchId } })
        photosRemoved = removeIds
      }
    }

    await tx.branchPendingEdit.update({
      where: { id: edit.id },
      data: { status: 'APPROVED', reviewedBy: adminId, reviewedAt: now },
    })
    await tx.adminApproval.update({
      where: { id: approvalId },
      data: { status: 'APPROVED', adminUserId: adminId, actionedAt: now, claimedById: null, claimedAt: null },
    })
    await writeAuditLogTx(tx, {
      entityId: edit.branchId,
      entityType: 'branch',
      event: 'BRANCH_EDIT_APPROVED',
      actorId: adminId,
      actorType: 'ADMIN',
      before,
      after: applied,
      // Capture the photo delta (added URLs + removed IDs) so the audit trail
      // records exactly what the apply created/deleted, not just identity fields.
      ...(edit.includesPhotos === true ? { metadata: { photosAdded, photosRemoved } } : {}),
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return { merchantId: edit.merchantId }
  })

  // After commit (best-effort): notify the merchant owner the change is live.
  const owner = await getMerchantOwner(prisma, result.merchantId)
  if (owner) {
    await safeNotify(prisma, redis, {
      to: owner.email,
      recipientType: 'MERCHANT_ADMIN',
      recipientId: owner.adminId,
      type: 'merchant_edit_applied',
      email: { ...merchantEditAppliedEmail(), sender: 'merchant' },
      inApp: {
        notificationType: 'MERCHANT_VERIFICATION_UPDATE',
        title: 'Your requested change is live',
        body: 'The change you requested has been reviewed and applied to your Redeemo listing.',
        referenceId: result.merchantId,
        referenceType: 'merchant',
      },
      ip: ctx.ipAddress,
    })
  } else {
    console.warn(
      `[edit-applier] approve-edit committed for merchant ${result.merchantId} but no ACTIVE OWNER membership found: merchant NOT notified`,
    )
  }
  return { approved: true as const }
}

/**
 * Reject a merchant-requested identity edit (Option B B1). The LIVE entity is
 * NEVER touched (no mutation), so there is no photo block: a photo edit can be
 * rejected. One transaction: validate (same as approve), flip both statuses
 * (PendingEdit → REJECTED with reviewNote, AdminApproval → REJECTED with
 * comment), write a transactional ADMIN audit carrying the reason. After commit:
 * best-effort notify the merchant owner.
 */
export async function rejectEdit(
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

    const kind = editKindOf(approval.type)
    if (kind === null) throw new AppError('APPROVAL_NOT_ACTIONABLE')
    if (approval.status !== 'PENDING') throw new AppError('APPROVAL_NOT_ACTIONABLE')

    const now = new Date()

    if (kind === 'merchant') {
      const edit = await tx.merchantPendingEdit.findUnique({
        where: { id: approval.referenceId },
        select: { id: true, status: true, merchantId: true },
      })
      if (!edit) throw new AppError('PENDING_EDIT_NOT_FOUND')
      if (edit.status !== 'PENDING') throw new AppError('PENDING_EDIT_NOT_ACTIONABLE')

      await tx.merchantPendingEdit.update({
        where: { id: edit.id },
        data: { status: 'REJECTED', reviewNote: reason, reviewedBy: adminId, reviewedAt: now },
      })
      await tx.adminApproval.update({
        where: { id: approvalId },
        data: { status: 'REJECTED', comment: reason, adminUserId: adminId, actionedAt: now, claimedById: null, claimedAt: null },
      })
      await writeAuditLogTx(tx, {
        entityId: edit.merchantId,
        entityType: 'merchant',
        event: 'MERCHANT_EDIT_REJECTED',
        actorId: adminId,
        actorType: 'ADMIN',
        reason,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
      return { merchantId: edit.merchantId }
    }

    // kind === 'branch'. Reject is safe for photo edits too: no mutation.
    const edit = await tx.branchPendingEdit.findUnique({
      where: { id: approval.referenceId },
      select: { id: true, status: true, branchId: true, merchantId: true },
    })
    if (!edit) throw new AppError('PENDING_EDIT_NOT_FOUND')
    if (edit.status !== 'PENDING') throw new AppError('PENDING_EDIT_NOT_ACTIONABLE')

    await tx.branchPendingEdit.update({
      where: { id: edit.id },
      data: { status: 'REJECTED', reviewNote: reason, reviewedBy: adminId, reviewedAt: now },
    })
    await tx.adminApproval.update({
      where: { id: approvalId },
      data: { status: 'REJECTED', comment: reason, adminUserId: adminId, actionedAt: now, claimedById: null, claimedAt: null },
    })
    await writeAuditLogTx(tx, {
      entityId: edit.branchId,
      entityType: 'branch',
      event: 'BRANCH_EDIT_REJECTED',
      actorId: adminId,
      actorType: 'ADMIN',
      reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return { merchantId: edit.merchantId }
  })

  const owner = await getMerchantOwner(prisma, result.merchantId)
  if (owner) {
    await safeNotify(prisma, redis, {
      to: owner.email,
      recipientType: 'MERCHANT_ADMIN',
      recipientId: owner.adminId,
      type: 'merchant_edit_rejected',
      email: { ...merchantEditRejectedEmail(reason), sender: 'merchant' },
      inApp: {
        notificationType: 'MERCHANT_VERIFICATION_UPDATE',
        title: 'Update on your requested change',
        body: 'We were unable to apply the change you requested. Open the portal for details.',
        referenceId: result.merchantId,
        referenceType: 'merchant',
      },
      ip: ctx.ipAddress,
    })
  } else {
    console.warn(
      `[edit-applier] reject-edit committed for merchant ${result.merchantId} but no ACTIVE OWNER membership found: merchant NOT notified`,
    )
  }
  return { rejected: true as const }
}

// ── Edit review context (the diff) ──────────────────────────────────────────

export interface EditReviewField {
  field: string
  current: unknown
  proposed: unknown
  isCustomerVisible: boolean
}

export interface EditReviewContext {
  kind: EditKind
  merchantId: string
  branchId?: string
  pendingEditId: string
  status: string
  includesPhotos: boolean
  fields: EditReviewField[]
  photoChanges?: { add: string[]; remove: string[] }
}

/**
 * Build the field-by-field diff for an edit approval (gated approval:read).
 * current = live entity value; proposed = proposedChanges[field]. For a photo
 * edit, surface photoChanges (proposed add/remove URLs): NOT silently ignored.
 * No secret fields are read or returned.
 */
export async function getEditReviewContext(prisma: PrismaClient, approvalId: string): Promise<EditReviewContext> {
  const approval = await prisma.adminApproval.findUnique({
    where: { id: approvalId },
    select: { id: true, type: true, referenceId: true },
  })
  if (!approval) throw new AppError('APPROVAL_NOT_FOUND')

  const kind = editKindOf(approval.type)
  if (kind === null) throw new AppError('APPROVAL_NOT_ACTIONABLE')

  if (kind === 'merchant') {
    const edit = await prisma.merchantPendingEdit.findUnique({ where: { id: approval.referenceId } })
    if (!edit) throw new AppError('PENDING_EDIT_NOT_FOUND')

    const proposed = (edit.proposedChanges ?? {}) as Record<string, unknown>
    const current = await prisma.merchant.findUnique({
      where: { id: edit.merchantId },
      select: { businessName: true, tradingName: true, logoUrl: true, bannerUrl: true, description: true },
    })

    const fields: EditReviewField[] = MERCHANT_SENSITIVE_FIELDS
      .filter((key) => key in proposed)
      .map((key) => ({
        field: key,
        current: current ? (current as Record<string, unknown>)[key] ?? null : null,
        proposed: proposed[key],
        // Every merchant SENSITIVE field is shown to customers on the listing.
        isCustomerVisible: true,
      }))

    return {
      kind: 'merchant',
      merchantId: edit.merchantId,
      pendingEditId: edit.id,
      status: edit.status,
      includesPhotos: false,
      fields,
    }
  }

  // kind === 'branch'
  const edit = await prisma.branchPendingEdit.findUnique({ where: { id: approval.referenceId } })
  if (!edit) throw new AppError('PENDING_EDIT_NOT_FOUND')

  const proposed = (edit.proposedChanges ?? {}) as Record<string, unknown>
  const current = await prisma.branch.findUnique({
    where: { id: edit.branchId },
    select: {
      name: true, about: true, addressLine1: true, addressLine2: true,
      city: true, postcode: true, latitude: true, longitude: true,
      logoUrl: true, bannerUrl: true,
    },
  })

  // The customer-visible identity-field diff (location snapshot fields are
  // applied verbatim but not surfaced as human-chosen edits).
  const fields: EditReviewField[] = BRANCH_SENSITIVE_FIELDS
    .filter((key) => key in proposed)
    .map((key) => ({
      field: key,
      current: current ? normaliseDecimal((current as Record<string, unknown>)[key]) ?? null : null,
      proposed: proposed[key],
      isCustomerVisible: true,
    }))

  // Photo edits store proposedChanges as { add?, remove? } (NOT identity fields).
  const photoChanges = edit.includesPhotos
    ? {
        add: Array.isArray(proposed.add) ? (proposed.add as string[]) : [],
        remove: Array.isArray(proposed.remove) ? (proposed.remove as string[]) : [],
      }
    : undefined

  return {
    kind: 'branch',
    merchantId: edit.merchantId,
    branchId: edit.branchId,
    pendingEditId: edit.id,
    status: edit.status,
    includesPhotos: edit.includesPhotos,
    fields,
    ...(photoChanges ? { photoChanges } : {}),
  }
}

/** Prisma Decimal (lat/lng) serialises as an object; coerce to a Number for the diff. */
function normaliseDecimal(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && 'toString' in (value as object)) {
    const n = Number((value as { toString(): string }).toString())
    if (!Number.isNaN(n)) return n
  }
  return value
}
