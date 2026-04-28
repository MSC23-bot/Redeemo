export type Scope = 'nearby' | 'city' | 'region' | 'platform'

export type ResolveScopeInput = {
  scope?: Scope | undefined
  lat: number | null
  lng: number | null
  profileCity: string | null
}

export type ResolvedScope = {
  scope: Scope
  resolvedArea: string
  radiusMiles: number | null   // null for region/platform
}

const NEARBY_RADIUS_MILES = 2
const REGION_RADIUS_MILES = 25

export function resolveScope(input: ResolveScopeInput): ResolvedScope {
  const requested = input.scope ?? 'nearby'

  // No location available: fall back per spec §4.6
  if (input.lat == null || input.lng == null) {
    if (input.profileCity) {
      return { scope: 'city', resolvedArea: input.profileCity, radiusMiles: null }
    }
    return { scope: 'platform', resolvedArea: 'United Kingdom', radiusMiles: null }
  }

  switch (requested) {
    case 'nearby':
      return { scope: 'nearby', resolvedArea: 'Nearby', radiusMiles: NEARBY_RADIUS_MILES }
    case 'city':
      return { scope: 'city', resolvedArea: input.profileCity ?? 'Your city', radiusMiles: null }
    case 'region':
      return { scope: 'region', resolvedArea: 'Wider area', radiusMiles: REGION_RADIUS_MILES }
    case 'platform':
      return { scope: 'platform', resolvedArea: 'United Kingdom', radiusMiles: null }
  }
}
