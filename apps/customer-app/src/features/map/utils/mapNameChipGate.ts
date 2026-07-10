import type { ClusterRegion } from './mapClustering'

// Map Phase 2 Slice S3 (pin v2, owner-approved Option A, 2026-07-10) —
// name-chip density gating.
//
// Chips (white pill: category-colour dot + merchant/branch name beside
// the pin) only make sense at close zoom AND when few branches are
// visible — at a wide zoom or in a dense viewport, chips for every pin
// would collide into unreadable clutter. Two independent gates, both
// documented as named constants so a future tuning pass doesn't have
// to go hunting for a magic number:
//
//   1. ZOOM gate — `region.latitudeDelta` below this threshold means
//      "zoomed in enough that per-pin labels are legible and there's
//      screen room for them" (mirrors the clustering module's use of
//      `Region` deltas as the cross-provider zoom proxy).
//   2. DENSITY gate — the number of currently-visible SINGLE pins (not
//      cluster count — a cluster already summarises via its own count
//      badge) must be at or below this cap, else even a "close zoom"
//      viewport is too crowded for one-chip-per-pin to read cleanly.
//
// Within a viewport that passes both gates, a simple GREEDY declutter
// pass drops any candidate that would visually overlap an
// already-accepted chip, processing candidates nearest-to-viewport-
// centre first (the most contextually relevant pins keep their chip
// when there isn't room for all of them). "Screen distance" here is
// approximated in NORMALIZED VIEWPORT UNITS (delta-relative), not real
// projected pixels — consistent with the rest of this module's
// provider-agnostic, pure-math approach (no native `pointForCoordinate`
// calls, no MapView measurement dependency). This is intentionally a
// coarse approximation; it's a decorative declutter pass, not a
// pixel-perfect collision system.

export type ChipGatePoint = {
  id: string
  latitude: number
  longitude: number
}

// Show chips only when the viewport spans less than ~0.03deg latitude
// — roughly a single-neighbourhood/high-street zoom level in the UK.
export const CHIP_ZOOM_LATITUDE_DELTA_THRESHOLD = 0.03

// Show chips only when 8 or fewer single (non-clustered) pins are on
// screen. Above this, even a close-zoom viewport is too busy for
// per-pin labels.
export const CHIP_MAX_VISIBLE_SINGLES = 8

// Minimum separation between two chips, expressed as a fraction of the
// viewport's own span (0.12 ≈ chips must be at least ~12% of the
// visible width/height apart from each other to be considered
// non-overlapping).
export const CHIP_MIN_SEPARATION_FRACTION = 0.12

function normalizedDistance(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
  region: ClusterRegion,
): number {
  const dLat = region.latitudeDelta !== 0 ? (a.latitude - b.latitude) / region.latitudeDelta : 0
  const dLng = region.longitudeDelta !== 0 ? (a.longitude - b.longitude) / region.longitudeDelta : 0
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

/**
 * Pure function: given the current SINGLE (non-clustered) pins and the
 * viewport region, returns the subset that should render a name chip.
 * Empty array when either density gate fails. Deterministic — same
 * input always returns the same subset in the same order (nearest-to-
 * centre first).
 */
export function selectChipCandidates<T extends ChipGatePoint>(
  singles: readonly T[],
  region: ClusterRegion,
): T[] {
  if (region.latitudeDelta > CHIP_ZOOM_LATITUDE_DELTA_THRESHOLD) return []
  if (singles.length === 0 || singles.length > CHIP_MAX_VISIBLE_SINGLES) return []

  const center = { latitude: region.latitude, longitude: region.longitude }
  const byDistanceToCenter = [...singles].sort(
    (a, b) => normalizedDistance(a, center, region) - normalizedDistance(b, center, region),
  )

  const accepted: T[] = []
  for (const candidate of byDistanceToCenter) {
    const overlapsAccepted = accepted.some(
      (a) => normalizedDistance(candidate, a, region) < CHIP_MIN_SEPARATION_FRACTION,
    )
    if (!overlapsAccepted) accepted.push(candidate)
  }
  return accepted
}
