// tests/api/lib/rankBranchesV3.test.ts
//
// Phase 1 Task 1.3 — `rankBranchesV3` branch-first cardinality.
//
// Pins the locked algorithm from spec §2 of
// docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md:
//
//   1. One tile per BRANCH (not per merchant). Same-merchant branches
//      emit independent tiles.
//   2. Discoverability gate from `classifyRung` filters out
//      POSTCODE_CENTROID + NEEDS_REVIEW + inactive branches silently
//      (returns null rung → branch dropped from the pipeline).
//   3. Pure-rank D1 sort within each rung per categoryIntent:
//        LOCAL       — distance ASC, businessName tiebreak, id final tiebreak.
//        DESTINATION — quality-aware (rated > unrated, rating DESC) then distance.
//        MIXED       — distance for NEARBY rung, quality-aware for outer rungs.
//   4. `rungCounts` reflects BRANCH count, not merchant count.
//
// Pure in-memory; no DB.

import { describe, it, expect } from 'vitest'
import {
  rankBranchesV3,
  type RankableBranchInputV3,
  type RankInputV3,
} from '../../../src/api/lib/ranking'
import type { EffectiveLocation } from '../../../src/api/lib/effectiveLocation'

// ── Fixtures ───────────────────────────────────────────────────────────

const brightlingsea = {
  id: 'loc_brightlingsea',
  name: 'Brightlingsea',
  slug: 'brightlingsea',
  postTown: 'COLCHESTER',
  ladDistrict: 'Tendring',
  adminCounty: 'Essex',
  region: 'East of England',
  country: 'England',
  centerLat: 51.811,
  centerLng: 1.027,
  populationTier: 'SMALL_TOWN' as const,
}

const fixedEffLoc: EffectiveLocation = {
  lat: 51.811,
  lng: 1.027,
  locality: brightlingsea as unknown as EffectiveLocation['locality'],
  densityClass: 'URBAN',
  source: 'GPS',
}

let branchSerial = 0
function makeBranch(over: Partial<RankableBranchInputV3> = {}): RankableBranchInputV3 {
  const id = over.id ?? `brn_${++branchSerial}`
  const merchantId = over.merchantId ?? `mer_${id}`
  return {
    id,
    merchantId,
    merchant: over.merchant ?? {
      id: merchantId,
      businessName: 'Default Merchant',
      avgRating: null,
      reviewCount: 0,
    },
    latitude: 51.811,
    longitude: 1.027,
    isActive: true,
    locationConfidence: 'MANUALLY_CONFIRMED',
    localityId: 'loc_brightlingsea',
    postTown: 'COLCHESTER',
    ladDistrict: 'Tendring',
    adminCounty: 'Essex',
    region: 'East of England',
    locationCountry: 'England',
    ...over,
  }
}

function baseInput(over: Partial<RankInputV3> = {}): RankInputV3 {
  return {
    effLoc: fixedEffLoc,
    ladderProfile: 'LOCAL_NORMAL',
    outgoingCatchmentTargetIds: [],
    categoryIntent: 'LOCAL',
    targetCount: 20,
    hardCap: 50,
    ...over,
  }
}

// ── 1. One tile per branch (not per merchant) ─────────────────────────

describe('rankBranchesV3 — branch-first cardinality', () => {
  it('emits one tile per branch — two branches of the same merchant produce two tiles', () => {
    const covelumBrightlingsea = makeBranch({
      id: 'brn_covelum_bri',
      merchantId: 'mer_covelum',
      merchant: {
        id: 'mer_covelum',
        businessName: 'Covelum',
        avgRating: null,
        reviewCount: 0,
      },
      latitude: 51.811,
      longitude: 1.027,
    })
    const covelumColchester = makeBranch({
      id: 'brn_covelum_col',
      merchantId: 'mer_covelum',
      merchant: {
        id: 'mer_covelum',
        businessName: 'Covelum',
        avgRating: null,
        reviewCount: 0,
      },
      latitude: 51.889,
      longitude: 0.903,
      localityId: 'loc_colchester',
      postTown: 'COLCHESTER',
    })

    const result = rankBranchesV3([covelumBrightlingsea, covelumColchester], baseInput())

    expect(result.tiles).toHaveLength(2)
    const tileIds = result.tiles.map(t => t.id).sort()
    expect(tileIds).toEqual(['brn_covelum_bri', 'brn_covelum_col'])
    // Both tiles carry the same merchantId — branch is the unit; merchant is grouping context.
    expect(result.tiles.every(t => t.merchantId === 'mer_covelum')).toBe(true)
  })
})

