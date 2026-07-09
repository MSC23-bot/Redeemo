import { PrismaClient } from '../../../../generated/prisma/client'
import type { Redis } from 'ioredis'
import { AppError } from '../../shared/errors'
import { writeAuditLogTx } from '../../shared/audit'
import { getMerchantOwner } from './service'
import { notify } from '../../shared/notify'
import { merchantEditAppliedEmail, merchantEditRejectedEmail } from '../../shared/merchantEmails'
import { crossCheckGoogleLocation } from '../../merchant/branch/locationTrust'

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

// Branch Location Trust Slice 1b (spec 2026-07-09): the proposedChanges sub-key
// under which the merchant-picked Google suggestion is staged by
// createBranchEditRequest (branch/service.ts LOCATION_SUGGESTION_KEY). Re-declared
// here (not imported) for the same own-your-own-knowledge discipline as the
// allow-lists above: a drift between writer and reader is FAIL-SAFE — the applier
// simply stops finding the suggestion and degrades to the legacy metadata-only
// apply, never an accidental ADDRESS_GEOCODED. Pinned by the suggestion-apply test.
const LOCATION_SUGGESTION_KEY = '__locationSuggestion' as const

// Voucher governed flows (2026-07-07): the promotable TOP-LEVEL Voucher columns
// a governed CHANGE may write. Re-declared here (not imported from the merchant
// writer) for the same reason as the SENSITIVE lists above: the applier owns its
// own allow-list, so writer drift can never widen what the applier writes.
// Pinned by the stray-key-never-written test.
const VOUCHER_EDITABLE_FIELDS = [
  'title', 'description', 'estimatedSaving', 'terms', 'imageUrl',
] as const

// Decimal(10,2) column max (mirrors the merchant service's RMV_SAVING_COLUMN_MAX).
const VOUCHER_SAVING_COLUMN_MAX = 100000000

type EditKind = 'merchant' | 'branch' | 'voucher'

