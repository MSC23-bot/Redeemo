import type { ClusterRegion } from './mapClustering'

// Map Phase 2 Slice S3 (pin v2, owner-approved Option A, 2026-07-10) —
// name-chip density gating. Loosened by Map P2 W2a round 2 (owner
// direction 2026-07-13): the label beside a pin is now the W2a TICKET
// LOCKUP (icon block + name + Save £X + voucher count), and the owner's
// device review found the original close-zoom gate too strict ("I
// shouldn't have to zoom really close to the location to see the name of
// the merchant and all that information: it needs to be more lenient").
// The lockup IS the primary information layer of the map, not a
// close-zoom garnish — so it shows from town-level zoom, and the greedy
// declutter pass (unchanged) is the honesty valve that keeps dense areas
// readable at those wider zooms.
//
// Lockups shown for every visible pin at a wide zoom or in a dense
// viewport would still collide into unreadable clutter, so the two
// independent gates remain, both documented as named constants so a
// future tuning pass doesn't have to go hunting for a magic number:
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

// Show lockups when the viewport spans less than ~0.10deg latitude —
// roughly a whole-town zoom level in the UK (the owner's Huddersfield
// walkthrough screenshots sat around 0.08-0.12 latitude delta).
//
// W2a round 2 (owner direction 2026-07-13): raised from 0.03 (single-
// neighbourhood/high-street zoom). The ticket lockup is the map's
// PRIMARY information layer, not a close-zoom garnish — the owner
// shouldn't have to zoom right down to a location to read the merchant
// name and saving. At these wider zooms the UNCHANGED greedy declutter
// pass below naturally shows fewer lockups in dense areas, which is the
// correct honesty valve (nearest-to-centre pins keep theirs).
export const CHIP_ZOOM_LATITUDE_DELTA_THRESHOLD = 0.10

// Show lockups only when 10 or fewer single (non-clustered) pins are on
// screen. Above this, even a gate-passing viewport is too busy for
// per-pin labels. (W2a round 2: raised from 8 alongside the zoom gate,
// same owner direction — town-level viewports legitimately hold a few
// more singles than a high-street one.)
export const CHIP_MAX_VISIBLE_SINGLES = 10

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