// ── 2. Discoverability gate — POSTCODE_CENTROID excluded ──────────────

describe('rankBranchesV3 — discoverability gate', () => {
  it('drops POSTCODE_CENTROID branches silently (redaction contract)', () => {
    const visible = makeBranch({
      id: 'brn_visible',
      locationConfidence: 'MANUALLY_CONFIRMED',
    })
    const redacted = makeBranch({
      id: 'brn_redacted',
      locationConfidence: 'POSTCODE_CENTROID',
    })

    const result = rankBranchesV3([visible, redacted], baseInput())

    expect(result.tiles.map(t => t.id)).toEqual(['brn_visible'])
    expect(result.tiles.find(t => t.id === 'brn_redacted')).toBeUndefined()
  })

  it('drops NEEDS_REVIEW branches', () => {
    const visible = makeBranch({ id: 'brn_visible_2', locationConfidence: 'ADDRESS_GEOCODED' })
    const review = makeBranch({ id: 'brn_review', locationConfidence: 'NEEDS_REVIEW' })

    const result = rankBranchesV3([visible, review], baseInput())

    expect(result.tiles.map(t => t.id)).toEqual(['brn_visible_2'])
  })

  it('drops inactive branches', () => {
    const active = makeBranch({ id: 'brn_active', isActive: true })
    const inactive = makeBranch({ id: 'brn_inactive', isActive: false })

    const result = rankBranchesV3([active, inactive], baseInput())

    expect(result.tiles.map(t => t.id)).toEqual(['brn_active'])
  })
})

// ── 3. Same-merchant same-rung branches sit adjacent ───────────────────

describe('rankBranchesV3 — pure-rank D1 sort', () => {
  it('same-merchant branches at the same rung are not deduped (Covelum + Karaara mixed)', () => {
    const covelumBri = makeBranch({
      id: 'brn_covelum_bri',
      merchantId: 'mer_covelum',
      merchant: {
        id: 'mer_covelum',
        businessName: 'Covelum',
        avgRating: null,
        reviewCount: 0,
      },
      latitude: 51.811, // viewer location → NEARBY
      longitude: 1.027,
    })
    const covelumCol = makeBranch({
      id: 'brn_covelum_col',
      merchantId: 'mer_covelum',
      merchant: {
        id: 'mer_covelum',
        businessName: 'Covelum',
        avgRating: null,
        reviewCount: 0,
      },
      latitude: 51.811, // also NEARBY for this test
      longitude: 1.027,
    })
    const karaaraHudd = makeBranch({
      id: 'brn_karaara_hudd',
      merchantId: 'mer_karaara',
      merchant: {
        id: 'mer_karaara',
        businessName: 'Karaara',
        avgRating: null,
        reviewCount: 0,
      },
      latitude: 53.6458,
      longitude: -1.7850,
      localityId: 'loc_huddersfield',
      postTown: 'HUDDERSFIELD',
      ladDistrict: 'Kirklees',
      adminCounty: 'West Yorkshire',
      region: 'Yorkshire and the Humber',
      locationCountry: 'England',
    })

    const result = rankBranchesV3([covelumBri, covelumCol, karaaraHudd], baseInput())

    const ids = result.tiles.map(t => t.id)
    // Both Covelum branches must appear (NOT deduped).
    expect(ids).toContain('brn_covelum_bri')
    expect(ids).toContain('brn_covelum_col')
    // Karaara — fixture is set up to LAND in NATIONAL (no overlap with Brightlingsea anywhere).
    // It's far enough that NEARBY would not match, and admin fields disagree.
    // Whether it survives the LOCAL_NORMAL maxRung is a separate concern; we
    // only care that the two Covelum branches sit ADJACENT inside whatever rung they share.
    const covelumIdxs = ids
      .map((id, i) => (id.startsWith('brn_covelum') ? i : -1))
      .filter(i => i !== -1)
    expect(covelumIdxs).toHaveLength(2)
    // Adjacent (consecutive indices).
    expect(covelumIdxs[1] - covelumIdxs[0]).toBe(1)
  })

  it('within a rung, distance ASC drives ordering (LOCAL intent)', () => {
    const near = makeBranch({
      id: 'brn_near',
      latitude: 51.811,
      longitude: 1.027, // 0m
    })
    const farther = makeBranch({
      id: 'brn_farther',
      latitude: 51.815, // ~445m
      longitude: 1.027,
    })

    const result = rankBranchesV3([farther, near], baseInput({ categoryIntent: 'LOCAL' }))

    expect(result.tiles.map(t => t.id)).toEqual(['brn_near', 'brn_farther'])
  })
})

