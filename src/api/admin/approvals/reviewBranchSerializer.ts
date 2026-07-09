// src/api/admin/approvals/reviewBranchSerializer.ts
//
// Branch Location Trust Slice 2 (spec 2026-07-09 §2.4) — pure serialization for
// the ADMIN review-context branch payload. Admin reads are NOT customer-redacted
// (invariant L3 governs CUSTOMER exposure only), so the admin approval screen is
// allowed the exact pin coordinates, the googlePlaceId provenance, and the staged
// Google suggestion that the NEEDS_REVIEW exception queue needs for context.
//
// Kept pure (no Prisma/DB) so the mapping is unit-testable in the fast lane.

/**
 * Which staged blob the surfaced suggestion came from. Precedence (freshest wins)
 * is decided in getReviewContext: an OPEN BranchPendingEdit's staged suggestion
 * (the one an admin is about to approve) beats the audit metadata; among audit
 * rows the latest parseable one wins across BOTH events (a draft-window edit
 * suggestion supersedes a stale create-time one after an address change). The
 * panel renders a short source line so the reviewer knows which they see.
 */
export type ReviewLocationSuggestionSource =
  | 'pending_edit'
  | 'branch_created_audit'
  | 'branch_updated_audit'
  // Branch Location Trust Slice 3 (spec 2026-07-09 pin-drop addendum §2.4 touchpoint 8,
  // APPROVED): a merchant pin-drop that FAILED the radius check stages its dropped pin
  // on the BRANCH_UPDATED audit metadata with its OWN source marker. Unlike the other
  // sources (which describe WHERE the blob was staged), this one describes WHAT it is:
  // a self-set pin with NO Google place (placeId null). The blob's own `source` field
  // takes precedence over the audit-event-derived source so the panel can label it
  // "Merchant-set pin", never "verified".
  | 'merchant_pin_drop'

/**
 * The AuditLog events (entityType 'branch', entityId = branchId) whose metadata
 * can carry a staged Google suggestion, mapped to the source tag the surfaced
 * suggestion is labelled with. These are the two lanes whose cross-check runs
 * BEFORE the admin sees the branch on the onboarding review screen:
 *   - BRANCH_CREATED — create lane (Slice 1);
 *   - BRANCH_UPDATED — draft-window direct edit lane (Slice 1b), which stamps
 *     NEEDS_REVIEW immediately on a failed cross-check, so its suggestion is
 *     exactly the exception context this panel exists to show.
 * The reviewed-edit lane is NOT an audit read: its staged blob lives on the OPEN
 * BranchPendingEdit (parsePendingEditSuggestion) and wins precedence when present.
 */
export const STAGED_SUGGESTION_AUDIT_EVENTS = {
  BRANCH_CREATED: 'branch_created_audit',
  BRANCH_UPDATED: 'branch_updated_audit',
} as const satisfies Record<string, ReviewLocationSuggestionSource>

export type StagedSuggestionAuditEvent = keyof typeof STAGED_SUGGESTION_AUDIT_EVENTS

/** The flat staged-suggestion shape the admin review context exposes. */
export interface ReviewLocationSuggestion {
  // Slice 3: nullable. A Google pick always carries a placeId; a merchant_pin_drop
  // suggestion has NO Google place, so placeId is null for that source only.
  placeId: string | null
  latitude: number
  longitude: number
  /** Postcode context; null when unparseable. For a Google pick this is Google's
   * reported postcode; for a merchant_pin_drop it is the merchant's entered postcode. */
  postcode: string | null
  /** Provenance of the surfaced suggestion (pending edit / audit lane / merchant pin-drop). */
  source: ReviewLocationSuggestionSource
}

/**
 * The Prisma `select` list for the admin review-context branch read. Declared
 * here (co-located with the DTO it feeds) and consumed by getReviewContext so the
 * projection is a single, test-pinned source of truth.
 *
 * SECURITY (admin-web rule + business rule 8): `redemptionPin` is the AES-256-GCM
 * encrypted PIN on the Branch model and is DELIBERATELY absent from this list —
 * it is NEVER selected into any list/read payload; it is revealed only via the
 * guarded PIN routes. The reviewBranchSelect-never-selects-redemptionPin test
 * pins this so a future field add cannot silently leak it.
 */
export const reviewBranchSelect = {
  id: true,
  name: true,
  isMainBranch: true,
  isActive: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  postcode: true,
  localityName: true,
  locationConfidence: true,
  // Branch Location Trust Slice 2 (spec 2026-07-09 §2.4): admin-scope provenance
  // fields. Admin reads are NOT customer-redacted (L3 governs customer exposure
  // only), so the exact pin + its googlePlaceId provenance are allowed here.
  latitude: true,
  longitude: true,
  googlePlaceId: true,
  // redemptionPin is intentionally omitted — NEVER expose it (see the doc-comment).
} as const

/** The Branch row shape this serializer consumes (a subset of the Prisma select). */
export interface ReviewBranchRow {
  id: string
  name: string
  isMainBranch: boolean
  isActive: boolean
  addressLine1: string
  addressLine2: string | null
  city: string
  postcode: string
  localityName: string | null
  locationConfidence: string
  // Slice 2 additive admin-scope fields. latitude/longitude arrive as Prisma
  // Decimal (or null); coerced to number below.
  latitude: unknown
  longitude: unknown
  googlePlaceId: string | null
}

