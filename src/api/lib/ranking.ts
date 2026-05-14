import { haversineMetres } from '../shared/haversine'
import type { PrismaClient } from '../../../generated/prisma/client'

// ─── Constants ───────────────────────────────────────────────────────────────

export const NEARBY_RADIUS_MILES = 2
const NEARBY_RADIUS_METRES = NEARBY_RADIUS_MILES * 1609.34

export const MIN_REVIEW_COUNT_FOR_RATING_SORT = 3

// ─── Types ───────────────────────────────────────────────────────────────────

export type SupplyTier = 'NEARBY' | 'CITY' | 'DISTANT'

export type ClassifyTierContext = {
  userLat: number | null
  userLng: number | null
  profileCity: string | null
}

export type MerchantForTier = {
  branches: Array<{
    isActive: boolean
    city: string
    latitude: number | null
    longitude: number | null
  }>
}

export type CategoryIntentType = 'LOCAL' | 'DESTINATION' | 'MIXED'

export type RankMerchantsContext = ClassifyTierContext & {
  intentType: CategoryIntentType
}

export type MerchantForRanking = MerchantForTier & {
  id: string
  businessName: string
  avgRating: number | null
  reviewCount: number
}

type RankedMerchant<T> = T & {
  supplyTier: SupplyTier
  distanceMetres: number | null
}

export type RankMerchantsResult<T> = {
  ordered: Array<RankedMerchant<T>>
  counts: { nearbyCount: number; cityCount: number; distantCount: number }
}

// ─── Primitives + helpers ────────────────────────────────────────────────────

/**
 * Classifies a merchant into a supply tier relative to user location context.
 * NEARBY: any active branch within NEARBY_RADIUS_MILES of user coords
 * CITY:   any active branch's city matches profileCity (case-insensitive)
 * DISTANT: otherwise
 *
 * When no location data at all (no coords, no profileCity), every merchant → DISTANT.
 * "Equally distant from a system that has no location signal."
 */
export function classifyTier(merchant: MerchantForTier, ctx: ClassifyTierContext): SupplyTier {
  const activeBranches = merchant.branches.filter(b => b.isActive)

  // NEARBY check: requires user coords + branch coords
  if (ctx.userLat !== null && ctx.userLng !== null) {
    for (const b of activeBranches) {
      if (b.latitude === null || b.longitude === null) continue
      const d = haversineMetres(ctx.userLat, ctx.userLng, Number(b.latitude), Number(b.longitude))
      if (d <= NEARBY_RADIUS_METRES) return 'NEARBY'
    }
  }

  // CITY check: case-insensitive match on profileCity
  if (ctx.profileCity) {
    const target = ctx.profileCity.toLowerCase()
    for (const b of activeBranches) {
      if (b.city.toLowerCase() === target) return 'CITY'
    }
  }

  return 'DISTANT'
}

function nearestDistanceMetres(merchant: MerchantForTier, ctx: ClassifyTierContext): number | null {
  if (ctx.userLat === null || ctx.userLng === null) return null
  let min: number | null = null
  for (const b of merchant.branches.filter(b => b.isActive)) {
    if (b.latitude === null || b.longitude === null) continue
    const d = haversineMetres(ctx.userLat, ctx.userLng, Number(b.latitude), Number(b.longitude))
    if (min === null || d < min) min = d
  }
  return min
}

