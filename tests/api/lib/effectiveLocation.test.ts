// tests/api/lib/effectiveLocation.test.ts
//
// Plan 4 M2.4 — EffectiveLocation resolver.
//
// Pins the locked resolution order (spec §4.4):
//   1. place query (highest)
//   2. live device GPS
//   3. saved user profile
//   4. null fallback (caller decides intent-driven empty state)
//
// Also pins:
//   - densityClass derivation from populationTier (M2.2)
//   - GPS path uses raw query coords for lat/lng (NOT the nearest
//     locality's centroid); locality only drives the rung match
//   - place-query path uses the locality's centroid as lat/lng (NOT
//     the user's GPS, even if both are present)
//   - UK-wide robustness: Scottish-style locality with null
//     adminCounty + null region resolves correctly through every path
//
// Test fixtures live in the North Sea (lat 54.0+, lng ≥ 2.4) so the
// 16k real seeded UK Localities cannot interfere with GPS lookups.
// Slugs / emails prefixed `test-` per project convention. Cleanup is
// scoped in afterAll.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { resolveEffectiveLocation } from '../../../src/api/lib/effectiveLocation'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// Coordinates well outside the UK seed's lng-max (2.0), so test
// fixtures dominate every bbox lookup.
//
// Deliberately at lng=4.0 (not lng=2.5) so this file's fixtures cannot
// share a bbox window with nearestLocality.test.ts (which uses lng=2.5
// in the same lat band). Both files exercise findNearestLocality
// against the real DB; concurrent runs must NOT see each other's rows
// in the same query. The bbox window is 0.3° wide; 1.5° of separation
// is 5× the window, so the two zones are guaranteed disjoint.
const URBAN_COORDS = { lat: 54.0, lng: 4.0 }      // a CITY-tier test locality lives here
const RURAL_COORDS = { lat: 55.0, lng: 4.0 }      // a VILLAGE-tier test locality lives here
const SCOTTISH_COORDS = { lat: 56.0, lng: 4.0 }   // null adminCounty + null region, SMALL_TOWN tier

let urbanLocalityId: string
let ruralLocalityId: string
let scottishLocalityId: string

let completeUserId: string       // has localityId + lat + lng
let userWithoutLocationId: string  // has localityId but lat/lng null (incomplete)
let userWithoutLocalityId: string  // no localityId at all

beforeAll(async () => {
  const urban = await prisma.locality.create({
    data: {
      name: 'TestUrban', slug: 'm2-effective-urban',
      ladDistrict: 'TestLAD', country: 'England',
      adminCounty: 'TestCounty', region: 'TestRegion',
      centerLat: URBAN_COORDS.lat, centerLng: URBAN_COORDS.lng,
      populationTier: 'CITY',
    },
  })
  urbanLocalityId = urban.id

  const rural = await prisma.locality.create({
    data: {
      name: 'TestRural', slug: 'm2-effective-rural',
      ladDistrict: 'TestLAD', country: 'England',
      adminCounty: 'TestCounty', region: 'TestRegion',
      centerLat: RURAL_COORDS.lat, centerLng: RURAL_COORDS.lng,
      populationTier: 'VILLAGE',
    },
  })
  ruralLocalityId = rural.id

  const scottish = await prisma.locality.create({
    data: {
      name: 'TestScottish', slug: 'm2-effective-scottish',
      ladDistrict: 'TestLAD', country: 'Scotland',
      adminCounty: null, region: null,
      centerLat: SCOTTISH_COORDS.lat, centerLng: SCOTTISH_COORDS.lng,
      populationTier: 'SMALL_TOWN',
    },
  })
  scottishLocalityId = scottish.id

  const complete = await prisma.user.create({
    data: {
      email: 'm2-effective-complete@test.local',
      latitude: URBAN_COORDS.lat, longitude: URBAN_COORDS.lng,
      localityId: urban.id,
    },
  })
  completeUserId = complete.id

  const noLocation = await prisma.user.create({
    data: {
      email: 'm2-effective-nolocation@test.local',
      latitude: null, longitude: null,
      localityId: urban.id, // localityId without lat/lng → still incomplete
    },
  })
  userWithoutLocationId = noLocation.id

  const noLocality = await prisma.user.create({
    data: {
      email: 'm2-effective-nolocality@test.local',
      latitude: null, longitude: null,
      localityId: null,
    },
  })
  userWithoutLocalityId = noLocality.id
})

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: [completeUserId, userWithoutLocationId, userWithoutLocalityId] } },
  })
  await prisma.locality.deleteMany({ where: { slug: { startsWith: 'm2-effective-' } } })
  await prisma.$disconnect()
})