// ── 4. rungCounts reflects branch count, not merchant count ────────────

describe('rankBranchesV3 — rungCounts envelope', () => {
  it('counts each branch separately (two branches of same merchant = 2 in NEARBY)', () => {
    const m1b1 = makeBranch({
      id: 'brn_a',
      merchantId: 'mer_a',
      merchant: {
        id: 'mer_a',
        businessName: 'Alpha',
        avgRating: null,
        reviewCount: 0,
      },
    })
    const m1b2 = makeBranch({
      id: 'brn_b',
      merchantId: 'mer_a',
      merchant: {
        id: 'mer_a',
        businessName: 'Alpha',
        avgRating: null,
        reviewCount: 0,
      },
    })

    const result = rankBranchesV3([m1b1, m1b2], baseInput())

    expect(result.rungCounts.NEARBY).toBe(2)
    expect(result.tiles).toHaveLength(2)
  })

  it('all rung counters initialised to zero', () => {
    const result = rankBranchesV3([], baseInput())

    expect(result.tiles).toEqual([])
    expect(result.rungCounts).toEqual({
      NEARBY: 0, CATCHMENT: 0, POST_TOWN: 0, LAD: 0,
      COUNTY: 0, REGION: 0, COUNTRY: 0, NATIONAL: 0,
    })
  })
})

// ── 5. Tile shape — supplyRung + legacy supplyTier + proximityBand ────

describe('rankBranchesV3 — tile shape', () => {
  it('tiles carry supplyRung + supplyTier (legacy) + proximityBand + distanceMetres', () => {
    const b = makeBranch({ id: 'brn_x', latitude: 51.811, longitude: 1.027 })
    const result = rankBranchesV3([b], baseInput())

    expect(result.tiles).toHaveLength(1)
    const t = result.tiles[0]
    expect(t.id).toBe('brn_x')
    expect(t.supplyRung).toBe('NEARBY')
    expect(t.supplyTier).toBe('NEARBY')
    expect(t.proximityBand).toBeTruthy()
    expect(t.distanceMetres).toBeGreaterThanOrEqual(0)
    expect(t.businessName).toBe('Default Merchant')
  })
})

// ── 6. hardCap, targetCount, rungCounts parity, MIXED, DESTINATION, over-maxRung ──

describe('rankBranchesV3 — hardCap caps tiles globally', () => {
  it('emits exactly hardCap tiles when more branches are eligible', () => {
    // 60 NEARBY-eligible branches; hardCap = 20.
    const branches = Array.from({ length: 60 }, (_, i) =>
      makeBranch({
        id: `brn_hc_${i.toString().padStart(3, '0')}`,
        merchantId: `mer_hc_${i}`,
        merchant: {
          id: `mer_hc_${i}`,
          businessName: `HardCap ${i.toString().padStart(3, '0')}`,
          avgRating: null,
          reviewCount: 0,
        },
        latitude: 51.811,
        longitude: 1.027,
      }),
    )

    const result = rankBranchesV3(branches, baseInput({ targetCount: 100, hardCap: 20 }))

    expect(result.tiles).toHaveLength(20)
    // Post-fix: rungCounts.NEARBY MUST reflect emitted tiles (20), not eligible
    // branches (60). Mirrors rankMerchantsV2 line 605 semantics — V2 increments
    // rungCounts inside the stitch loop AFTER hardCap + tiles.push.
    expect(result.rungCounts.NEARBY).toBe(20)
  })
})

