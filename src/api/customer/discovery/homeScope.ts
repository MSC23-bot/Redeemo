// src/api/customer/discovery/homeScope.ts
//
// Home relevance — per-rail scope helpers (spec §10.2).
//
// Distinct from Search's `resolveScopeForBranches` because Home rails have
// hardcoded per-rail policies (no `?scope=` user input). See spec §6.1/§6.2/§6.3.

import type { SupplyRung } from '../../lib/ladderProfiles'

export type HomeRailKind = 'featured' | 'trending' | 'nearbyByCategory' | 'popular'

const NEARBY_RUNGS:  readonly SupplyRung[] = ['NEARBY']
const CITY_RUNGS:    readonly SupplyRung[] = ['CATCHMENT', 'POST_TOWN']
const DISTANT_RUNGS: readonly SupplyRung[] = ['LAD', 'COUNTY', 'REGION', 'COUNTRY', 'NATIONAL']

export type HomeScopeResolution = {
  retainedRungs: ReadonlySet<SupplyRung>
  scopeExpanded: boolean
  scope:         'nearby' | 'city' | 'platform'
}

function sumRungs(rungs: readonly SupplyRung[], counts: Record<SupplyRung, number>): number {
  return rungs.reduce((s, r) => s + (counts[r] ?? 0), 0)
}

export function resolveScopeForHomeRail(
  rail:   HomeRailKind,
  counts: Record<SupplyRung, number>,
): HomeScopeResolution {
  if (rail === 'popular') {
    return {
      retainedRungs: new Set([...NEARBY_RUNGS, ...CITY_RUNGS, ...DISTANT_RUNGS]),
      scopeExpanded: false,
      scope:         'platform',
    }
  }
  if (rail === 'trending' || rail === 'nearbyByCategory') {
    return {
      retainedRungs: new Set([...NEARBY_RUNGS, ...CITY_RUNGS]),
      scopeExpanded: false,
      scope:         'city',
    }
  }
  // Featured: NEARBY+CITY first, cascade to DISTANT on zero supply.
  const localSupply = sumRungs([...NEARBY_RUNGS, ...CITY_RUNGS], counts)
  if (localSupply > 0) {
    return {
      retainedRungs: new Set([...NEARBY_RUNGS, ...CITY_RUNGS]),
      scopeExpanded: false,
      scope:         'city',
    }
  }
  const distantSupply = sumRungs(DISTANT_RUNGS, counts)
  if (distantSupply > 0) {
    return {
      retainedRungs: new Set([...NEARBY_RUNGS, ...CITY_RUNGS, ...DISTANT_RUNGS]),
      scopeExpanded: true,
      scope:         'platform',
    }
  }
  // Sentinel: caller (buildFeaturedRail) hides the rail when total supply is zero.
  return {
    retainedRungs: new Set([...NEARBY_RUNGS, ...CITY_RUNGS]),
    scopeExpanded: false,
    scope:         'city',
  }
}
