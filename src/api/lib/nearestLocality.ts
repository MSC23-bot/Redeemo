// src/api/lib/nearestLocality.ts
//
// Plan 4 M2.3 — GPS → nearest-Locality lookup.
//
// Two-stage read:
//   1. Bbox prefilter on `centerLat` / `centerLng` (≈0.3° → ~20mi at UK
//      latitudes). Uses the existing `@@index([centerLat, centerLng])`.
//   2. In-memory Haversine sort on the prefiltered candidate set
//      (typically <100 rows under M1's UK seed).
//
// Pure read. No writes. No schema changes. PostGIS NOT required —
// plain Postgres + the existing index suffices per spec §4.4.
//
// Invalid coords (NaN / non-finite) short-circuit to null BEFORE any DB
// roundtrip, so a bad query param can never cause a Prisma error or
// return an absurd "closest" match.
//
// See:
//   docs/superpowers/specs/2026-05-13-plan-4-location-model-uk-enrichment-design.md §4.4
//   docs/superpowers/plans/2026-05-13-plan-4-location-model-uk-enrichment.md  Task M2.3

import type { PrismaClient, Locality } from '../../../generated/prisma/client'
import { haversineMetres } from '../shared/haversine'

// ~0.3° latitude is ~20 miles at UK latitudes; ~0.3° longitude at
// latitude 54° is ~13 miles. The bbox is rectangular in degrees, not
// metres — a deliberate trade-off for using the indexed (lat, lng)
// scan. Candidate set is sorted by true Haversine distance afterwards,
// so the "shape" of the prefilter does not affect correctness, only
// the size of the in-memory pass.
//
// §AT4 status: profiled + CLOSED BY EVIDENCE on 2026-05-15.
//
//   Measured against the production Neon DB with the current M1 ONSPD
//   seed (16,628 localities). Worst-case point in the UK is Central
//   London — Trafalgar Square / Oxford Circus, both at ~881 candidates
//   inside the 0.3° bbox. Warm-state latency: p50 ≈ 159 ms, p95 ≈ 172
//   ms, max ≈ 286 ms across 20 samples after 2 warm-up shots.
//   Estimated worst-case in-memory pull: ~430 KB per request.
//
//   Per the owner's decision rule (warm p95 < 400 ms), the current
//   unbounded findMany-then-in-memory-Haversine pipeline is acceptable
//   for M3 v1. The §AT4 carry-over from PR #84 is closed by evidence.
//
//   Profiling tool kept at prisma/profile-nearest-locality-at4.ts for
//   future re-checks (e.g. after seed growth or any infra change).
//   Regression test pinning the dense-London candidate-count upper
//   bound lives in tests/api/lib/nearestLocality.test.ts (the §AT4
//   regression describe block) — if it fires, re-profile before M3
//   live-launch.
//
// STANDING RULE — preserved as a lasting constraint, NOT just a §AT4
// item: any future optimisation here (e.g. distance-aware DB sort,
// `take` cap, PostGIS `<->` operator) MUST be correctness-safe. A
// blind `take: N` cap that doesn't sort distance-first at the DB layer
// is FORBIDDEN — it could silently drop the true nearest locality in
// a dense bbox where Prisma's default order isn't distance-aware.
// Tail-latency-driven follow-up tracked at deferred-followups §AT5.
const BBOX_DEGREES = 0.3

export async function findNearestLocality(
  prisma: PrismaClient,
  lat: number,
  lng: number,
): Promise<Locality | null> {
  // Guard invalid coords up front — never hit the DB with NaN or
  // Infinity. Number.isFinite returns false for NaN, ±Infinity, and
  // non-numbers (e.g. when someone passes a string by accident at the
  // type-boundary).
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const candidates = await prisma.locality.findMany({
    where: {
      centerLat: { gte: lat - BBOX_DEGREES, lte: lat + BBOX_DEGREES },
      centerLng: { gte: lng - BBOX_DEGREES, lte: lng + BBOX_DEGREES },
    },
  })
  if (candidates.length === 0) return null

  let best = candidates[0]
  let bestDist = haversineMetres(lat, lng, Number(best.centerLat), Number(best.centerLng))
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]
    const d = haversineMetres(lat, lng, Number(c.centerLat), Number(c.centerLng))
    if (d < bestDist) {
      best = c
      bestDist = d
    }
  }
  return best
}
