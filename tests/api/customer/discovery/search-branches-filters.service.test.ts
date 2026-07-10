// Map Phase 2 Slice S1 (§BX.1-§BX.7 closure) — service-level unit tests for
// the seven previously-ignored `searchBranches` params. Mocked-Prisma style
// (no real DB), mirroring tests/api/customer/discovery.service.test.ts's
// mock-class pattern for the merchant arm's tagIds test.
//
// `prisma.branch.findMany` is called TWICE per searchBranches invocation:
// once for the lean ranking-candidate fetch, once inside `enrichBranchTiles`
// for the full BRANCH_TILE_SELECT page-slice fetch. The mocks below return
// the SAME superset fixture object for both calls — the mock does not
// project by `select` (these are plain JS objects, not a real Prisma
// engine), so a single fixture carrying every field either select would
// produce is sufficient and avoids call-order/call-count brittleness.
import 'dotenv/config'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class PrismaPg {
    constructor(_opts: { connectionString: string }) {}
  },
}))

vi.mock('../../../../generated/prisma/client', () => {
  class PrismaClient {
    branch                  = { findMany: vi.fn().mockResolvedValue([]) }
    merchant                 = { findMany: vi.fn().mockResolvedValue([]) }
    merchantSuggestedTag     = { findMany: vi.fn().mockResolvedValue([]) }
    category                 = { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) }
    locality                 = { findMany: vi.fn().mockResolvedValue([]) }
    localityCatchmentEdge    = { findMany: vi.fn().mockResolvedValue([]) }
    tag                      = { findFirst: vi.fn().mockResolvedValue(null) }
    voucher                  = { findMany: vi.fn().mockResolvedValue([]) }
    review                   = { groupBy: vi.fn().mockResolvedValue([]) }
    favouriteBranch          = { findMany: vi.fn().mockResolvedValue([]) }
    redundantHighlight       = { findMany: vi.fn().mockResolvedValue([]) }
    user                     = { findUnique: vi.fn().mockResolvedValue(null) }
    constructor(_opts?: any) {}
  }
  return {
    PrismaClient,
    MerchantStatus: { ACTIVE: 'ACTIVE' },
    MerchantSuggestedTagStatus: { APPROVED: 'APPROVED' },
    VoucherStatus: { ACTIVE: 'ACTIVE' },
    ApprovalStatus: { APPROVED: 'APPROVED' },
  }
})

vi.mock('../../../../src/api/lib/userCity', () => ({
  resolveProfileCity: vi.fn().mockResolvedValue(null),
}))

import { searchBranches } from '../../../../src/api/customer/discovery/service'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// ── Fixtures ──────────────────────────────────────────────────────────────

// London — used as both the caller's GPS (lat/lng) and the effLoc centroid
// `findNearestLocality` resolves to.
const EFF_LAT = 51.5074
const EFF_LNG = -0.1278

function fixtureLocality(overrides: Partial<{
  id: string; postTown: string | null; ladDistrict: string | null
}> = {}) {
  return {
    id:             overrides.id ?? 'loc-london',
    name:           'London',
    centerLat:      EFF_LAT,
    centerLng:      EFF_LNG,
    populationTier: 'CITY',
    postTown:       overrides.postTown ?? null,
    ladDistrict:    overrides.ladDistrict ?? null,
    adminCounty:    null,
    region:         null,
    country:        null,
  }
}

// Every day, all day — robust against wall-clock test time (see
// isOpenNow.ts: closeMins===1440 is the same-day end-of-day sentinel, so
// [00:00, 24:00) covers the entire day for any `now`).
const ALWAYS_OPEN_HOURS = [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
  dayOfWeek, openTime: '00:00', closeTime: '24:00', isClosed: false,
}))

