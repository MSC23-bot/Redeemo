// tests/api/lib/classifyRung.test.ts
//
// Plan 4 M2.5 — per-branch rung classifier.
//
// Pins the 8-rung ladder, the discoverability gate (the
// locationConfidence-redaction contract from PR #81), the "most-
// specific wins" precedence, the UK-wide null-handling for
// Scottish / Welsh / NI users where `adminCounty` and `region` are
// null, AND the Branch field-name asymmetry (`locationCountry` on
// the Plan 4 branch snapshot vs `country` on Locality).
//
// Pure in-memory tests — no DB. Fixtures are plain TS objects cast
// as the relevant types where Prisma columns aren't needed.

import { describe, it, expect } from 'vitest'
import { classifyRung } from '../../../src/api/lib/ranking'
import { isBranchLocationConfirmed } from '../../../src/api/shared/location'
import type { EffectiveLocation } from '../../../src/api/lib/effectiveLocation'

// Helper — build an EffectiveLocation around a partial Locality.
function buildEffLoc(
  localityOverrides: Partial<Record<string, unknown>> = {},
  effOverrides: Partial<EffectiveLocation> = {},
): EffectiveLocation {
  const locality = {
    id: 'loc-user',
    name: 'UserTown',
    slug: 'user-town',
    postTown: null,
    ladDistrict: 'UserLAD',
    adminCounty: 'UserCounty',
    region: 'UserRegion',
    country: 'England',
    centerLat: 51.5,
    centerLng: -0.1,
    populationTier: 'CITY' as const,
    ...localityOverrides,
  } as unknown as EffectiveLocation['locality']
  return {
    lat: 51.5,
    lng: -0.1,
    locality,
    densityClass: 'URBAN',
    source: 'GPS',
    ...effOverrides,
  }
}

