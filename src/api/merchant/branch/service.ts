import { PrismaClient } from '../../../../generated/prisma/client'
import type Redis from 'ioredis'
import { AppError } from '../../shared/errors'
import { writeAuditLog, writeAuditLogTx } from '../../shared/audit'
import {
  resolveAdminMerchant,
  resolveMerchantContext,
  assertBranchAllowed,
  assertCanManageBranch,
  canManageBranchPredicate,
  assertOwner,
  isDraftWindow,
  type EditActor,
} from '../shared'
import { encrypt, decrypt } from '../../shared/encryption'
import { classifyPinDecryptError } from '../../shared/pinDecrypt'
import { parsePublicUrl } from '../../shared/storage'
import { resolvePostcode } from '../../lib/postcodeResolver'
import { findOrCreateLocality } from '../../lib/findOrCreateLocality'
import { validateOpeningHours } from './openingHours'
import { crossCheckGoogleLocation } from './locationTrust'
import { uploadMerchantImage } from '../upload/service'
import { enqueue, MAINTENANCE_QUEUE } from '../../queues'
import { PROMOTE_PENDING_HOURS_JOB } from '../../queues/processors/promotePendingHours'

/**
 * Plan 4 M1.21 — resolve a postcode via postcodes.io + find-or-create the
 * matching Locality. Returns the Branch location-snapshot fields ready to
 * spread into a Branch.create payload OR to merge into a
 * BranchPendingEdit.proposedChanges block for later admin apply.
 *
 * Throws AppError on resolver failure (POSTCODE_NOT_FOUND or
 * GAZETTEER_UNAVAILABLE — both defined in ERROR_DEFINITIONS, both surface as
 * their declared statusCode via the global error handler).
 *
 * locationConfidence is always 'POSTCODE_CENTROID' on resolve-on-write — a
 * postcode change re-anchors the branch pin to the postcode-area centroid.
 * Admin pin-drop / Phase 4 Merchant Portal geocoder upgrades to
 * MANUALLY_CONFIRMED via a separate path (out of scope for Plan 4a M1).
 */
async function resolveBranchLocationFields(prisma: PrismaClient, postcode: string) {
  const resolved = await resolvePostcode(postcode)
  if (!resolved.ok) {
    throw new AppError(resolved.error)
  }
  const locality = await findOrCreateLocality(prisma, resolved.snapshot)
  return {
    latitude:           resolved.snapshot.latitude,
    longitude:          resolved.snapshot.longitude,
    localityId:         locality.id,
    localityName:       locality.name,
    postTown:           resolved.snapshot.postTown ?? locality.postTown,
    ladDistrict:        resolved.snapshot.ladDistrict,
    adminCounty:        resolved.snapshot.adminCounty,
    region:             resolved.snapshot.region,
    locationCountry:    resolved.snapshot.country,
    locationResolvedAt: new Date(),
    locationConfidence: 'POSTCODE_CENTROID' as const,
  }
}

const PIN_REGEX = /^\d{4}$/

/**
 * Branches PR-6 (§4b) — Layer 2: the resolved Google location SUGGESTION that
 * rides along an address-apply as ADMIN-REVIEW METADATA ONLY.
 *
 * SECURITY INVARIANT (mini-spec §4b CRITICAL + the load-bearing lock): this is
 * NEVER applied to a Branch column and NEVER sets a CONFIRMED_LOCATION_SET
 * confidence. It is staged purely so the admin can confirm at the merchant's
 * suggested pin via the unchanged `confirmBranchLocation` -> MANUALLY_CONFIRMED
 * authority. The address change itself flows through the EXISTING lanes
 * unchanged (the postcode resolver stamps POSTCODE_CENTROID = non-confirmed =
 * non-discovery-visible). lat/lng + placeId are resolved server-side from the
 * candidate token (Layer 1's `resolveLocationCandidate`); they never cross the
 * wire from the client.
 */
export interface BranchLocationSuggestion {
  placeId: string
  latitude: number
  longitude: number
  // Branch Location Trust Slice 1 (spec 2026-07-09): the postcode parsed from the
  // Google formattedAddress at stash time, threaded through from
  // resolveLocationCandidate. The create-lane trust pipeline cross-checks it
  // against the merchant-entered postcode. Null when Google's address had no
  // parseable UK postcode (read as a failed check). The edit lane still stages
  // this suggestion as admin-review metadata only until Slice 1b.
  postcode: string | null
}

/**
 * The audit/metadata block staged from a Google suggestion. `source` marks the
 * provenance so an admin reviewer can tell a merchant-portal Google pick apart
 * from any future suggestion origin. Shape is intentionally flat + JSON-safe.
 */
function locationSuggestionMetadata(suggestion: BranchLocationSuggestion) {
  return {
    placeId: suggestion.placeId,
    latitude: suggestion.latitude,
    longitude: suggestion.longitude,
    source: 'merchant_portal_google' as const,
  }
}

// The proposedChanges sub-key under which the suggestion is stashed in the
// reviewed edit lane. It is DELIBERATELY NOT a Branch field name — the
// editApplier's allow-lists (BRANCH_SENSITIVE_FIELDS + BRANCH_LOCATION_SNAPSHOT_FIELDS)
// will NEVER pick it up at apply time, and getEditReviewContext's diff never
// surfaces it. Verified against editApplier.ts.
const LOCATION_SUGGESTION_KEY = '__locationSuggestion' as const

// Sensitive fields require admin approval via edit-request
const SENSITIVE_FIELDS = [
  'name', 'about', 'addressLine1', 'addressLine2', 'city', 'postcode',
  'latitude', 'longitude', 'logoUrl', 'bannerUrl',
] as const

// Directly editable fields via PATCH. The shared cores
// (updateBranchDirectCore / updateBranchSensitiveDirectCore) write whichever of
// these keys they are given, so the admin route + the owner paths set `isActive`
// through them — this set stays complete.
//
// Staff & Access PR-2 (D3): the BM-allowed direct subset is phone/email/websiteUrl
// only. `isActive` is OWNER-ONLY — setting it false takes the branch offline
// (removed from all customer discovery feeds), a close/lifecycle-adjacent action
// D3 reserves to OWNERS (same governance reasoning that keeps `isMainBranch`
// owner-only). The owner gate for `isActive` lives in `updateBranch` (the merchant
// route entry point), so a BM PATCHing it gets 403 before any DB write while the
// admin/owner cores keep writing it.
const DIRECT_FIELDS = ['phone', 'email', 'websiteUrl', 'isActive'] as const

const BRANCH_INCLUDE = {
  openingHours: true,
  amenities: { include: { amenity: true } },
  photos: true,
  pendingEdits: { where: { status: 'PENDING' as const }, take: 1 },
  // Branches PR-4 (§6-data): the current PENDING opening-hours cool-off change, so
  // getBranch / listBranches expose the proposed hours + go-live time + status on
  // the merchant-web payload. At-most-one PENDING per branch is DB-enforced (the
  // partial unique), so take:1 is exact. PROMOTED / CANCELLED rows are NOT exposed.
  pendingHours: {
    where: { status: 'PENDING' as const },
    take: 1,
    select: { id: true, proposedHours: true, effectiveAt: true, status: true },
  },
} as const

async function resolveBranch(
  prisma: PrismaClient,
  branchId: string,
  merchantId: string
) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
    include: BRANCH_INCLUDE,
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  return branch
}

/**
 * Wire hygiene (2026-07-05): strip the AES-encrypted `redemptionPin` ciphertext
 * from every branch row that leaves the API and replace it with the derived
 * `redemptionPinSet` boolean. Branches PR-1 shipped the ciphertext deliberately
 * (the FE only ever derived set/not-set from its presence), but that trade-off
 * contradicts the stronger no-select invariant used by the redemptions and
 * staff endpoints - the ciphertext has no legitimate client use and the guarded
 * reveal route (`getBranchPin`) remains the ONLY way to read the PIN.
 */
export function toMerchantBranch<T extends { redemptionPin?: string | null }>(row: T) {
  const { redemptionPin, ...rest } = row
  return { ...rest, redemptionPinSet: redemptionPin != null }
}

export async function listBranches(prisma: PrismaClient, adminId: string) {
  // Staff & Access B5 (§4.3 SCOPED-READ): a scoped member sees only their allowed
  // branches; owner / allBranches sees all. resolveMerchantContext keeps the SEC-M2
  // suspended guard.
  const ctx = await resolveMerchantContext(prisma, adminId)
  const rows = await prisma.branch.findMany({
    where: {
      merchantId: ctx.merchantId,
      deletedAt: null,
      // Scoped member: restrict to allowedBranchIds; owner / allBranches: no clause.
      ...(ctx.allBranches ? {} : { id: { in: ctx.allowedBranchIds } }),
    },
    include: BRANCH_INCLUDE,
    orderBy: [{ isMainBranch: 'desc' }, { createdAt: 'asc' }],
  })
  return rows.map(toMerchantBranch)
}

