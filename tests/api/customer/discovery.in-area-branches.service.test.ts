import 'dotenv/config'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Map in-area reliability slice — unit coverage for `getInAreaBranches`'s
// candidate-fetch fix (deterministic cap + orderBy BEFORE ranking) and the
// new opt-in `includeEmptyStateReason` param used by the route's
// `branchesOnly` mode. Mocked prisma (no real DB) — mirrors the pattern in
// discovery.service.test.ts.

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class PrismaPg {
    constructor(_opts: { connectionString: string }) {}
  },
}))

vi.mock('../../../generated/prisma/client', () => {
  class PrismaClient {
    branch = {
      findMany: vi.fn().mockResolvedValue([]),
      count:    vi.fn().mockResolvedValue(0),
    }
    // locality.findMany empty → findNearestLocality resolves null →
    // resolveEffectiveLocation returns null → the rankBranchesV3 step is
    // skipped entirely, so tests don't need to mock the ranking/enrichment
    // dependency chain to assert on the candidate-fetch call shape.
    locality              = { findMany: vi.fn().mockResolvedValue([]) }
    localityCatchmentEdge = { findMany: vi.fn().mockResolvedValue([]) }
    category               = { findUnique: vi.fn().mockResolvedValue(null) }
    favouriteBranch         = { findMany: vi.fn().mockResolvedValue([]) }
    review                  = { groupBy: vi.fn().mockResolvedValue([]) }
    // F6 distance suite exercises the enrichBranchTiles path (the existing
    // candidate-fetch / emptyStateReason suites never emit a tile, so they
    // never reach this table); the default empty resolve is inert for them.
    redundantHighlight      = { findMany: vi.fn().mockResolvedValue([]) }
    constructor(_opts?: any) {}
  }
  return {
    PrismaClient,
    MerchantStatus:             { ACTIVE: 'ACTIVE' },
    VoucherStatus:              { ACTIVE: 'ACTIVE' },
    ApprovalStatus:             { APPROVED: 'APPROVED' },
    MerchantSuggestedTagStatus: { APPROVED: 'APPROVED' },
  }
})

// F6 (map walkthrough): the distance suite below needs `getInAreaBranches` to
// actually emit + enrich tiles, so it drives `rankBranchesV3` (whose output
// is viewport-relative) through a controlled mock and asserts the emitted
// tile distance is USER-relative instead. `resolveEffectiveLocation` +
// `getOutgoingCatchmentTargetIds` are stubbed so the ranking branch runs
// without a DB. The default vi.fn() return (undefined) leaves the existing
// candidate-fetch / emptyStateReason suites unchanged: an undefined effLoc is
// falsy, so those suites still skip ranking exactly as before (they never set
// a resolved value; only the F6 beforeEach does).
vi.mock('../../../src/api/lib/effectiveLocation', () => ({
  resolveEffectiveLocation: vi.fn(),
}))
vi.mock('../../../src/api/lib/catchmentLookup', () => ({
  getOutgoingCatchmentTargetIds: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../../src/api/lib/ranking', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/lib/ranking')>()
  return { ...actual, rankBranchesV3: vi.fn() }
})

import { getInAreaBranches } from '../../../src/api/customer/discovery/service'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { haversineMetres } from '../../../src/api/shared/haversine'
import { resolveEffectiveLocation } from '../../../src/api/lib/effectiveLocation'
import { rankBranchesV3, type RankedBranchTile } from '../../../src/api/lib/ranking'

const BBOX = { minLat: 51.4, maxLat: 51.6, minLng: -0.2, maxLng: 0 }

describe('getInAreaBranches — candidate fetch (Map in-area reliability)', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
    prisma.branch.findMany.mockResolvedValue([])
    prisma.branch.count.mockResolvedValue(0)
  })

  it('fetches candidates with a deterministic orderBy (id asc) instead of no order', async () => {
    await getInAreaBranches(prisma, { bbox: BBOX, userId: null, limit: 50 })

    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: 'asc' } }),
    )
  })

  it('caps the candidate pool at max(limit*4, 200), not the raw caller limit', async () => {
    await getInAreaBranches(prisma, { bbox: BBOX, userId: null, limit: 10 })
    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }), // max(10*4, 200) = 200
    )

    prisma.branch.findMany.mockClear()
    await getInAreaBranches(prisma, { bbox: BBOX, userId: null, limit: 100 })
    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 400 }), // max(100*4, 200) = 400
    )
  })

  it('never passes `take: limit` directly (the pre-fix behaviour)', async () => {
    await getInAreaBranches(prisma, { bbox: BBOX, userId: null, limit: 50 })
    const call = prisma.branch.findMany.mock.calls[0][0]
    expect(call.take).not.toBe(50)
    expect(call.take).toBe(200)
  })
})

