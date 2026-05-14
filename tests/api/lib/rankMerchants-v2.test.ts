// tests/api/lib/rankMerchants-v2.test.ts
//
// Plan 4 M2.6 — `rankMerchantsV2` collect-first ladder walk.
//
// Pins the locked algorithm from spec §5.6:
//   1. Collect EVERY discoverable branch's matched rung per merchant
//      (skip non-discoverable; respect maxRung).
//   2. Select one context branch per merchant — most-specific rung
//      first, then distance ASC, then id alphabetical.
//   3. Group entries by rung; sort within each rung per categoryIntent.
//   4. Walk rungs in order, applying targetCount + hardCap.
//      NEARBY rung is always evaluated before targetCount stops.
//
// Also pins: legacy `supplyTier` field populated alongside
// `supplyRung`, `proximityBand` derived from (rung × density),
// `rungCounts` envelope, and the PR #81 locationConfidence redaction
// contract (POSTCODE_CENTROID branches are silently filtered out).
//
// Pure in-memory; no DB.

import { describe, it, expect } from 'vitest'
import { rankMerchantsV2 } from '../../../src/api/lib/ranking'
import type { EffectiveLocation } from '../../../src/api/lib/effectiveLocation'

// ── Fixtures ───────────────────────────────────────────────────────────

const huddersfield = {
  id: 'loc-huddersfield',
  name: 'Huddersfield',
  slug: 'huddersfield',
  postTown: 'HUDDERSFIELD',
  ladDistrict: 'Kirklees',
  adminCounty: 'West Yorkshire',
  region: 'Yorkshire and the Humber',
  country: 'England',
  centerLat: 53.6458,
  centerLng: -1.7850,
  populationTier: 'LARGE_TOWN' as const,
}

const effLoc: EffectiveLocation = {
  lat: 53.6458,
  lng: -1.7850,
  locality: huddersfield as unknown as EffectiveLocation['locality'],
  densityClass: 'SUBURBAN',
  source: 'GPS',
}

let branchSerial = 0
type Branch = {
  id: string
  latitude: number | null
  longitude: number | null
  isActive: boolean
  locationConfidence: 'MANUALLY_CONFIRMED' | 'ADDRESS_GEOCODED' | 'POSTCODE_CENTROID' | 'NEEDS_REVIEW'
  localityId: string | null
  postTown: string | null
  ladDistrict: string | null
  adminCounty: string | null
  region: string | null
  locationCountry: string | null
}
function branch(latitude: number | null, longitude: number | null, overrides: Partial<Branch> = {}): Branch {
  return {
    id: overrides.id ?? `b-${++branchSerial}`,
    latitude,
    longitude,
    isActive: true,
    locationConfidence: 'MANUALLY_CONFIRMED',
    localityId: 'loc-other',
    postTown: null,
    ladDistrict: 'OtherLAD',
    adminCounty: null,
    region: null,
    locationCountry: null,
    ...overrides,
  }
}

function merchant(
  id: string,
  branches: Branch[],
  extras: { avgRating?: number | null; reviewCount?: number; businessName?: string } = {},
) {
  return {
    id,
    businessName: extras.businessName ?? id,
    avgRating: extras.avgRating ?? null,
    reviewCount: extras.reviewCount ?? 0,
    branches,
  }
}

// ── Base envelope shape ────────────────────────────────────────────────

