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