export async function getBranch(prisma: PrismaClient, adminId: string, branchId: string) {
  // Staff & Access B5 (§4.3 SCOPED-READ): a scoped member can only read a branch in
  // their allowed set; assertBranchAllowed throws INSUFFICIENT_PERMISSIONS otherwise.
  const ctx = await resolveMerchantContext(prisma, adminId)
  assertBranchAllowed(ctx, branchId)
  // D-BM1: additive per-branch capability hint computed from the context already
  // in memory via the ONE shared predicate (never inline the formula here - the
  // single-definition-site guard pins that). Composed AFTER toMerchantBranch so
  // the #377 pin-hygiene chain is preserved. A boolean only - never ids or
  // assignment lists. UX hint: backend asserts remain the real boundary.
  return {
    ...toMerchantBranch(await resolveBranch(prisma, branchId, ctx.merchantId)),
    viewerCapabilities: { canManage: canManageBranchPredicate(ctx, branchId) },
  }
}

/**
 * Option B B2.4: the tight admin-facing branch shape. NEVER includes
 * `redemptionPin` (AES-encrypted) or asset/secret URLs (logoUrl/bannerUrl/
 * priceListUrl/about). Mirrors getMerchantDetail's branch select so the admin
 * create response cannot leak a branch secret.
 */
export function toAdminBranchShape(b: {
  id: string; name: string; isMainBranch: boolean; addressLine1: string
  addressLine2: string | null; city: string; postcode: string
  localityName: string | null; locationConfidence: string
  phone: string | null; email: string | null; websiteUrl: string | null; isActive: boolean
}) {
  return {
    id: b.id, name: b.name, isMainBranch: b.isMainBranch,
    addressLine1: b.addressLine1, addressLine2: b.addressLine2, city: b.city, postcode: b.postcode,
    localityName: b.localityName, locationConfidence: b.locationConfidence,
    phone: b.phone, email: b.email, websiteUrl: b.websiteUrl, isActive: b.isActive,
  }
}

/**
 * Option B B2.4: the shared branch-create core (D4 seam). BOTH the merchant
 * wrapper (actor MERCHANT_ADMIN) and the new admin route (actor ADMIN + reason)
 * call this, so validation/side-effects/audit are identical (no weaker path).
 * The postcode resolve STAYS before the transaction (a bad postcode or gazetteer
 * outage must reject before opening a tx); the branch.create + audit are inside
 * one transaction, actor-attributed, `entityType:'branch'`. Caller lat/lng are
 * dropped (pin-precise coords arrive via the separate confirm-location flow).
 *
 * Branches PR-5 (D5): `stageForApproval` defaults FALSE so the existing instant-live
 * behaviour is preserved for the onboarding first/main branch AND the admin
 * create-draft-on-behalf path (the admin is the approval authority). When TRUE
 * (a merchant self-created SUBSEQUENT branch), the branch is staged
 * `lifecycleStatus = PENDING_CREATE` + `isActive = false` (customer-INVISIBLE) and a
 * `BRANCH_CREATE` AdminApproval is created in the SAME transaction; admin approval
 * flips it LIVE (the next dispatch). The `existingCount`/auto-main count is scoped to
 * non-deleted, non-PENDING_CREATE branches so a pending branch can NEVER become main.
 */
export async function createBranchCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string },
  stageForApproval = false,
  // Branches PR-6 (§4b): an OPTIONAL resolved Google suggestion (server-held
  // coords + placeId from the candidate token). Recorded in the BRANCH_CREATED
  // audit metadata as ADMIN-REVIEW METADATA ONLY — NEVER applied to a Branch
  // column, NEVER a confidence write. The address itself still lands at
  // POSTCODE_CENTROID via resolveBranchLocationFields below.
  locationSuggestion?: BranchLocationSuggestion,
) {
  // Auto-main counts only LIVE (non-pending), non-deleted branches: a PENDING_CREATE
  // branch is never an eligible "first branch", so the first instant-live branch is
  // the only one that can auto-promote to main. A staged branch is by definition not
  // the first non-pending branch, so it can never be auto-main even if it were the
  // only row (it stages with isMainBranch=false below).
  const existingCount = await prisma.branch.count({
    where: { merchantId, deletedAt: null, lifecycleStatus: { not: 'PENDING_CREATE' } },
  })
  // A staged (pending-create) branch is NEVER auto-main; only an instant first branch is.
  const isMainBranch = !stageForApproval && existingCount === 0

  const postcode = data.postcode as string | undefined
  if (!postcode) throw new AppError('POSTCODE_REQUIRED')
  const locationFields = await resolveBranchLocationFields(prisma, postcode)

  // Branch Location Trust Slice 1 (spec 2026-07-09): auto-trust pipeline.
  // SUPERSEDES the PR-6 "metadata only" invariant on the CREATE lane by owner
  // direction: a Google-picked pin that passes BOTH cross-checks is APPLIED with
  // ADDRESS_GEOCODED + googlePlaceId; any failure degrades to exactly the legacy
  // behaviour (the postcode-centroid coords from resolveBranchLocationFields)
  // PLUS a NEEDS_REVIEW stamp so the branch enters the admin exception queue (L4;
  // no partial Google-coord application). The staged audit metadata
  // (locationSuggestionMetadata) continues in BOTH outcomes so admins always see
  // provenance. crossCheckGoogleLocation is the ONLY writer-authority for the
  // ADDRESS_GEOCODED decision (L2).
  let trustedLocation: { latitude: number; longitude: number; googlePlaceId: string } | null = null
  let confidenceOverride: 'ADDRESS_GEOCODED' | 'NEEDS_REVIEW' | null = null
  if (locationSuggestion) {
    const verdict = crossCheckGoogleLocation({
      googleLat:       locationSuggestion.latitude,
      googleLng:       locationSuggestion.longitude,
      googlePostcode:  locationSuggestion.postcode,
      enteredPostcode: postcode,
      centroidLat:     locationFields.latitude,
      centroidLng:     locationFields.longitude,
    })
    if (verdict.trusted) {
      trustedLocation = {
        latitude:      locationSuggestion.latitude,
        longitude:     locationSuggestion.longitude,
        googlePlaceId: locationSuggestion.placeId,
      }
      confidenceOverride = 'ADDRESS_GEOCODED'
    } else {
      confidenceOverride = 'NEEDS_REVIEW'
    }
  }

  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.create({
      data: {
        merchantId,
        isMainBranch,
        // Branches PR-5: staged subsequent branch -> PENDING_CREATE + isActive=false
        // (customer-INVISIBLE by STATUS; isActive=false is belt-and-braces so the
        // isActive:true feeds + createReview/createRedemption are incidentally safe).
        // The instant path keeps the LIVE default + isActive=true default.
        ...(stageForApproval ? { lifecycleStatus: 'PENDING_CREATE' as const, isActive: false } : {}),
        name:         data.name as string,
        addressLine1: data.addressLine1 as string,
        addressLine2: data.addressLine2 as string | undefined,
        city:         data.city as string,
        postcode:     postcode,
        country:      (data.country as string | undefined) ?? 'GB',  // legacy address-country
        phone:        data.phone as string | undefined,
        email:        data.email as string | undefined,
        websiteUrl:   data.websiteUrl as string | undefined,
        logoUrl:      data.logoUrl as string | undefined,
        bannerUrl:    data.bannerUrl as string | undefined,
        about:        data.about as string | undefined,
        ...locationFields,  // latitude / longitude / localityId / localityName /
                            // postTown / ladDistrict / adminCounty / region /
                            // locationCountry / locationResolvedAt /
                            // locationConfidence = POSTCODE_CENTROID
        // Branch Location Trust Slice 1: on a passed cross-check ONLY, overwrite
        // the centroid coords with the exact Google pin + record googlePlaceId.
        ...(trustedLocation ? {
          latitude:      trustedLocation.latitude,
          longitude:     trustedLocation.longitude,
          googlePlaceId: trustedLocation.googlePlaceId,
        } : {}),
        // And override the POSTCODE_CENTROID snapshot with ADDRESS_GEOCODED (pass)
        // or NEEDS_REVIEW (fail). Absent when no suggestion rode along.
        ...(confidenceOverride ? { locationConfidence: confidenceOverride } : {}),
      },
      include: BRANCH_INCLUDE,
    })
    await writeAuditLogTx(tx, {
      entityId: branch.id, entityType: 'branch', event: 'BRANCH_CREATED',
      actorId: actor.id, actorType: actor.type, reason: actor.reason,
      // Branches PR-6 (§4b): fold the Google suggestion into the existing
      // BRANCH_CREATED audit metadata as admin-review metadata. No new audit row;
      // no Branch column; no confidence write (locationConfidence is set ONLY by
      // resolveBranchLocationFields above = POSTCODE_CENTROID).
      metadata: {
        merchantId,
        staged: stageForApproval,
        ...(locationSuggestion ? { locationSuggestion: locationSuggestionMetadata(locationSuggestion) } : {}),
      },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
    // Branches PR-5: a staged branch carries a BRANCH_CREATE approval (referenceId =
    // the branch id directly; referenceType 'branch'). The admin actioner approves it
    // (confirming the precise location via the reused confirm-location flow) to flip
    // the branch LIVE. Created in the SAME transaction as the branch so a pending
    // branch always has its approval.
    if (stageForApproval) {
      await tx.adminApproval.create({
        data: {
          type:          'BRANCH_CREATE',
          status:        'PENDING',
          referenceId:   branch.id,
          referenceType: 'branch',
          comment:       `Branch ${branch.id} created and awaiting approval`,
        },
      })
    }
    return branch
  })
}