describe('rankMerchantsV2 — tile envelope', () => {
  it('tiles carry supplyRung + supplyTier (legacy) + proximityBand + contextBranchId', () => {
    const m1 = merchant('m-nearby', [branch(53.6470, -1.7860, { id: 'b-near' })]) // ~150m
    const m2 = merchant('m-catchment', [
      branch(54.0, -1.0, { id: 'b-catchment', localityId: 'loc-huddersfield' }), // same locality FK, far in distance
    ])
    const m3 = merchant('m-country', [
      branch(51.5, -0.1, { id: 'b-country', ladDistrict: 'Westminster', adminCounty: 'Greater London', region: 'London', locationCountry: 'England' }),
    ])
    // DESTINATION_WIDE admits all 8 rungs under SUBURBAN — needed because
    // m-country classifies as COUNTRY (different region vs Yorkshire),
    // and MIXED_NORMAL × SUBURBAN would cap at REGION and drop it.
    const result = rankMerchantsV2([m1, m2, m3], {
      effLoc, ladderProfile: 'DESTINATION_WIDE',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50, hardCap: 200,
    })
    expect(result.tiles).toHaveLength(3)
    const nearby = result.tiles.find(t => t.merchantId === 'm-nearby')!
    expect(nearby.supplyRung).toBe('NEARBY')
    expect(nearby.supplyTier).toBe('NEARBY')
    expect(nearby.proximityBand).toBe('NEARBY')
    expect(nearby.contextBranchId).toBe('b-near')
    expect(typeof nearby.distanceMetres).toBe('number')

    const catchment = result.tiles.find(t => t.merchantId === 'm-catchment')!
    expect(catchment.supplyRung).toBe('CATCHMENT')
    expect(catchment.supplyTier).toBe('CITY')        // legacy compat
    expect(catchment.proximityBand).toBe('IN_YOUR_AREA')
    expect(catchment.contextBranchId).toBe('b-catchment')

    const country = result.tiles.find(t => t.merchantId === 'm-country')!
    expect(country.supplyRung).toBe('COUNTRY')
    expect(country.supplyTier).toBe('DISTANT')
    // SUBURBAN density: COUNTRY rung → NEAREST_ON_REDEEMO
    expect(country.proximityBand).toBe('NEAREST_ON_REDEEMO')
  })

  it('rungCounts surfaces in the result envelope and matches the tile distribution', () => {
    const m1 = merchant('m-a', [branch(53.6470, -1.7860, { id: 'b-1' })])      // NEARBY
    const m2 = merchant('m-b', [branch(53.6471, -1.7861, { id: 'b-2' })])      // NEARBY
    const m3 = merchant('m-c', [
      branch(51.5, -0.1, { id: 'b-3', locationCountry: 'England' }),           // COUNTRY
    ])
    const result = rankMerchantsV2([m1, m2, m3], {
      effLoc, ladderProfile: 'DESTINATION_WIDE', // admits COUNTRY under SUBURBAN
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50, hardCap: 200,
    })
    expect(result.rungCounts.NEARBY).toBe(2)
    expect(result.rungCounts.COUNTRY).toBe(1)
    expect(result.rungCounts.NATIONAL).toBe(0)
  })
})

// ── Collect-first / context-branch selection ───────────────────────────

describe('rankMerchantsV2 — collect-first context branch selection', () => {
  it('multi-branch merchant: best rung wins regardless of branch order in input', () => {
    // FAR branch first, NEAR branch second — context must still be the NEAR one.
    const m = merchant('m-multi', [
      branch(51.5, -0.1, { id: 'b-far', locationCountry: 'England' }),         // COUNTRY rung
      branch(53.6470, -1.7860, { id: 'b-near' }),                              // NEARBY rung
    ])
    const result = rankMerchantsV2([m], {
      effLoc, ladderProfile: 'MIXED_NORMAL',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50, hardCap: 200,
    })
    expect(result.tiles).toHaveLength(1)
    expect(result.tiles[0].supplyRung).toBe('NEARBY')
    expect(result.tiles[0].contextBranchId).toBe('b-near')
  })

  it('multi-branch tie-break within the same rung: closer branch wins', () => {
    // Both branches in NEARBY rung. The closer one becomes contextBranch.
    const m = merchant('m-multi-near', [
      branch(53.6500, -1.7900, { id: 'b-near-far' }),  // ~600m
      branch(53.6470, -1.7860, { id: 'b-near-close' }), // ~150m
    ])
    const result = rankMerchantsV2([m], {
      effLoc, ladderProfile: 'MIXED_NORMAL',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50, hardCap: 200,
    })
    expect(result.tiles[0].contextBranchId).toBe('b-near-close')
  })
})

// ── Discoverability gate (locationConfidence redaction contract) ───────

describe('rankMerchantsV2 — discoverability gate (PR #81 redaction)', () => {
  it('POSTCODE_CENTROID branches are silently excluded (no tile produced)', () => {
    const m = merchant('m-centroid', [
      // VALID coords inside NEARBY radius — but confidence forbids classification.
      branch(53.6470, -1.7860, { id: 'b-centroid', locationConfidence: 'POSTCODE_CENTROID' }),
    ])
    const result = rankMerchantsV2([m], {
      effLoc, ladderProfile: 'MIXED_NORMAL',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50, hardCap: 200,
    })
    expect(result.tiles).toHaveLength(0)
  })

  it('inactive branches are silently excluded', () => {
    const m = merchant('m-inactive', [
      branch(53.6470, -1.7860, { id: 'b-inactive', isActive: false }),
    ])
    const result = rankMerchantsV2([m], {
      effLoc, ladderProfile: 'MIXED_NORMAL',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50, hardCap: 200,
    })
    expect(result.tiles).toHaveLength(0)
  })

  it('merchants with NO discoverable branches do not appear in tiles', () => {
    // m-a has one usable branch; m-b has zero (all inactive).
    const ma = merchant('m-a', [branch(53.6470, -1.7860, { id: 'b-a' })])
    const mb = merchant('m-b', [
      branch(53.6470, -1.7860, { id: 'b-b-inactive', isActive: false }),
      branch(53.6470, -1.7860, { id: 'b-b-centroid', locationConfidence: 'POSTCODE_CENTROID' }),
    ])
    const result = rankMerchantsV2([ma, mb], {
      effLoc, ladderProfile: 'MIXED_NORMAL',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50, hardCap: 200,
    })
    expect(result.tiles).toHaveLength(1)
    expect(result.tiles[0].merchantId).toBe('m-a')
  })
})