type TestBranch = {
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

function makeBranch(overrides: Partial<TestBranch> = {}): TestBranch {
  return {
    latitude: 53.0,
    longitude: -2.0, // ~150mi from (51.5, -0.1), well outside NEARBY for the tests below
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

describe('classifyRung — rung matches', () => {
  it('NEARBY when within the configured radius', () => {
    const branch = makeBranch({
      latitude: 51.501,
      longitude: -0.101, // ~140m from (51.5, -0.1)
      localityId: 'loc-other',
      ladDistrict: 'OtherLAD', // deliberately different so only the distance check explains the match
    })
    expect(classifyRung(branch, buildEffLoc(), 1.5, [])).toBe('NEARBY')
  })

  it('CATCHMENT when the branch locality is the user locality (same id, no edges needed)', () => {
    const branch = makeBranch({
      localityId: 'loc-user', // identical to effLoc.locality.id
      ladDistrict: 'OtherLAD',
    })
    expect(classifyRung(branch, buildEffLoc(), 1.5, [])).toBe('CATCHMENT')
  })

  it('CATCHMENT via outgoing edge to branch locality', () => {
    const branch = makeBranch({
      localityId: 'loc-target',
      ladDistrict: 'OtherLAD',
    })
    expect(classifyRung(branch, buildEffLoc(), 1.5, ['loc-target'])).toBe('CATCHMENT')
  })

  it('POST_TOWN when same postTown (both sides non-null)', () => {
    const eff = buildEffLoc({ postTown: 'HUDDERSFIELD' })
    const branch = makeBranch({
      postTown: 'HUDDERSFIELD',
      ladDistrict: 'OtherLAD',
    })
    expect(classifyRung(branch, eff, 1.5, [])).toBe('POST_TOWN')
  })

  it('LAD when same ladDistrict and no closer match', () => {
    const branch = makeBranch({ ladDistrict: 'UserLAD' })
    expect(classifyRung(branch, buildEffLoc(), 1.5, [])).toBe('LAD')
  })

  it('COUNTY when same adminCounty and no LAD / POST_TOWN / CATCHMENT match', () => {
    const branch = makeBranch({
      ladDistrict: 'OtherLAD',
      adminCounty: 'UserCounty',
      region: 'OtherRegion',
    })
    expect(classifyRung(branch, buildEffLoc(), 1.5, [])).toBe('COUNTY')
  })

  it('REGION when same region only', () => {
    const branch = makeBranch({
      ladDistrict: 'OtherLAD',
      adminCounty: 'OtherCounty',
      region: 'UserRegion',
    })
    expect(classifyRung(branch, buildEffLoc(), 1.5, [])).toBe('REGION')
  })

  it('COUNTRY when only the Plan 4 nation matches (branch.locationCountry === locality.country)', () => {
    const branch = makeBranch({
      ladDistrict: 'OtherLAD',
      adminCounty: 'OtherCounty',
      region: 'OtherRegion',
      locationCountry: 'England',
    })
    expect(classifyRung(branch, buildEffLoc(), 1.5, [])).toBe('COUNTRY')
  })

  it('NATIONAL when only fall-through (different country)', () => {
    const branch = makeBranch({
      ladDistrict: 'OtherLAD',
      adminCounty: 'OtherCounty',
      region: 'OtherRegion',
      locationCountry: 'Scotland',
    })
    expect(classifyRung(branch, buildEffLoc(), 1.5, [])).toBe('NATIONAL')
  })
})

describe('classifyRung — precedence (most-specific wins)', () => {
  it('NEARBY wins over LAD: a branch in the same LAD AND within the NEARBY radius returns NEARBY', () => {
    const branch = makeBranch({
      latitude: 51.501,
      longitude: -0.101, // within radius
      ladDistrict: 'UserLAD', // would also match LAD on fallthrough
    })
    expect(classifyRung(branch, buildEffLoc(), 1.5, [])).toBe('NEARBY')
  })

  it('CATCHMENT wins over LAD: same-locality match outranks LAD-only match', () => {
    const branch = makeBranch({
      localityId: 'loc-user', // same as effLoc.locality.id
      ladDistrict: 'UserLAD',
    })
    expect(classifyRung(branch, buildEffLoc(), 1.5, [])).toBe('CATCHMENT')
  })
})

describe('classifyRung — discoverability gate (locationConfidence-redaction contract)', () => {
  it('returns null when isActive is false (even if all other fields would match NEARBY)', () => {
    const branch = makeBranch({
      latitude: 51.501,
      longitude: -0.101,
      isActive: false,
    })
    expect(classifyRung(branch, buildEffLoc(), 1.5, [])).toBeNull()
  })

  it('returns null when locationConfidence is POSTCODE_CENTROID — pins PR #81 redaction contract', () => {
    // Branch has VALID coords inside NEARBY radius. The gate MUST refuse
    // to classify, otherwise an approximate postcode-centroid pin would
    // leak into customer-facing "near me" ordering.
    const branch = makeBranch({
      latitude: 51.501,
      longitude: -0.101,
      locationConfidence: 'POSTCODE_CENTROID',
      ladDistrict: 'UserLAD',
    })
    expect(classifyRung(branch, buildEffLoc(), 1.5, [])).toBeNull()
  })

  it('returns null when locationConfidence is NEEDS_REVIEW', () => {
    const branch = makeBranch({
      latitude: 51.501,
      longitude: -0.101,
      locationConfidence: 'NEEDS_REVIEW',
      ladDistrict: 'UserLAD',
    })
    expect(classifyRung(branch, buildEffLoc(), 1.5, [])).toBeNull()
  })

  it('ADDRESS_GEOCODED is discoverable (returns a rung)', () => {
    const branch = makeBranch({
      latitude: 51.501,
      longitude: -0.101,
      locationConfidence: 'ADDRESS_GEOCODED',
    })
    expect(classifyRung(branch, buildEffLoc(), 1.5, [])).toBe('NEARBY')
  })
})

describe('classifyRung — null-safe admin-rung handling', () => {
  it('does NOT match at COUNTY when BOTH sides have null adminCounty', () => {
    // Scottish-style: both sides null. The null-vs-null comparison must
    // NOT classify as COUNTY — falls through to REGION / COUNTRY / etc.
    const eff = buildEffLoc({ adminCounty: null, region: null, country: 'Scotland' })
    const branch = makeBranch({
      ladDistrict: 'OtherLAD',
      adminCounty: null,
      region: null,
      locationCountry: 'Scotland',
    })
    // Falls through past COUNTY (both null) and REGION (both null), lands at COUNTRY.
    expect(classifyRung(branch, eff, 1.5, [])).toBe('COUNTRY')
  })

  it('does NOT match at REGION when BOTH sides have null region', () => {
    // Same shape as above but with a county difference to isolate REGION.
    const eff = buildEffLoc({ region: null, country: 'Scotland' })
    const branch = makeBranch({
      ladDistrict: 'OtherLAD',
      adminCounty: 'OtherCounty', // breaks COUNTY explicitly
      region: null,
      locationCountry: 'Scotland',
    })
    expect(classifyRung(branch, eff, 1.5, [])).toBe('COUNTRY')
  })

  it('does NOT match at COUNTY when only the branch side is null', () => {
    const branch = makeBranch({
      ladDistrict: 'OtherLAD',
      adminCounty: null, // branch null, eff has 'UserCounty'
      region: 'UserRegion',
    })
    expect(classifyRung(branch, buildEffLoc(), 1.5, [])).toBe('REGION')
  })

  it('Scottish user + Scottish branch in same LAD → LAD (no spurious null-side admin matches)', () => {
    const eff = buildEffLoc({ adminCounty: null, region: null, country: 'Scotland', ladDistrict: 'Edinburgh' })
    const branch = makeBranch({
      ladDistrict: 'Edinburgh', // matches
      adminCounty: null,
      region: null,
      locationCountry: 'Scotland',
    })
    expect(classifyRung(branch, eff, 1.5, [])).toBe('LAD')
  })
})

// Phase 2 Slice 1 M4 — cross-module parity pin.
//
// M4 refactored classifyRung's discoverability gate from an inline
// `=== 'MANUALLY_CONFIRMED' || === 'ADDRESS_GEOCODED'` literal to the shared
// `isBranchLocationConfirmed` helper. This pins that the gate and the helper
// stay in lockstep across the FULL LocationConfidence enum, so a future edit
// to CONFIRMED_LOCATION_SET can't silently desync the ranking gate from the
// helper the M5 go-live path will share.
describe('classifyRung — discoverability tracks isBranchLocationConfirmed (M4 helper parity)', () => {
  const ALL_CONFIDENCES = [
    'MANUALLY_CONFIRMED',
    'ADDRESS_GEOCODED',
    'POSTCODE_CENTROID',
    'NEEDS_REVIEW',
  ] as const

  it.each(ALL_CONFIDENCES)(
    'confidence %s: classifyRung returns a rung iff isBranchLocationConfirmed is true',
    (confidence) => {
      // NEARBY-eligible coords so a confirmed branch resolves to a rung and an
      // unconfirmed branch is the ONLY reason a null comes back.
      const branch = makeBranch({
        latitude: 51.501,
        longitude: -0.101,
        locationConfidence: confidence,
      })
      const rung = classifyRung(branch, buildEffLoc(), 1.5, [])
      expect(rung !== null).toBe(isBranchLocationConfirmed({ locationConfidence: confidence }))
    },
  )
})

describe('classifyRung — branch with no coordinates', () => {
  it('falls through past NEARBY to LAD when branch.latitude / longitude are null', () => {
    const branch = makeBranch({
      latitude: null,
      longitude: null,
      ladDistrict: 'UserLAD',
    })
    expect(classifyRung(branch, buildEffLoc(), 1.5, [])).toBe('LAD')
  })
})
