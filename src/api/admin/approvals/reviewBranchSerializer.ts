// src/api/admin/approvals/reviewBranchSerializer.ts
//
// Branch Location Trust Slice 2 (spec 2026-07-09 §2.4) — pure serialization for
// the ADMIN review-context branch payload. Admin reads are NOT customer-redacted
// (invariant L3 governs CUSTOMER exposure only), so the admin approval screen is
// allowed the exact pin coordinates, the googlePlaceId provenance, and the staged
// Google suggestion that the NEEDS_REVIEW exception queue needs for context.
//
// Kept pure (no Prisma/DB) so the mapping is unit-testable in the fast lane.

/** The flat staged-Google-suggestion shape the admin review context exposes. */
export interface ReviewLocationSuggestion {
  placeId: string
  latitude: number
  longitude: number
  /** Postcode Google reported for the place; null when unparseable. */
  postcode: string | null
}

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

/**
 * Parse the staged Google suggestion out of an AuditLog `metadata` JSON blob.
 * The create/edit lanes stash it under `metadata.locationSuggestion` as
 * `{ placeId, latitude, longitude, postcode, source }`. Defensive against
 * arbitrary JSON: any shape mismatch returns null (no partial suggestion).
 */
export function parseStagedSuggestion(metadata: unknown): ReviewLocationSuggestion | null {
  if (metadata === null || typeof metadata !== 'object') return null
  const suggestion = (metadata as Record<string, unknown>).locationSuggestion
  if (suggestion === null || typeof suggestion !== 'object') return null
  const s = suggestion as Record<string, unknown>
  const placeId = s.placeId
  const latitude = toNumberOrNull(s.latitude)
  const longitude = toNumberOrNull(s.longitude)
  if (typeof placeId !== 'string' || latitude === null || longitude === null) return null
  const postcode = typeof s.postcode === 'string' ? s.postcode : null
  return { placeId, latitude, longitude, postcode }
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