// ── maxRung enforcement ────────────────────────────────────────────────

describe('rankMerchantsV2 — maxRung enforcement', () => {
  it('LOCAL_TIGHT × SUBURBAN: COUNTY is the max; REGION / COUNTRY / NATIONAL are excluded', () => {
    const mNear = merchant('m-near', [branch(53.6470, -1.7860, { id: 'b-near' })]) // NEARBY
    const mCounty = merchant('m-county', [
      branch(53.0, -1.5, { id: 'b-county', ladDistrict: 'OtherLAD', adminCounty: 'West Yorkshire', region: 'Yorkshire and the Humber', locationCountry: 'England' }),
    ])
    const mRegion = merchant('m-region', [
      branch(54.5, -1.5, { id: 'b-region', ladDistrict: 'OtherLAD', adminCounty: 'OtherCounty', region: 'Yorkshire and the Humber', locationCountry: 'England' }),
    ])
    const mCountry = merchant('m-country', [
      branch(51.5, -0.1, { id: 'b-country', ladDistrict: 'OtherLAD', adminCounty: 'Greater London', region: 'London', locationCountry: 'England' }),
    ])
    const mNational = merchant('m-national', [
      branch(56.0, -3.0, { id: 'b-national', ladDistrict: 'OtherLAD', adminCounty: null, region: null, locationCountry: 'Scotland' }),
    ])
    const result = rankMerchantsV2([mNear, mCounty, mRegion, mCountry, mNational], {
      effLoc, ladderProfile: 'LOCAL_TIGHT',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'LOCAL',
      targetCount: 50, hardCap: 200,
    })
    const ids = result.tiles.map(t => t.merchantId)
    expect(ids).toContain('m-near')
    expect(ids).toContain('m-county')
    expect(ids).not.toContain('m-region')
    expect(ids).not.toContain('m-country')
    expect(ids).not.toContain('m-national')
  })
})

// ── In-rung sort (categoryIntent) ──────────────────────────────────────

