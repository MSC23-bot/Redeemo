import { describe, it, expect } from 'vitest'
import { classifyTier, NEARBY_RADIUS_MILES, rankMerchants } from '../../../src/api/lib/ranking'

describe('classifyTier', () => {
  const merchantWithBranches = (branches: { city: string; latitude: number | null; longitude: number | null }[]) =>
    ({ branches: branches.map(b => ({ ...b, isActive: true })) }) as any

  it('returns NEARBY when nearest branch is within NEARBY_RADIUS_MILES of user coords', () => {
    const m = merchantWithBranches([{ city: 'London', latitude: 51.5074, longitude: -0.1278 }])
    expect(classifyTier(m, { userLat: 51.5074, userLng: -0.1278, profileCity: null })).toBe('NEARBY')
  })

  it('returns CITY when no NEARBY match but a branch matches profileCity (case-insensitive)', () => {
    const m = merchantWithBranches([{ city: 'London', latitude: 51.5074, longitude: -0.1278 }])
    expect(classifyTier(m, { userLat: null, userLng: null, profileCity: 'london' })).toBe('CITY')
  })

  it('returns DISTANT when no coords and no profileCity match', () => {
    const m = merchantWithBranches([{ city: 'Manchester', latitude: 53.4808, longitude: -2.2426 }])
    expect(classifyTier(m, { userLat: null, userLng: null, profileCity: 'London' })).toBe('DISTANT')
  })

  it('returns DISTANT when no location data at all', () => {
    const m = merchantWithBranches([{ city: 'London', latitude: 51.5074, longitude: -0.1278 }])
    expect(classifyTier(m, { userLat: null, userLng: null, profileCity: null })).toBe('DISTANT')
  })

  it('returns NEARBY when at least one branch is in radius (multi-branch)', () => {
    const m = merchantWithBranches([
      { city: 'Manchester', latitude: 53.4808, longitude: -2.2426 },
      { city: 'London',     latitude: 51.5074, longitude: -0.1278 },
    ])
    expect(classifyTier(m, { userLat: 51.5074, userLng: -0.1278, profileCity: null })).toBe('NEARBY')
  })

  it('exposes NEARBY_RADIUS_MILES as a constant', () => {
    expect(NEARBY_RADIUS_MILES).toBe(2)
  })
})

describe('rankMerchants — LOCAL intent', () => {
  const m = (id: string, opts: Partial<{
    businessName: string
    branches: { city: string; lat: number | null; lng: number | null }[]
    avgRating: number | null
    reviewCount: number
  }>) => ({
    id,
    businessName: opts.businessName ?? id,
    branches: (opts.branches ?? []).map(b => ({
      isActive: true,
      city: b.city,
      latitude: b.lat,
      longitude: b.lng,
    })),
    avgRating: opts.avgRating ?? null,
    reviewCount: opts.reviewCount ?? 0,
  })

  it('orders strict NEARBY → CITY → DISTANT, distance ASC within NEARBY, alphabetical within CITY/DISTANT', () => {
    // London user
    const userLat = 51.5074, userLng = -0.1278
    const merchants = [
      m('m-distant-z',   { businessName: 'Z Distant',   branches: [{ city: 'Edinburgh', lat: 55.95, lng: -3.19 }] }),
      m('m-city-b',      { businessName: 'B City',      branches: [{ city: 'London', lat: 51.6, lng: -0.2 }] }),
      m('m-nearby-far',  { businessName: 'N1',          branches: [{ city: 'London', lat: 51.5074, lng: -0.130 }] }),  // 0.5km
      m('m-distant-a',   { businessName: 'A Distant',   branches: [{ city: 'Manchester', lat: 53.48, lng: -2.24 }] }),
      m('m-city-a',      { businessName: 'A City',      branches: [{ city: 'London', lat: 51.55, lng: -0.15 }] }),
      m('m-nearby-near', { businessName: 'N2',          branches: [{ city: 'London', lat: 51.5074, lng: -0.1280 }] }),  // very close
    ]

    const { ordered, counts } = rankMerchants(merchants, {
      intentType: 'LOCAL',
      userLat, userLng,
      profileCity: 'London',
    })

    // Tiers in order: 2 NEARBY (by distance), 2 CITY (alphabetical), 2 DISTANT (alphabetical)
    expect(ordered.map(o => o.id)).toEqual([
      'm-nearby-near',  // closer of the two NEARBY
      'm-nearby-far',
      'm-city-a',       // CITY: A then B
      'm-city-b',
      'm-distant-a',    // DISTANT: A then Z
      'm-distant-z',
    ])
    expect(counts).toEqual({ nearbyCount: 2, cityCount: 2, distantCount: 2 })
  })
})

