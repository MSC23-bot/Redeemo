// tests/api/customer/discovery/search-branches-scope.test.ts
//
// Discovery Rebaseline Task 2.1.0 — `searchBranches` scope-cascade parity.
// Plan Rev 1.2 PR-2 entry gate.
//
// Pins:
//   1. `scope: 'nearby'`  filters to NEARBY rung only.
//   2. `scope: 'city'`    admits NEARBY + CATCHMENT + POST_TOWN rungs.
//   3. `scope: 'region'`  admits NEARBY + CITY tiers identically to 'city'
//      (parity with `resolveScopeForRanking` — both → ['NEARBY', 'CITY']).
//   4. `scope: 'platform'` admits all rungs.
//   5. Default scope follows LOCAL/MIXED category intent — NEARBY + CITY.
//   6. Cascade expansion when initial retained-set is empty.
//
// Real-DB integration pattern (§BU). FIXTURE_PREFIX = `rbl-2-1-0-` so
// afterAll cleanup is deterministic and bounded to this suite's rows.
//
// Test localities sit in the North Sea (lat 54.5, lng 5.0) so the 16k+
// seeded UK Localities cannot interfere with GPS-driven findNearestLocality
// lookups (mirrors the pattern in tests/api/lib/effectiveLocation.test.ts).

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { searchBranches } from '../../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const FIXTURE_PREFIX = 'rbl-2-1-0-'

// Viewer locality — North Sea, well outside any seeded UK Locality bbox.
// lat 54.5, lng 5.0 puts us ≥ 1.5° east of the UK seed's lng-max (~2.0)
// and disjoint from effectiveLocation.test.ts's lng=4.0 zone.
const VIEWER = { lat: 54.5, lng: 5.0 }

// Multi-rung fixture coordinates. Distances from VIEWER are computed via
// haversine; the resolved viewer-locality has populationTier=CITY, which
// gives DensityClass=URBAN. For MIXED_NORMAL ladder profile (the default
// when no categoryId is passed) NEARBY radius @ URBAN = 5 miles.
//
// NEARBY_COORDS: ~0.4 mi from viewer — well inside the 5 mi NEARBY radius.
const NEARBY_COORDS    = { lat: 54.506, lng: 5.006 }
// FAR_COORDS: ~12 mi from viewer — outside NEARBY radius. Same locality as
// viewer (set via localityId), so classifyRung falls through to CATCHMENT.
const FAR_SAME_LOC     = { lat: 54.675, lng: 5.000 }
// REGION_COORDS: outside NEARBY radius; different post-town / LAD / county
// from viewer but SAME `region` and `country`. classifyRung walks past
// LAD/COUNTY (no match), hits REGION (match). Region rung is in the DISTANT
// tier per `resolveScopeForBranches`'s mapping. We deliberately stay within
// the maxRung admitted by MIXED_NORMAL @ URBAN (= REGION) so the branch
// survives `rankBranchesV3`'s discoverability walk.
const REGION_COORDS    = { lat: 55.500, lng: 5.000 }

const VIEWER_LOCALITY_ID = `${FIXTURE_PREFIX}viewer-locality`
const REGION_LOCALITY_ID = `${FIXTURE_PREFIX}region-locality`
const MERCHANT_ID        = `${FIXTURE_PREFIX}merchant`
const BRANCH_A_ID        = `${FIXTURE_PREFIX}branch-a-nearby`
const BRANCH_B_ID        = `${FIXTURE_PREFIX}branch-b-catchment`
const BRANCH_C_ID        = `${FIXTURE_PREFIX}branch-c-national`

// Cascade-expansion fixture — only a NATIONAL-rung branch exists.
const CASCADE_MERCHANT_ID = `${FIXTURE_PREFIX}cascade-merchant`
const CASCADE_BRANCH_ID   = `${FIXTURE_PREFIX}cascade-branch`

