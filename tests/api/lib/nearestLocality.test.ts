// tests/api/lib/nearestLocality.test.ts
//
// Plan 4 M2.3 — GPS → nearest-Locality lookup.
//
// Pins the contract: bbox prefilter on `centerLat`/`centerLng` (~20mi
// window), then in-memory Haversine sort on the candidate set. Pure
// read; no writes. Guards invalid coords (NaN / non-finite) BEFORE any
// DB roundtrip.
//
// Test-design note: test fixtures are placed in the NORTH SEA (lat 54.0,
// lng > 2.0) where the UK seed has no real Localities to compete. This
// keeps the tests defensive against the 16k real seeded localities on
// Neon and makes pass/fail signal deterministic. All fixture slugs are
// prefixed `test-` per project convention so cleanup is scoped + safe.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { findNearestLocality } from '../../../src/api/lib/nearestLocality'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// All fixtures live in / around the North Sea east of the UK.
// UK seed lng max = 2.0; we use lng >= 2.4 so no real Locality is ever
// in our test bboxes.
const Q_BASE = { lat: 54.0, lng: 2.5 }              // bbox: [53.7..54.3] × [2.2..2.8]
const Q_SCOTTISH = { lat: 55.0, lng: 2.5 }          // bbox: [54.7..55.3] × [2.2..2.8]
const Q_BBOX_BOUNDARY = { lat: 56.0, lng: 2.5 }     // bbox: [55.7..56.3] × [2.2..2.8]

beforeAll(async () => {
  await prisma.locality.createMany({
    data: [
      // Test 1: at exact query point → distance 0 → must win.
      {
        name: 'TestExact', slug: 'test-exact-q-base',
        ladDistrict: 'TestLAD', country: 'TestCountry',
        centerLat: Q_BASE.lat, centerLng: Q_BASE.lng,
        populationTier: 'CITY',
      },
      // Test 2: two fixtures, both inside bbox, different distances. The
      // closer one must win the Haversine sort.
      {
        name: 'TestNear', slug: 'test-near-q-base',
        ladDistrict: 'TestLAD', country: 'TestCountry',
        centerLat: Q_BASE.lat + 0.0001, centerLng: Q_BASE.lng + 0.0001, // ~14m
        populationTier: 'TOWN',
      },
      {
        name: 'TestFarInBbox', slug: 'test-far-q-base',
        ladDistrict: 'TestLAD', country: 'TestCountry',
        centerLat: Q_BASE.lat + 0.05, centerLng: Q_BASE.lng + 0.05, // ~6km
        populationTier: 'VILLAGE',
      },
      // Test 5: Scottish-style — null adminCounty + null region. Must be
      // returnable; the helper does not filter on those fields.
      {
        name: 'TestScottish', slug: 'test-scottish-q-scottish',
        ladDistrict: 'TestLAD', country: 'Scotland',
        centerLat: Q_SCOTTISH.lat, centerLng: Q_SCOTTISH.lng,
        adminCounty: null, region: null,
        populationTier: 'SMALL_TOWN',
      },
      // Test 3: bbox boundary pin. Fixture at +0.29° lat is INSIDE the
      // 0.3° bbox; fixture at +0.31° lat is OUTSIDE. The outside fixture
      // must NOT be returned even though no closer candidate exists.
      {
        name: 'TestJustInside', slug: 'test-just-inside-bbox',
        ladDistrict: 'TestLAD', country: 'TestCountry',
        centerLat: Q_BBOX_BOUNDARY.lat + 0.29, centerLng: Q_BBOX_BOUNDARY.lng,
        populationTier: 'VILLAGE',
      },
    ],
    skipDuplicates: true,
  })

  // Test 3b fixture has its own bbox we want to test against, NOT shared
  // with the just-inside fixture above. Place it at a separate query
  // point so its bbox doesn't overlap.
  await prisma.locality.create({
    data: {
      name: 'TestJustOutside', slug: 'test-just-outside-bbox',
      ladDistrict: 'TestLAD', country: 'TestCountry',
      centerLat: 57.0 + 0.31, centerLng: 2.5,         // 0.31° lat north of (57.0, 2.5)
      populationTier: 'VILLAGE',
    },
  })
})

