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
// prefixed `m2-nearest-` so this file's fixtures have a private
// namespace that no other test file shares (M2.7 fix — see PR #84
// commit 0723b9d). Cleanup is prefix-scoped in both beforeAll
// (self-healing for prior failed runs) and afterAll.

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
  // Self-healing cleanup. A prior failed run can leave orphan rows
  // matching this file's `m2-nearest-*` namespace, and a re-run
  // would then fail on the Locality
  // `@@unique([name, ladDistrict, country])` constraint. Wipe our
  // own namespace first. No User rows in this file, so locality
  // delete is unconditional.
  await prisma.locality.deleteMany({ where: { slug: { startsWith: 'm2-nearest-' } } })

  await prisma.locality.createMany({
    data: [
      // Test 1: at exact query point → distance 0 → must win.
      {
        name: 'TestExact', slug: 'm2-nearest-exact',
        ladDistrict: 'TestLAD', country: 'TestCountry',
        centerLat: Q_BASE.lat, centerLng: Q_BASE.lng,
        populationTier: 'CITY',
      },
      // Test 2: two fixtures, both inside bbox, different distances. The
      // closer one must win the Haversine sort.
      {
        name: 'TestNear', slug: 'm2-nearest-near',
        ladDistrict: 'TestLAD', country: 'TestCountry',
        centerLat: Q_BASE.lat + 0.0001, centerLng: Q_BASE.lng + 0.0001, // ~14m
        populationTier: 'TOWN',
      },
      {
        name: 'TestFarInBbox', slug: 'm2-nearest-far',
        ladDistrict: 'TestLAD', country: 'TestCountry',
        centerLat: Q_BASE.lat + 0.05, centerLng: Q_BASE.lng + 0.05, // ~6km
        populationTier: 'VILLAGE',
      },
      // Test 5: Scottish-style — null adminCounty + null region. Must be
      // returnable; the helper does not filter on those fields.
      //
      // NAME is deliberately file-unique ('NearestLocScottish') so the
      // Locality `@@unique([name, ladDistrict, country])` tuple does
      // not collide with another concurrently-running test file that
      // might also create a Scottish-style fixture.
      {
        name: 'NearestLocScottish', slug: 'm2-nearest-scottish',
        ladDistrict: 'TestLAD', country: 'Scotland',
        centerLat: Q_SCOTTISH.lat, centerLng: Q_SCOTTISH.lng,
        adminCounty: null, region: null,
        populationTier: 'SMALL_TOWN',
      },
      // Test 3: bbox boundary pin. Fixture at +0.29° lat is INSIDE the
      // 0.3° bbox; fixture at +0.31° lat is OUTSIDE. The outside fixture
      // must NOT be returned even though no closer candidate exists.
      {
        name: 'TestJustInside', slug: 'm2-nearest-just-inside-bbox',
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
      name: 'TestJustOutside', slug: 'm2-nearest-just-outside-bbox',
      ladDistrict: 'TestLAD', country: 'TestCountry',
      centerLat: 57.0 + 0.31, centerLng: 2.5,         // 0.31° lat north of (57.0, 2.5)
      populationTier: 'VILLAGE',
    },
  })
})

afterAll(async () => {
  // Narrow to this file's own slug prefix only. A broader cleanup
  // (e.g. `startsWith: 'test-'`) would clobber other test files'
  // fixtures (e.g. effectiveLocation's `test-effective-*`) when
  // vitest schedules files in parallel and one file's afterAll
  // fires while another's tests are still running.
  await prisma.locality.deleteMany({ where: { slug: { startsWith: 'm2-nearest-' } } })
  await prisma.$disconnect()
})

describe('findNearestLocality', () => {
  it('returns the fixture at the exact query point (distance 0 wins)', async () => {
    const result = await findNearestLocality(prisma, Q_BASE.lat, Q_BASE.lng)
    expect(result?.slug).toBe('m2-nearest-exact')
  })

  it('Haversine sort: among candidates in the bbox, the closest one wins', async () => {
    // Query AT TestNear's coordinates. All three fixtures (EXACT, NEAR,
    // FAR) are inside the bbox. NEAR has distance 0, EXACT ~14m, FAR
    // ~6km. The sort must pick NEAR, NOT the first row Prisma returns
    // (which would likely be EXACT by insertion order). This pins that
    // the in-memory Haversine pass is actually evaluating distances,
    // not just trusting candidate-array ordering.
    const result = await findNearestLocality(prisma, Q_BASE.lat + 0.0001, Q_BASE.lng + 0.0001)
    expect(result?.slug).toBe('m2-nearest-near')
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
    expect(result?.slug).toBe('m2-nearest-just-inside-bbox')
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
    expect(result?.slug).toBe('m2-nearest-scottish')
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

// §AT4 candidate-count regression (real UK seed — no fixtures).
//
// Pinned to the densest UK point we identified during the §AT4
// profiling pass on 2026-05-15: Central London — Trafalgar Square,
// which returned 881 candidates inside the 0.3° bbox against the M1
// ONSPD seed (16,628 localities total).
//
// The 1500 threshold gives ~70% headroom over today's 881 to absorb
// seed growth without false-positive alarms. If this test ever
// fires, the candidate count has grown materially — the right
// response is to RE-RUN `prisma/profile-nearest-locality-at4.ts`
// against the new seed and re-evaluate against the owner's
// "warm p95 < 400 ms" decision rule BEFORE shipping M3 / live
// Discovery on the same path.
//
// Also asserts the candidate count is strictly positive so this
// test cannot silently pass against an empty / un-seeded test DB.
// If the M1 ONSPD seed is missing the test fails LOUDLY — that's
// the signal the regression coverage is real.
//
// Read-only. Hits real seed rows, NOT the m2-nearest-* fixtures
// from the file's beforeAll. No cleanup needed.

describe('findNearestLocality — §AT4 candidate-count regression', () => {
  const TRAFALGAR_SQUARE = { lat: 51.5081, lng: -0.1281 } // densest UK point in the 2026-05-15 profile
  const BBOX_DEGREES = 0.3 // mirrors src/api/lib/nearestLocality.ts

  it('Central London bbox candidate count stays bounded (<1500) against real ONSPD seed', async () => {
    const count = await prisma.locality.count({
      where: {
        centerLat: { gte: TRAFALGAR_SQUARE.lat - BBOX_DEGREES, lte: TRAFALGAR_SQUARE.lat + BBOX_DEGREES },
        centerLng: { gte: TRAFALGAR_SQUARE.lng - BBOX_DEGREES, lte: TRAFALGAR_SQUARE.lng + BBOX_DEGREES },
      },
    })
    // Sanity: seed must be present. If this fires, the test isn't
    // exercising the regression — re-seed the test DB before trusting
    // the upper bound below.
    expect(count).toBeGreaterThan(0)
    // 2026-05-15 measured: 881. Threshold 1500 gives ~70% headroom.
    expect(count).toBeLessThan(1500)
  })
})
