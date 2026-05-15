// prisma/profile-nearest-locality-at4.ts
//
// §AT4 (M3 prerequisite) — profile `findNearestLocality`'s candidate
// counts AND warm-state latency at representative UK query points.
// The plan's "<100 rows" claim is for sparse rural points; the M3
// wire-up needs evidence that dense areas (Greater London,
// Manchester) also fit safely in memory under the current unbounded
// `findMany`-then-Haversine-sort pipeline — or evidence that we
// need a distance-aware DB sort (PostGIS `<->`, etc.) before live
// Discovery can rely on it.
//
// This script is OWNER-RUN and READ-ONLY. Zero writes, zero DB state
// changes. Runs the EXACT same bbox prefilter as
// src/api/lib/nearestLocality.ts (BBOX_DEGREES = 0.3) so the numbers
// reported are the production-shape candidate counts.
//
// Multi-sample (default 20 samples per point AFTER 2 warm-up shots
// to stabilise Neon connection state) so the per-point report
// includes min / p50 / p95 / max — the cold-start single-shot
// numbers from the first run of this script were not a fair signal
// of warm steady-state.
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

// Per-point sampling: 2 warm-up shots discarded, then `SAMPLES`
// measured shots. 20 measured samples gives a defensible p95 via
// nearest-rank interpolation (index 18 / 19 with linear blend).
const WARMUP_SHOTS = 2
const SAMPLES = 20

type Point = { label: string; lat: number; lng: number }

// 5 dense urban centres + 1 deliberately rural / sparse point for
// contrast. Coordinates are well-known landmark centroids (Wikipedia
// / OS Maps). The two London points are deliberately chosen to span
// "Trafalgar Square" (south-of-Soho West End) and "Oxford Circus"
// (Soho-adjacent shopping core) to test whether either is materially
// denser than the other in the M1 ONSPD seed.
const POINTS: readonly Point[] = [
  { label: 'Central London — Trafalgar Square',         lat: 51.5081, lng: -0.1281 },
  { label: 'Central London — Oxford Circus / Soho',     lat: 51.5152, lng: -0.1418 },
  { label: 'Manchester city centre — Albert Square',    lat: 53.4793, lng: -2.2452 },
  { label: 'Birmingham city centre — Victoria Square',  lat: 52.4796, lng: -1.9026 },
  { label: 'Edinburgh city centre — Princes Street',    lat: 55.9533, lng: -3.1883 },
  { label: 'Rural — Cairngorms NP / Aviemore',          lat: 57.1944, lng: -3.8273 },
] as const

type Sample = number // latency in ms

type Row = {
  label: string
  candidateCount: number
  latencies: Sample[]   // sorted ascending
  nearestDistanceM: number
  topThree: Array<{ name: string; populationTier: string; country: string; distanceM: number }>
}

// One bbox query at the given point. Returns the candidate set plus
// the wall-clock latency for the round-trip. We deliberately call the
// EXACT same `findMany` shape as src/api/lib/nearestLocality.ts (no
// `select`) so latencies are honest-to-production.
async function runBboxQuery(prisma: PrismaClient, p: Point): Promise<{
  candidates: Array<{ name: string; centerLat: unknown; centerLng: unknown; populationTier: string; country: string }>
  latencyMs: number
}> {
  const t0 = Date.now()
  const candidates = await prisma.locality.findMany({
    where: {
      centerLat: { gte: p.lat - BBOX_DEGREES, lte: p.lat + BBOX_DEGREES },
      centerLng: { gte: p.lng - BBOX_DEGREES, lte: p.lng + BBOX_DEGREES },
    },
  })
  const latencyMs = Date.now() - t0
  return { candidates, latencyMs }
}

// p in [0, 1]. Linear interpolation between nearest ranks (matches
// numpy's default `linear` method).
function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return NaN
  if (sortedAsc.length === 1) return sortedAsc[0]
  const rank = p * (sortedAsc.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return sortedAsc[lo]
  const frac = rank - lo
  return sortedAsc[lo] + frac * (sortedAsc[hi] - sortedAsc[lo])
}

async function profilePoint(prisma: PrismaClient, p: Point): Promise<Row> {
  // Warm-up — discard.
  for (let i = 0; i < WARMUP_SHOTS; i++) {
    await runBboxQuery(prisma, p)
  }

  // Measure. Capture candidates + topThree from the LAST sample so
  // the per-point breakdown is consistent with the timed runs.
  const latencies: number[] = []
  let lastCandidates: Awaited<ReturnType<typeof runBboxQuery>>['candidates'] = []
  for (let i = 0; i < SAMPLES; i++) {
    const { candidates, latencyMs } = await runBboxQuery(prisma, p)
    latencies.push(latencyMs)
    lastCandidates = candidates
  }
  latencies.sort((a, b) => a - b)

  const enriched = lastCandidates.map(c => ({
    name: c.name,
    populationTier: String(c.populationTier),
    country: c.country,
    distanceM: haversineMetres(p.lat, p.lng, Number(c.centerLat), Number(c.centerLng)),
  })).sort((a, b) => a.distanceM - b.distanceM)

  return {
    label: p.label,
    candidateCount: lastCandidates.length,
    latencies,
    nearestDistanceM: enriched[0]?.distanceM ?? Infinity,
    topThree: enriched.slice(0, 3),
  }
}

