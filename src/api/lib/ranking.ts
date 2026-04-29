import { haversineMetres } from '../shared/haversine'

export const NEARBY_RADIUS_MILES = 2
const NEARBY_RADIUS_METRES = NEARBY_RADIUS_MILES * 1609.34

export type SupplyTier = 'NEARBY' | 'CITY' | 'DISTANT'

export type ClassifyTierContext = {
  userLat: number | null
  userLng: number | null
  profileCity: string | null
}

type MerchantForTier = {
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

type MerchantForRanking = MerchantForTier & {
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

export const MIN_REVIEW_COUNT_FOR_RATING_SORT = 3

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