/** Map an edit approval type to its kind. Returns null for non-edit types. */
function editKindOf(type: string): EditKind | null {
  if (type === 'MERCHANT_IDENTITY_EDIT') return 'merchant'
  if (type === 'BRANCH_IDENTITY_EDIT') return 'branch'
  if (type === 'VOUCHER_EDIT') return 'voucher'
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
 * Voucher governed flows: build the update payload for a CHANGE apply. Two
 * defence layers on top of pickAllowed (mirrors the submit-bridge robustness in
 * merchant/voucher/service.ts):
 *   - strings (title/description/terms/imageUrl) apply ONLY when the stored
 *     value is a string (title additionally non-empty); a malformed value is
 *     DROPPED so a poisoned staging row degrades gracefully, never a Prisma 500;
 *   - estimatedSaving is customer-facing quantitative data, so a malformed /
 *     overflowing value throws the clean SAVING_INVALID (never silently applied,
 *     never a Postgres 22003). Rounded to scale 2 pre-write so Postgres cannot
 *     re-round into overflow.
 * A stray key (status / isRmv / merchantId / approvalStatus / ...) can NEVER be
 * written: pickAllowed drops it before either layer runs.
 */
function buildVoucherApplied(proposed: Record<string, unknown>): Record<string, unknown> {
  const picked = pickAllowed(proposed, VOUCHER_EDITABLE_FIELDS)
  const out: Record<string, unknown> = {}
  for (const field of ['title', 'description', 'terms', 'imageUrl'] as const) {
    if (field in picked && typeof picked[field] === 'string') {
      if (field === 'title' && (picked[field] as string).trim().length === 0) continue
      out[field] = picked[field]
    }
  }
  if ('estimatedSaving' in picked) {
    const s = picked.estimatedSaving
    if (typeof s !== 'number' || !Number.isFinite(s) || s <= 0) throw new AppError('SAVING_INVALID')
    const rounded = Math.round(s * 100) / 100
    if (rounded >= VOUCHER_SAVING_COLUMN_MAX) throw new AppError('SAVING_INVALID')
    out.estimatedSaving = rounded
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
 * Branch Location Trust Slice 1b (spec 2026-07-09): run the auto-trust cross-check
 * on the reviewed-edit APPLY lane and mutate the branch update payload `applied`
 * in place. Only acts when:
 *   - a server-staged Google suggestion (`rawSuggestion`) with valid coords + a
 *     placeId is present (a malformed / poisoned blob is ignored — graceful
 *     degrade, never a crash, never an accidental ADDRESS_GEOCODED), AND
 *   - `applied` carries a FRESH postcode re-anchor snapshot (locationConfidence
 *     POSTCODE_CENTROID + a string postcode + finite centroid coords). A NEW
 *     postcode is required: without it there is no new centroid to cross-check, so
 *     the branch location is left untouched (never a silent NEEDS_REVIEW downgrade).
 * PASS -> the exact Google pin + googlePlaceId + ADDRESS_GEOCODED overwrite the
 * centroid snapshot. FAIL -> keep the centroid coords, stamp NEEDS_REVIEW (L4).
 * The raw suggestion sub-key itself is NEVER written as a column (only the
 * controlled googlePlaceId is added); crossCheckGoogleLocation is the ONLY
 * ADDRESS_GEOCODED writer-authority (L2).
 */
function applyLocationTrust(applied: Record<string, unknown>, rawSuggestion: unknown): void {
  if (rawSuggestion === null || typeof rawSuggestion !== 'object') return
  const s = rawSuggestion as Record<string, unknown>
  const googleLat = s.latitude
  const googleLng = s.longitude
  const placeId = s.placeId
  if (
    typeof googleLat !== 'number' || !Number.isFinite(googleLat) ||
    typeof googleLng !== 'number' || !Number.isFinite(googleLng) ||
    typeof placeId !== 'string' || placeId.length === 0
  ) {
    return
  }

  // Require a fresh postcode re-anchor snapshot: a NEW postcode + NEW centroid.
  const centroidLat = applied.latitude
  const centroidLng = applied.longitude
  if (
    applied.locationConfidence !== 'POSTCODE_CENTROID' ||
    typeof applied.postcode !== 'string' ||
    typeof centroidLat !== 'number' || !Number.isFinite(centroidLat) ||
    typeof centroidLng !== 'number' || !Number.isFinite(centroidLng)
  ) {
    return
  }

  const verdict = crossCheckGoogleLocation({
    googleLat,
    googleLng,
    googlePostcode:  typeof s.postcode === 'string' ? s.postcode : null,
    enteredPostcode: applied.postcode,
    centroidLat,
    centroidLng,
  })
  if (verdict.trusted) {
    applied.latitude           = googleLat
    applied.longitude          = googleLng
    applied.googlePlaceId      = placeId
    applied.locationConfidence = 'ADDRESS_GEOCODED'
  } else {
    applied.locationConfidence = 'NEEDS_REVIEW'
  }
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

    if (kind === 'voucher') {
      // Voucher governed flows: apply a VoucherPendingEdit (kind CHANGE | END).
      const edit = await tx.voucherPendingEdit.findUnique({ where: { id: approval.referenceId } })
      if (!edit) throw new AppError('PENDING_EDIT_NOT_FOUND')
      if (edit.status !== 'PENDING') throw new AppError('PENDING_EDIT_NOT_ACTIONABLE')

      const voucher = await tx.voucher.findUnique({ where: { id: edit.voucherId } })
      if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')

      let before: Record<string, unknown>
      let after: Record<string, unknown>

      if (edit.kind === 'END') {
        // D4 PIN: an END may NEVER touch a flagship — re-verified here (the
        // writer already rejects it) and thrown BEFORE any mutation.
        if (voucher.isRmv) throw new AppError('VOUCHER_EDIT_NOT_ALLOWED')
        // Re-verify the voucher is still LIVE at apply time (it may have been
        // rejected/suspended/expired since the request was written).
        if (voucher.status !== 'ACTIVE') throw new AppError('VOUCHER_EDIT_NOT_ALLOWED')
        await tx.voucher.update({ where: { id: voucher.id }, data: { status: 'INACTIVE' } })
        before = { status: voucher.status }
        after = { status: 'INACTIVE' }
      } else {
        // kind CHANGE: re-verify a LIVE flagship (CHANGE is flagship-only).
        if (!voucher.isRmv) throw new AppError('VOUCHER_EDIT_NOT_ALLOWED')
        if (voucher.status !== 'ACTIVE') throw new AppError('VOUCHER_EDIT_NOT_ALLOWED')

        const proposed = (edit.proposedChanges ?? {}) as Record<string, unknown>
        // ONLY the allow-listed, type-valid fields are written — a stray key
        // (status/isRmv/merchantId/...) smuggled into proposedChanges can NEVER
        // reach the voucher row (pinned by test).
        const applied = buildVoucherApplied(proposed)

        before = {}
        for (const key of Object.keys(applied)) {
          before[key] = normaliseDecimal((voucher as unknown as Record<string, unknown>)[key]) ?? null
        }
        if (Object.keys(applied).length > 0) {
          await tx.voucher.update({ where: { id: voucher.id }, data: applied })
        }
        after = applied
      }

      await tx.voucherPendingEdit.update({
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
        event: 'VOUCHER_EDIT_APPROVED',
        actorId: adminId,
        actorType: 'ADMIN',
        before,
        after,
        metadata: { voucherId: voucher.id, pendingEditId: edit.id, kind: edit.kind },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
      return { merchantId: edit.merchantId, voucherId: voucher.id, voucherEditKind: edit.kind as 'CHANGE' | 'END' }
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

    // Branch Location Trust Slice 1b (spec 2026-07-09) — reviewed-edit APPLY lane.
    // When the reviewed edit carries a server-staged Google suggestion AND a fresh
    // postcode re-anchor snapshot (the "NEW postcode + NEW centroid" case), run the
    // SAME cross-check the create/draft-direct lanes run. A PASS applies the exact
    // Google pin (ADDRESS_GEOCODED + googlePlaceId); any FAIL keeps the staged
    // postcode-centroid coords and stamps NEEDS_REVIEW (L4, no partial application).
    // crossCheckGoogleLocation stays the ONLY writer-authority for ADDRESS_GEOCODED
    // (L2); MANUALLY_CONFIRMED is never reachable here. The raw suggestion sub-key is
    // NEVER copied as a Branch column (pickAllowed excludes it; only the pipeline's
    // controlled googlePlaceId is added) — L1: the applier consumes the SERVER-staged
    // suggestion, never client-supplied coordinates.
    applyLocationTrust(applied, proposed[LOCATION_SUGGESTION_KEY])

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
  // Voucher edits get voucher-flavoured copy + a voucher deep-link; the email
  // template is reused (email delivery stays dark; the bell is the live signal).
  const owner = await getMerchantOwner(prisma, result.merchantId)
  if (owner) {
    const voucherResult = 'voucherId' in result ? result : null
    await safeNotify(prisma, redis, {
      to: owner.email,
      recipientType: 'MERCHANT_ADMIN',
      recipientId: owner.adminId,
      type: voucherResult ? 'voucher_edit_applied' : 'merchant_edit_applied',
      email: { ...merchantEditAppliedEmail(), sender: 'merchant' },
      inApp: voucherResult
        ? {
            notificationType: 'VOUCHER_APPROVAL_UPDATE',
            title: voucherResult.voucherEditKind === 'END' ? 'Your voucher has been ended' : 'Your voucher changes are live',
            body: voucherResult.voucherEditKind === 'END'
              ? 'Your request to end this voucher has been approved. It is no longer live.'
              : 'The changes you requested have been reviewed and applied to your voucher.',
            referenceId: voucherResult.voucherId,
            referenceType: 'voucher',
          }
        : {
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

    if (kind === 'voucher') {
      // Voucher governed flows: reject NEVER touches the voucher (a CHANGE
      // leaves the live flagship as-is; an END leaves the custom voucher ACTIVE).
      const edit = await tx.voucherPendingEdit.findUnique({
        where: { id: approval.referenceId },
        select: { id: true, status: true, merchantId: true, voucherId: true, kind: true },
      })
      if (!edit) throw new AppError('PENDING_EDIT_NOT_FOUND')
      if (edit.status !== 'PENDING') throw new AppError('PENDING_EDIT_NOT_ACTIONABLE')

      await tx.voucherPendingEdit.update({
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
        event: 'VOUCHER_EDIT_REJECTED',
        actorId: adminId,
        actorType: 'ADMIN',
        reason,
        metadata: { voucherId: edit.voucherId, pendingEditId: edit.id, kind: edit.kind },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      })
      return { merchantId: edit.merchantId, voucherId: edit.voucherId }
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
    const voucherResult = 'voucherId' in result ? result : null
    await safeNotify(prisma, redis, {
      to: owner.email,
      recipientType: 'MERCHANT_ADMIN',
      recipientId: owner.adminId,
      type: voucherResult ? 'voucher_edit_rejected' : 'merchant_edit_rejected',
      email: { ...merchantEditRejectedEmail(reason), sender: 'merchant' },
      inApp: voucherResult
        ? {
            notificationType: 'VOUCHER_APPROVAL_UPDATE',
            title: 'Update on your voucher request',
            body: 'We were unable to apply the request you made for this voucher. Open the portal for details.',
            referenceId: voucherResult.voucherId,
            referenceType: 'voucher',
          }
        : {
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
  // Voucher governed flows (kind === 'voucher' only): the request kind, the
  // merchant's mandatory reason, and a curated voucher identity block so the
  // reviewer can see WHAT is being changed/ended without a second fetch.
  voucherId?: string
  voucherEditKind?: 'CHANGE' | 'END'
  reason?: string | null
  voucher?: {
    id: string
    code: string
    title: string
    type: string
    status: string
    isRmv: boolean
    estimatedSaving: number
  } | null
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

  if (kind === 'voucher') {
    const edit = await prisma.voucherPendingEdit.findUnique({ where: { id: approval.referenceId } })
    if (!edit) throw new AppError('PENDING_EDIT_NOT_FOUND')

    const proposed = (edit.proposedChanges ?? {}) as Record<string, unknown>
    const current = await prisma.voucher.findUnique({
      where: { id: edit.voucherId },
      select: {
        id: true, code: true, title: true, type: true, status: true, isRmv: true,
        description: true, terms: true, imageUrl: true, estimatedSaving: true,
      },
    })

    // The current-vs-proposed field diff (CHANGE only; an END proposes no field
    // values — the "diff" is the status flip, carried by voucherEditKind).
    const fields: EditReviewField[] = edit.kind === 'CHANGE'
      ? VOUCHER_EDITABLE_FIELDS
          .filter((key) => key in proposed)
          .map((key) => ({
            field: key,
            current: current ? normaliseDecimal((current as unknown as Record<string, unknown>)[key]) ?? null : null,
            proposed: proposed[key],
            // Every promotable voucher field is shown to customers.
            isCustomerVisible: true,
          }))
      : []

    return {
      kind: 'voucher',
      merchantId: edit.merchantId,
      voucherId: edit.voucherId,
      pendingEditId: edit.id,
      status: edit.status,
      includesPhotos: false,
      fields,
      voucherEditKind: edit.kind as 'CHANGE' | 'END',
      reason: edit.reason,
      voucher: current
        ? {
            id: current.id,
            code: current.code,
            title: current.title,
            type: current.type as unknown as string,
            status: current.status as unknown as string,
            isRmv: current.isRmv,
            estimatedSaving: Number(current.estimatedSaving),
          }
        : null,
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