describe('rankMerchantsV2 — in-rung sort by categoryIntent', () => {
  it('LOCAL intent: NEARBY rung sorted by distance ASC', () => {
    const mFar = merchant('m-far', [branch(53.6500, -1.7900, { id: 'b-far' })])     // ~600m
    const mClose = merchant('m-close', [branch(53.6470, -1.7860, { id: 'b-close' })]) // ~150m
    const result = rankMerchantsV2([mFar, mClose], {
      effLoc, ladderProfile: 'MIXED_NORMAL',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'LOCAL',
      targetCount: 50, hardCap: 200,
    })
    expect(result.tiles.map(t => t.merchantId)).toEqual(['m-close', 'm-far'])
  })

  it('DESTINATION intent: rated merchants outrank unrated; rated tie → avgRating DESC', () => {
    const mUnrated = merchant('m-unrated', [branch(51.5, -0.1, { id: 'b-1', locationCountry: 'England' })], { avgRating: null, reviewCount: 0 })
    const mLowRated = merchant('m-low', [branch(51.5, -0.11, { id: 'b-2', locationCountry: 'England' })], { avgRating: 3.5, reviewCount: 10 })
    const mHighRated = merchant('m-high', [branch(51.5, -0.12, { id: 'b-3', locationCountry: 'England' })], { avgRating: 4.8, reviewCount: 25 })
    const result = rankMerchantsV2([mUnrated, mLowRated, mHighRated], {
      effLoc, ladderProfile: 'DESTINATION_WIDE',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'DESTINATION',
      targetCount: 50, hardCap: 200,
    })
    // All three are COUNTRY rung. DESTINATION: high-rated > low-rated > unrated.
    expect(result.tiles.map(t => t.merchantId)).toEqual(['m-high', 'm-low', 'm-unrated'])
  })

  it('MIXED intent: NEARBY rung uses distance; outer rungs use quality', () => {
    const mNearFar = merchant('m-near-far', [branch(53.6500, -1.7900, { id: 'b-far' })], { avgRating: 4.9, reviewCount: 50 })
    const mNearClose = merchant('m-near-close', [branch(53.6470, -1.7860, { id: 'b-close' })], { avgRating: 3.1, reviewCount: 50 })
    const mCountryLow = merchant('m-country-low', [branch(51.5, -0.1, { id: 'b-cl', locationCountry: 'England' })], { avgRating: 3.0, reviewCount: 10 })
    const mCountryHigh = merchant('m-country-high', [branch(51.5, -0.11, { id: 'b-ch', locationCountry: 'England' })], { avgRating: 4.8, reviewCount: 10 })
    const result = rankMerchantsV2([mNearFar, mNearClose, mCountryLow, mCountryHigh], {
      effLoc, ladderProfile: 'DESTINATION_WIDE', // admits COUNTRY under SUBURBAN
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50, hardCap: 200,
    })
    // NEARBY first (sorted by distance): m-near-close, m-near-far (high rating ignored at NEARBY).
    // Then COUNTRY (sorted by quality): m-country-high, m-country-low.
    expect(result.tiles.map(t => t.merchantId)).toEqual([
      'm-near-close', 'm-near-far', 'm-country-high', 'm-country-low',
    ])
  })

  it('quality comparator: <3 reviews counts as unrated, alphabetical fallback', () => {
    // All same rung (COUNTRY), all "unrated" by the 3-review threshold.
    // Order should be alphabetical by businessName.
    const mZ = merchant('m-z', [branch(51.5, -0.1, { id: 'b-z', locationCountry: 'England' })], { avgRating: 4.9, reviewCount: 2 }) // <3 → unrated
    const mA = merchant('m-a', [branch(51.5, -0.11, { id: 'b-a', locationCountry: 'England' })], { avgRating: null, reviewCount: 0 })
    const mM = merchant('m-m', [branch(51.5, -0.12, { id: 'b-m', locationCountry: 'England' })], { avgRating: 5.0, reviewCount: 1 }) // <3 → unrated
    const result = rankMerchantsV2([mZ, mA, mM], {
      effLoc, ladderProfile: 'DESTINATION_WIDE',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'DESTINATION',
      targetCount: 50, hardCap: 200,
    })
    expect(result.tiles.map(t => t.merchantId)).toEqual(['m-a', 'm-m', 'm-z'])
  })
})

// ── targetCount + hardCap ──────────────────────────────────────────────

describe('rankMerchantsV2 — targetCount + hardCap', () => {
  it('targetCount stops the walk after NEARBY is fully evaluated', () => {
    // 3 NEARBY merchants + 5 COUNTRY merchants. targetCount=2 means:
    // take all NEARBY first (per spec §5.6), THEN stop — don't proceed
    // to COUNTRY. Use DESTINATION_WIDE so the COUNTRY merchants are
    // CANDIDATES (i.e. not dropped at maxRung) — otherwise the
    // targetCount-stops-walk semantic isn't exercised.
    const nearby = [1, 2, 3].map(i => merchant(`m-near-${i}`, [branch(53.6470 + i * 0.0001, -1.7860 + i * 0.0001, { id: `b-near-${i}` })]))
    const country = [1, 2, 3, 4, 5].map(i => merchant(`m-country-${i}`, [branch(51.5, -0.1 + i * 0.001, { id: `b-country-${i}`, locationCountry: 'England' })]))
    const result = rankMerchantsV2([...nearby, ...country], {
      effLoc, ladderProfile: 'DESTINATION_WIDE',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 2, hardCap: 200,
    })
    expect(result.tiles).toHaveLength(3) // all NEARBY — outer loop breaks before COUNTRY
    expect(result.tiles.every(t => t.supplyRung === 'NEARBY')).toBe(true)
    expect(result.rungCounts.NEARBY).toBe(3)
    expect(result.rungCounts.COUNTRY).toBe(0)
  })

  it('hardCap caps total tiles regardless of targetCount', () => {
    const ms = [1, 2, 3, 4, 5].map(i => merchant(`m-${i}`, [branch(53.6470 + i * 0.0001, -1.7860 + i * 0.0001, { id: `b-${i}` })]))
    const result = rankMerchantsV2(ms, {
      effLoc, ladderProfile: 'MIXED_NORMAL',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 100, hardCap: 3,
    })
    expect(result.tiles).toHaveLength(3)
  })
})