describe('getInAreaBranches — includeEmptyStateReason (branchesOnly route mode)', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
    prisma.branch.findMany.mockResolvedValue([])
  })

  it('omits emptyStateReason and skips the extra count() query when not requested', async () => {
    const result = await getInAreaBranches(prisma, { bbox: BBOX, userId: null, limit: 50 })
    expect(result.meta.emptyStateReason).toBeUndefined()
    expect(prisma.branch.count).not.toHaveBeenCalled()
  })

  it('sets emptyStateReason to no_uk_supply when the UK-wide count is 0', async () => {
    prisma.branch.count.mockResolvedValue(0)
    const result = await getInAreaBranches(prisma, {
      bbox: BBOX, userId: null, limit: 50, includeEmptyStateReason: true,
    })
    expect(result.meta.emptyStateReason).toBe('no_uk_supply')
    // Slice 1 composition (PR #435 on #434): the count's confidence filter
    // mirrors the pin-exposure set (CONFIRMED_LOCATION_SET), not
    // MANUALLY_CONFIRMED-only, so ADDRESS_GEOCODED-only categories report
    // viewport_empty rather than no_uk_supply. Slice 3 (pin-drop addendum §2)
    // widens the set by one tier: MERCHANT_CONFIRMED joins it via the shared
    // constant, so the filter widens automatically with no per-site literal edit.
    expect(prisma.branch.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          locationConfidence: { in: ['MANUALLY_CONFIRMED', 'ADDRESS_GEOCODED', 'MERCHANT_CONFIRMED'] },
        }),
      }),
    )
    // The UK-wide count must NOT carry the viewport bbox constraint.
    const countArgs = prisma.branch.count.mock.calls[0][0]
    expect(countArgs.where.latitude).toBeUndefined()
    expect(countArgs.where.longitude).toBeUndefined()
  })

  it('sets emptyStateReason to none when UK-wide supply exists', async () => {
    prisma.branch.count.mockResolvedValue(3)
    const result = await getInAreaBranches(prisma, {
      bbox: BBOX, userId: null, limit: 50, includeEmptyStateReason: true,
    })
    expect(result.meta.emptyStateReason).toBe('none')
  })
})