export async function createBranch(
  prisma: PrismaClient,
  adminId: string,
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string },
  // Branches PR-6 (§4b): resolved at the route boundary from the candidateToken
  // (NEVER a fresh Google call). Threaded straight into the core's audit metadata.
  locationSuggestion?: BranchLocationSuggestion,
) {
  // Branches PR-5 (D5): OWNER-only (resolveAdminMerchant denies a non-owner by
  // construction with INVALID_CREDENTIALS; keeps the SEC-M2 suspended guard). Do NOT
  // migrate to assertCanManageBranch — D3 reserves create to OWNERS.
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)

  // The pending-vs-instant discriminator is BRANCH COUNT, NOT merchant.status: only
  // the merchant's FIRST branch (the main branch, count===0 over non-deleted,
  // non-PENDING_CREATE rows) is created INSTANT (it is reviewed as part of the
  // merchant onboarding approval). EVERY subsequent merchant-created branch (count>=1,
  // INCLUDING a second branch added pre-live during onboarding — the Codex case)
  // stages for its own BRANCH_CREATE approval. Keying on merchant.status was too
  // broad: a pre-live merchant could otherwise add an unreviewed second branch that
  // would go live the moment onboarding was approved.
  const existingNonDeletedBranchCount = await prisma.branch.count({
    where: { merchantId, deletedAt: null, lifecycleStatus: { not: 'PENDING_CREATE' } },
  })
  const stageForApproval = existingNonDeletedBranchCount >= 1

  // Wire hygiene: the merchant create response never carries the pin ciphertext
  // (the admin route curates its own shape via toAdminBranchShape).
  return toMerchantBranch(await createBranchCore(
    prisma,
    { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } },
    data,
    ctx,
    stageForApproval,
    locationSuggestion,
  ))
}

/**
 * Branches PR-5 (D5): cancel a pending-create branch (merchant, OWNER-only). The
 * branch never went live (it is PENDING_CREATE + isActive=false + customer-invisible
 * + has no redemption/review/favourite data), so a hard cleanup is acceptable: delete
 * the branch row + withdraw its BRANCH_CREATE approval. Mirrors
 * withdrawBranchEditRequest. Guards BRANCH_NOT_FOUND (unknown/owned-else) +
 * BRANCH_NOT_PENDING_CREATE (the branch is not awaiting create approval).
 */
export async function cancelPendingCreate(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  // OWNER-only (resolveAdminMerchant). Do NOT use assertCanManageBranch — D3 reserves
  // branch create/cancel to OWNERS.
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
    select: { id: true, lifecycleStatus: true },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  if (branch.lifecycleStatus !== 'PENDING_CREATE') throw new AppError('BRANCH_NOT_PENDING_CREATE')

  await prisma.$transaction(async (tx) => {
    // DELETE the open BRANCH_CREATE approval (referenceId = branch id). The branch is
    // being hard-deleted and never went live, so the never-actioned pending approval
    // is removed outright (ApprovalStatus has no WITHDRAWN value; a dangling approval
    // pointing at a deleted branch would be a junk queue row). deleteMany so a
    // (defensive) missing approval is not fatal.
    await tx.adminApproval.deleteMany({
      where: { type: 'BRANCH_CREATE', referenceId: branchId, status: 'PENDING' },
    })
    await writeAuditLogTx(tx, {
      entityId: branchId, entityType: 'branch', event: 'BRANCH_CREATE_CANCELLED',
      actorId: adminId, actorType: 'MERCHANT_ADMIN',
      metadata: { merchantId },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
    // Hard-delete the never-live branch row LAST (the audit references its id above).
    await tx.branch.delete({ where: { id: branchId } })
  })

  return { ok: true as const }
}

/**
 * Option B B2.1: the shared simple-DIRECT branch apply core. Resolves +
 * ownership-validates the branch, filters `data` to DIRECT_FIELDS, captures a
 * before-snapshot, then writes + audits inside one transaction. BOTH the merchant
 * route (via `updateBranch`) and the new admin route call this so the
 * validation/apply/audit is identical (no weaker path). The audit row uses the
 * CORRECTED entity (entityType:'branch', entityId:branchId; matching the admin
 * precedents confirmBranchLocation + B1 editApplier) and carries the actor +
 * before/after + the ADMIN reason.
 */
export async function updateBranchDirectCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  branchId: string,
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const safe: Record<string, unknown> = {}
  for (const key of DIRECT_FIELDS) {
    if (key in data) safe[key] = data[key]
  }

  const branch = await resolveBranch(prisma, branchId, merchantId)
  if (Object.keys(safe).length === 0) return toMerchantBranch(branch)

  const before: Record<string, unknown> = {}
  for (const k of Object.keys(safe)) before[k] = (branch as any)[k]

  return prisma.$transaction(async (tx) => {
    const updated = await tx.branch.update({
      where: { id: branchId },
      data: safe,
      include: BRANCH_INCLUDE,
    })
    await writeAuditLogTx(tx, {
      entityId: branchId,
      entityType: 'branch',
      event: 'BRANCH_UPDATED',
      actorId: actor.id,
      actorType: actor.type,
      before,
      after: safe,
      reason: actor.reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: { merchantId },
    })
    // Wire hygiene: the shared core serves BOTH the merchant route and the admin
    // on-behalf route - neither client has any use for the pin ciphertext.
    return toMerchantBranch(updated)
  })
}

/**
 * M2 B1 (D1): the draft-window SENSITIVE-direct branch apply core. Writes the
 * sensitive branch fields directly (transactional + actor audit), re-resolving
 * location via `resolveBranchLocationFields` when `postcode` is among the changes
 * (so a postcode change re-anchors lat/lng/locality to the postcode centroid -
 * NEVER writes a raw postcode without re-resolving). ONLY reachable from the
 * draft window (`updateBranch` gates on `isDraftWindow`); outside it the sensitive
 * fields keep routing through the governed `createBranchEditRequest` lane.
 *
 * Direct fields in the same payload are written alongside the sensitive ones. The
 * postcode resolve STAYS before the transaction (a bad postcode / gazetteer outage
 * must reject before opening a tx), matching `createBranchCore`.
 */
async function updateBranchSensitiveDirectCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  branchId: string,
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string },
  // Branches PR-6 (§4b): the draft-window direct edit is a direct-write path like
  // create — the Google suggestion is recorded in the BRANCH_UPDATED audit
  // metadata only (no Branch column, no confidence write).
  locationSuggestion?: BranchLocationSuggestion,
) {
  const branch = await resolveBranch(prisma, branchId, merchantId)

  const safe: Record<string, unknown> = {}
  for (const key of SENSITIVE_FIELDS) if (key in data) safe[key] = data[key]
  for (const key of DIRECT_FIELDS) if (key in data) safe[key] = data[key]
  if (Object.keys(safe).length === 0) return toMerchantBranch(branch)

  // Re-resolve location on a postcode change (mirrors createBranchCore +
  // createBranchEditRequest). The resolved snapshot OVERWRITES any caller-supplied
  // latitude/longitude in `safe` - a postcode change re-anchors the pin to the
  // postcode centroid. trim() the candidate up front (PR #81 contract).
  if (typeof safe.postcode === 'string' && safe.postcode.trim().length > 0) {
    const locationFields = await resolveBranchLocationFields(prisma, safe.postcode as string)
    Object.assign(safe, locationFields)
  }

  const before: Record<string, unknown> = {}
  for (const k of Object.keys(safe)) before[k] = (branch as any)[k]

  return prisma.$transaction(async (tx) => {
    const updated = await tx.branch.update({
      where: { id: branchId },
      data: safe,
      include: BRANCH_INCLUDE,
    })
    await writeAuditLogTx(tx, {
      entityId: branchId,
      entityType: 'branch',
      event: 'BRANCH_UPDATED',
      actorId: actor.id,
      actorType: actor.type,
      before,
      after: safe,
      reason: actor.reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      // Branches PR-6 (§4b): fold the Google suggestion into the existing
      // BRANCH_UPDATED audit metadata (admin-review metadata only).
      metadata: {
        merchantId,
        ...(locationSuggestion ? { locationSuggestion: locationSuggestionMetadata(locationSuggestion) } : {}),
      },
    })
    return toMerchantBranch(updated)
  })
}