// ── proximityBand (rung × density) ─────────────────────────────────────

describe('rankMerchantsV2 — proximityBand derivation', () => {
  it('LAD rung × URBAN → A_LITTLE_FURTHER; LAD × SUBURBAN → IN_YOUR_AREA', () => {
    const m = merchant('m-lad', [
      branch(53.0, -1.5, { id: 'b-lad', ladDistrict: 'Kirklees', adminCounty: 'OtherCounty', region: 'OtherRegion', locationCountry: 'England' }),
    ])
    // SUBURBAN (LARGE_TOWN derives to SUBURBAN) → LAD = IN_YOUR_AREA
    const suburban = rankMerchantsV2([m], {
      effLoc, ladderProfile: 'MIXED_NORMAL',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50, hardCap: 200,
    })
    expect(suburban.tiles[0].proximityBand).toBe('IN_YOUR_AREA')

    // Same merchant, URBAN density (override effLoc) → LAD = A_LITTLE_FURTHER
    const urbanResult = rankMerchantsV2([m], {
      effLoc: { ...effLoc, densityClass: 'URBAN' },
      ladderProfile: 'MIXED_NORMAL',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50, hardCap: 200,
    })
    expect(urbanResult.tiles[0].proximityBand).toBe('A_LITTLE_FURTHER')
  })
})

// ── UK-wide robustness ─────────────────────────────────────────────────

describe('rankMerchantsV2 — UK-wide robustness', () => {
  it('Scottish user (null adminCounty + null region) + Scottish merchant in same LAD → LAD', () => {
    const scottishLocality = {
      ...huddersfield,
      ladDistrict: 'Edinburgh',
      adminCounty: null,
      region: null,
      country: 'Scotland',
      centerLat: 55.95, centerLng: -3.19,
    }
    const scottishEffLoc: EffectiveLocation = {
      lat: 55.95, lng: -3.19,
      locality: scottishLocality as unknown as EffectiveLocation['locality'],
      densityClass: 'URBAN',
      source: 'GPS',
    }
    // Branch placed at (56.10, -3.20), ~17km north of (55.95, -3.19) —
    // clearly outside the LOCAL_TIGHT × URBAN NEARBY radius (1.5mi
    // ≈ 2.4km). This makes the LAD outcome deterministic (was loose-
    // assertion in the original M2.6 test — PR #84 review fix).
    const m = merchant('m-edinburgh', [
      branch(56.10, -3.20, {
        id: 'b-edin',
        ladDistrict: 'Edinburgh',
        adminCounty: null,
        region: null,
        locationCountry: 'Scotland',
      }),
    ])
    const result = rankMerchantsV2([m], {
      effLoc: scottishEffLoc,
      // LOCAL_TIGHT gives the tightest NEARBY radius across all profiles
      // (URBAN: 1.5mi). Guarantees the 17km branch is outside NEARBY
      // and forces the LAD rung match.
      ladderProfile: 'LOCAL_TIGHT',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50, hardCap: 200,
    })
    expect(result.tiles).toHaveLength(1)
    expect(result.tiles[0].supplyRung).toBe('LAD')
  })
})

// ── Edge cases ─────────────────────────────────────────────────────────

describe('rankMerchantsV2 — edge cases', () => {
  it('empty merchants array returns no tiles and all-zero rungCounts', () => {
    const result = rankMerchantsV2([], {
      effLoc, ladderProfile: 'MIXED_NORMAL',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50, hardCap: 200,
    })
    expect(result.tiles).toEqual([])
    expect(result.rungCounts).toEqual({
      NEARBY: 0, CATCHMENT: 0, POST_TOWN: 0, LAD: 0,
      COUNTY: 0, REGION: 0, COUNTRY: 0, NATIONAL: 0,
    })
  })

  it('merchants with empty branches array return no tiles and all-zero rungCounts', () => {
    const m1 = merchant('m-no-branches-1', [])
    const m2 = merchant('m-no-branches-2', [])
    const result = rankMerchantsV2([m1, m2], {
      effLoc, ladderProfile: 'MIXED_NORMAL',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50, hardCap: 200,
    })
    expect(result.tiles).toEqual([])
    expect(result.rungCounts).toEqual({
      NEARBY: 0, CATCHMENT: 0, POST_TOWN: 0, LAD: 0,
      COUNTY: 0, REGION: 0, COUNTRY: 0, NATIONAL: 0,
    })
  })
})