async function main() {
  const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }))
  const prisma = new PrismaClient({ adapter })

  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log(`§AT4 nearest-locality bbox profiling — multi-sample p50/p95`)
  console.log(`   BBOX_DEGREES = ${BBOX_DEGREES}`)
  console.log(`   Warm-up      = ${WARMUP_SHOTS} shots/point (discarded)`)
  console.log(`   Samples      = ${SAMPLES} measured shots/point`)
  console.log(`   Date         = ${new Date().toISOString()}`)
  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log('')

  // Global warm-up: open the Neon connection + warm up Prisma's
  // engine with one no-op query.
  await prisma.locality.findFirst()

  const rows: Row[] = []
  for (const p of POINTS) {
    const row = await profilePoint(prisma, p)
    rows.push(row)

    const min = row.latencies[0]
    const p50 = Math.round(percentile(row.latencies, 0.50))
    const p95 = Math.round(percentile(row.latencies, 0.95))
    const max = row.latencies[row.latencies.length - 1]

    console.log(`▶ ${row.label}`)
    console.log(`    coords:           ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`)
    console.log(`    candidates:       ${row.candidateCount}`)
    console.log(`    nearest distance: ${Math.round(row.nearestDistanceM)} m`)
    console.log(`    latency  min:     ${String(min).padStart(4)} ms`)
    console.log(`    latency  p50:     ${String(p50).padStart(4)} ms`)
    console.log(`    latency  p95:     ${String(p95).padStart(4)} ms`)
    console.log(`    latency  max:     ${String(max).padStart(4)} ms`)
    console.log(`    top 3 nearest:`)
    for (let i = 0; i < row.topThree.length; i++) {
      const c = row.topThree[i]
      console.log(`      #${i + 1} ${c.name.padEnd(30)} ${c.populationTier.padEnd(12)} ${c.country.padEnd(8)} ${Math.round(c.distanceM)}m`)
    }
    console.log('')
  }

  // Summary table.
  const maxCount = rows.reduce((a, r) => Math.max(a, r.candidateCount), 0)
  const maxCountLabel = rows.find(r => r.candidateCount === maxCount)?.label

  // The worst-case p95 across all points — the headline number for
  // the owner's decision rule.
  let worstP95 = 0
  let worstP95Label = ''
  for (const r of rows) {
    const p95 = percentile(r.latencies, 0.95)
    if (p95 > worstP95) { worstP95 = p95; worstP95Label = r.label }
  }

  const ROW_BYTES_ESTIMATE = 500 // full Locality row, no select
  const maxMemoryKB = Math.round((maxCount * ROW_BYTES_ESTIMATE) / 1024)

  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log('SUMMARY (warm-state, ' + SAMPLES + ' samples/point)')
  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log('')
  console.log(`Max candidate count:                    ${maxCount}`)
  console.log(`Max candidate count point:              ${maxCountLabel}`)
  console.log(`Estimated worst-case in-memory pull:    ~${maxMemoryKB} KB / request`)
  console.log('')
  console.log(`Worst-case p95 latency:                 ${Math.round(worstP95)} ms`)
  console.log(`Worst-case p95 point:                   ${worstP95Label}`)
  console.log('')
  console.log('Per-point latency matrix (ms):')
  console.log('  point' + ' '.repeat(50) + 'count   min   p50   p95   max')
  console.log('  ' + '─'.repeat(80))
  for (const r of rows) {
    const min = String(r.latencies[0]).padStart(5)
    const p50 = String(Math.round(percentile(r.latencies, 0.50))).padStart(5)
    const p95 = String(Math.round(percentile(r.latencies, 0.95))).padStart(5)
    const max = String(r.latencies[r.latencies.length - 1]).padStart(5)
    const count = String(r.candidateCount).padStart(5)
    console.log(`  ${r.label.padEnd(53)} ${count} ${min} ${p50} ${p95} ${max}`)
  }
  console.log('')
  console.log('Decision rule (owner-set 2026-05-15):')
  console.log('  - Worst p95 ≲ 400 ms → close §AT4 by evidence + regression test.')
  console.log('  - Worst p95 ≳ 500 ms → recommend correctness-safe optimisation.')
  console.log('                          NOT a blind `take` cap.')
  console.log('═══════════════════════════════════════════════════════════════════════')

  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