// ─── F6 (map walkthrough): card distance is USER-relative, not viewport ──────
//
// Bug: the in-area tile `distance`/`distanceMetres` was sourced from
// `rankBranchesV3(..., { effLoc: viewportEffLoc })` — the VIEWPORT CENTRE — so
// recentring the camera on a pin (a pin tap or carousel swipe both animate the
// camera onto the branch) collapsed that store's displayed distance toward 0
// (owner saw 0.9 mi become 0.0 mi). Fix: the DISPLAY distance is recomputed
// from the caller's GPS against each branch's own coords; RANKING (order /
// rungs / bands) stays viewport-relative.
//
// These tests drive `rankBranchesV3` through a mock whose `distanceMetres` is
// deliberately the collapsed viewport value, then assert the EMITTED tile
// distance ignores it and equals the user-relative haversine instead.
describe('getInAreaBranches — F6 user-relative card distance', () => {
  let prisma: any

  // Branch A sits at the viewport centre; branch B is elsewhere. The user is
  // located NEAR B (far from A), so a viewport-relative distance would show A
  // at ~0 while the honest user-relative distance to A is large.
  const A = { lat: 51.5, lng: -0.1 }
  const B = { lat: 51.52, lng: -0.12 }
  const USER = { lat: 51.519, lng: -0.119 } // ~130 m from B, ~2.5 km from A
  // Viewport tightly centred on A (centre = (51.5, -0.1) = A), modelling a
  // camera that has recentred on pin A.
  const VIEWPORT_ON_A = { minLat: 51.49, maxLat: 51.51, minLng: -0.11, maxLng: -0.09 }

  const EMPTY_RUNGS = {
    NEARBY: 0, CATCHMENT: 0, POST_TOWN: 0, LAD: 0,
    COUNTY: 0, REGION: 0, COUNTRY: 0, NATIONAL: 0,
  }

  function candidate(id: string, c: { lat: number; lng: number }) {
    return {
      id,
      merchantId:         `m-${id}`,
      name:               `Branch ${id}`,
      latitude:           c.lat,
      longitude:          c.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityId:         'loc-1',
      postTown:           'Testville',
      ladDistrict:        null,
      adminCounty:        null,
      region:             null,
      locationCountry:    'GB',
      merchant:           { id: `m-${id}`, businessName: `Merchant ${id}` },
    }
  }

  function rawBranch(id: string, c: { lat: number; lng: number }) {
    return {
      id,
      name:               `Branch ${id}`,
      localityId:         'loc-1',
      localityName:       'Testville',
      postTown:           'Testville',
      city:               'Testville',
      latitude:           c.lat,
      longitude:          c.lng,
      locationConfidence: 'MANUALLY_CONFIRMED',
      isActive:           true,
      openingHours:       [],
      merchant: {
        id:                `m-${id}`,
        businessName:      `Merchant ${id}`,
        tradingName:       null,
        logoUrl:           null,
        bannerUrl:         null,
        primaryCategoryId: 'cat-1',
        description:       null,
        primaryCategory:   { id: 'cat-1', name: 'Cafe', pinColour: null, pinIcon: null, descriptorSuffix: null, parentId: null, intentType: null, parent: null },
        primaryDescriptorTag: null,
        categories:        [],
        tags:              [],
        highlights:        [],
        vouchers:          [],
        _count:            { vouchers: 0 },
      },
    }
  }

  // Ranker output: order [A, B] (viewport-driven), with A's distanceMetres
  // collapsed to ~0 because the viewport is centred on A. The fix must ignore
  // these values for DISPLAY.
  function rankedTile(id: string, distanceMetres: number | null): RankedBranchTile {
    return {
      id,
      merchantId:     `m-${id}`,
      businessName:   `Merchant ${id}`,
      supplyRung:     'NEARBY',
      supplyTier:     'NEARBY',
      proximityBand:  'NEARBY',
      distanceMetres,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)

    // Two branch.findMany calls per getInAreaBranches: (1) candidate fetch,
    // (2) enrichBranchTiles hydration.
    prisma.branch.findMany
      .mockResolvedValueOnce([candidate('A', A), candidate('B', B)])
      .mockResolvedValueOnce([rawBranch('A', A), rawBranch('B', B)])

    // effLoc is mocked non-null so the ranking branch runs without a DB. Only
    // `.locality.{id,name}` are read downstream (catchment lookup + meta).
    vi.mocked(resolveEffectiveLocation).mockResolvedValue({
      locality: { id: 'loc-1', name: 'Testville' },
    } as any)

    // Ranker returns [A, B] with A's viewport distance collapsed to ~0.
    vi.mocked(rankBranchesV3).mockReturnValue({
      tiles:      [rankedTile('A', 5), rankedTile('B', 2800)],
      rungCounts: { ...EMPTY_RUNGS },
    })
  })

  it('(a) shows the USER-relative distance, not the ~0 viewport-collapsed value, when the viewport is centred on a branch', async () => {
    const result = await getInAreaBranches(prisma, {
      bbox: VIEWPORT_ON_A, lat: USER.lat, lng: USER.lng, userId: null, limit: 50,
    })

    const tileA = result.branches.find(b => b.id === 'A')!
    expect(tileA).toBeDefined()

    const expectedA = haversineMetres(USER.lat, USER.lng, A.lat, A.lng)
    // The emitted distance is the honest user-relative haversine, NOT the
    // ranker's collapsed viewport value (5 m).
    expect(tileA.distance).toBeCloseTo(expectedA, 5)
    expect(tileA.distance).not.toBe(5)
    expect(tileA.distance!).toBeGreaterThan(1000)
    // distanceMetres mirrors distance (enrichBranchTile sets both from input).
    expect(tileA.distanceMetres).toBe(tileA.distance)
  })

  it('(b) emits null distance (and still returns tiles) when the caller has no GPS', async () => {
    const result = await getInAreaBranches(prisma, {
      bbox: VIEWPORT_ON_A, lat: null, lng: null, userId: null, limit: 50,
    })

    // Route still succeeds and returns the ranked tiles.
    expect(result.branches).toHaveLength(2)
    for (const b of result.branches) {
      expect(b.distance).toBeNull()
      expect(b.distanceMetres).toBeNull()
    }
  })

  it('(c) keeps ranking order viewport-driven while distance is user-driven (order unchanged even though the user is nearer the second-ranked branch)', async () => {
    const result = await getInAreaBranches(prisma, {
      bbox: VIEWPORT_ON_A, lat: USER.lat, lng: USER.lng, userId: null, limit: 50,
    })

    // Order follows the ranker (viewport-relative): A before B.
    expect(result.branches.map(b => b.id)).toEqual(['A', 'B'])

    const tileA = result.branches.find(b => b.id === 'A')!
    const tileB = result.branches.find(b => b.id === 'B')!
    // Yet the DISPLAYED distance is user-relative: the user sits next to B, so
    // A's shown distance is LARGER than B's despite A ranking first. If display
    // distance were viewport-driven this would be reversed (A ~0 < B).
    expect(tileA.distance!).toBeGreaterThan(tileB.distance!)
    expect(tileA.distance).toBeCloseTo(haversineMetres(USER.lat, USER.lng, A.lat, A.lng), 5)
    expect(tileB.distance).toBeCloseTo(haversineMetres(USER.lat, USER.lng, B.lat, B.lng), 5)
  })
})