describe('rankBranchesV3 — targetCount stops outer loop after NEARBY fully evaluated', () => {
  it('does NOT cap mid-NEARBY: emits all NEARBY branches even when targetCount is exceeded', () => {
    // 30 NEARBY-eligible branches + 30 CATCHMENT-eligible branches in a
    // catchment-target locality. targetCount=5, hardCap=100.
    const nearby = Array.from({ length: 30 }, (_, i) =>
      makeBranch({
        id: `brn_n_${i.toString().padStart(3, '0')}`,
        merchantId: `mer_n_${i}`,
        merchant: {
          id: `mer_n_${i}`,
          businessName: `Near ${i.toString().padStart(3, '0')}`,
          avgRating: null,
          reviewCount: 0,
        },
        latitude: 51.811,
        longitude: 1.027,
      }),
    )
    // CATCHMENT branches via outgoing-edge to 'loc_catch'. Lat/lng far enough
    // to not match NEARBY radius (LOCAL_NORMAL URBAN = 3 miles).
    const catchment = Array.from({ length: 30 }, (_, i) =>
      makeBranch({
        id: `brn_c_${i.toString().padStart(3, '0')}`,
        merchantId: `mer_c_${i}`,
        merchant: {
          id: `mer_c_${i}`,
          businessName: `Catch ${i.toString().padStart(3, '0')}`,
          avgRating: null,
          reviewCount: 0,
        },
        latitude: 52.500, // ~80km north — well outside any NEARBY radius
        longitude: 1.027,
        localityId: 'loc_catch',
        postTown: 'OTHER',
        ladDistrict: 'OtherLad',
        adminCounty: 'OtherCounty',
        region: 'OtherRegion',
      }),
    )

    const result = rankBranchesV3(
      [...nearby, ...catchment],
      baseInput({ targetCount: 5, hardCap: 100, outgoingCatchmentTargetIds: ['loc_catch'] }),
    )

    // All 30 NEARBY branches emit (targetCount only stops the OUTER loop
    // AFTER NEARBY rung has been fully evaluated, per spec §5.6).
    expect(result.rungCounts.NEARBY).toBe(30)
    // Zero CATCHMENT branches emit (targetCount hit + NEARBY done → outer loop exits).
    expect(result.rungCounts.CATCHMENT).toBe(0)
    expect(result.tiles).toHaveLength(30)
    expect(result.tiles.every(t => t.supplyRung === 'NEARBY')).toBe(true)
  })
})

describe('rankBranchesV3 — rungCounts under hardCap mirrors V2', () => {
  it('rungCounts reflects EMITTED tile count, not eligible branch count', () => {
    const branches = Array.from({ length: 50 }, (_, i) =>
      makeBranch({
        id: `brn_e_${i.toString().padStart(3, '0')}`,
        merchantId: `mer_e_${i}`,
        merchant: {
          id: `mer_e_${i}`,
          businessName: `Eq ${i.toString().padStart(3, '0')}`,
          avgRating: null,
          reviewCount: 0,
        },
      }),
    )

    const result = rankBranchesV3(branches, baseInput({ targetCount: 100, hardCap: 10 }))

    expect(result.tiles).toHaveLength(10)
    // V2 parity: rungCounts post-cap, NOT pre-cap.
    expect(result.rungCounts.NEARBY).toBe(10)
  })
})

describe('rankBranchesV3 — MIXED intent: distance at NEARBY, quality at outer rungs', () => {
  it('MIXED at NEARBY uses distance ASC (closer branch first)', () => {
    const near = makeBranch({
      id: 'brn_mixed_near',
      latitude: 51.811,
      longitude: 1.027,
      merchant: {
        id: 'mer_mixed_near',
        businessName: 'Mixed Near',
        avgRating: 3.0,
        reviewCount: 10,
      },
    })
    const farther = makeBranch({
      id: 'brn_mixed_far',
      latitude: 51.815, // ~445m
      longitude: 1.027,
      merchant: {
        id: 'mer_mixed_far',
        businessName: 'Mixed Far',
        avgRating: 5.0, // higher quality, but distance dominates at NEARBY
        reviewCount: 10,
      },
    })

    const result = rankBranchesV3([farther, near], baseInput({ categoryIntent: 'MIXED' }))

    expect(result.tiles.map(t => t.id)).toEqual(['brn_mixed_near', 'brn_mixed_far'])
  })

  it('MIXED at outer rung (CATCHMENT) uses quality (rated > unrated)', () => {
    // Both branches are CATCHMENT (outgoing edge → loc_catch), same distance.
    const rated = makeBranch({
      id: 'brn_catch_rated',
      latitude: 52.500,
      longitude: 1.027,
      localityId: 'loc_catch',
      postTown: 'OTHER',
      ladDistrict: 'OtherLad',
      adminCounty: 'OtherCounty',
      region: 'OtherRegion',
      merchant: {
        id: 'mer_catch_rated',
        businessName: 'Rated Catch',
        avgRating: 4.5,
        reviewCount: 10, // ≥ MIN_REVIEW_COUNT_FOR_RATING_SORT (3)
      },
    })
    const unrated = makeBranch({
      id: 'brn_catch_unrated',
      latitude: 52.500,
      longitude: 1.027,
      localityId: 'loc_catch',
      postTown: 'OTHER',
      ladDistrict: 'OtherLad',
      adminCounty: 'OtherCounty',
      region: 'OtherRegion',
      merchant: {
        id: 'mer_catch_unrated',
        businessName: 'Aaaa Unrated', // alphabetically first — would win pure-alpha but quality kicks in
        avgRating: null,
        reviewCount: 0,
      },
    })

    const result = rankBranchesV3(
      [unrated, rated],
      baseInput({ categoryIntent: 'MIXED', outgoingCatchmentTargetIds: ['loc_catch'] }),
    )

    // Both at CATCHMENT; quality-aware sort places the rated one first.
    expect(result.tiles.map(t => t.supplyRung)).toEqual(['CATCHMENT', 'CATCHMENT'])
    expect(result.tiles.map(t => t.id)).toEqual(['brn_catch_rated', 'brn_catch_unrated'])
  })
})