describe('rankMerchants — DESTINATION intent', () => {
  it('NEARBY first by distance, then CITY+DISTANT merged with rated-by-rating, unrated-alphabetical fallback', () => {
    const userLat = 51.5074, userLng = -0.1278
    // mLocal must use the same shape as the test helper
    const merchants = [
      // City below review-count threshold — avgRating present (4.9) but
      // reviewCount=1 < MIN_REVIEW_COUNT_FOR_RATING_SORT (3), so qualityComparator
      // treats this as unrated and falls back to alphabetical ordering.
      { id: 'city-z', businessName: 'Z City', branches: [{ isActive: true, city: 'London', latitude: 51.55, longitude: -0.15 }],
        avgRating: 4.9, reviewCount: 1 },
      // Rated distant — should beat unrated city
      { id: 'distant-rated', businessName: 'B Distant', branches: [{ isActive: true, city: 'Manchester', latitude: 53.48, longitude: -2.24 }],
        avgRating: 4.5, reviewCount: 10 },
      // Higher-rated distant
      { id: 'distant-best', businessName: 'A Distant', branches: [{ isActive: true, city: 'Edinburgh', latitude: 55.95, longitude: -3.19 }],
        avgRating: 4.8, reviewCount: 20 },
      // Unrated city (alphabetical fallback) — A
      { id: 'city-a', businessName: 'A City', branches: [{ isActive: true, city: 'London', latitude: 51.6, longitude: -0.2 }],
        avgRating: null, reviewCount: 0 },
      // Nearby
      { id: 'nearby', businessName: 'N1', branches: [{ isActive: true, city: 'London', latitude: 51.5074, longitude: -0.128 }],
        avgRating: 3.0, reviewCount: 5 },
    ]

    const { ordered } = rankMerchants(merchants, {
      intentType: 'DESTINATION',
      userLat, userLng,
      profileCity: 'London',
    })

    // Order:
    //   1. nearby (NEARBY tier first)
    //   2-3. distant-best (4.8) then distant-rated (4.5) — rated, sorted DESC
    //   4-5. city-a then city-z — unrated, alphabetical
    expect(ordered.map(o => o.id)).toEqual([
      'nearby',
      'distant-best',
      'distant-rated',
      'city-a',
      'city-z',
    ])
  })
})

describe('rankMerchants — MIXED intent', () => {
  it('matches LOCAL for NEARBY+CITY, but DISTANT uses quality-aware comparator', () => {
    const userLat = 51.5074, userLng = -0.1278
    const merchants = [
      { id: 'city-a', businessName: 'A City', branches: [{ isActive: true, city: 'London', latitude: 51.55, longitude: -0.15 }],
        avgRating: 2.0, reviewCount: 100 },  // CITY: alphabetical, ignores rating
      { id: 'city-b', businessName: 'B City', branches: [{ isActive: true, city: 'London', latitude: 51.6, longitude: -0.2 }],
        avgRating: 5.0, reviewCount: 100 },
      { id: 'distant-low', businessName: 'A Distant', branches: [{ isActive: true, city: 'Edinburgh', latitude: 55.95, longitude: -3.19 }],
        avgRating: 2.0, reviewCount: 10 },  // DISTANT: rating-aware
      { id: 'distant-high', businessName: 'Z Distant', branches: [{ isActive: true, city: 'Manchester', latitude: 53.48, longitude: -2.24 }],
        avgRating: 4.8, reviewCount: 10 },
    ]

    const { ordered } = rankMerchants(merchants, {
      intentType: 'MIXED',
      userLat, userLng,
      profileCity: 'London',
    })

    expect(ordered.map(o => o.id)).toEqual([
      'city-a',       // CITY alphabetical — A before B (ignores 2.0 vs 5.0)
      'city-b',
      'distant-high', // DISTANT rating DESC — 4.8 before 2.0 (despite Z > A alphabetically)
      'distant-low',
    ])
  })
})