export async function updateBranch(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string },
  // Branches PR-6 (§4b): resolved at the route boundary from the candidateToken.
  // Forwarded to whichever apply path the PATCH fans out to — the draft-window
  // SENSITIVE-direct core OR the governed createBranchEditRequest lane. The
  // simple-DIRECT path (phone/email/websiteUrl/isActive) is not an address edit,
  // so it ignores the suggestion.
  locationSuggestion?: BranchLocationSuggestion,
) {
  // Staff & Access PR-2 (D3, spec §3 PR-2): the PATCH route is split by
  // authorization WITHIN the service.
  //   - setting `isMainBranch` is an OWNER-ONLY action (assertOwner);
  //   - setting `isActive` is an OWNER-ONLY action — it takes the branch offline
  //     (removed from all customer discovery feeds), which is close/lifecycle-
  //     adjacent and D3-reserved to OWNERS (same reasoning as `isMainBranch`);
  //   - the draft-window SENSITIVE-direct path is onboarding (REGISTERED /
  //     NEEDS_CHANGES) and stays OWNER-ONLY (it is not a day-2 BM action);
  //   - the live-merchant SENSITIVE → governed edit-request lane is BM-allowed
  //     for an assigned branch (it routes through createBranchEditRequest, which
  //     re-resolves its own scope);
  //   - the BM-allowed simple-DIRECT subset is phone/email/websiteUrl only.
  // resolveMerchantContext keeps the SEC-M2 suspended-merchant guard.
  // assertCanManageBranch requires OWNER (any branch) OR BRANCH_MANAGER (assigned
  // branch only) — STAFF is view/validate-only and is denied even when assigned.
  const ctxMerchant = await resolveMerchantContext(prisma, adminId)
  assertCanManageBranch(ctxMerchant, branchId)
  const { merchantId } = ctxMerchant

  // OWNER-ONLY: changing the active flag is close/lifecycle-adjacent (D3 grants a
  // Branch Manager view/contact/amenities/PIN/edit-request/withdraw, and DENIES
  // close/request-close). Gate BEFORE any DB write so a BM PATCHing `isActive`
  // gets 403 with NO branch update.
  if ('isActive' in data) assertOwner(ctxMerchant)

  await resolveBranch(prisma, branchId, merchantId)

  // Build safe update object (only direct fields)
  const safe: Record<string, unknown> = {}
  for (const key of DIRECT_FIELDS) {
    if (key in data) safe[key] = data[key]
  }

  // Handle isMainBranch promotion atomically — OWNER-ONLY (a BM cannot set-main).
  if (data.isMainBranch === true) {
    assertOwner(ctxMerchant)
    const updated = await prisma.$transaction(async (tx) => {
      await tx.branch.updateMany({
        where: { merchantId, isMainBranch: true },
        data: { isMainBranch: false },
      })
      return tx.branch.update({
        where: { id: branchId },
        data: { ...safe, isMainBranch: true },
        include: BRANCH_INCLUDE,
      })
    })
    writeAuditLog(prisma, {
      entityId: merchantId, entityType: 'merchant',
      event: 'BRANCH_MAIN_CHANGED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      metadata: { newMainBranchId: branchId },
    })
    writeAuditLog(prisma, {
      entityId: merchantId, entityType: 'merchant',
      event: 'BRANCH_UPDATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      metadata: { branchId },
    })
    return toMerchantBranch(updated)
  }

  // M2 B1 (D1): sensitive branch fields write DIRECTLY in the draft window
  // (status REGISTERED, or onboardingStep NEEDS_CHANGES) with postcode
  // re-resolution; outside it they keep routing through the governed
  // createBranchEditRequest lane. The lifecycle read is a single targeted select.
  const attemptedSensitive = SENSITIVE_FIELDS.filter(key => key in data)
  if (attemptedSensitive.length > 0) {
    const lifecycle = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { status: true, onboardingStep: true },
    })
    if (!lifecycle) throw new AppError('MERCHANT_NOT_FOUND')

    if (isDraftWindow(lifecycle)) {
      // Draft window: apply sensitive (+ any direct) fields directly, re-resolving
      // location on a postcode change. This is the ONBOARDING path (status
      // REGISTERED / onboardingStep NEEDS_CHANGES), not a day-2 action, so it
      // stays OWNER-ONLY (PR-2 D3: a Branch Manager cannot direct-write sensitive
      // identity fields).
      assertOwner(ctxMerchant)
      return updateBranchSensitiveDirectCore(
        prisma,
        { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } },
        branchId,
        data,
        ctx,
        locationSuggestion,
      )
    }

    // Live / governed: route the sensitive fields through the EXISTING
    // edit-request lane (createBranchEditRequest does its own scope re-check via
    // resolveMerchantContext + assertBranchAllowed, PENDING_EDIT_EXISTS guard, and
    // eager postcode resolution). BM-allowed for an assigned branch (D3 lists
    // branch-details review requests as a BM action). The Google suggestion (if
    // any) rides into proposedChanges + audit as admin-review metadata.
    return createBranchEditRequest(prisma, adminId, branchId, data, false, ctx, locationSuggestion)
  }

  // Simple-DIRECT path: delegate to the shared core so the merchant path and
  // the admin path run identical validation/apply/audit. The core re-resolves +
  // ownership-validates the branch and filters `data` to DIRECT_FIELDS itself.
  return updateBranchDirectCore(
    prisma,
    { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } },
    branchId,
    data,
    ctx
  )
}

