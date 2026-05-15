// tests/api/lib/catchmentLookup.test.ts
//
// Plan 4 M3.2 — `getOutgoingCatchmentTargetIds` helper.
//
// Loads the directed `LocalityCatchmentEdge`s rooted at a single
// source Locality, returns their target Locality ids ordered by
// `rank` ASC. Used by the M3 Discovery service to feed
// `rankMerchantsV2`'s `outgoingCatchmentTargetIds` parameter so
// `classifyRung` can identify CATCHMENT-rung branches.
//
// Real-DB integration test. Fixtures use the `m3-catchment-*` slug
// prefix to keep cleanup scoped to this file (lesson from PR #84:
// broader prefixes collide with `findOrCreateLocality.test.ts`'s
// `slug.startsWith('test-')` afterEach).
//
// Pure read against the test fixtures. No writes outside beforeAll/
// afterAll. Reuses the inline PrismaClient pattern shared by all
// other M2 real-DB tests (no `tests/helpers/` indirection — that
// pattern doesn't exist in this project).

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getOutgoingCatchmentTargetIds } from '../../../src/api/lib/catchmentLookup'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// North-Sea-east coords (lng=4.0) — outside the UK seed's lng-max of
// 2.0 so the new fixtures cannot collide with real seeded Localities
// or with `m2-effective-*` / `m2-nearest-*` test fixtures from the
// M2 suite. Coords don't matter for this helper (it's a pure DB
// join), but placing fixtures away from real data is consistent
// hygiene.
const COORDS = { lat: 54.0, lng: 4.0 }

let sourceId: string
let targetAId: string
let targetBId: string
let isolatedId: string // a separate Locality with NO outgoing edges

beforeAll(async () => {
  // Self-healing: a prior failed run could leave orphan
  // `m3-catchment-*` rows that would collide with this file's
  // fixture creation. Wipe the namespace first (edges before
  // localities for the FK).
  await prisma.localityCatchmentEdge.deleteMany({
    where: {
      OR: [
        { source: { slug: { startsWith: 'm3-catchment-' } } },
        { target: { slug: { startsWith: 'm3-catchment-' } } },
      ],
    },
  })
  await prisma.locality.deleteMany({ where: { slug: { startsWith: 'm3-catchment-' } } })

  const source = await prisma.locality.create({
    data: {
      name: 'M3CatchmentSource', slug: 'm3-catchment-source',
      ladDistrict: 'TestLAD', country: 'England',
      centerLat: COORDS.lat, centerLng: COORDS.lng,
      populationTier: 'VILLAGE',
    },
  })
  sourceId = source.id

  const targetA = await prisma.locality.create({
    data: {
      name: 'M3CatchmentCentreA', slug: 'm3-catchment-centre-a',
      ladDistrict: 'TestLAD', country: 'England',
      centerLat: COORDS.lat + 0.1, centerLng: COORDS.lng + 0.1,
      populationTier: 'TOWN',
    },
  })
  targetAId = targetA.id

  const targetB = await prisma.locality.create({
    data: {
      name: 'M3CatchmentCentreB', slug: 'm3-catchment-centre-b',
      ladDistrict: 'TestLAD', country: 'England',
      centerLat: COORDS.lat + 0.2, centerLng: COORDS.lng + 0.2,
      populationTier: 'LARGE_TOWN',
    },
  })
  targetBId = targetB.id

  const isolated = await prisma.locality.create({
    data: {
      name: 'M3CatchmentIsolated', slug: 'm3-catchment-isolated',
      ladDistrict: 'TestLAD', country: 'England',
      centerLat: COORDS.lat + 0.3, centerLng: COORDS.lng + 0.3,
      populationTier: 'VILLAGE',
    },
  })
  isolatedId = isolated.id

  // Deliberately insert with reversed `rank` order to prove the
  // helper sorts on `rank ASC` (not Prisma's default row order):
  // insert B first (rank 2), then A (rank 1).
  await prisma.localityCatchmentEdge.createMany({
    data: [
      { sourceLocalityId: sourceId, targetLocalityId: targetBId, rank: 2 },
      { sourceLocalityId: sourceId, targetLocalityId: targetAId, rank: 1 },
    ],
  })
})

afterAll(async () => {
  // Prefix-scoped cleanup. Edges first (FK), then localities.
  await prisma.localityCatchmentEdge.deleteMany({
    where: {
      OR: [
        { source: { slug: { startsWith: 'm3-catchment-' } } },
        { target: { slug: { startsWith: 'm3-catchment-' } } },
      ],
    },
  })
  await prisma.locality.deleteMany({ where: { slug: { startsWith: 'm3-catchment-' } } })
  await prisma.$disconnect()
})

describe('getOutgoingCatchmentTargetIds', () => {
  it('returns target ids ordered by rank ASC (not Prisma row order)', async () => {
    const ids = await getOutgoingCatchmentTargetIds(prisma, sourceId)
    expect(ids).toEqual([targetAId, targetBId]) // A (rank 1) before B (rank 2)
  })

  it('returns empty array when the source has no outgoing edges', async () => {
    const ids = await getOutgoingCatchmentTargetIds(prisma, isolatedId)
    expect(ids).toEqual([])
  })

  it('returns empty array for a non-existent locality id', async () => {
    const ids = await getOutgoingCatchmentTargetIds(prisma, '00000000-0000-0000-0000-000000000000')
    expect(ids).toEqual([])
  })

  it('returns a readonly array (caller cannot mutate the result)', async () => {
    const ids = await getOutgoingCatchmentTargetIds(prisma, sourceId)
    // Compile-time `readonly string[]` typing — the runtime result
    // is a plain array. Best we can do at runtime is confirm the
    // helper doesn't return undefined/null and the shape matches.
    expect(Array.isArray(ids)).toBe(true)
    expect(ids.every(id => typeof id === 'string')).toBe(true)
  })
})
