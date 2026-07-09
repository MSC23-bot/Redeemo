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
 * (the one an admin is about to approve) beats the BRANCH_CREATED audit metadata.
 * The panel renders a short source line so the reviewer knows which they see.
 */
export type ReviewLocationSuggestionSource = 'pending_edit' | 'branch_created_audit'

/** The flat staged-Google-suggestion shape the admin review context exposes. */
export interface ReviewLocationSuggestion {
  placeId: string
  latitude: number
  longitude: number
  /** Postcode Google reported for the place; null when unparseable. */
  postcode: string | null
  /** Provenance of the surfaced suggestion (pending edit vs branch-created audit). */
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
  const placeId = s.placeId
  const latitude = toNumberOrNull(s.latitude)
  const longitude = toNumberOrNull(s.longitude)
  if (typeof placeId !== 'string' || placeId.length === 0 || latitude === null || longitude === null) {
    return null
  }
  const postcode = typeof s.postcode === 'string' ? s.postcode : null
  return { placeId, latitude, longitude, postcode, source }
}

/**
 * Parse the staged Google suggestion out of a BRANCH_CREATED AuditLog `metadata`
 * JSON blob. The create lane stashes it under `metadata.locationSuggestion`.
 * Tagged `source: 'branch_created_audit'`. Defensive: any shape mismatch → null.
 */
export function parseStagedSuggestion(metadata: unknown): ReviewLocationSuggestion | null {
  if (metadata === null || typeof metadata !== 'object') return null
  return parseSuggestionBlob(
    (metadata as Record<string, unknown>).locationSuggestion,
    'branch_created_audit',
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