async function createScopeFixture() {
  // Two Localities — viewer's and a remote one in a different country.
  await prisma.locality.upsert({
    where: { id: VIEWER_LOCALITY_ID },
    create: {
      id:             VIEWER_LOCALITY_ID,
      name:           `${FIXTURE_PREFIX}ViewerLocality`,
      slug:           `${FIXTURE_PREFIX}viewer-locality`,
      postTown:       `${FIXTURE_PREFIX}ViewerPostTown`,
      ladDistrict:    `${FIXTURE_PREFIX}ViewerLAD`,
      adminCounty:    `${FIXTURE_PREFIX}ViewerCounty`,
      region:         `${FIXTURE_PREFIX}ViewerRegion`,
      country:        'England',
      centerLat:      VIEWER.lat,
      centerLng:      VIEWER.lng,
      populationTier: 'CITY',
    },
    update: {
      centerLat:      VIEWER.lat,
      centerLng:      VIEWER.lng,
      postTown:       `${FIXTURE_PREFIX}ViewerPostTown`,
      ladDistrict:    `${FIXTURE_PREFIX}ViewerLAD`,
      adminCounty:    `${FIXTURE_PREFIX}ViewerCounty`,
      region:         `${FIXTURE_PREFIX}ViewerRegion`,
      country:        'England',
      populationTier: 'CITY',
    },
  })

  // Branch C's locality — different postTown / LAD / county from viewer,
  // but SAME region + SAME country. classifyRung walks past LAD/COUNTY
  // (no match), hits REGION (match). REGION is in the DISTANT tier per
  // `resolveScopeForBranches`'s mapping AND within MIXED_NORMAL @ URBAN's
  // maxRung (= REGION), so the branch survives rankBranchesV3's walk.
  await prisma.locality.upsert({
    where: { id: REGION_LOCALITY_ID },
    create: {
      id:             REGION_LOCALITY_ID,
      name:           `${FIXTURE_PREFIX}RegionLocality`,
      slug:           `${FIXTURE_PREFIX}region-locality`,
      postTown:       `${FIXTURE_PREFIX}RegionPostTown`,
      ladDistrict:    `${FIXTURE_PREFIX}RegionLAD`,
      adminCounty:    `${FIXTURE_PREFIX}RegionCounty`,
      region:         `${FIXTURE_PREFIX}ViewerRegion`, // SAME region as viewer
      country:        'England',                       // SAME country as viewer
      centerLat:      REGION_COORDS.lat,
      centerLng:      REGION_COORDS.lng,
      populationTier: 'TOWN',
    },
    update: {
      centerLat:      REGION_COORDS.lat,
      centerLng:      REGION_COORDS.lng,
      region:         `${FIXTURE_PREFIX}ViewerRegion`,
      country:        'England',
      populationTier: 'TOWN',
    },
  })

  await prisma.merchant.upsert({
    where: { id: MERCHANT_ID },
    create: {
      id:                 MERCHANT_ID,
      businessName:       `${FIXTURE_PREFIX}ScopeTest`,
      tradingName:        `${FIXTURE_PREFIX}ScopeTest`,
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: { businessName: `${FIXTURE_PREFIX}ScopeTest`, status: 'ACTIVE' },
  })

  // Branch A — NEARBY rung. Inside the 5-mi URBAN NEARBY radius for
  // MIXED_NORMAL ladder profile.
  await prisma.branch.upsert({
    where: { id: BRANCH_A_ID },
    create: {
      id:                 BRANCH_A_ID,
      merchantId:         MERCHANT_ID,
      name:               `${FIXTURE_PREFIX}ScopeTest — Nearby`,
      isMainBranch:       true,
      addressLine1:       '1 Test St',
      city:               'Nearby',
      postcode:           'TS1 1AA',
      country:            'GB',
      latitude:           NEARBY_COORDS.lat,
      longitude:          NEARBY_COORDS.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityId:         VIEWER_LOCALITY_ID,
      localityName:       `${FIXTURE_PREFIX}ViewerLocality`,
      postTown:           `${FIXTURE_PREFIX}ViewerPostTown`,
      ladDistrict:        `${FIXTURE_PREFIX}ViewerLAD`,
      adminCounty:        `${FIXTURE_PREFIX}ViewerCounty`,
      region:             `${FIXTURE_PREFIX}ViewerRegion`,
      locationCountry:    'England',
    },
    update: {
      latitude:           NEARBY_COORDS.lat,
      longitude:          NEARBY_COORDS.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityId:         VIEWER_LOCALITY_ID,
      localityName:       `${FIXTURE_PREFIX}ViewerLocality`,
      postTown:           `${FIXTURE_PREFIX}ViewerPostTown`,
      ladDistrict:        `${FIXTURE_PREFIX}ViewerLAD`,
      adminCounty:        `${FIXTURE_PREFIX}ViewerCounty`,
      region:             `${FIXTURE_PREFIX}ViewerRegion`,
      locationCountry:    'England',
    },
  })

  // Branch B — CATCHMENT rung. Outside NEARBY radius (~12 mi), same
  // localityId as viewer → classifyRung falls through to CATCHMENT (same
  // locality).
  await prisma.branch.upsert({
    where: { id: BRANCH_B_ID },
    create: {
      id:                 BRANCH_B_ID,
      merchantId:         MERCHANT_ID,
      name:               `${FIXTURE_PREFIX}ScopeTest — Catchment`,
      isMainBranch:       false,
      addressLine1:       '2 Test St',
      city:               'CatchmentCity',
      postcode:           'TS2 2AA',
      country:            'GB',
      latitude:           FAR_SAME_LOC.lat,
      longitude:          FAR_SAME_LOC.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityId:         VIEWER_LOCALITY_ID,
      localityName:       `${FIXTURE_PREFIX}ViewerLocality`,
      postTown:           `${FIXTURE_PREFIX}ViewerPostTown`,
      ladDistrict:        `${FIXTURE_PREFIX}ViewerLAD`,
      adminCounty:        `${FIXTURE_PREFIX}ViewerCounty`,
      region:             `${FIXTURE_PREFIX}ViewerRegion`,
      locationCountry:    'England',
    },
    update: {
      latitude:           FAR_SAME_LOC.lat,
      longitude:          FAR_SAME_LOC.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityId:         VIEWER_LOCALITY_ID,
      postTown:           `${FIXTURE_PREFIX}ViewerPostTown`,
      ladDistrict:        `${FIXTURE_PREFIX}ViewerLAD`,
      adminCounty:        `${FIXTURE_PREFIX}ViewerCounty`,
      region:             `${FIXTURE_PREFIX}ViewerRegion`,
      locationCountry:    'England',
    },
  })

  // Branch C — REGION rung (DISTANT tier). Shares region+country with viewer
  // but NOT locality/postTown/LAD/county — so classifyRung walks past LAD
  // (no match) → COUNTY (no match) → REGION (match). REGION is the highest
  // rung admitted by MIXED_NORMAL @ URBAN (maxRung=REGION) so the branch
  // survives rankBranchesV3's discoverability walk.
  await prisma.branch.upsert({
    where: { id: BRANCH_C_ID },
    create: {
      id:                 BRANCH_C_ID,
      merchantId:         MERCHANT_ID,
      name:               `${FIXTURE_PREFIX}ScopeTest — Region`,
      isMainBranch:       false,
      addressLine1:       '3 Test St',
      city:               'RegionCity',
      postcode:           'TS3 3AA',
      country:            'GB',
      latitude:           REGION_COORDS.lat,
      longitude:          REGION_COORDS.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityId:         REGION_LOCALITY_ID,
      localityName:       `${FIXTURE_PREFIX}RegionLocality`,
      postTown:           `${FIXTURE_PREFIX}RegionPostTown`,
      ladDistrict:        `${FIXTURE_PREFIX}RegionLAD`,
      adminCounty:        `${FIXTURE_PREFIX}RegionCounty`,
      region:             `${FIXTURE_PREFIX}ViewerRegion`, // SAME as viewer
      locationCountry:    'England',                        // SAME as viewer
    },
    update: {
      latitude:           REGION_COORDS.lat,
      longitude:          REGION_COORDS.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityId:         REGION_LOCALITY_ID,
      postTown:           `${FIXTURE_PREFIX}RegionPostTown`,
      ladDistrict:        `${FIXTURE_PREFIX}RegionLAD`,
      adminCounty:        `${FIXTURE_PREFIX}RegionCounty`,
      region:             `${FIXTURE_PREFIX}ViewerRegion`,
      locationCountry:    'England',
    },
  })
}

async function createCascadeFixture() {
  // Separate merchant/branch so the cascade test's `q` filter doesn't
  // pull in the 3-rung fixture branches.
  await prisma.merchant.upsert({
    where: { id: CASCADE_MERCHANT_ID },
    create: {
      id:                 CASCADE_MERCHANT_ID,
      businessName:       `${FIXTURE_PREFIX}CascadeTest`,
      tradingName:        `${FIXTURE_PREFIX}CascadeTest`,
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: { businessName: `${FIXTURE_PREFIX}CascadeTest`, status: 'ACTIVE' },
  })

  // Only one branch — REGION rung (DISTANT tier). Triggers the cascade
  // expansion when scope: 'nearby' is requested but NEARBY+CITY supply is
  // zero. Same locality/region/country setup as Branch C above so
  // classifyRung resolves to REGION (within MIXED_NORMAL @ URBAN's maxRung).
  await prisma.branch.upsert({
    where: { id: CASCADE_BRANCH_ID },
    create: {
      id:                 CASCADE_BRANCH_ID,
      merchantId:         CASCADE_MERCHANT_ID,
      name:               `${FIXTURE_PREFIX}CascadeTest — Region`,
      isMainBranch:       true,
      addressLine1:       '9 Test St',
      city:               'RegionCity',
      postcode:           'TS9 9AA',
      country:            'GB',
      latitude:           REGION_COORDS.lat,
      longitude:          REGION_COORDS.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityId:         REGION_LOCALITY_ID,
      localityName:       `${FIXTURE_PREFIX}RegionLocality`,
      postTown:           `${FIXTURE_PREFIX}RegionPostTown`,
      ladDistrict:        `${FIXTURE_PREFIX}RegionLAD`,
      adminCounty:        `${FIXTURE_PREFIX}RegionCounty`,
      region:             `${FIXTURE_PREFIX}ViewerRegion`, // SAME as viewer
      locationCountry:    'England',                        // SAME as viewer
    },
    update: {
      latitude:           REGION_COORDS.lat,
      longitude:          REGION_COORDS.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityId:         REGION_LOCALITY_ID,
      postTown:           `${FIXTURE_PREFIX}RegionPostTown`,
      ladDistrict:        `${FIXTURE_PREFIX}RegionLAD`,
      adminCounty:        `${FIXTURE_PREFIX}RegionCounty`,
      region:             `${FIXTURE_PREFIX}ViewerRegion`,
      locationCountry:    'England',
    },
  })
}

beforeAll(async () => {
  // Warm-up the connection (§BU pattern).
  await prisma.$queryRaw`SELECT 1`
  // FK ordering: localities first (branches reference them), merchants next,
  // branches last (handled inside each create helper).
  await createScopeFixture()
  await createCascadeFixture()
})

afterAll(async () => {
  // FK ordering: branches → merchants → localities (User table not touched).
  await prisma.branch.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.merchant.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.locality.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.$disconnect()
})

describe('Discovery Rebaseline Task 2.1.0 — searchBranches scope cascade', () => {
  // Reusable helper. q-filter matches all 3 branches of the scope fixture;
  // we then verify which of A/B/C survive the rung filter.
  const callScopeFixture = (scope?: 'nearby' | 'city' | 'region' | 'platform') =>
    searchBranches(prisma, {
      q:      `${FIXTURE_PREFIX}ScopeTest`,
      lat:    VIEWER.lat,
      lng:    VIEWER.lng,
      scope,
      limit:  20,
      offset: 0,
      userId: null,
    })

  it("scope: 'nearby' filters to NEARBY rung only — branch A surfaces, B and C do NOT", async () => {
    const result = await callScopeFixture('nearby')

    const fixtureIds = new Set(
      result.branches
        .filter(t => t.merchant.id === MERCHANT_ID)
        .map(t => t.id),
    )

    expect(fixtureIds.has(BRANCH_A_ID)).toBe(true)
    expect(fixtureIds.has(BRANCH_B_ID)).toBe(false)
    expect(fixtureIds.has(BRANCH_C_ID)).toBe(false)

    expect(result.meta.scope).toBe('nearby')
    expect(result.meta.scopeExpanded).toBe(false)
  })

  it("scope: 'city' admits NEARBY + CATCHMENT + POST_TOWN — branches A + B surface, C does NOT", async () => {
    const result = await callScopeFixture('city')

    const fixtureIds = new Set(
      result.branches
        .filter(t => t.merchant.id === MERCHANT_ID)
        .map(t => t.id),
    )

    expect(fixtureIds.has(BRANCH_A_ID)).toBe(true)
    expect(fixtureIds.has(BRANCH_B_ID)).toBe(true)
    expect(fixtureIds.has(BRANCH_C_ID)).toBe(false)

    expect(result.meta.scope).toBe('city')
    expect(result.meta.scopeExpanded).toBe(false)
  })

  it("scope: 'region' behaves identically to 'city' — parity with resolveScopeForRanking", async () => {
    // resolveScopeForRanking maps both 'city' and 'region' to ['NEARBY', 'CITY']
    // initial tier list. resolveScopeForBranches MUST preserve this parity so
    // the customer-app's UI flip from `merchants` to `branches` doesn't shift
    // behaviour between the two scope values.
    const result = await callScopeFixture('region')

    const fixtureIds = new Set(
      result.branches
        .filter(t => t.merchant.id === MERCHANT_ID)
        .map(t => t.id),
    )

    expect(fixtureIds.has(BRANCH_A_ID)).toBe(true)
    expect(fixtureIds.has(BRANCH_B_ID)).toBe(true)
    expect(fixtureIds.has(BRANCH_C_ID)).toBe(false)

    // resolvedScope is 'city' (DISTANT tier not retained, CITY is) — same
    // as scope: 'city'.
    expect(result.meta.scope).toBe('city')
    expect(result.meta.scopeExpanded).toBe(false)
  })

  it("scope: 'platform' admits all rungs — A + B + C all surface", async () => {
    const result = await callScopeFixture('platform')

    const fixtureIds = new Set(
      result.branches
        .filter(t => t.merchant.id === MERCHANT_ID)
        .map(t => t.id),
    )

    expect(fixtureIds.has(BRANCH_A_ID)).toBe(true)
    expect(fixtureIds.has(BRANCH_B_ID)).toBe(true)
    expect(fixtureIds.has(BRANCH_C_ID)).toBe(true)

    expect(result.meta.scope).toBe('platform')
    expect(result.meta.scopeExpanded).toBe(false)
  })

  it('default scope (no scope param) follows LOCAL/MIXED intent — NEARBY + CITY tiers', async () => {
    // No categoryId is passed, so categoryIntent defaults to 'MIXED'. Per
    // resolveScopeForBranches: MIXED + no requested → ['NEARBY', 'CITY']
    // initial tiers. Branch A (NEARBY) + Branch B (CATCHMENT) admitted;
    // Branch C (NATIONAL) excluded.
    const result = await callScopeFixture(undefined)

    const fixtureIds = new Set(
      result.branches
        .filter(t => t.merchant.id === MERCHANT_ID)
        .map(t => t.id),
    )

    expect(fixtureIds.has(BRANCH_A_ID)).toBe(true)
    expect(fixtureIds.has(BRANCH_B_ID)).toBe(true)
    expect(fixtureIds.has(BRANCH_C_ID)).toBe(false)

    expect(result.meta.scope).toBe('city')
    expect(result.meta.scopeExpanded).toBe(false)
  })

  it('cascade expansion: when initial retained-set has zero supply, expand to platform', async () => {
    // Cascade fixture has ONE branch in NATIONAL rung. Requesting
    // scope: 'nearby' initially retains only the NEARBY rung — zero
    // supply. The cascade walk should expand to add CITY, then DISTANT,
    // surfacing the National branch and reporting scopeExpanded=true.
    const result = await searchBranches(prisma, {
      q:      `${FIXTURE_PREFIX}CascadeTest`,
      lat:    VIEWER.lat,
      lng:    VIEWER.lng,
      scope:  'nearby',
      limit:  20,
      offset: 0,
      userId: null,
    })

    const fixtureIds = new Set(
      result.branches
        .filter(t => t.merchant.id === CASCADE_MERCHANT_ID)
        .map(t => t.id),
    )

    expect(fixtureIds.has(CASCADE_BRANCH_ID)).toBe(true)
    expect(result.meta.scopeExpanded).toBe(true)
    // After cascading NEARBY → CITY → DISTANT (only DISTANT has supply),
    // resolvedScope is 'platform'.
    expect(result.meta.scope).toBe('platform')
  })
})