export async function createBranchEditRequest(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  proposedChanges: Record<string, unknown>,
  includesPhotos: boolean,
  ctx: { ipAddress: string; userAgent: string },
  // Branches PR-6 (§4b): an OPTIONAL resolved Google suggestion staged as a
  // metadata sub-key in proposedChanges (NOT an applicable Branch field — the
  // editApplier's allow-lists never pick it up at apply time) PLUS the audit
  // metadata. The address fields apply through this lane as normal; the postcode
  // resolver still stamps POSTCODE_CENTROID. NEVER a confidence write.
  locationSuggestion?: BranchLocationSuggestion,
) {
  // Staff & Access PR-2 (D3): submitting a branch-details review request is a
  // BM-allowed action for an assigned branch. Scope-enforced via
  // resolveMerchantContext + assertCanManageBranch — OWNER (any) OR BRANCH_MANAGER
  // (assigned), STAFF denied (keeps the SEC-M2 suspended guard).
  const ctxMerchant = await resolveMerchantContext(prisma, adminId)
  assertCanManageBranch(ctxMerchant, branchId)
  const { merchantId } = ctxMerchant
  await resolveBranch(prisma, branchId, merchantId)

  // Filter to only sensitive fields
  const filtered: Record<string, unknown> = {}
  for (const key of SENSITIVE_FIELDS) {
    if (key in proposedChanges) filtered[key] = proposedChanges[key]
  }

  if (Object.keys(filtered).length === 0 && !includesPhotos) {
    throw new AppError('NO_SENSITIVE_FIELDS')
  }

  // Plan 4 M1.21 — when the merchant is proposing a postcode change, eagerly
  // resolve and stash the full location snapshot in the pending edit so admin
  // approval is a clean apply. Two benefits: (a) merchant gets immediate
  // POSTCODE_NOT_FOUND / GAZETTEER_UNAVAILABLE feedback BEFORE admin sees the
  // request; (b) `proposedChanges.localityId` etc. are present at admin-approval
  // time so the apply step doesn't need to re-resolve.
  //
  // Resolved snapshot overwrites any caller-supplied latitude/longitude in
  // `filtered` — a postcode change re-anchors the pin to the postcode
  // centroid; pin-drop refinement is a separate (no-postcode) edit path.
  //
  // PR #81 review follow-up — trim() the postcode candidate before the
  // length check. A whitespace-only payload ("   ") would pass `length > 0`
  // and then trip resolvePostcode into the < 5-char POSTCODE_NOT_FOUND
  // branch; trimming up front gives a cleaner contract.
  if (typeof filtered.postcode === 'string' && filtered.postcode.trim().length > 0) {
    const locationFields = await resolveBranchLocationFields(prisma, filtered.postcode as string)
    Object.assign(filtered, locationFields)
  }

  // Branches PR-6 (§4b): stash the resolved Google suggestion as a metadata
  // sub-key AFTER the SENSITIVE_FIELDS filter so it survives into proposedChanges
  // (it is NOT a sensitive field, so the filter above would otherwise drop it).
  // The key is deliberately not a Branch field name — editApplier.approveEdit
  // applies ONLY BRANCH_SENSITIVE_FIELDS + BRANCH_LOCATION_SNAPSHOT_FIELDS via
  // pickAllowed, so __locationSuggestion is NEVER written to a Branch column, and
  // getEditReviewContext's diff (which iterates BRANCH_SENSITIVE_FIELDS) never
  // surfaces it. Admin-review metadata only; NO confidence write.
  if (locationSuggestion) {
    filtered[LOCATION_SUGGESTION_KEY] = locationSuggestionMetadata(locationSuggestion)
  }

  // Check for existing PENDING edit
  const existingEdit = await prisma.branchPendingEdit.findFirst({
    where: { branchId, status: 'PENDING' },
  })
  if (existingEdit) throw new AppError('PENDING_EDIT_EXISTS')

  const pendingEdit = await prisma.branchPendingEdit.create({
    data: {
      branchId,
      merchantId,
      proposedChanges: filtered as any,
      includesPhotos,
      status: 'PENDING',
    },
  })

  await prisma.adminApproval.create({
    data: {
      type:          'BRANCH_IDENTITY_EDIT',
      status:        'PENDING',
      referenceId:   pendingEdit.id,
      referenceType: 'branch_pending_edit',
      comment:       `Branch ${branchId} requested identity field changes`,
    },
  })

  writeAuditLog(prisma, {
    entityId: merchantId, entityType: 'merchant',
    event: 'BRANCH_EDIT_REQUEST_CREATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: {
      branchId,
      pendingEditId: pendingEdit.id,
      // Branches PR-6 (§4b): admin-review metadata; no Branch column, no confidence write.
      ...(locationSuggestion ? { locationSuggestion: locationSuggestionMetadata(locationSuggestion) } : {}),
    },
  })
  return pendingEdit
}

export async function createBranchPhotoEditRequest(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  photoChanges: { add?: string[]; remove?: string[] },
  ctx: { ipAddress: string; userAgent: string }
) {
  // Branches PR-3 (§6a, D-PR3-4 add-via-review): submitting a photo review request
  // is a branch-management WRITE per umbrella D3 — OWNER (any branch) OR
  // BRANCH_MANAGER (assigned branch), completable WITHOUT canManageVouchers; a portal
  // STAFF member is DENIED even when assigned. Uses the role-aware resolver +
  // assertCanManageBranch (which runs BEFORE any write, so a BM can never act on an
  // unassigned branch and STAFF can never submit a photo edit). Mirrors the PR-2
  // createBranchEditRequest write guard; keeps the SEC-M2 suspended guard.
  const ctxMerchant = await resolveMerchantContext(prisma, adminId)
  assertCanManageBranch(ctxMerchant, branchId)
  const { merchantId } = ctxMerchant
  await resolveBranch(prisma, branchId, merchantId)

  // Branches PR-3 (§3 + D-PR3-1): `add` is image URLs validated as OWNED uploads our
  // storage produced for THIS merchant's `photo` kind (external / other-merchant /
  // other-kind URLs are rejected with INVALID_PHOTO_URL — see below); `remove` is
  // BranchPhoto IDs (NEVER URLs). Validate every `remove` id belongs to THIS branch
  // before storing — a foreign / unknown id is rejected so an admin-apply can never
  // resolve a cross-branch delete. (remove-by-ID, branch-scoped, data-loss-safe.)
  const removeIds = Array.isArray(photoChanges.remove)
    ? photoChanges.remove.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []
  if (removeIds.length > 0) {
    const owned = await prisma.branchPhoto.findMany({
      where: { id: { in: removeIds }, branchId },
      select: { id: true },
    })
    const ownedSet = new Set(owned.map((p) => p.id))
    const foreign = removeIds.filter((id) => !ownedSet.has(id))
    if (foreign.length > 0) throw new AppError('BRANCH_PHOTO_NOT_FOUND')
  }

  // Branches PR-3 (P1 trust-boundary fix): an `add` URL is NOT trusted from the
  // request — it MUST be an OWNED upload our storage minted, i.e. a public URL that
  // parses back (via parsePublicUrl) to kind `photo` AND ownerId === THIS merchantId.
  // Branch-photo uploads (uploadBranchPhotoAsset -> uploadMerchantImage(kind:'photo',
  // merchantId)) mint exactly `${R2_PUBLIC_BASE_URL}/photo/<merchantId>/<rand>.<ext>`,
  // so a valid add URL inverts to { kind:'photo', ownerId:merchantId }. This rejects:
  //   - an EXTERNAL origin / malformed / traversal key (parsePublicUrl -> null),
  //   - an OTHER-KIND upload (logo / banner / document / voucher),
  //   - an OTHER-MERCHANT photo (ownerId !== merchantId).
  // Closing this means an admin-apply (editApplier) can only ever turn a
  // server-validated owned asset into an APPROVED BranchPhoto, never an unvalidated
  // external image that skipped the upload route's type/size/dimension checks.
  //
  // NOTE: the key encodes the OWNER (merchantId), NOT the branchId — so reusing the
  // merchant's OWN validated photo asset across the merchant's OWN branches is
  // permitted BY DESIGN (it is still an owned, validated image of the right kind).
  // The persisted `proposedChanges` shape is unchanged ({ add, remove }); this is a
  // gate, not a rewrite, and the editApplier trusts this validated-at-submission data.
  const addUrls = Array.isArray(photoChanges.add)
    ? photoChanges.add.filter((url): url is string => typeof url === 'string' && url.length > 0)
    : []
  for (const url of addUrls) {
    const parsed = parsePublicUrl(url)
    if (!parsed || parsed.kind !== 'photo' || parsed.ownerId !== merchantId) {
      throw new AppError('INVALID_PHOTO_URL')
    }
  }

  // Check for existing PENDING edit
  const existingEdit = await prisma.branchPendingEdit.findFirst({
    where: { branchId, status: 'PENDING' },
  })
  if (existingEdit) throw new AppError('PENDING_EDIT_EXISTS')

  const pendingEdit = await prisma.branchPendingEdit.create({
    data: {
      branchId,
      merchantId,
      proposedChanges: photoChanges,
      includesPhotos: true,
      status: 'PENDING',
    },
  })

  await prisma.adminApproval.create({
    data: {
      type:          'BRANCH_IDENTITY_EDIT',
      status:        'PENDING',
      referenceId:   pendingEdit.id,
      referenceType: 'branch_pending_edit',
      comment:       `Branch ${branchId} requested photo changes`,
    },
  })

  writeAuditLog(prisma, {
    entityId: merchantId, entityType: 'merchant',
    event: 'BRANCH_EDIT_REQUEST_CREATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { branchId, pendingEditId: pendingEdit.id, includesPhotos: true },
  })
  return pendingEdit
}

/**
 * Branches PR-3 (§6c, D-PR3-4 add-via-review): branch-scoped photo-ASSET upload.
 * Gated by BRANCH MANAGEMENT, not voucher delegation: OWNER may upload for ANY
 * branch; BRANCH_MANAGER may upload ONLY for ASSIGNED branches; a portal STAFF
 * member is DENIED even when assigned; NEITHER allowed role requires
 * canManageVouchers. assertCanManageBranch runs BEFORE any bytes are written, so a
 * BM can never upload against an unassigned branch and STAFF can never upload at all
 * (this is a branch-management WRITE — adding a photo via review is content authoring,
 * not view/validate).
 *
 * Deliberately ISOLATED from the voucher `kind:'photo'` upload (which keeps its
 * assertCanManageVouchers gate UNCHANGED — see src/api/merchant/upload/routes.ts):
 * canManageVouchers must NOT silently become the branch-photo key. This path reuses
 * the SAME image validation (type/size caps + dimensions) + R2 storage via
 * uploadMerchantImage(kind:'photo'), only the AUTH differs.
 *
 * Returns { url } (same shape as the existing upload). The asset is NOT bound to the
 * branch by this call; the URL then feeds createBranchPhotoEditRequest({ add:[url] })
 * (also branch-scoped, §6a) -> admin approval makes it a live BranchPhoto row. The
 * branchId here is used ONLY for the assertCanManageBranch check.
 */