function fixtureBranch(o: {
  id: string
  merchantId?: string
  businessName?: string
  latitude: number
  longitude: number
  locationConfidence?: string
  isActive?: boolean
  localityId?: string | null
  postTown?: string | null
  ladDistrict?: string | null
  openingHours?: Array<{ dayOfWeek: number; openTime: string | null; closeTime: string | null; isClosed: boolean }>
}) {
  const merchantId = o.merchantId ?? `${o.id}-merchant`
  return {
    id:                 o.id,
    merchantId,
    name:               o.id,
    latitude:           o.latitude,
    longitude:          o.longitude,
    isActive:           o.isActive ?? true,
    locationConfidence: o.locationConfidence ?? 'MANUALLY_CONFIRMED',
    localityId:         o.localityId ?? null,
    localityName:       null,
    postTown:           o.postTown ?? null,
    city:               'TestCity',
    ladDistrict:        o.ladDistrict ?? null,
    adminCounty:        null,
    region:             null,
    locationCountry:    null,
    openingHours:       o.openingHours ?? [],
    merchant: {
      id:                   merchantId,
      businessName:         o.businessName ?? o.id.toUpperCase(),
      tradingName:          null,
      logoUrl:              null,
      bannerUrl:            null,
      primaryCategoryId:    null,
      description:          null,
      primaryCategory:      null,
      primaryDescriptorTag: null,
      categories:           [],
      tags:                 [],
      highlights:           [],
      vouchers:             [],
      _count:               { vouchers: 0 },
    },
  }
}

// ~1.1km north of EFF_LAT — well within any ladder profile's NEARBY radius.
const NEAR_LAT = EFF_LAT + 0.01

function setBranches(prisma: any, branches: any[]) {
  prisma.branch.findMany.mockResolvedValue(branches)
}

function setEffLocGps(prisma: any, locality = fixtureLocality()) {
  prisma.locality.findMany.mockResolvedValue([locality])
}

// ─────────────────────────────────────────────────────────────────────────
// WHERE-clause construction — amenityIds / tagIds / featured (§BX.2/.3/.5)
// ─────────────────────────────────────────────────────────────────────────

describe('searchBranches — amenityIds / tagIds / featured WHERE construction', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
  })

  it('amenityIds: ALL-of on the SAME branch — one `{ amenities: { some } }` AND-entry per id', async () => {
    await searchBranches(prisma, {
      categoryId: 'cat-1', amenityIds: ['am-1', 'am-2'],
      limit: 20, offset: 0, userId: null,
    })

    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { amenities: { some: { amenityId: 'am-1' } } },
            { amenities: { some: { amenityId: 'am-2' } } },
          ]),
        }),
      }),
    )
  })

  it('tagIds: ANY-of across MerchantTag / MerchantHighlight / primaryDescriptorTagId, via merchant', async () => {
    await searchBranches(prisma, {
      categoryId: 'cat-1', tagIds: ['tag-1'],
      limit: 20, offset: 0, userId: null,
    })

    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              merchant: {
                OR: [
                  { tags:       { some: { tagId:          { in: ['tag-1'] } } } },
                  { highlights: { some: { highlightTagId: { in: ['tag-1'] } } } },
                  { primaryDescriptorTagId: { in: ['tag-1'] } },
                ],
              },
            },
          ]),
        }),
      }),
    )
  })

  it('featured: merchant-scoped active-listing date-range gate', async () => {
    await searchBranches(prisma, {
      categoryId: 'cat-1', featured: true,
      limit: 20, offset: 0, userId: null,
    })

    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              merchant: expect.objectContaining({
                featuredListings: {
                  some: expect.objectContaining({
                    isActive:  true,
                    startDate: expect.objectContaining({ lte: expect.any(Date) }),
                    endDate:   expect.objectContaining({ gte: expect.any(Date) }),
                  }),
                },
              }),
            }),
          ]),
        }),
      }),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Post-fetch filters — openNow / maxDistanceMiles / topRated (§BX.1/.4/.6)
// ─────────────────────────────────────────────────────────────────────────

describe('searchBranches — openNow (branch\'s own hours)', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
    setEffLocGps(prisma)
  })

  it('drops a branch with no open window today, keeps one that is always open', async () => {
    setBranches(prisma, [
      fixtureBranch({ id: 'open',   latitude: NEAR_LAT, longitude: EFF_LNG, openingHours: ALWAYS_OPEN_HOURS }),
      fixtureBranch({ id: 'closed', latitude: NEAR_LAT, longitude: EFF_LNG, openingHours: [] }),
    ])

    const result = await searchBranches(prisma, {
      categoryId: 'cat-1', lat: EFF_LAT, lng: EFF_LNG, openNow: true,
      limit: 20, offset: 0, userId: null,
    })

    expect(result.branches.map(b => b.id)).toEqual(['open'])
    expect(result.totalBranches).toBe(1)
  })

  it('without openNow, both branches surface (zero-filter parity within this fixture)', async () => {
    setBranches(prisma, [
      fixtureBranch({ id: 'open',   latitude: NEAR_LAT, longitude: EFF_LNG, openingHours: ALWAYS_OPEN_HOURS }),
      fixtureBranch({ id: 'closed', latitude: NEAR_LAT, longitude: EFF_LNG, openingHours: [] }),
    ])

    const result = await searchBranches(prisma, {
      categoryId: 'cat-1', lat: EFF_LAT, lng: EFF_LNG,
      limit: 20, offset: 0, userId: null,
    })

    expect(result.branches.map(b => b.id).sort()).toEqual(['closed', 'open'])
  })
})

