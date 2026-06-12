import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getInAreaMerchants } from '../../../src/api/customer/discovery/service'
import { getEligibleAmenitiesForSubcategory } from '../../../src/api/lib/amenity'

// PR A — real-DB integration tests for the two new endpoints in this PR:
//   - getInAreaMerchants (Map bbox queries, application-level bbox filter,
//     in-area meta shape without scope/scopeExpanded)
//   - getEligibleAmenitiesForSubcategory (already covered by tests/api/customer/
//     amenity-eligibility.test.ts in Plan 1.5; here we add E2E coverage of
//     `getEligibleAmenitiesForSubcategory` under the URL contract the new
//     /categories/:id/amenities route will hit)
//
// Runs against the isolated Plan 1.5 Neon branch ep-muddy-breeze-abreefzn.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

afterAll(async () => {
  await prisma.$disconnect()
})

describe('getInAreaMerchants — end-to-end against Plan 1.5 Neon branch', () => {
  // London centre coords + a generous London-wide bbox (~ 0.4° square,
  // captures dev-merchant-001 at 51.5194, -0.0988)
  const LONDON_LAT = 51.5074
  const LONDON_LNG = -0.1278
  const LONDON_BBOX = { minLat: 51.4, maxLat: 51.7, minLng: -0.3, maxLng: 0.0 }

  let restaurantSubcatId: string
  let devUserId: string
  let originalCustomerCity: string | null = null

  beforeAll(async () => {
    const r = await prisma.category.findFirst({
      where:  { name: 'Restaurant', parentId: { not: null } },
      select: { id: true },
    })
    if (!r) throw new Error('Restaurant subcategory not seeded')
    restaurantSubcatId = r.id

    const u = await prisma.user.findUnique({
      where:  { email: 'customer@redeemo.com' },
      select: { id: true, city: true },
    })
    if (!u) throw new Error('customer@redeemo.com not seeded')
    devUserId = u.id
    originalCustomerCity = u.city

    // Same precondition handling as discovery.merchant.test.ts — make the user
    // city-resolvable so CITY-tier classification is exercised. afterAll
    // restores the original value.
    if (u.city !== 'London') {
      await prisma.user.update({ where: { id: u.id }, data: { city: 'London' } })
    }
  })

  afterAll(async () => {
    if (devUserId) {
      await prisma.user.update({
        where: { id: devUserId },
        data:  { city: originalCustomerCity },
      })
    }
  })

  it('returns dev-merchant-001 when bbox covers its London branch', async () => {
    const result = await getInAreaMerchants(prisma, {
      bbox:       LONDON_BBOX,
      categoryId: restaurantSubcatId,
      lat:        LONDON_LAT,
      lng:        LONDON_LNG,
      userId:     devUserId,
      limit:      50,
    })
    const dev = result.merchants.find((m: any) => m.id === 'dev-merchant-001')
    expect(dev).toBeDefined()
    expect((dev as any).supplyTier).toBe('NEARBY')
  })

  it('excludes dev-merchant-001 when bbox is outside the UK (offshore-equivalent)', async () => {
    const offshoreBbox = { minLat: 50.0, maxLat: 50.1, minLng: -10.0, maxLng: -9.9 }
    const result = await getInAreaMerchants(prisma, {
      bbox:       offshoreBbox,
      categoryId: restaurantSubcatId,
      lat:        LONDON_LAT,
      lng:        LONDON_LNG,
      userId:     devUserId,
      limit:      50,
    })
    expect(result.merchants).toHaveLength(0)
  })

  it("tier counts surface UK-wide supply even when viewport is empty (Plan 1.5 invariant)", async () => {
    // Bbox far from London → 0 merchants in viewport. UK-wide supply for
    // Restaurant category is NOT zero in seed, so meta.distantCount + nearbyCount
    // + cityCount must reflect that — Map needs this to message
    // "X elsewhere — tap to expand".
    const offshoreBbox = { minLat: 50.0, maxLat: 50.1, minLng: -10.0, maxLng: -9.9 }
    const result = await getInAreaMerchants(prisma, {
      bbox:       offshoreBbox,
      categoryId: restaurantSubcatId,
      lat:        LONDON_LAT,
      lng:        LONDON_LNG,
      userId:     devUserId,
      limit:      50,
    })
    const totalSupply = result.meta.nearbyCount + result.meta.cityCount + result.meta.distantCount
    expect(totalSupply).toBeGreaterThan(0)
    expect(result.merchants).toHaveLength(0)
    // emptyStateReason stays 'none' because UK has supply; Map UI derives the
    // "viewport empty but UK has supply" state client-side.
    expect(result.meta.emptyStateReason).toBe('none')
  })

  it('meta shape excludes scope and scopeExpanded fields', async () => {
    const result = await getInAreaMerchants(prisma, {
      bbox:       LONDON_BBOX,
      categoryId: restaurantSubcatId,
      lat:        LONDON_LAT,
      lng:        LONDON_LNG,
      userId:     devUserId,
      limit:      50,
    })
    expect((result.meta as any).scope).toBeUndefined()
    expect((result.meta as any).scopeExpanded).toBeUndefined()
    // Required fields present
    expect(result.meta).toHaveProperty('resolvedArea')
    expect(result.meta).toHaveProperty('nearbyCount')
    expect(result.meta).toHaveProperty('cityCount')
    expect(result.meta).toHaveProperty('distantCount')
    expect(result.meta).toHaveProperty('emptyStateReason')
  })

  it('every returned merchant carries supplyTier ∈ {NEARBY, CITY, DISTANT}', async () => {
    const result = await getInAreaMerchants(prisma, {
      bbox:       LONDON_BBOX,
      categoryId: restaurantSubcatId,
      lat:        LONDON_LAT,
      lng:        LONDON_LNG,
      userId:     devUserId,
      limit:      50,
    })
    expect(result.merchants.length).toBeGreaterThan(0)
    for (const m of result.merchants) {
      expect(['NEARBY', 'CITY', 'DISTANT']).toContain((m as any).supplyTier)
    }
  })

  it('works without a categoryId (returns all in-bbox merchants)', async () => {
    const result = await getInAreaMerchants(prisma, {
      bbox:   LONDON_BBOX,
      lat:    LONDON_LAT,
      lng:    LONDON_LNG,
      userId: devUserId,
      limit:  50,
    })
    // No category filter → should include dev-merchant-001 (London Restaurant)
    expect(result.merchants.find((m: any) => m.id === 'dev-merchant-001')).toBeDefined()
  })

  // ─── Guest path (userId=null) — Map's most common state ────────────────────
  // Independent code-review (PR #18) flagged that all prior integration tests
  // assumed an authenticated user with city='London', which is the LEAST common
  // Map state, not the most. These two tests pin the contract for guest /
  // unauthenticated browsing — first-load Map experience for new users.

  it("guest (userId=null) without coords: all merchants DISTANT, nearbyCount/cityCount === 0", async () => {
    const result = await getInAreaMerchants(prisma, {
      bbox:       LONDON_BBOX,
      categoryId: restaurantSubcatId,
      lat:        null,
      lng:        null,
      userId:     null,
      limit:      50,
    })

    // dev-merchant-001 has a London branch → bbox keeps it. Without user coords
    // (no NEARBY possible) AND without profileCity (no CITY possible),
    // classifyTier collapses every merchant to DISTANT — the documented
    // "no location signal" behaviour from ranking.ts.
    expect(result.merchants.length).toBeGreaterThan(0)
    for (const m of result.merchants) {
      expect((m as any).supplyTier).toBe('DISTANT')
    }
    expect(result.meta.nearbyCount).toBe(0)
    expect(result.meta.cityCount).toBe(0)
    expect(result.meta.distantCount).toBeGreaterThan(0)
    // resolvedArea fallback when no profileCity available
    expect(result.meta.resolvedArea).toBe('Your area')
  })

  it("guest (userId=null) WITH user coords: NEARBY classification still works (no profileCity needed)", async () => {
    const result = await getInAreaMerchants(prisma, {
      bbox:       LONDON_BBOX,
      categoryId: restaurantSubcatId,
      lat:        LONDON_LAT,
      lng:        LONDON_LNG,
      userId:     null,
      limit:      50,
    })

    // dev-merchant-001's London branch is ~2.4 km from London centre coords
    // (within the 2-mile / 3.2 km NEARBY radius). NEARBY is purely
    // distance-based — it does NOT need profileCity. The CITY check is what
    // requires profileCity, so cityCount must remain 0 for guests.
    const dev = result.merchants.find((m: any) => m.id === 'dev-merchant-001')
    expect(dev).toBeDefined()
    expect((dev as any).supplyTier).toBe('NEARBY')
    expect(result.meta.nearbyCount).toBeGreaterThanOrEqual(1)
    expect(result.meta.cityCount).toBe(0)
    expect(result.meta.resolvedArea).toBe('Your area')
  })
})

