// prisma/seed-data/markets.ts
//
// Owner-curated active Markets for Plan 4a rollout.
//
// Initial scope (M1.15, 2026-05-14): Huddersfield Market only.
// Other UK Localities default to marketId = null (organic / no curated Market).
//
// Schema notes (Market model, committed M1.2):
// - anchorLocalityId is UNIQUE — one anchor per Market, one Market per anchor.
// - includedLocalities is the m:1 inverse of Locality.marketId; we set
//   marketId on each member Locality after the Market upsert.
// - status enum: ACTIVE / PAUSED / RETIRED. M1.15 ships Huddersfield ACTIVE.
//
// Owner-locked design decision for the two-Huddersfield cross-LAD split:
// `huddersfield` (Kirklees LAD, CITY) is the canonical anchor. The slug-
// uniquifier (M1.12) split off `huddersfield-calderdale` (Calderdale LAD, CITY)
// for postcode-overlap rows in the Calderdale BUA boundary. We INCLUDE
// huddersfield-calderdale as a Market member (not as a second anchor —
// anchorLocalityId is @unique) so Market-level routing treats both slugs as
// one place. No catchment-edge curation needed for huddersfield-calderdale;
// the heuristic already routes Calderdale small Localities to it directly.

import type { PrismaClient } from '../../generated/prisma/client'

type MarketSeed = {
  slug: string
  name: string
  anchorLocalitySlug: string
  status: 'ACTIVE' | 'PAUSED' | 'RETIRED'
  ladDistrict: string | null
  adminCounty: string | null
  region: string | null
  country: string
  targetMerchantCount: number | null
  launchedAt: Date | null
  notes: string | null
  memberLocalitySlugs: string[]
}

const MARKETS: MarketSeed[] = [
  {
    slug: 'huddersfield',
    name: 'Huddersfield',
    anchorLocalitySlug: 'huddersfield',
    status: 'ACTIVE',
    ladDistrict: 'Kirklees',
    adminCounty: 'West Yorkshire',
    region: 'Yorkshire and the Humber',
    country: 'England',
    targetMerchantCount: 50,
    launchedAt: null,
    notes:
      'Plan 4a first curated rollout market. Includes canonical Huddersfield, ' +
      'cross-LAD Huddersfield-Calderdale shadow, owner-approved Kirklees catchment ' +
      'localities, and Honley as a commercial member.',
    // Owner-approved 24 members (M1.15, 2026-05-14):
    memberLocalitySlugs: [
      // Anchor:
      'huddersfield',
      // Cross-LAD shadow (Calderdale-LAD postcode overlap of the same physical town):
      'huddersfield-calderdale',
      // 21 owner-approved Kirklees-LAD catchment sources from M1.14:
      'netherton-kirklees',
      'kirkheaton',
      'lepton',
      'linthwaite-and-slaithwaite',
      'kirkburton',
      'meltham',
      'colne-valley',
      'grange-moor',
      'upperthong',
      'shepley-and-shelley',
      'holmfirth',
      'marsden',
      'holme-valley',
      'scholes-near-holmfirth',
      'holmbridge',
      'flockton',
      'upper-cumberworth',
      'emley',
      'denby-dale',
      'skelmanthorpe-and-clayton-west',
      'upper-denby',
      // Honley — TOWN-tier neighbour, included as a Market member only (not a
      // catchment source; M1.13's heuristic requires source-tier <= SMALL_TOWN).
      'honley',
    ],
  },
]

export async function seedMarkets(prisma: PrismaClient): Promise<void> {
  for (const m of MARKETS) {
    const anchor = await prisma.locality.findUnique({ where: { slug: m.anchorLocalitySlug } })
    if (!anchor) {
      throw new Error(`Market anchor locality not found: ${m.anchorLocalitySlug}`)
    }

    const market = await prisma.market.upsert({
      where: { slug: m.slug },
      create: {
        slug: m.slug,
        name: m.name,
        status: m.status,
        anchorLocalityId: anchor.id,
        ladDistrict: m.ladDistrict,
        adminCounty: m.adminCounty,
        region: m.region,
        country: m.country,
        targetMerchantCount: m.targetMerchantCount,
        launchedAt: m.launchedAt,
        notes: m.notes,
      },
      update: {
        name: m.name,
        status: m.status,
        anchorLocalityId: anchor.id,
        ladDistrict: m.ladDistrict,
        adminCounty: m.adminCounty,
        region: m.region,
        country: m.country,
        targetMerchantCount: m.targetMerchantCount,
        launchedAt: m.launchedAt,
        notes: m.notes,
      },
    })

    let memberSet = 0
    let memberSkipped = 0
    let memberMissing = 0
    for (const memberSlug of m.memberLocalitySlugs) {
      const member = await prisma.locality.findUnique({
        where: { slug: memberSlug },
        select: { id: true, marketId: true },
      })
      if (!member) {
        console.warn(`[market member] locality not found: ${memberSlug}`)
        memberMissing++
        continue
      }
      if (member.marketId === market.id) {
        memberSkipped++
        continue
      }
      await prisma.locality.update({
        where: { id: member.id },
        data: { marketId: market.id },
      })
      memberSet++
    }
    console.log(`Market ${m.slug}: ${memberSet} members set, ${memberSkipped} already set, ${memberMissing} missing`)
  }
}
