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
// M3 prerequisite: the candidate set is NOT bounded — `findMany` could
// in principle return every Locality inside the bbox. The plan's claim
// of "<100 rows" is for sparse rural points. Dense areas (Greater
// London, Manchester) may return materially more. A naive `take: 500`
// is NOT safe — it could silently drop the true nearest in a
// dense bbox where Prisma's default order isn't distance-aware.
// Before M3 wires this into live Discovery, profile real dense-area
// counts from the M1 ONSPD seed and either:
//   (a) prove the count safely fits in memory + add a regression test, OR
//   (b) introduce a distance-aware DB sort (`ORDER BY` on a computed
//       expression or a PostGIS `<->` operator) and then cap.
// Tracked at deferred-followups §AT (PR #84 review carry-overs).
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
