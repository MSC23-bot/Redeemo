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
      primaryCategory: { intentType: 'LOCAL' },
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
        primaryCategory: { intentType: 'LOCAL' },
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
        primaryCategory: { intentType: 'LOCAL' },
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
        primaryCategory: { intentType: 'LOCAL' },
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
        primaryCategory: { intentType: 'LOCAL' },
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
        primaryCategory: { intentType: 'LOCAL' },
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
        primaryCategory: { intentType: 'LOCAL' },
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
        primaryCategory: { intentType: 'LOCAL' },
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