/** The serialized admin review branch DTO (matches reviewBranchSchema in admin-web). */
export interface ReviewBranchDto {
  id: string
  name: string
  isMainBranch: boolean
  isActive: boolean
  addressLine1: string
  addressLine2: string | null
  city: string
  postcode: string
  localityName: string | null
  locationConfidence: string
  latitude: number | null
  longitude: number | null
  googlePlaceId: string | null
  locationSuggestion: ReviewLocationSuggestion | null
}

/** Coerce a Prisma Decimal | number | string | null into a finite number or null. */
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// The proposedChanges sub-key under which the reviewed-edit lane stages the
// merchant-picked Google suggestion. Re-declared here (not imported) with the
// SAME own-your-own-knowledge discipline the writer (merchant/branch/service.ts)
// and the applier (editApplier.ts) both use: a drift between writer and reader is
// FAIL-SAFE — the reader simply stops finding the suggestion and surfaces null,
// never a crash. Pinned by the pending-edit parse test.
const LOCATION_SUGGESTION_KEY = '__locationSuggestion' as const

/**
 * Validate one flat staged-suggestion blob and tag it with its provenance. The
 * writer (locationSuggestionMetadata) emits `{ placeId, latitude, longitude,
 * postcode, source }`; this mirrors editApplier.applyLocationTrust's defensive
 * posture: a non-object blob, a missing/empty placeId, or non-finite coords all
 * yield null (treat as absent, never a partial suggestion, never a throw).
 */
function parseSuggestionBlob(
  blob: unknown,
  source: ReviewLocationSuggestionSource,
): ReviewLocationSuggestion | null {
  if (blob === null || typeof blob !== 'object') return null
  const s = blob as Record<string, unknown>
  const latitude = toNumberOrNull(s.latitude)
  const longitude = toNumberOrNull(s.longitude)
  // Coordinates are required for EVERY suggestion (a suggestion with no pin is
  // meaningless); non-finite / missing → treat as absent, never a partial.
  if (latitude === null || longitude === null) return null
  const postcode = typeof s.postcode === 'string' ? s.postcode : null

  // Branch Location Trust Slice 3: a merchant pin-drop FAIL stages a suggestion
  // with NO Google place. The blob's OWN `source` marks it; tolerate a null
  // placeId for this source and surface the merchant_pin_drop provenance
  // (overriding the audit-event-derived source, since the blob knows its own
  // kind). This is the only source for which placeId may be null.
  if (s.source === 'merchant_pin_drop') {
    const placeId = typeof s.placeId === 'string' && s.placeId.length > 0 ? s.placeId : null
    return { placeId, latitude, longitude, postcode, source: 'merchant_pin_drop' }
  }

  // Every other suggestion is a Google pick and MUST carry a non-empty placeId.
  const placeId = s.placeId
  if (typeof placeId !== 'string' || placeId.length === 0) return null
  return { placeId, latitude, longitude, postcode, source }
}

/**
 * Parse the staged Google suggestion out of a BRANCH_CREATED / BRANCH_UPDATED
 * AuditLog `metadata` JSON blob. Both audit lanes stash it under
 * `metadata.locationSuggestion` (same writer: locationSuggestionMetadata). The
 * caller passes the source tag matching the row's event (see
 * STAGED_SUGGESTION_AUDIT_EVENTS); defaults to the create-lane tag. Defensive:
 * any shape mismatch → null.
 */
export function parseStagedSuggestion(
  metadata: unknown,
  source: Extract<ReviewLocationSuggestionSource, `${string}_audit`> = 'branch_created_audit',
): ReviewLocationSuggestion | null {
  if (metadata === null || typeof metadata !== 'object') return null
  return parseSuggestionBlob(
    (metadata as Record<string, unknown>).locationSuggestion,
    source,
  )
}

/**
 * Parse the staged Google suggestion out of a BranchPendingEdit `proposedChanges`
 * JSON blob (Slice 1b: the merchant-picked suggestion an admin is about to
 * approve, under the `__locationSuggestion` sub-key). Tagged `source:
 * 'pending_edit'`. Defensive exactly like applyLocationTrust: malformed → null.
 */
export function parsePendingEditSuggestion(proposedChanges: unknown): ReviewLocationSuggestion | null {
  if (proposedChanges === null || typeof proposedChanges !== 'object') return null
  return parseSuggestionBlob(
    (proposedChanges as Record<string, unknown>)[LOCATION_SUGGESTION_KEY],
    'pending_edit',
  )
}

/**
 * Map one Branch row + its (optional) staged suggestion into the admin review
 * DTO. All existing fields pass through unchanged; the Slice 2 additive fields
 * are appended. redemptionPin is never in scope (never selected upstream).
 */
export function serializeReviewBranch(
  row: ReviewBranchRow,
  suggestion: ReviewLocationSuggestion | null,
): ReviewBranchDto {
  return {
    id: row.id,
    name: row.name,
    isMainBranch: row.isMainBranch,
    isActive: row.isActive,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    postcode: row.postcode,
    localityName: row.localityName,
    locationConfidence: row.locationConfidence,
    latitude: toNumberOrNull(row.latitude),
    longitude: toNumberOrNull(row.longitude),
    googlePlaceId: row.googlePlaceId,
    locationSuggestion: suggestion,
  }
}
