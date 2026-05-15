// src/api/lib/catchmentLookup.ts
//
// Plan 4 M3.2 — outgoing catchment-edge lookup for the ranking
// pipeline.
//
// Given the source Locality from an `EffectiveLocation`, returns the
// ids of Localities reachable via directed `LocalityCatchmentEdge`
// rows (`source → target`), ordered by `rank` ASC (primary catchment
// first, secondary second, etc.).
//
// Used by the Discovery service to populate `rankMerchantsV2`'s
// `outgoingCatchmentTargetIds` parameter. `classifyRung` then admits
// any branch whose `localityId` matches the source itself OR appears
// in the returned list, classifying it at the CATCHMENT rung.
//
// Pure read. Synchronous shape (returns Promise but doesn't mutate
// anything). Reuses the existing `@@index([sourceLocalityId])` on
// `LocalityCatchmentEdge`.
//
// See:
//   docs/superpowers/specs/2026-05-13-plan-4-location-model-uk-enrichment-design.md §5.1 (CATCHMENT rung)
//   docs/superpowers/plans/2026-05-13-plan-4-location-model-uk-enrichment.md  Task M3.2

import type { PrismaClient } from '../../../generated/prisma/client'

export async function getOutgoingCatchmentTargetIds(
  prisma: PrismaClient,
  sourceLocalityId: string,
): Promise<readonly string[]> {
  const edges = await prisma.localityCatchmentEdge.findMany({
    where: { sourceLocalityId },
    select: { targetLocalityId: true, rank: true },
    orderBy: { rank: 'asc' },
  })
  return edges.map(e => e.targetLocalityId)
}