export async function uploadBranchPhotoAsset(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  file: { contentType: string; body: Buffer }
): Promise<{ url: string }> {
  const ctxMerchant = await resolveMerchantContext(prisma, adminId)
  assertCanManageBranch(ctxMerchant, branchId)
  const { merchantId } = ctxMerchant
  // Confirm the branch is owned + live before spending the upload (also re-asserts
  // the branch belongs to this merchant, defence-in-depth beyond assertCanManageBranch).
  await resolveBranch(prisma, branchId, merchantId)

  return uploadMerchantImage({
    merchantId,
    kind: 'photo',
    contentType: file.contentType,
    body: file.body,
  })
}

/**
 * Branches PR-3 (§6b, D-PR3-2 + D-PR3-4 EXPLICIT EXCEPTION): instant removal of a
 * LIVE branch photo. OWNER-ONLY in v1 (resolveAdminMerchant) — removal is immediate,
 * UNREVIEWED (no admin gate, unlike add-via-review), customer-visible, and a
 * permanent delete with no undo, so a non-owner instant destructive action is not
 * granted in v1. (A BM-assigned removal is the documented owner-decision alternative;
 * if chosen, switch to resolveMerchantContext + assertBranchAllowed.)
 *
 * Data-loss-safe: the photo is found by `id` AND `branchId` (remove-by-ID, never by
 * URL; never cross-branch). Only an APPROVED (live) row is removable — a PENDING /
 * FLAGGED row is guarded out (pending adds are not rows, so they never reach here).
 * The delete + the MERCHANT_ADMIN-actor before-snapshot audit run in ONE transaction.
 * Customer effect: row gone -> immediately out of the APPROVED read set -> invisible.
 */
export async function removeBranchPhoto(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  photoId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  // OWNER-ONLY (D-PR3-4 exception). resolveAdminMerchant denies a non-owner by
  // construction (getOwnerMembership -> null -> INVALID_CREDENTIALS) and keeps the
  // SEC-M2 suspended-merchant guard.
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  // Confirm the branch is owned + live (deletedAt: null) before touching photos.
  await resolveBranch(prisma, branchId, merchantId)

  // Find the photo by id AND branchId (branch-scoped; an id not on this branch ->
  // 404, never a cross-branch read or delete).
  const photo = await prisma.branchPhoto.findFirst({
    where: { id: photoId, branchId },
    select: { id: true, url: true, moderationStatus: true },
  })
  if (!photo) throw new AppError('BRANCH_PHOTO_NOT_FOUND')

  // Instant-removal is for LIVE photos only. A non-APPROVED row (PENDING / FLAGGED)
  // is not customer-visible and is not part of this lane -> 409.
  if (photo.moderationStatus !== 'APPROVED') throw new AppError('PHOTO_NOT_REMOVABLE')

  await prisma.$transaction(async (tx) => {
    await tx.branchPhoto.delete({ where: { id: photo.id } })
    await writeAuditLogTx(tx, {
      entityId: branchId,
      entityType: 'branch',
      event: 'BRANCH_PHOTO_REMOVED',
      actorId: adminId,
      actorType: 'MERCHANT_ADMIN',
      before: { id: photo.id, url: photo.url, moderationStatus: photo.moderationStatus },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: { merchantId, branchId, photoId: photo.id },
    })
  })

  return { ok: true as const }
}

export async function listBranchEditRequests(
  prisma: PrismaClient,
  adminId: string,
  branchId: string
) {
  // Staff & Access PR-2 (D3): viewing pending requests for an assigned branch is
  // a BM-allowed read paired with the withdraw action below.
  const ctxMerchant = await resolveMerchantContext(prisma, adminId)
  assertBranchAllowed(ctxMerchant, branchId)
  const { merchantId } = ctxMerchant
  await resolveBranch(prisma, branchId, merchantId)
  return prisma.branchPendingEdit.findMany({
    where: { branchId, merchantId },
    orderBy: { createdAt: 'desc' },
  })
}