describe('resolveEffectiveLocation — GPS path', () => {
  it('returns source=GPS and lat/lng match the query params (not the locality centroid)', async () => {
    // The query is 14m offset from URBAN_COORDS so nearest-locality
    // resolution is unambiguous, but lat/lng on the result MUST be the
    // query params, not the centroid. Pins spec §4.4 wording: "lat, lng
    // = query params".
    const result = await resolveEffectiveLocation(prisma, {
      lat: URBAN_COORDS.lat + 0.0001,
      lng: URBAN_COORDS.lng + 0.0001,
    }, null)
    expect(result).not.toBeNull()
    expect(result!.source).toBe('GPS')
    expect(result!.lat).toBe(URBAN_COORDS.lat + 0.0001)
    expect(result!.lng).toBe(URBAN_COORDS.lng + 0.0001)
    expect(result!.locality.id).toBe(urbanLocalityId)
  })

  it('densityClass URBAN when GPS lands in a CITY-tier locality', async () => {
    const result = await resolveEffectiveLocation(prisma, URBAN_COORDS, null)
    expect(result!.densityClass).toBe('URBAN')
  })

  it('densityClass RURAL when GPS lands in a VILLAGE-tier locality', async () => {
    const result = await resolveEffectiveLocation(prisma, RURAL_COORDS, null)
    expect(result!.densityClass).toBe('RURAL')
  })

  it('returns null when GPS lands far from any Locality', async () => {
    // (0, 0) is off West Africa — no UK locality reachable through the
    // bbox prefilter in findNearestLocality.
    const result = await resolveEffectiveLocation(prisma, { lat: 0, lng: 0 }, null)
    expect(result).toBeNull()
  })
})

describe('resolveEffectiveLocation — saved-profile path', () => {
  it('returns source=SAVED_PROFILE using the user\'s stored locality + lat/lng', async () => {
    const result = await resolveEffectiveLocation(prisma, {}, completeUserId)
    expect(result).not.toBeNull()
    expect(result!.source).toBe('SAVED_PROFILE')
    expect(result!.locality.id).toBe(urbanLocalityId)
    expect(result!.lat).toBe(URBAN_COORDS.lat)
    expect(result!.lng).toBe(URBAN_COORDS.lng)
    expect(result!.densityClass).toBe('URBAN')
  })

  it('returns null when the user has localityId but null lat/lng (incomplete profile)', async () => {
    const result = await resolveEffectiveLocation(prisma, {}, userWithoutLocationId)
    expect(result).toBeNull()
  })

  it('returns null when the user has no localityId at all', async () => {
    const result = await resolveEffectiveLocation(prisma, {}, userWithoutLocalityId)
    expect(result).toBeNull()
  })
})

describe('resolveEffectiveLocation — place-query path', () => {
  it('returns source=PLACE_QUERY using the locality\'s centroid as lat/lng', async () => {
    const placeLocality = await prisma.locality.findUnique({ where: { id: urbanLocalityId } })
    const result = await resolveEffectiveLocation(prisma, { placeLocality: placeLocality! }, null)
    expect(result).not.toBeNull()
    expect(result!.source).toBe('PLACE_QUERY')
    expect(result!.locality.id).toBe(urbanLocalityId)
    // Place-query path uses the locality centroid (not the user GPS).
    expect(result!.lat).toBe(URBAN_COORDS.lat)
    expect(result!.lng).toBe(URBAN_COORDS.lng)
    expect(result!.densityClass).toBe('URBAN')
  })
})

describe('resolveEffectiveLocation — priority order (locked contract, spec §4.4)', () => {
  it('PLACE_QUERY beats GPS — same call with both provided returns PLACE_QUERY', async () => {
    const placeLocality = await prisma.locality.findUnique({ where: { id: urbanLocalityId } })
    // Pass GPS coords near the RURAL locality, but also provide the
    // URBAN placeLocality. Place must win, AND the result lat/lng must
    // come from the place's centroid (URBAN_COORDS), not the GPS query.
    const result = await resolveEffectiveLocation(prisma, {
      lat: RURAL_COORDS.lat, lng: RURAL_COORDS.lng,
      placeLocality: placeLocality!,
    }, completeUserId)
    expect(result!.source).toBe('PLACE_QUERY')
    expect(result!.locality.id).toBe(urbanLocalityId)
    expect(result!.lat).toBe(URBAN_COORDS.lat)
    expect(result!.lng).toBe(URBAN_COORDS.lng)
  })

  it('GPS beats SAVED_PROFILE — same call with both signals returns GPS', async () => {
    // The user's saved profile points at URBAN. The GPS query points
    // at RURAL. GPS must win.
    const result = await resolveEffectiveLocation(prisma, RURAL_COORDS, completeUserId)
    expect(result!.source).toBe('GPS')
    expect(result!.locality.id).toBe(ruralLocalityId)
    expect(result!.densityClass).toBe('RURAL')
  })
})

describe('resolveEffectiveLocation — null fallback', () => {
  it('returns null when no GPS query and no userId', async () => {
    const result = await resolveEffectiveLocation(prisma, {}, null)
    expect(result).toBeNull()
  })

  it('returns null when userId points at a non-existent user', async () => {
    const result = await resolveEffectiveLocation(prisma, {}, '00000000-0000-0000-0000-000000000000')
    expect(result).toBeNull()
  })
})

describe('resolveEffectiveLocation — UK-wide robustness', () => {
  it('place-query path returns Scottish locality (null adminCounty + null region) intact', async () => {
    const placeLocality = await prisma.locality.findUnique({ where: { id: scottishLocalityId } })
    const result = await resolveEffectiveLocation(prisma, { placeLocality: placeLocality! }, null)
    expect(result!.source).toBe('PLACE_QUERY')
    expect(result!.locality.adminCounty).toBeNull()
    expect(result!.locality.region).toBeNull()
    expect(result!.locality.country).toBe('Scotland')
    // SMALL_TOWN tier → RURAL density
    expect(result!.densityClass).toBe('RURAL')
  })
})