describe('searchBranches — maxDistanceMiles (branch\'s own exact position)', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
    setEffLocGps(prisma)
  })

  it('excludes a branch beyond the radius; keeps one inside it', async () => {
    setBranches(prisma, [
      fixtureBranch({ id: 'close', latitude: EFF_LAT + 0.01, longitude: EFF_LNG }),   // ~1.1km
      fixtureBranch({ id: 'far',   latitude: EFF_LAT + 0.08, longitude: EFF_LNG }),   // ~8.9km, > 3mi
    ])

    const result = await searchBranches(prisma, {
      categoryId: 'cat-1', lat: EFF_LAT, lng: EFF_LNG, maxDistanceMiles: 3,
      limit: 20, offset: 0, userId: null,
    })

    expect(result.branches.map(b => b.id)).toEqual(['close'])
  })

  it('excludes a POSTCODE_CENTROID branch even when it would be within radius (no exact position to trust)', async () => {
    setBranches(prisma, [
      fixtureBranch({ id: 'approx', latitude: EFF_LAT + 0.001, longitude: EFF_LNG, locationConfidence: 'POSTCODE_CENTROID' }),
    ])

    const result = await searchBranches(prisma, {
      categoryId: 'cat-1', lat: EFF_LAT, lng: EFF_LNG, maxDistanceMiles: 3,
      limit: 20, offset: 0, userId: null,
    })

    expect(result.branches).toHaveLength(0)
  })
})