// Hygiene fix (2026-07-07, aligning with the voucher governed-flows lane,
// #411): withdrawing a PENDING BranchPendingEdit used to flip only the edit
// row -> WITHDRAWN and leave its linked AdminApproval{BRANCH_IDENTITY_EDIT}
// PENDING forever (a dangling admin-queue row) — same gap class as the
// merchant profile sibling (withdrawMerchantEditRequest). Mirrors
// withdrawVoucherPendingEdit's exact convention: edit -> WITHDRAWN AND its
// AdminApproval (matched by type + referenceId=editId, status PENDING;
// CHANGES_REQUESTED is onboarding/VOUCHER-only per editApplier.ts, so it never
// applies to this type) -> WITHDRAWN with the claim cleared, atomically. The
// approval lookup is optional (a historical row created before this fix, or
// one already actioned, does not block the edit withdraw).
export async function withdrawBranchEditRequest(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  editId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  // Staff & Access PR-2 (D3): withdrawing a pending request for an assigned
  // branch is a BM-allowed WRITE — OWNER (any) OR BRANCH_MANAGER (assigned),
  // STAFF denied.
  const ctxMerchant = await resolveMerchantContext(prisma, adminId)
  assertCanManageBranch(ctxMerchant, branchId)
  const { merchantId } = ctxMerchant
  await resolveBranch(prisma, branchId, merchantId)

  const edit = await prisma.branchPendingEdit.findFirst({
    where: { id: editId, branchId, merchantId },
  })
  if (!edit) throw new AppError('PENDING_EDIT_NOT_FOUND')
  if (edit.status !== 'PENDING') throw new AppError('PENDING_EDIT_NOT_FOUND')

  return prisma.$transaction(async (tx) => {
    const updated = await tx.branchPendingEdit.update({
      where: { id: editId },
      data: { status: 'WITHDRAWN', reviewedAt: new Date() },
    })
    const approval = await tx.adminApproval.findFirst({
      where: { type: 'BRANCH_IDENTITY_EDIT', referenceId: editId, status: 'PENDING' },
      select: { id: true },
    })
    if (approval) {
      await tx.adminApproval.update({
        where: { id: approval.id },
        data: {
          status: 'WITHDRAWN',
          claimedById: null,
          claimedAt: null,
          actionedAt: new Date(),
          comment: 'Merchant withdrew the request',
        },
      })
    }
    await writeAuditLogTx(tx, {
      entityId: merchantId, entityType: 'merchant',
      event: 'BRANCH_EDIT_REQUEST_WITHDRAWN',
      actorId: adminId, actorType: 'MERCHANT_ADMIN',
      metadata: { branchId, editId },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
    return updated
  })
}

// Branches PR-4 (umbrella D4): the opening-hours customer cool-off window. A merchant
// hours edit does NOT go live immediately — it stages a durable
// BranchOpeningHoursPending row with effectiveAt = now + PROMOTION_WINDOW_MS and a
// worker promotes it (upserts the live BranchOpeningHours) after the window. 2 hours
// is a constant, NOT configurable (matches D4). Customers keep seeing the current
// live hours until promotion.
export const PROMOTION_WINDOW_MS = 2 * 60 * 60 * 1000 // 2 h

export async function setOpeningHours(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  hours: Array<{ dayOfWeek: number; openTime?: string; closeTime?: string; isClosed: boolean }>
) {
  // M2 B4 (D8a): validate BEFORE any DB work, so a bad payload (closed-day-with-times
  // / malformed time / bad 24:00 / zero-length period / overlapping windows) rejects
  // with OPENING_HOURS_INVALID before the staging write runs. Overnight close
  // (close < open) is accepted (the customer-app consumer treats it as crossing
  // midnight). Under PR-8 the staged payload is now MULTI-WINDOW: N rows per day
  // (the single-window-per-day model is gone), validated by the multi-window
  // validateOpeningHours (per-day no-overlap rule).
  validateOpeningHours(hours)

  // Branches PR-4 (§4a step 2 / §7): branch-management WRITE — OWNER (any branch) OR
  // assigned BRANCH_MANAGER; STAFF denied even when assigned. A deliberate widening
  // from today's OWNER-only resolveAdminMerchant (locked by D3), mirroring
  // setAmenities. resolveMerchantContext keeps the SEC-M2 suspended-merchant guard.
  const ctx = await resolveMerchantContext(prisma, adminId)
  assertCanManageBranch(ctx, branchId)
  const { merchantId } = ctx
  await resolveBranch(prisma, branchId, merchantId)

  // STAGE, do NOT upsert the live BranchOpeningHours. Supersede semantics (§4a):
  // a new stage SUPERSEDES any existing PENDING row for the branch (the prior
  // PENDING is CANCELLED; the new one takes a fresh effectiveAt = now + 2h). The
  // cancel-then-create runs in ONE transaction in that order, so at no instant do
  // two PENDING rows coexist and the partial unique ("branchId") WHERE
  // status='PENDING' is never violated; a racing second stage that tries to create
  // a second PENDING fails the unique and retries cleanly.
  const effectiveAt = new Date(Date.now() + PROMOTION_WINDOW_MS)
  const pending = await prisma.$transaction(async (tx) => {
    await tx.branchOpeningHoursPending.updateMany({
      where: { branchId, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })
    return tx.branchOpeningHoursPending.create({
      data: {
        branchId,
        merchantId,
        proposedHours: hours,
        effectiveAt,
        status: 'PENDING',
        createdBy: ctx.adminId,
      },
    })
  })

  // Enqueue the delayed promotion NUDGE (§4a step 5 / §4c). The stable jobId keyed
  // on branchId lets a re-stage replace the prior delayed job (BullMQ same-jobId
  // dedup). The handler (PROMOTE_PENDING_HOURS_JOB) + the durable repeatable sweep
  // that GUARANTEES promotion both land in the promotion dispatch (PR-4 §4c); they
  // re-read the durable row and skip any non-PENDING / cancelled record.
  //
  // The separator is '-' NOT ':' because BullMQ FORBIDS a colon in a custom jobId
  // ("Custom Id cannot contain :") and throws at add() time. A colon here surfaced
  // as an opaque 500 on every branch hours save (createBranch succeeds, then this
  // sub-step crashes -> "We could not save your branch"). enqueue() now also guards
  // this class centrally.
  await enqueue(
    MAINTENANCE_QUEUE,
    { job: PROMOTE_PENDING_HOURS_JOB, pendingId: pending.id },
    { jobId: `promote-hours-${branchId}`, delay: PROMOTION_WINDOW_MS },
  )

  return pending
}

/**
 * Branches PR-4 (§4b): cancel/withdraw a staged opening-hours change BEFORE it
 * promotes. Same branch-management WRITE boundary as the stage write
 * (resolveMerchantContext + assertCanManageBranch — OWNER any / assigned
 * BRANCH_MANAGER / STAFF denied). Marks the branch's PENDING row CANCELLED +
 * cancelledAt; the outstanding delayed job becomes a no-op because the promotion
 * handler re-reads the row and skips a non-PENDING record (never trusts job.data).
 * Does NOT touch the live BranchOpeningHours — the live hours only ever change on
 * promotion. Throws PENDING_HOURS_NOT_FOUND (404) when there is no PENDING row.
 */
export async function cancelPendingHours(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
) {
  const ctx = await resolveMerchantContext(prisma, adminId)
  assertCanManageBranch(ctx, branchId)
  const { merchantId } = ctx
  await resolveBranch(prisma, branchId, merchantId)

  const res = await prisma.branchOpeningHoursPending.updateMany({
    where: { branchId, status: 'PENDING' },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  })
  if (res.count === 0) throw new AppError('PENDING_HOURS_NOT_FOUND')

  return { ok: true as const }
}

export async function setAmenities(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  amenityIds: string[]
) {
  // Staff & Access PR-2 (D3): editing amenities (an instant operational field)
  // for an assigned branch is a BM-allowed WRITE — OWNER (any) OR BRANCH_MANAGER
  // (assigned), STAFF denied.
  const ctxMerchant = await resolveMerchantContext(prisma, adminId)
  assertCanManageBranch(ctxMerchant, branchId)
  const { merchantId } = ctxMerchant
  await resolveBranch(prisma, branchId, merchantId)

  await prisma.branchAmenity.deleteMany({ where: { branchId } })
  if (amenityIds.length > 0) {
    await prisma.branchAmenity.createMany({
      data: amenityIds.map(amenityId => ({ branchId, amenityId })),
    })
  }

  return { ok: true }
}

/**
 * Branches PR-7 (§6 / §7): set the per-branch redemption-alerts opt-in. Same
 * branch-management WRITE boundary as the PR-4 hours toggle + setAmenities
 * (resolveMerchantContext + assertCanManageBranch — OWNER any branch || assigned
 * BRANCH_MANAGER; STAFF denied even when assigned; suspended merchant -> the
 * SEC-M2 MERCHANT_SUSPENDED guard inside resolveMerchantContext). When ON, an
 * in-store validation fans out an IN_APP VOUCHER_REDEEMED bell to the merchant's
 * active owner(s) + the branch's scope-covering Branch Managers (the producer in
 * verifyRedemption); email stays dark.
 */
export async function setRedemptionAlerts(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  enabled: boolean,
) {
  const ctx = await resolveMerchantContext(prisma, adminId)
  assertCanManageBranch(ctx, branchId)
  const { merchantId } = ctx
  // BRANCH_NOT_FOUND for an unknown / other-merchant / deleted branch (defence in
  // depth beyond assertCanManageBranch's scope check).
  await resolveBranch(prisma, branchId, merchantId)

  const updated = await prisma.branch.update({
    where: { id: branchId },
    data:  { redemptionAlertsEnabled: enabled },
    include: BRANCH_INCLUDE,
  })
  return toMerchantBranch(updated)
}

/**
 * Option B B2.4: the shared branch-soft-delete core (D4 seam). BOTH the merchant
 * wrapper (actor MERCHANT_ADMIN) and the new admin route (actor ADMIN + reason)
 * call this. The guards (reads) stay BEFORE the transaction; the staff-user
 * deactivation cascade + the branch soft-delete + the audit are inside ONE
 * transaction (atomic - was previously two separate writes). Audit is
 * actor-attributed, `entityType:'branch'`. BRANCH_IS_MAIN + BRANCH_LAST_ACTIVE
 * guards preserved.
 */
export async function softDeleteBranchCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  branchId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')

  // Block deleting main branch
  if (branch.isMainBranch) throw new AppError('BRANCH_IS_MAIN')

  // Block deleting last active branch of a live merchant
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } })
  if (merchant?.status === 'ACTIVE') {
    const activeBranchCount = await prisma.branch.count({
      where: { merchantId, isActive: true, deletedAt: null },
    })
    if (activeBranchCount <= 1) throw new AppError('BRANCH_LAST_ACTIVE')
  }

  await prisma.$transaction(async (tx) => {
    // Deactivate branch users (staff logins)
    await tx.branchUser.updateMany({ where: { branchId }, data: { status: 'INACTIVE' } })
    // Soft delete
    await tx.branch.update({ where: { id: branchId }, data: { deletedAt: new Date(), isActive: false } })
    await writeAuditLogTx(tx, {
      entityId: branchId, entityType: 'branch', event: 'BRANCH_DELETED',
      actorId: actor.id, actorType: actor.type, reason: actor.reason,
      metadata: { merchantId },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
  })

  return { ok: true as const }
}

export async function softDeleteBranch(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return softDeleteBranchCore(prisma, { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } }, branchId, ctx)
}

/**
 * Branches PR-5 (D5, §4b): close-REQUEST (merchant, OWNER-only). The branch is NOT
 * deactivated here — it STAYS isActive + LIVE-visible to customers until an admin
 * approves (the admin-approve deactivation is the NEXT dispatch). Enforces the SAME
 * guards as the immediate delete, at REQUEST time (reusing the existing
 * BRANCH_IS_MAIN + BRANCH_LAST_ACTIVE semantics/messages): you cannot close the main
 * branch (promote another main first) or the last active branch of a live merchant.
 * Sets lifecycleStatus = PENDING_CLOSE + closeReason and creates a BRANCH_CLOSE
 * approval (referenceId = the branch id, referenceType 'branch'). A branch already
 * mid-close (PENDING_CLOSE) is rejected with BRANCH_CLOSE_REQUEST_EXISTS; a
 * pending-create branch is BRANCH_NOT_FOUND (it is not yet a live branch to close — it
 * is cancelled via cancelPendingCreate).
 */
