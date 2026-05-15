// prisma/profile-nearest-locality-at4.ts
//
// §AT4 (M3 prerequisite) — profile `findNearestLocality`'s candidate
// counts at representative UK query points. The plan's "<100 rows"
// claim is for sparse rural points; the M3 wire-up needs evidence
// that dense areas (Greater London, Manchester) also fit safely in
// memory under the current unbounded `findMany`-then-Haversine-sort
// pipeline — or evidence that we need a distance-aware DB sort
// (PostGIS `<->`, etc.) before live Discovery can rely on it.
//
// This script is OWNER-RUN and READ-ONLY. Zero writes, zero DB state
// changes. Runs the EXACT same bbox prefilter as
// src/api/lib/nearestLocality.ts (BBOX_DEGREES = 0.3) so the numbers
// reported are the production candidate counts.
//
// Usage:
//   npx tsx prisma/profile-nearest-locality-at4.ts
//
// See:
//   src/api/lib/nearestLocality.ts (inline §AT4 comment above BBOX_DEGREES)
//   deferred-followups §AT4 — locked NOT to ship a blind `take` cap

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { haversineMetres } from '../src/api/shared/haversine'

// Identical to src/api/lib/nearestLocality.ts BBOX_DEGREES.
const BBOX_DEGREES = 0.3

type Point = { label: string; lat: number; lng: number }

// 4 dense urban centres (England, Scotland, Wales by-density representative)
// + 1 deliberately rural / sparse point for contrast.
//
// Coordinates are well-known landmark centroids (Wikipedia / OS Maps).
// Cherry-picked to span the densest pockets of the UK seed: Greater
// London, Greater Manchester, Birmingham/West Midlands, and Edinburgh.
const POINTS: readonly Point[] = [
  { label: 'Central London — Trafalgar Square',       lat: 51.5081, lng: -0.1281 },
  { label: 'Manchester city centre — Albert Square',  lat: 53.4793, lng: -2.2452 },
  { label: 'Birmingham city centre — Victoria Square', lat: 52.4796, lng: -1.9026 },
  { label: 'Edinburgh city centre — Princes Street',  lat: 55.9533, lng: -3.1883 },
  { label: 'Rural — Cairngorms NP / Aviemore',        lat: 57.1944, lng: -3.8273 },
] as const

type Row = {
  label: string
  candidateCount: number
  queryLatencyMs: number
  nearestDistanceM: number
  topThree: Array<{ name: string; populationTier: string; country: string; distanceM: number }>
}

async function profilePoint(prisma: PrismaClient, p: Point): Promise<Row> {
  const t0 = Date.now()
  const candidates = await prisma.locality.findMany({
    where: {
      centerLat: { gte: p.lat - BBOX_DEGREES, lte: p.lat + BBOX_DEGREES },
      centerLng: { gte: p.lng - BBOX_DEGREES, lte: p.lng + BBOX_DEGREES },
    },
    select: {
      id: true, name: true, centerLat: true, centerLng: true,
      populationTier: true, country: true,
    },
  })
  const latencyMs = Date.now() - t0

  const enriched = candidates.map(c => ({
    name: c.name,
    populationTier: c.populationTier,
    country: c.country,
    distanceM: haversineMetres(p.lat, p.lng, Number(c.centerLat), Number(c.centerLng)),
  })).sort((a, b) => a.distanceM - b.distanceM)

  return {
    label: p.label,
    candidateCount: candidates.length,
    queryLatencyMs: latencyMs,
    nearestDistanceM: enriched[0]?.distanceM ?? Infinity,
    topThree: enriched.slice(0, 3),
  }
}

async function main() {
  const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }))
  const prisma = new PrismaClient({ adapter })

  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log(`§AT4 nearest-locality bbox profiling`)
  console.log(`   BBOX_DEGREES = ${BBOX_DEGREES}`)
  console.log(`   Date         = ${new Date().toISOString()}`)
  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log('')

  // Warm-up query — first Neon connection has a cold-start hit; we
  // throw it away so the per-point latency numbers are steady-state.
  await prisma.locality.findFirst()

  const rows: Row[] = []
  for (const p of POINTS) {
    const row = await profilePoint(prisma, p)
    rows.push(row)

    console.log(`▶ ${row.label}`)
    console.log(`    coords:           ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`)
    console.log(`    bbox window:      lat ${(p.lat - BBOX_DEGREES).toFixed(4)}..${(p.lat + BBOX_DEGREES).toFixed(4)}, lng ${(p.lng - BBOX_DEGREES).toFixed(4)}..${(p.lng + BBOX_DEGREES).toFixed(4)}`)
    console.log(`    candidates:       ${row.candidateCount}`)
    console.log(`    query latency:    ${row.queryLatencyMs} ms`)
    console.log(`    nearest distance: ${Math.round(row.nearestDistanceM)} m`)
    console.log(`    top 3 nearest:`)
    for (let i = 0; i < row.topThree.length; i++) {
      const c = row.topThree[i]
      console.log(`      #${i + 1} ${c.name.padEnd(30)} ${String(c.populationTier).padEnd(12)} ${c.country.padEnd(8)} ${Math.round(c.distanceM)}m`)
    }
    console.log('')
  }

  // Summary
  const maxCount = rows.reduce((a, r) => Math.max(a, r.candidateCount), 0)
  const maxLabel = rows.find(r => r.candidateCount === maxCount)?.label
  const avgCount = Math.round(rows.reduce((a, r) => a + r.candidateCount, 0) / rows.length)
  const minCount = rows.reduce((a, r) => Math.min(a, r.candidateCount), Infinity)
  const minLabel = rows.find(r => r.candidateCount === minCount)?.label

  // Rough memory estimate. Each candidate row pulled by findNearestLocality
  // returns the full Locality record (no `select`). A row has ~14 fields
  // (strings up to ~50 chars + decimals + enum + timestamps + nullable
  // marketId). Conservative estimate: ~500 bytes per row in-memory after
  // Prisma deserialises Decimal → number, etc.
  const ROW_BYTES_ESTIMATE = 500
  const maxMemoryKB = Math.round((maxCount * ROW_BYTES_ESTIMATE) / 1024)

  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log('SUMMARY')
  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log(`Points profiled:      ${rows.length}`)
  console.log(`Min candidate count:  ${minCount}  (${minLabel})`)
  console.log(`Avg candidate count:  ${avgCount}`)
  console.log(`Max candidate count:  ${maxCount}  (${maxLabel})`)
  console.log(`Estimated worst-case in-memory pull: ~${maxMemoryKB} KB / request`)
  console.log('')
  console.log('Decision framework (per inline §AT4 comment in nearestLocality.ts):')
  console.log('  (a) If max count is comfortably small (e.g. < a few thousand rows)')
  console.log('      and worst-case memory is acceptable for a single request,')
  console.log('      the current unbounded findMany-then-Haversine pipeline is safe.')
  console.log('      §AT4 can be closed by evidence + a regression test pinning the')
  console.log('      worst-case count from this profile.')
  console.log('  (b) If max count is materially larger OR memory pressure is real,')
  console.log('      introduce a distance-aware DB sort (PostGIS `<->` or computed')
  console.log('      ORDER BY) and only then add a `take` cap. NOT a blind cap.')
  console.log('')
  console.log('Owner reviews the numbers above and decides.')
  console.log('═══════════════════════════════════════════════════════════════════════')

  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