// At launch, most merchants have <3 reviews. Rated merchants come first
// (sorted by avgRating DESC), unrated alphabetical after. As reviews
// accumulate, the rated tier expands; alphabetical recedes naturally.
function qualityComparator(
  a: { avgRating: number | null; reviewCount: number; businessName: string },
  b: { avgRating: number | null; reviewCount: number; businessName: string },
): number {
  const aRated = (a.reviewCount ?? 0) >= MIN_REVIEW_COUNT_FOR_RATING_SORT
  const bRated = (b.reviewCount ?? 0) >= MIN_REVIEW_COUNT_FOR_RATING_SORT
  if (aRated && bRated) return (b.avgRating ?? 0) - (a.avgRating ?? 0)
  if (aRated) return -1
  if (bRated) return 1
  return a.businessName.localeCompare(b.businessName)
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Ranks merchants by intent-aware tier ladder.
 *
 *   LOCAL:       NEARBY (distance ASC) → CITY (alphabetical) → DISTANT (alphabetical)
 *   DESTINATION: NEARBY (distance ASC) → CITY+DISTANT merged (quality-aware comparator)
 *   MIXED:       NEARBY (distance ASC) → CITY (alphabetical) → DISTANT (quality-aware comparator)
 *
 * MIXED differs from LOCAL ONLY in the DISTANT tier sort. See Task 5.
 *
 * Returns ordered merchants tagged with supplyTier and distanceMetres,
 * plus tier counts (always reflect the input set, regardless of any later filtering).
 */
export function rankMerchants<T extends MerchantForRanking>(
  merchants: T[],
  ctx: RankMerchantsContext,
): RankMerchantsResult<T> {
  const tagged: RankedMerchant<T>[] = merchants.map(m => ({
    ...m,
    supplyTier:     classifyTier(m, ctx),
    distanceMetres: nearestDistanceMetres(m, ctx),
  }))

  const counts = {
    nearbyCount:  tagged.filter(t => t.supplyTier === 'NEARBY').length,
    cityCount:    tagged.filter(t => t.supplyTier === 'CITY').length,
    distantCount: tagged.filter(t => t.supplyTier === 'DISTANT').length,
  }

  const nearby  = tagged.filter(t => t.supplyTier === 'NEARBY')
                        .sort((a, b) => (a.distanceMetres ?? Infinity) - (b.distanceMetres ?? Infinity))
  const city    = tagged.filter(t => t.supplyTier === 'CITY')
  const distant = tagged.filter(t => t.supplyTier === 'DISTANT')

  let ordered: RankedMerchant<T>[]
  switch (ctx.intentType) {
    case 'LOCAL':
      ordered = [
        ...nearby,
        ...city.sort((a, b) => a.businessName.localeCompare(b.businessName)),
        ...distant.sort((a, b) => a.businessName.localeCompare(b.businessName)),
      ]
      break
    case 'DESTINATION':
      ordered = [
        ...nearby,
        ...[...city, ...distant].sort(qualityComparator),
      ]
      break
    case 'MIXED':
      // MIXED differs from LOCAL ONLY in the DISTANT tier sort.
      // NEARBY + CITY behave identically to LOCAL.
      ordered = [
        ...nearby,
        ...city.sort((a, b) => a.businessName.localeCompare(b.businessName)),
        ...distant.sort(qualityComparator),
      ]
      break
  }

  return { ordered, counts }
}

// ─── Independent utilities ───────────────────────────────────────────────────

/**
 * Resolves the effective intentType for a category, with parent inheritance.
 * Returns the category's own intentType if set; otherwise inherits parent's;
 * otherwise falls back to 'LOCAL' (proximity-first is the safe default when
 * classification is missing).
 */
export function resolveCategoryIntent(category: {
  intentType: CategoryIntentType | null
  parent: { intentType: CategoryIntentType | null } | null
}): CategoryIntentType {
  return category.intentType ?? category.parent?.intentType ?? 'LOCAL'
}

/**
 * Computes per-merchant rating aggregates from a single review.groupBy across
 * all branchIds in the input set. Pure-ish — hits the DB once.
 *
 * Used by `searchMerchants` and `getCategoryMerchants` to feed avgRating +
 * reviewCount into `rankMerchants` BEFORE enrichment. enrichMerchantTiles also
 * computes ratings (via its own groupBy on the page slice) for tile display —
 * the duplicate fetch on the smaller paginated set is acceptable in Plan 1.5.
 */
export async function computeRatingsByMerchant(
  prisma: PrismaClient,
  merchants: Array<{ id: string; branches: Array<{ id: string }> }>,
): Promise<Map<string, { avgRating: number | null; reviewCount: number }>> {
  const branchIds = merchants.flatMap(m => m.branches.map(b => b.id))
  const result = new Map<string, { avgRating: number | null; reviewCount: number }>()

  if (branchIds.length === 0) {
    for (const m of merchants) result.set(m.id, { avgRating: null, reviewCount: 0 })
    return result
  }

  const groups = await prisma.review.groupBy({
    by: ['branchId'],
    where: { branchId: { in: branchIds }, isHidden: false },
    _avg: { rating: true },
    _count: { id: true },
  })
  const byBranch = Object.fromEntries(
    groups.map((g: any) => [g.branchId, { avg: g._avg.rating ?? 0, count: g._count.id }])
  )

  for (const m of merchants) {
    let totalRating = 0
    let totalCount = 0
    for (const b of m.branches) {
      const r = byBranch[b.id]
      if (r) { totalRating += r.avg * r.count; totalCount += r.count }
    }
    result.set(m.id, {
      avgRating:   totalCount > 0 ? Math.round((totalRating / totalCount) * 10) / 10 : null,
      reviewCount: totalCount,
    })
  }

  return result
}

// ─── Plan 4 M2 — parallel new ranking primitives ─────────────────────────────
//
// Everything BELOW this line is the M2 ranking refactor. Everything ABOVE
// is the Plan 1.5 legacy path (classifyTier / rankMerchants) and stays
// intact until M3 swaps Discovery's callers over, and M5 audits-then-deletes.
//
// See:
//   docs/superpowers/specs/2026-05-13-plan-4-location-model-uk-enrichment-design.md §5
//   docs/superpowers/plans/2026-05-13-plan-4-location-model-uk-enrichment.md  Task M2.5

import type { SupplyRung } from './ladderProfiles'
import type { EffectiveLocation } from './effectiveLocation'

const MILES_TO_METRES = 1609.344

type BranchForClassification = {
  latitude: number | null
  longitude: number | null
  isActive: boolean
  locationConfidence: 'MANUALLY_CONFIRMED' | 'ADDRESS_GEOCODED' | 'POSTCODE_CENTROID' | 'NEEDS_REVIEW'
  localityId: string | null
  postTown: string | null
  ladDistrict: string | null
  adminCounty: string | null
  region: string | null
  /**
   * Plan 4 nation snapshot ("England" | "Scotland" | "Wales" |
   * "Northern Ireland"). Distinct from the legacy `Branch.country`
   * (ISO-2 address-country, e.g. "GB") — see spec §3.5.
   */
  locationCountry: string | null
}

/**
 * Classify a branch into a SupplyRung relative to an EffectiveLocation.
 *
 * Returns null for non-discoverable branches:
 *   - `isActive = false`
 *   - `locationConfidence ∈ { POSTCODE_CENTROID, NEEDS_REVIEW }`
 *
 * Only `MANUALLY_CONFIRMED` and `ADDRESS_GEOCODED` branches are
 * discoverable. This is structurally how the PR #81 redaction
 * contract is enforced at the ranking layer — an approximate
 * postcode-centroid pin can never produce a NEARBY match.
 *
 * Rung evaluation order (most-specific first):
 *   NEARBY → CATCHMENT → POST_TOWN → LAD → COUNTY → REGION → COUNTRY → NATIONAL
 *
 * All admin-rung comparisons are null-safe — both sides must be
 * non-null. UK-wide: a Scottish user with null adminCounty + null
 * region falls through past those rungs cleanly without spurious
 * null-vs-null matches.
 */
export function classifyRung(
  branch: BranchForClassification,
  effLoc: EffectiveLocation,
  nearbyRadiusMiles: number,
  /**
   * Locality IDs reachable from `effLoc.locality` via outgoing
   * CATCHMENT edges. Looked up once by the caller (M2.6) and passed
   * in — keeps `classifyRung` synchronous + pure.
   */
  outgoingCatchmentTargetIds: readonly string[],
): SupplyRung | null {
  // Discoverability gate.
  if (!branch.isActive) return null
  if (branch.locationConfidence !== 'MANUALLY_CONFIRMED' && branch.locationConfidence !== 'ADDRESS_GEOCODED') {
    return null
  }

  // NEARBY — distance check via reused shared/haversine helper.
  if (branch.latitude !== null && branch.longitude !== null) {
    const dMetres = haversineMetres(effLoc.lat, effLoc.lng, branch.latitude, branch.longitude)
    if (dMetres <= nearbyRadiusMiles * MILES_TO_METRES) return 'NEARBY'
  }

  // CATCHMENT — same locality OR effLoc has an outgoing edge into branch's locality.
  if (branch.localityId && (
    branch.localityId === effLoc.locality.id ||
    outgoingCatchmentTargetIds.includes(branch.localityId)
  )) {
    return 'CATCHMENT'
  }

  // POST_TOWN.
  if (branch.postTown && effLoc.locality.postTown && branch.postTown === effLoc.locality.postTown) {
    return 'POST_TOWN'
  }

  // LAD.
  if (branch.ladDistrict && branch.ladDistrict === effLoc.locality.ladDistrict) {
    return 'LAD'
  }

  // COUNTY (English shire counties only; null on unitary / Scotland / Wales / NI).
  if (branch.adminCounty && effLoc.locality.adminCounty && branch.adminCounty === effLoc.locality.adminCounty) {
    return 'COUNTY'
  }

  // REGION (English regions only; null on Scotland / Wales / NI).
  if (branch.region && effLoc.locality.region && branch.region === effLoc.locality.region) {
    return 'REGION'
  }

  // COUNTRY — Plan 4 nation match. Branch reads `locationCountry`
  // (Plan 4 nation snapshot); Locality reads `country` (the matching
  // Plan 4 nation field on Locality). The field-name asymmetry is
  // intentional per spec §3.5.
  if (branch.locationCountry && branch.locationCountry === effLoc.locality.country) {
    return 'COUNTRY'
  }

  // NATIONAL — anywhere else in the UK that survived the discoverability gate.
  return 'NATIONAL'
}