afterAll(async () => {
  await prisma.locality.deleteMany({ where: { slug: { startsWith: 'test-' } } })
  await prisma.$disconnect()
})

describe('findNearestLocality', () => {
  it('returns the fixture at the exact query point (distance 0 wins)', async () => {
    const result = await findNearestLocality(prisma, Q_BASE.lat, Q_BASE.lng)
    expect(result?.slug).toBe('test-exact-q-base')
  })

  it('Haversine sort: among candidates in the bbox, the closest one wins', async () => {
    // Query AT TestNear's coordinates. All three fixtures (EXACT, NEAR,
    // FAR) are inside the bbox. NEAR has distance 0, EXACT ~14m, FAR
    // ~6km. The sort must pick NEAR, NOT the first row Prisma returns
    // (which would likely be EXACT by insertion order). This pins that
    // the in-memory Haversine pass is actually evaluating distances,
    // not just trusting candidate-array ordering.
    const result = await findNearestLocality(prisma, Q_BASE.lat + 0.0001, Q_BASE.lng + 0.0001)
    expect(result?.slug).toBe('test-near-q-base')
  })

  it('bbox prefilter: fixture just OUTSIDE the bbox is NOT returned even with no closer candidate', async () => {
    // Query (57.0, 2.5). The bbox is [56.7..57.3] × [2.2..2.8]. The
    // TestJustOutside fixture sits at (57.31, 2.5) — 0.31° away in lat
    // — so it's BEYOND the bbox upper bound (57.3). Nothing else is
    // close. Without a bbox prefilter the Haversine pass would find it;
    // with the prefilter it should not.
    const result = await findNearestLocality(prisma, 57.0, 2.5)
    expect(result).toBeNull()
  })

  it('bbox prefilter: fixture just INSIDE the bbox IS returned', async () => {
    // Query Q_BBOX_BOUNDARY (56.0, 2.5). TestJustInside is at (56.29, 2.5)
    // — INSIDE the bbox (upper bound 56.3). It should be returned.
    const result = await findNearestLocality(prisma, Q_BBOX_BOUNDARY.lat, Q_BBOX_BOUNDARY.lng)
    expect(result?.slug).toBe('test-just-inside-bbox')
  })

  it('returns null when no Locality lies in the bbox window (far from any UK locality)', async () => {
    // (0, 0) is off the coast of West Africa. The bbox is
    // [-0.3..0.3] × [-0.3..0.3] — no UK locality reaches there.
    const result = await findNearestLocality(prisma, 0, 0)
    expect(result).toBeNull()
  })

  it('returns Scottish-style locality (null adminCounty + null region) intact', async () => {
    // Pins UK-wide robustness: the helper does not filter on or break
    // because of nullable admin-hierarchy fields.
    const result = await findNearestLocality(prisma, Q_SCOTTISH.lat, Q_SCOTTISH.lng)
    expect(result?.slug).toBe('test-scottish-q-scottish')
    expect(result?.adminCounty).toBeNull()
    expect(result?.region).toBeNull()
    expect(result?.country).toBe('Scotland')
  })

  it('returns null for NaN latitude without touching the DB', async () => {
    const result = await findNearestLocality(prisma, Number.NaN, 2.5)
    expect(result).toBeNull()
  })

  it('returns null for NaN longitude without touching the DB', async () => {
    const result = await findNearestLocality(prisma, 54.0, Number.NaN)
    expect(result).toBeNull()
  })

  it('returns null for non-finite (Infinity) latitude', async () => {
    const result = await findNearestLocality(prisma, Number.POSITIVE_INFINITY, 2.5)
    expect(result).toBeNull()
  })

  it('returns null for non-finite (Infinity) longitude', async () => {
    const result = await findNearestLocality(prisma, 54.0, Number.NEGATIVE_INFINITY)
    expect(result).toBeNull()
  })
})
