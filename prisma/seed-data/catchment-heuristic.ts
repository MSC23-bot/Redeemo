// prisma/seed-data/catchment-heuristic.ts
//
// Heuristic catchment-edge seeder: for every "small" Locality (HAMLET / VILLAGE /
// SMALL_TOWN / UNKNOWN), find up to MAX_EDGES_PER_SOURCE nearby "big" Localities
// (TOWN / LARGE_TOWN / CITY / METRO_CORE) within K_MILES, ranked by
// (population tier descending, then distance ascending), and write them as
// LocalityCatchmentEdge rows with isCurated = false.
//
// Idempotent: re-runs are safe because the writes use createMany with
// skipDuplicates against the @@unique([sourceLocalityId, targetLocalityId])
// constraint. Curated edges added later (M1.14) sit alongside these heuristic
// edges in the same table; the discovery code differentiates via isCurated.
//
// Performance note (deviation from plan §M1.13 Step 1 literal code):
// The plan supplies findUnique + create per edge, which would be ~150 min of
// Neon roundtrips for ~46k potential edges (2 RTT per row × 100 ms RTT). This
// module uses createMany({ skipDuplicates: true }) in batches of CREATEMANY_BATCH,
// which collapses the writes into ~30 batched roundtrips. Same idempotency
// semantics; ~100× faster.

import type { PrismaClient } from '../../generated/prisma/client'

const TOWN_TIER_AND_ABOVE = ['TOWN', 'LARGE_TOWN', 'CITY', 'METRO_CORE'] as const
const SMALL_LOCALITY_TIERS = ['HAMLET', 'VILLAGE', 'SMALL_TOWN', 'UNKNOWN'] as const
const K_MILES = 12
const MAX_EDGES_PER_SOURCE = 3
const MILES_TO_METRES = 1609.344
const CREATEMANY_BATCH = 1000

// Postgres has a 65,535 bind-parameter limit per statement. createMany binds
// ~4 params per row (sourceLocalityId, targetLocalityId, rank, isCurated). 1000
// rows = ~4000 params = comfortable margin below the limit.

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const phi1 = lat1 * Math.PI / 180
  const phi2 = lat2 * Math.PI / 180
  const dPhi = (lat2 - lat1) * Math.PI / 180
  const dLambda = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const TIER_RANK: Record<string, number> = {
  METRO_CORE: 4,
  CITY: 3,
  LARGE_TOWN: 2,
  TOWN: 1,
}

export async function seedHeuristicCatchmentEdges(prisma: PrismaClient): Promise<void> {
  const sources = await prisma.locality.findMany({
    where: { populationTier: { in: [...SMALL_LOCALITY_TIERS] } },
    select: { id: true, centerLat: true, centerLng: true, country: true },
  })
  const targets = await prisma.locality.findMany({
    where: { populationTier: { in: [...TOWN_TIER_AND_ABOVE] } },
    select: { id: true, centerLat: true, centerLng: true, country: true, populationTier: true },
  })

  const K_METRES = K_MILES * MILES_TO_METRES

  // Bucket targets by country so we don't scan the whole UK target set per source.
  const targetsByCountry = new Map<string, typeof targets>()
  for (const t of targets) {
    const arr = targetsByCountry.get(t.country) ?? []
    arr.push(t)
    targetsByCountry.set(t.country, arr)
  }

  const edgesToInsert: { sourceLocalityId: string; targetLocalityId: string; rank: number; isCurated: false }[] = []

  for (const src of sources) {
    const countryTargets = targetsByCountry.get(src.country) ?? []
    const srcLat = Number(src.centerLat)
    const srcLng = Number(src.centerLng)

    const candidates = countryTargets
      .map(t => ({
        id: t.id,
        distMetres: haversineMetres(srcLat, srcLng, Number(t.centerLat), Number(t.centerLng)),
        populationTier: t.populationTier,
      }))
      .filter(t => t.distMetres <= K_METRES)
      .sort((a, b) => {
        const dt = (TIER_RANK[b.populationTier] ?? 0) - (TIER_RANK[a.populationTier] ?? 0)
        return dt !== 0 ? dt : a.distMetres - b.distMetres
      })
      .slice(0, MAX_EDGES_PER_SOURCE)

    for (let i = 0; i < candidates.length; i++) {
      edgesToInsert.push({
        sourceLocalityId: src.id,
        targetLocalityId: candidates[i].id,
        rank: i + 1,
        isCurated: false,
      })
    }
  }

  // Batched insert with skipDuplicates so re-runs are idempotent against
  // @@unique([sourceLocalityId, targetLocalityId]).
  let inserted = 0
  for (let i = 0; i < edgesToInsert.length; i += CREATEMANY_BATCH) {
    const batch = edgesToInsert.slice(i, i + CREATEMANY_BATCH)
    const result = await prisma.localityCatchmentEdge.createMany({ data: batch, skipDuplicates: true })
    inserted += result.count
  }
  const skipped = edgesToInsert.length - inserted
  console.log(`Seeded heuristic catchment edges: ${inserted} new, ${skipped} existing (computed ${edgesToInsert.length} candidates from ${sources.length} sources × ≤${MAX_EDGES_PER_SOURCE} targets/${K_MILES}mi)`)
}