describe('rankBranchesV3 — DESTINATION quality fallback when both unrated', () => {
  it('both branches unrated → quality comparator falls through to distance', () => {
    const near = makeBranch({
      id: 'brn_dest_near',
      latitude: 51.811,
      longitude: 1.027,
      merchant: {
        id: 'mer_dest_near',
        businessName: 'Bee Dest', // alphabetically AFTER 'Aaa Dest' — distance must dominate
        avgRating: null,
        reviewCount: 1, // below MIN_REVIEW_COUNT_FOR_RATING_SORT (3) → unrated
      },
    })
    const farther = makeBranch({
      id: 'brn_dest_far',
      latitude: 51.815, // ~445m
      longitude: 1.027,
      merchant: {
        id: 'mer_dest_far',
        businessName: 'Aaa Dest',
        avgRating: null,
        reviewCount: 1, // also unrated
      },
    })

    const result = rankBranchesV3([farther, near], baseInput({ categoryIntent: 'DESTINATION' }))

    // Both unrated → falls through to distance ASC; closer 'Bee Dest' wins despite alphabetically later name.
    expect(result.tiles.map(t => t.id)).toEqual(['brn_dest_near', 'brn_dest_far'])
  })
})

describe('rankBranchesV3 — over-maxRung branches excluded from tiles AND rungCounts', () => {
  it('LOCAL_TIGHT URBAN max is LAD — a COUNTY-classified branch is dropped from both', () => {
    // viewer at Brightlingsea (Essex / Tendring). Construct a branch that lands at COUNTY
    // (same Essex county, different locality + postTown + LAD, NEARBY distance excluded).
    // LOCAL_TIGHT URBAN nearby radius = 1.5 miles; 'far' branch ~80km away.
    const nearbyLad = makeBranch({
      id: 'brn_local_lad',
      latitude: 51.811,
      longitude: 1.027,
      // default fixture is Brightlingsea — NEARBY rung.
    })
    const overMax = makeBranch({
      id: 'brn_county_over_max',
      latitude: 52.000, // ~21km north of Brightlingsea → outside 1.5mi NEARBY
      longitude: 1.027,
      localityId: 'loc_chelmsford',
      postTown: 'CHELMSFORD', // different postTown
      ladDistrict: 'Chelmsford', // different LAD
      adminCounty: 'Essex', // SAME county → would classify as COUNTY
      region: 'East of England',
      locationCountry: 'England',
    })

    const result = rankBranchesV3(
      [nearbyLad, overMax],
      baseInput({ ladderProfile: 'LOCAL_TIGHT' }),
    )

    // Only the NEARBY branch emits — over-max COUNTY branch dropped.
    expect(result.tiles.map(t => t.id)).toEqual(['brn_local_lad'])
    expect(result.rungCounts.NEARBY).toBe(1)
    expect(result.rungCounts.COUNTY).toBe(0)
    // Defensive — no spurious counts at any rung beyond max.
    expect(result.rungCounts.REGION).toBe(0)
    expect(result.rungCounts.COUNTRY).toBe(0)
    expect(result.rungCounts.NATIONAL).toBe(0)
  })
})