export async function requestBranchClose(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  reason: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  // OWNER-only (resolveAdminMerchant). Do NOT use assertCanManageBranch — D3 reserves
  // close/request-close to OWNERS.
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
    select: { id: true, isMainBranch: true, isActive: true, lifecycleStatus: true },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  // A pending-create branch is not yet live — there is nothing to close; it is
  // cancelled via cancelPendingCreate. Treat as not-found for the close lane.
  if (branch.lifecycleStatus === 'PENDING_CREATE') throw new AppError('BRANCH_NOT_FOUND')
  // Idempotency: a branch already awaiting close cannot be re-requested.
  if (branch.lifecycleStatus === 'PENDING_CLOSE') throw new AppError('BRANCH_CLOSE_REQUEST_EXISTS')

  // Reuse the immediate-delete guards AT REQUEST TIME (CORRECTION 2): cannot close
  // the main branch (promote another main first), nor the last active branch of a
  // live merchant.
  if (branch.isMainBranch) throw new AppError('BRANCH_IS_MAIN')
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } })
  if (merchant?.status === 'ACTIVE') {
    const activeBranchCount = await prisma.branch.count({
      where: { merchantId, isActive: true, deletedAt: null },
    })
    if (activeBranchCount <= 1) throw new AppError('BRANCH_LAST_ACTIVE')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.branch.update({
      where: { id: branchId },
      data: { lifecycleStatus: 'PENDING_CLOSE', closeReason: reason },
      include: BRANCH_INCLUDE,
    })
    await tx.adminApproval.create({
      data: {
        type:          'BRANCH_CLOSE',
        status:        'PENDING',
        referenceId:   branchId,
        referenceType: 'branch',
        comment:       `Branch ${branchId} close requested: ${reason}`,
      },
    })
    await writeAuditLogTx(tx, {
      entityId: branchId, entityType: 'branch', event: 'BRANCH_CLOSE_REQUESTED',
      actorId: adminId, actorType: 'MERCHANT_ADMIN', reason,
      metadata: { merchantId },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
    return b
  })
  return toMerchantBranch(updated)
}

/**
 * Branches PR-5 (D5, §4b): withdraw a pending close request (merchant, OWNER-only).
 * The branch was LIVE-visible throughout (close-request never deactivated it), so
 * this simply reverts lifecycleStatus -> LIVE + clears closeReason and removes the
 * open BRANCH_CLOSE approval. BRANCH_CLOSE_REQUEST_NOT_FOUND (404) when the branch is
 * not awaiting close. Mirrors withdrawBranchEditRequest.
 */
export async function withdrawBranchClose(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  // OWNER-only (resolveAdminMerchant). Do NOT use assertCanManageBranch.
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
    select: { id: true, lifecycleStatus: true },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  if (branch.lifecycleStatus !== 'PENDING_CLOSE') throw new AppError('BRANCH_CLOSE_REQUEST_NOT_FOUND')

  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.branch.update({
      where: { id: branchId },
      data: { lifecycleStatus: 'LIVE', closeReason: null },
      include: BRANCH_INCLUDE,
    })
    // DELETE the open BRANCH_CLOSE approval (referenceId = branch id). The close never
    // happened (the branch stays live); the never-actioned pending approval is removed
    // outright (ApprovalStatus has no WITHDRAWN value). deleteMany so a (defensive)
    // missing approval is not fatal.
    await tx.adminApproval.deleteMany({
      where: { type: 'BRANCH_CLOSE', referenceId: branchId, status: 'PENDING' },
    })
    await writeAuditLogTx(tx, {
      entityId: branchId, entityType: 'branch', event: 'BRANCH_CLOSE_WITHDRAWN',
      actorId: adminId, actorType: 'MERCHANT_ADMIN',
      metadata: { merchantId },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    })
    return b
  })
  return toMerchantBranch(updated)
}

export async function getBranchPin(
  prisma: PrismaClient,
  adminId: string,
  branchId: string
): Promise<{ pin: string | null }> {
  // Staff & Access PR-2 (D3): revealing the DECRYPTED branch PIN uses the same
  // management boundary as PIN change/send (setBranchPin / sendBranchPin) —
  // OWNER (any branch) OR assigned BRANCH_MANAGER; STAFF is denied even when
  // assigned (the decrypted PIN is a secret, not a non-secret branch-detail read).
  const ctxMerchant = await resolveMerchantContext(prisma, adminId)
  assertCanManageBranch(ctxMerchant, branchId)
  const { merchantId } = ctxMerchant
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
    select: { redemptionPin: true },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  if (!branch.redemptionPin) return { pin: null }
  // Codex review finding 3: map a typed decrypt throw to the CONTROLLED client envelope
  // (KEY_NOT_AVAILABLE / REDEMPTION_PIN_UNREADABLE) via the shared classifier — without it
  // the raw typed error reaches the global handler as a generic 500. EVERY decrypt failure
  // here is loud + controlled (a reader has no PIN to compare, so there is no wrong-PIN
  // path); a GCM-auth mismatch is an unreadable stored value, not a user error.
  try {
    return { pin: decrypt(branch.redemptionPin) }
  } catch (err) {
    throw classifyPinDecryptError(err, { branchId, source: 'branch-pin-read' })
  }
}

export async function setBranchPin(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  pin: string,
  ctx: { ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  if (!PIN_REGEX.test(pin)) throw new AppError('INVALID_PIN_FORMAT')
  // Staff & Access PR-2 (D3): changing the PIN for an assigned branch is a
  // BM-allowed WRITE — OWNER (any) OR BRANCH_MANAGER (assigned), STAFF denied.
  const ctxMerchant = await resolveMerchantContext(prisma, adminId)
  assertCanManageBranch(ctxMerchant, branchId)
  const { merchantId } = ctxMerchant
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  await prisma.branch.update({
    where: { id: branchId },
    data:  { redemptionPin: encrypt(pin) },
  })
  writeAuditLog(prisma, {
    entityId: merchantId, entityType: 'merchant',
    event: 'BRANCH_PIN_CHANGED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { branchId },
  })
  return { message: 'PIN updated' }
}

export async function sendBranchPin(
  prisma: PrismaClient,
  redis: Redis,
  adminId: string,
  branchId: string,
  ctx: { ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  // Staff & Access PR-2 (D3): sending the PIN to staff for an assigned branch is
  // a BM-allowed WRITE — OWNER (any) OR BRANCH_MANAGER (assigned), STAFF denied.
  const ctxMerchant = await resolveMerchantContext(prisma, adminId)
  assertCanManageBranch(ctxMerchant, branchId)
  const { merchantId } = ctxMerchant
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
    select: { redemptionPin: true, name: true, phone: true, email: true },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  if (!branch.redemptionPin) throw new AppError('PIN_NOT_CONFIGURED')

  // Codex review finding 3: controlled-envelope mapping (see getBranchPin). EVERY decrypt
  // failure is loud + controlled (no wrong-PIN path at a reader).
  let pin: string
  try {
    pin = decrypt(branch.redemptionPin)
  } catch (err) {
    throw classifyPinDecryptError(err, { branchId, source: 'branch-pin-send' })
  }

  // SMS via Twilio — SEC-H3 (Gate-PR-7) + §SEC.1: toll-fraud controls (E.164
  // check + country allowlist + per-phone/IP/branch caps + cooldown + global
  // circuit-breaker) as ONE atomic check-and-count. branch.phone MUST be stored
  // as E.164 (+44…) — a non-E.164 number is rejected with
  // SMS_DESTINATION_NOT_ALLOWED, never silently sent. The send is AWAITED so
  // the rate-limit counting + the route response reflect the actual attempt.
  if (branch.phone) {
    const { consumeSmsSend } = await import('../../shared/smsLimiter')
    const smsCtx = { phone: branch.phone, ip: ctx.ipAddress, scope: 'branchPin' as const, branchId }
    await consumeSmsSend(redis, smsCtx)
    const { default: twilio } = await import('twilio')
    const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
    await client.messages.create({
      to:   branch.phone,
      from: process.env.TWILIO_FROM_NUMBER!,
      body: `Your Redeemo branch PIN for ${branch.name} is: ${pin}. Keep this secure.`,
    })
  }

  // Email via the PR-0.4 outbox (dark by default). Supplementary to the SMS —
  // best-effort, so an email-path hiccup never fails the PIN send. The PIN is
  // never logged: it travels only inside the rendered email payload.
  if (branch.email) {
    try {
      const { notify } = await import('../../shared/notify')
      const { branchPinEmail } = await import('../../shared/emailTemplates')
      await notify(prisma, redis, {
        to: branch.email,
        recipientType: 'BRANCH_USER',
        recipientId: branchId,
        type: 'branch_pin',
        email: branchPinEmail(branch.name, pin),
        ip: ctx.ipAddress,
      })
    } catch (err) {
      console.warn('[branch-pin] email dispatch failed (non-fatal):', err instanceof Error ? err.message : String(err))
    }
  }

  writeAuditLog(prisma, {
    entityId: merchantId, entityType: 'merchant',
    event: 'BRANCH_PIN_SENT',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { branchId, channels: [branch.phone ? 'sms' : null, branch.email ? 'email' : null].filter(Boolean) },
  })

  return { message: 'PIN sent to branch staff' }
}