describe('rankMerchants — empty input', () => {
  it('returns ordered=[], counts all 0 for empty merchant array', () => {
    const { ordered, counts } = rankMerchants([], {
      intentType: 'LOCAL',
      userLat: null, userLng: null, profileCity: null,
    })
    expect(ordered).toEqual([])
    expect(counts).toEqual({ nearbyCount: 0, cityCount: 0, distantCount: 0 })
  })
})

describe('rankMerchants — tier counts', () => {
  it('tier counts reflect input regardless of intent', () => {
    const merchants = [
      { id: 'a', businessName: 'A', branches: [{ isActive: true, city: 'London', latitude: 51.5074, longitude: -0.128 }],
        avgRating: null, reviewCount: 0 },
      { id: 'b', businessName: 'B', branches: [{ isActive: true, city: 'London', latitude: 51.6, longitude: -0.2 }],
        avgRating: null, reviewCount: 0 },
      { id: 'c', businessName: 'C', branches: [{ isActive: true, city: 'Manchester', latitude: 53.48, longitude: -2.24 }],
        avgRating: null, reviewCount: 0 },
    ]
    const ctx = { userLat: 51.5074, userLng: -0.1278, profileCity: 'London' }
    const local = rankMerchants(merchants, { ...ctx, intentType: 'LOCAL' })
    const dest  = rankMerchants(merchants, { ...ctx, intentType: 'DESTINATION' })
    const mixed = rankMerchants(merchants, { ...ctx, intentType: 'MIXED' })
    expect(local.counts).toEqual({ nearbyCount: 1, cityCount: 1, distantCount: 1 })
    expect(dest.counts).toEqual(local.counts)
    expect(mixed.counts).toEqual(local.counts)
  })
})

describe('MIN_REVIEW_COUNT_FOR_RATING_SORT', () => {
  it('is 3', async () => {
    const { MIN_REVIEW_COUNT_FOR_RATING_SORT } = await import('../../../src/api/lib/ranking')
    expect(MIN_REVIEW_COUNT_FOR_RATING_SORT).toBe(3)
  })
})

describe('resolveCategoryIntent', () => {
  it("returns category's intentType when set", async () => {
    const { resolveCategoryIntent } = await import('../../../src/api/lib/ranking')
    expect(resolveCategoryIntent({ intentType: 'DESTINATION', parent: null })).toBe('DESTINATION')
  })

  it("inherits parent's intentType when category's is NULL", async () => {
    const { resolveCategoryIntent } = await import('../../../src/api/lib/ranking')
    expect(resolveCategoryIntent({ intentType: null, parent: { intentType: 'MIXED' } })).toBe('MIXED')
  })

  it("falls back to 'LOCAL' when both NULL", async () => {
    const { resolveCategoryIntent } = await import('../../../src/api/lib/ranking')
    expect(resolveCategoryIntent({ intentType: null, parent: null })).toBe('LOCAL')
    expect(resolveCategoryIntent({ intentType: null, parent: { intentType: null } })).toBe('LOCAL')
  })

  it("subcategory's own intentType wins over parent's", async () => {
    const { resolveCategoryIntent } = await import('../../../src/api/lib/ranking')
    expect(resolveCategoryIntent({ intentType: 'LOCAL', parent: { intentType: 'DESTINATION' } })).toBe('LOCAL')
  })
})
