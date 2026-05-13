// prisma/seed-data/catchmentOverrides.ts
//
// Owner-curated catchment overrides for active rollout Markets.
//
// Format: source-locality slug → ordered array of natural-centre locality slugs.
// Each entry writes a LocalityCatchmentEdge with isCurated = true at rank = index+1.
//
// Curated edges sit alongside the heuristic edges (isCurated = false) in the same
// table. Discovery code differentiates via isCurated: curated overrides take
// precedence when present.
//
// Owner-approved for Huddersfield Market launch (2026-05-14, Plan 4 M1.14):
// 21 Kirklees-LAD small-tier Localities within ~10 mi of Huddersfield that already
// heuristic-point at Huddersfield. Curating them locks in Huddersfield as the
// natural centre for its real catchment, surviving any future heuristic algorithm
// changes.
//
// Cross-LAD overlap note: the slug-uniquifier (M1.12) split Huddersfield into two
// Localities — `huddersfield` (Kirklees LAD, the canonical/anchor) and
// `huddersfield-calderdale` (Calderdale LAD, the postcode-overlap shadow). The
// curated edges below ALL point at `huddersfield` (the primary anchor). M1.15
// Huddersfield Market assigns BOTH huddersfield slugs to the Market entity so
// downstream Market-level routing treats them as one place — no second curated
// edge needed per source.
//
// Calderdale-LAD small Localities (outlane, ripponden, sowerby-bridge, etc.) are
// NOT curated in M1.14 — they heuristic-point at `huddersfield-calderdale`
// already, which the Market entity claims separately in M1.15.

import type { PrismaClient } from '../../generated/prisma/client'

const CURATED: Record<string, string[]> = {
  // Owner-approved 21 Kirklees-LAD small-tier Localities (M1.14, 2026-05-14).
  // All point to the canonical 'huddersfield' (Kirklees LAD, CITY) as rank-1
  // natural centre.
  'netherton-kirklees':             ['huddersfield'],
  'kirkheaton':                     ['huddersfield'],
  'lepton':                         ['huddersfield'],
  'linthwaite-and-slaithwaite':     ['huddersfield'],
  'kirkburton':                     ['huddersfield'],
  'meltham':                        ['huddersfield'],
  'colne-valley':                   ['huddersfield'],
  'grange-moor':                    ['huddersfield'],
  'upperthong':                     ['huddersfield'],
  'shepley-and-shelley':            ['huddersfield'],
  'holmfirth':                      ['huddersfield'],
  'marsden':                        ['huddersfield'],
  'holme-valley':                   ['huddersfield'],
  'scholes-near-holmfirth':         ['huddersfield'],
  'holmbridge':                     ['huddersfield'],
  'flockton':                       ['huddersfield'],
  'upper-cumberworth':              ['huddersfield'],
  'emley':                          ['huddersfield'],
  'denby-dale':                     ['huddersfield'],
  'skelmanthorpe-and-clayton-west': ['huddersfield'],
  'upper-denby':                    ['huddersfield'],
}

export async function seedCuratedCatchmentEdges(prisma: PrismaClient): Promise<void> {
  let inserted = 0
  let updated = 0
  let missing = 0

  for (const [sourceSlug, targetSlugs] of Object.entries(CURATED)) {
    const source = await prisma.locality.findUnique({ where: { slug: sourceSlug } })
    if (!source) {
      console.warn(`[catchment override] source locality not found: ${sourceSlug}`)
      missing++
      continue
    }
    for (let i = 0; i < targetSlugs.length; i++) {
      const targetSlug = targetSlugs[i]
      const target = await prisma.locality.findUnique({ where: { slug: targetSlug } })
      if (!target) {
        console.warn(`[catchment override] target locality not found: ${targetSlug}`)
        missing++
        continue
      }
      // Explicit findUnique → update | create instead of upsert + timestamp heuristic.
      // LocalityCatchmentEdge has no updatedAt field, so the plan's literal code
      // (result.createdAt.getTime() === result.updatedAt.getTime()) crashes on
      // undefined.getTime(). This branch tracks new-vs-updated correctly and
      // promotes any heuristic edge (isCurated=false) for the same (source, target)
      // pair to a curated edge (isCurated=true, owner-approved rank).
      const existing = await prisma.localityCatchmentEdge.findUnique({
        where: {
          sourceLocalityId_targetLocalityId: {
            sourceLocalityId: source.id,
            targetLocalityId: target.id,
          },
        },
      })
      if (existing) {
        await prisma.localityCatchmentEdge.update({
          where: { id: existing.id },
          data: { rank: i + 1, isCurated: true },
        })
        updated++
      } else {
        await prisma.localityCatchmentEdge.create({
          data: {
            sourceLocalityId: source.id,
            targetLocalityId: target.id,
            rank: i + 1,
            isCurated: true,
          },
        })
        inserted++
      }
    }
  }
  console.log(`Curated catchment edges: ${inserted} new, ${updated} updated, ${missing} missing`)
}