describe('getEligibleAmenitiesForSubcategory — end-to-end (used by /categories/:id/amenities)', () => {
  // Sanity-check coverage that the helper backing the new amenities endpoint
  // returns the expected shape. Detailed eligibility/inheritance/isActive
  // semantics are covered by tests/api/customer/amenity-eligibility.test.ts;
  // here we just confirm the route's helper-call shape is what we expect.

  it('returns an array of {id, name, iconUrl, isActive} sorted by name for the Restaurant subcategory', async () => {
    const restaurant = await prisma.category.findFirst({
      where:  { name: 'Restaurant', parentId: { not: null } },
      select: { id: true },
    })
    if (!restaurant) throw new Error('Restaurant subcategory not seeded')

    const amenities = await getEligibleAmenitiesForSubcategory(prisma, restaurant.id)

    expect(amenities.length).toBeGreaterThan(0)
    for (const a of amenities) {
      expect(a).toHaveProperty('id')
      expect(a).toHaveProperty('name')
      expect(a).toHaveProperty('iconUrl')
      expect(a).toHaveProperty('isActive')
      expect(a.isActive).toBe(true)
    }
    const names = amenities.map(a => a.name)
    const sorted = [...names].sort((x, y) => x.localeCompare(y))
    expect(names).toEqual(sorted)
  })
})