describe('searchBranches — topRated admission filter', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
    setEffLocGps(prisma)
  })

  it('keeps only branches with avgRating >= 4.0 AND reviewCount >= 5', async () => {
    setBranches(prisma, [
      fixtureBranch({ id: 'good', latitude: NEAR_LAT, longitude: EFF_LNG }),
      fixtureBranch({ id: 'meh',  latitude: NEAR_LAT, longitude: EFF_LNG }),
    ])
    prisma.review.groupBy.mockResolvedValue([
      { branchId: 'good', _avg: { rating: 4.5 }, _count: { id: 10 } },
      { branchId: 'meh',  _avg: { rating: 3.0 }, _count: { id: 10 } },
    ])

    const result = await searchBranches(prisma, {
      categoryId: 'cat-1', lat: EFF_LAT, lng: EFF_LNG, topRated: true,
      limit: 20, offset: 0, userId: null,
    })

    expect(result.branches.map(b => b.id)).toEqual(['good'])
  })

  it('excludes a well-rated branch that fails the reviewCount >= 5 threshold', async () => {
    setBranches(prisma, [
      fixtureBranch({ id: 'thin', latitude: NEAR_LAT, longitude: EFF_LNG }),
    ])
    prisma.review.groupBy.mockResolvedValue([
      { branchId: 'thin', _avg: { rating: 5.0 }, _count: { id: 2 } },
    ])

    const result = await searchBranches(prisma, {
      categoryId: 'cat-1', lat: EFF_LAT, lng: EFF_LNG, topRated: true,
      limit: 20, offset: 0, userId: null,
    })

    expect(result.branches).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// sortBy — post-rank override (§BX.7), incl. sortBy x ranking interaction
// ─────────────────────────────────────────────────────────────────────────

describe('searchBranches — sortBy post-rank override', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
  })

  it("sortBy='top_rated' reorders WITHIN a single rung, crossing the default distance order", async () => {
    setEffLocGps(prisma)
    setBranches(prisma, [
      // Closer but unrated — default relevance (distance-sort within NEARBY) ranks this first.
      fixtureBranch({ id: 'closeUnrated', latitude: EFF_LAT + 0.002, longitude: EFF_LNG }),
      // Farther but well-rated (avg>=4.0, count>=3 — the post-rank sortBy threshold).
      fixtureBranch({ id: 'farRated',     latitude: EFF_LAT + 0.01,  longitude: EFF_LNG }),
    ])
    prisma.review.groupBy.mockResolvedValue([
      { branchId: 'farRated', _avg: { rating: 4.8 }, _count: { id: 6 } },
    ])

    const relevance = await searchBranches(prisma, {
      categoryId: 'cat-1', lat: EFF_LAT, lng: EFF_LNG,
      limit: 20, offset: 0, userId: null,
    })
    expect(relevance.branches.map(b => b.id)).toEqual(['closeUnrated', 'farRated'])

    const topRatedSort = await searchBranches(prisma, {
      categoryId: 'cat-1', lat: EFF_LAT, lng: EFF_LNG, sortBy: 'top_rated',
      limit: 20, offset: 0, userId: null,
    })
    expect(topRatedSort.branches.map(b => b.id)).toEqual(['farRated', 'closeUnrated'])
  })

  it("sortBy='highest_saving' reorders by the merchant's max active voucher saving", async () => {
    setEffLocGps(prisma)
    setBranches(prisma, [
      fixtureBranch({ id: 'closeCheap', merchantId: 'm-cheap', latitude: EFF_LAT + 0.002, longitude: EFF_LNG }),
      fixtureBranch({ id: 'farPricey',  merchantId: 'm-pricey', latitude: EFF_LAT + 0.01,  longitude: EFF_LNG }),
    ])
    prisma.voucher.findMany.mockResolvedValue([
      { merchantId: 'm-pricey', estimatedSaving: '20.00' },
      { merchantId: 'm-cheap',  estimatedSaving: '2.00' },
    ])

    const result = await searchBranches(prisma, {
      categoryId: 'cat-1', lat: EFF_LAT, lng: EFF_LNG, sortBy: 'highest_saving',
      limit: 20, offset: 0, userId: null,
    })

    expect(result.branches.map(b => b.id)).toEqual(['farPricey', 'closeCheap'])
  })

  it("sortBy='nearest' is a genuine full-list distance override that crosses rung boundaries — the sortBy x ranking interaction case", async () => {
    // Locality carries both a postTown and ladDistrict so two DIFFERENT,
    // non-NEARBY rungs can be triggered deterministically:
    //   - postMatch  matches postTown  -> POST_TOWN rung (CITY tier)
    //   - ladMatch   matches ladDistrict -> LAD rung (DISTANT tier)
    // classifyRung checks POST_TOWN before LAD, so DEFAULT relevance
    // ranks postMatch before ladMatch regardless of actual distance —
    // but ladMatch (~11km) is genuinely CLOSER than postMatch (~33km).
    // sortBy='nearest' must invert that order; scope='platform' keeps
    // both the CITY-tier and DISTANT-tier rung in the retained set.
    setEffLocGps(prisma, fixtureLocality({ postTown: 'PostTownX', ladDistrict: 'LadX' }))
    setBranches(prisma, [
      fixtureBranch({ id: 'postMatch', latitude: EFF_LAT + 0.3, longitude: EFF_LNG, postTown: 'PostTownX', localityId: 'other-locality' }),
      fixtureBranch({ id: 'ladMatch',  latitude: EFF_LAT + 0.1, longitude: EFF_LNG, ladDistrict: 'LadX',   localityId: 'other-locality' }),
    ])

    const relevance = await searchBranches(prisma, {
      categoryId: 'cat-1', lat: EFF_LAT, lng: EFF_LNG, scope: 'platform',
      limit: 20, offset: 0, userId: null,
    })
    expect(relevance.branches.map(b => b.id)).toEqual(['postMatch', 'ladMatch'])

    const nearest = await searchBranches(prisma, {
      categoryId: 'cat-1', lat: EFF_LAT, lng: EFF_LNG, scope: 'platform', sortBy: 'nearest',
      limit: 20, offset: 0, userId: null,
    })
    expect(nearest.branches.map(b => b.id)).toEqual(['ladMatch', 'postMatch'])
  })

  it("sortBy='relevance' leaves rankBranchesV3's ordering untouched (explicit param, same as omitting it)", async () => {
    setEffLocGps(prisma)
    setBranches(prisma, [
      fixtureBranch({ id: 'near', latitude: EFF_LAT + 0.002, longitude: EFF_LNG }),
      fixtureBranch({ id: 'far',  latitude: EFF_LAT + 0.01,  longitude: EFF_LNG }),
    ])

    const omitted = await searchBranches(prisma, {
      categoryId: 'cat-1', lat: EFF_LAT, lng: EFF_LNG,
      limit: 20, offset: 0, userId: null,
    })
    const explicit = await searchBranches(prisma, {
      categoryId: 'cat-1', lat: EFF_LAT, lng: EFF_LNG, sortBy: 'relevance',
      limit: 20, offset: 0, userId: null,
    })

    expect(explicit.branches.map(b => b.id)).toEqual(omitted.branches.map(b => b.id))
    expect(explicit.branches.map(b => b.id)).toEqual(['near', 'far'])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Combined filters — proves composition, not just per-param isolation.
// ─────────────────────────────────────────────────────────────────────────

describe('searchBranches — combined filters compose correctly', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
    setEffLocGps(prisma)
  })

  it('WHERE-level filters (amenityIds + tagIds + featured) all appear together in one query', async () => {
    setBranches(prisma, [])

    await searchBranches(prisma, {
      categoryId: 'cat-1', amenityIds: ['am-1'], tagIds: ['tag-1'], featured: true,
      limit: 20, offset: 0, userId: null,
    })

    const call = prisma.branch.findMany.mock.calls.find(
      (c: any[]) => Array.isArray(c[0]?.where?.AND) && c[0].where.AND.length > 1,
    )
    expect(call).toBeDefined()
    const andEntries = call![0].where.AND
    expect(andEntries).toContainEqual({ amenities: { some: { amenityId: 'am-1' } } })
    expect(andEntries.some((e: any) => e?.merchant?.OR?.[0]?.tags)).toBe(true)
    expect(andEntries.some((e: any) => e?.merchant?.featuredListings)).toBe(true)
  })

  it('post-fetch filters (openNow + maxDistanceMiles + topRated) only admit the branch satisfying ALL three', async () => {
    setBranches(prisma, [
      // Satisfies everything.
      fixtureBranch({ id: 'good', latitude: EFF_LAT + 0.002, longitude: EFF_LNG, openingHours: ALWAYS_OPEN_HOURS }),
      // Fails openNow.
      fixtureBranch({ id: 'shut', latitude: EFF_LAT + 0.002, longitude: EFF_LNG, openingHours: [] }),
      // Fails maxDistanceMiles (way outside 3mi).
      fixtureBranch({ id: 'faraway', latitude: EFF_LAT + 0.2, longitude: EFF_LNG, openingHours: ALWAYS_OPEN_HOURS }),
    ])
    prisma.review.groupBy.mockResolvedValue([
      { branchId: 'good',    _avg: { rating: 4.5 }, _count: { id: 8 } },
      { branchId: 'shut',    _avg: { rating: 4.5 }, _count: { id: 8 } },
      { branchId: 'faraway', _avg: { rating: 4.5 }, _count: { id: 8 } },
    ])

    const result = await searchBranches(prisma, {
      categoryId: 'cat-1', lat: EFF_LAT, lng: EFF_LNG,
      openNow: true, maxDistanceMiles: 3, topRated: true,
      limit: 20, offset: 0, userId: null,
    })

    expect(result.branches.map(b => b.id)).toEqual(['good'])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// No-filters regression pin — omitting all seven params must be byte-
// identical to Phase 1 behaviour (no new AND-entries, no reordering).
// ─────────────────────────────────────────────────────────────────────────

describe('searchBranches — no-filters regression pin', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
    setEffLocGps(prisma)
  })

  it('WHERE carries only the categoryId AND-entry — none of the seven new filter shapes appear', async () => {
    setBranches(prisma, [])

    await searchBranches(prisma, {
      categoryId: 'cat-1',
      limit: 20, offset: 0, userId: null,
    })

    const [{ where }] = prisma.branch.findMany.mock.calls[0]
    expect(Array.isArray(where.AND)).toBe(true)
    expect(where.AND).toHaveLength(1)
    expect(where.AND[0]).toEqual({
      merchant: {
        OR: [
          { primaryCategoryId: { in: ['cat-1'] } },
          { categories: { some: { categoryId: { in: ['cat-1'] } } } },
        ],
      },
    })
  })

  it('two NEARBY branches surface in distance-ascending order (default MIXED intent behaviour, unchanged)', async () => {
    setBranches(prisma, [
      fixtureBranch({ id: 'near', latitude: EFF_LAT + 0.002, longitude: EFF_LNG }),
      fixtureBranch({ id: 'far',  latitude: EFF_LAT + 0.01,  longitude: EFF_LNG }),
    ])

    const result = await searchBranches(prisma, {
      categoryId: 'cat-1', lat: EFF_LAT, lng: EFF_LNG,
      limit: 20, offset: 0, userId: null,
    })

    expect(result.branches.map(b => b.id)).toEqual(['near', 'far'])
    expect(result.totalBranches).toBe(2)
  })
})
