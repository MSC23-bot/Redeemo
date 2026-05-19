import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { searchBranches } from '../../../../src/api/customer/discovery/service'

/**
 * PR-2 device-QA blocker (owner observation 2026-05-19): typing "Covelum"
 * on device returns "No merchant found".  Root cause hypothesis (owner-
 * supplied): `searchBranches` runs candidates through `rankBranchesV3`,
 * which drops branches whose `classifyRung` result exceeds the ladder
 * profile's `maxRung`.  For `MIXED_NORMAL @ URBAN` density (the default
 * when no `categoryId` is supplied), `maxRung = REGION`.  Branches that
 * classify as NATIONAL (e.g. UK-resident merchants when the caller's
 * `effLoc` is in another UK region or outside the UK) get silently
 * dropped at the maxRung gate.
 *
 * The legacy `searchMerchants` path does NOT have this problem — it
 * uses 3-tier `SupplyTier` (NEARBY / CITY / DISTANT) with DISTANT as the
 * catch-all.  `resolveScopeForRanking`'s cascade adds DISTANT when
 * NEARBY+CITY have zero supply, so direct text matches always surface.
 *
 * `searchBranches`'s scope cascade can't help: `rungCounts` reflects
 * only branches that survived the `rankBranchesV3` gate, so the cascade
 * has nothing to retain when the gate dropped everything.
 *
 * SPEC RATIONALE: a user searching a specific merchant name expects to
 * find that merchant regardless of ladder/scope.  Direct text matches
 * MUST surface even if rank/scope rejected them.  Browsing without a
 * text query (category-only / bbox-only) keeps the strict rung gate —
 * users browsing want curation, not exhaustive lists.
 *
 * Fix shape (owner-suggested):
 *   - Keep ranked branches first.
 *   - When `q` is non-empty AND `effLoc` is resolved, append rankable
 *     branches NOT in `rankedTiles` (i.e. dropped by the rank gate or
 *     the scope filter) as a deterministic "text-match fallback" tail.
 *     `supplyRung: null, proximityBand: null, distance: null` mirrors
 *     Spec §4.1.1 list-view admission semantics.
 *   - Preserve POSTCODE_CENTROID / NEEDS_REVIEW tail unchanged.
 *   - Do NOT loosen Map bbox behaviour (that's `getInAreaBranches`).
 *
 * This test pins the contract: `q="Covelum"` MUST return Covelum
 * branches in `branches[]` even when those branches classify above the
 * ladder maxRung.
 */

const FIXTURE_PREFIX = 'rbl-textmatch-'
const COVELUM_NAME   = `${FIXTURE_PREFIX}Covelum`
const BRANCH_A_NAME  = `${FIXTURE_PREFIX}Covelum-A`
const BRANCH_B_NAME  = `${FIXTURE_PREFIX}Covelum-B`

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

let MERCHANT_ID: string
let BRANCH_A_ID: string
let BRANCH_B_ID: string

beforeAll(async () => {
  // §BU pattern — warm up Neon connection before the fixture create.
  await prisma.$queryRaw`SELECT 1`

  // Two MANUALLY_CONFIRMED branches with locality fields set such that
  // classifyRung against a UK English `effLoc` walks all the way to
  // NATIONAL (no localityId / postTown / lad / county / region /
  // locationCountry match).  NATIONAL > REGION (the MIXED_NORMAL @
  // URBAN maxRung) → rankBranchesV3 drops them at line 703 of
  // ranking.ts.  Coordinates put them outside the NEARBY radius from
  // any English effLoc, so the NEARBY rung doesn't catch them either.
  const merchant = await prisma.merchant.create({
    data: {
      businessName: COVELUM_NAME,
      status:       'ACTIVE',
      branches: {
        create: [
          {
            name:               BRANCH_A_NAME,
            addressLine1:       '1 Test St',
            city:               'TestCity-A',
            postcode:           'XX1 1XX',
            country:            'GB',
            latitude:           54.500, // North Sea — disjoint from UK locality seed
            longitude:          5.000,
            locationConfidence: 'MANUALLY_CONFIRMED',
            isActive:           true,
            // All locality fields NULL → classifyRung walks past every
            // rung until NATIONAL.
            localityId:         null,
            postTown:           null,
            ladDistrict:        null,
            adminCounty:        null,
            region:             null,
            locationCountry:    null,
          },
          {
            name:               BRANCH_B_NAME,
            addressLine1:       '2 Test St',
            city:               'TestCity-B',
            postcode:           'XX1 2XX',
            country:            'GB',
            latitude:           54.500,
            longitude:          5.010,
            locationConfidence: 'MANUALLY_CONFIRMED',
            isActive:           true,
            localityId:         null,
            postTown:           null,
            ladDistrict:        null,
            adminCounty:        null,
            region:             null,
            locationCountry:    null,
          },
        ],
      },
    },
    include: { branches: { orderBy: { name: 'asc' } } },
  })

  MERCHANT_ID = merchant.id
  BRANCH_A_ID = merchant.branches[0].id
  BRANCH_B_ID = merchant.branches[1].id
}, 30_000)

afterAll(async () => {
  await prisma.branch.deleteMany({ where: { name: { startsWith: FIXTURE_PREFIX } } })
  await prisma.merchant.deleteMany({ where: { businessName: { startsWith: FIXTURE_PREFIX } } })
  await prisma.$disconnect()
}, 30_000)

describe('searchBranches — direct text match fallback (PR-2 device-QA blocker fix)', () => {
  it('q=COVELUM with English effLoc returns BOTH Covelum branches (LOAD-BEARING)', async () => {
    // London effLoc — resolves to an English locality.  Covelum branches
    // (no locality / postTown / etc.) classify as NATIONAL.  MIXED_NORMAL
    // @ URBAN maxRung = REGION.  Without the fix, rankBranchesV3 drops
    // both branches and `branches[]` returns empty.
    const result = await searchBranches(prisma, {
      q:      COVELUM_NAME,
      lat:    51.5,   // London
      lng:    -0.1,
      limit:  20,
      offset: 0,
      userId: null,
    } as any)

    const covelumBranches = result.branches.filter(t => t.merchant.id === MERCHANT_ID)

    // The load-bearing pin: BOTH Covelum branches MUST surface.
    expect(covelumBranches).toHaveLength(2)
    const branchIds = new Set(covelumBranches.map(t => t.id))
    expect(branchIds.has(BRANCH_A_ID)).toBe(true)
    expect(branchIds.has(BRANCH_B_ID)).toBe(true)

    // The fallback tail tiles MUST carry merchant identity intact.
    for (const tile of covelumBranches) {
      expect(tile.merchant.businessName).toBe(COVELUM_NAME)
    }
  })

  it('q=COVELUM with non-UK effLoc (Doha) returns BOTH Covelum branches', async () => {
    // Doha QA effLoc — likely resolves to null OR to a non-UK fallback.
    // Either way, the Covelum branches MUST still surface for direct
    // text match.
    const result = await searchBranches(prisma, {
      q:      COVELUM_NAME,
      lat:    25.276,
      lng:    51.520,
      limit:  20,
      offset: 0,
      userId: null,
    } as any)

    const covelumBranches = result.branches.filter(t => t.merchant.id === MERCHANT_ID)
    expect(covelumBranches.length).toBeGreaterThanOrEqual(2)
  })

  it('q=COVELUM with NO lat/lng (effLoc null) returns BOTH branches via existing fallback path', async () => {
    // This case already works on main (effLoc null → ranking skipped →
    // all candidates flow through tail).  Pinning so a future refactor
    // can't break it.
    const result = await searchBranches(prisma, {
      q:      COVELUM_NAME,
      limit:  20,
      offset: 0,
      userId: null,
    } as any)

    const covelumBranches = result.branches.filter(t => t.merchant.id === MERCHANT_ID)
    expect(covelumBranches.length).toBeGreaterThanOrEqual(2)
  })

  it('Empty q (category-only / bbox-only) keeps the strict rung gate — no text-match fallback fires', async () => {
    // Category-only queries are browsing, not direct search.  The user
    // hasn't asked for a specific merchant — strict rung gate keeps
    // curation clean.  This test pins that the fallback path only fires
    // for non-empty `q`.
    //
    // Note: this test relies on `SEARCH_QUERY_REQUIRED` validation
    // throwing when q + categoryId + subcategoryId + bbox are all
    // empty — so we use a wide bbox to force a non-throw path.
    //
    // The pin is structural: empty `q` MUST NOT pull the text-match
    // fallback into play (otherwise category-only queries silently
    // widen to UK-wide).
    //
    // We assert by checking that the fixture Covelum branches do NOT
    // surface in a London bbox query (they're at lat=54.5, lng=5.0 —
    // way outside any reasonable London bbox).
    const result = await searchBranches(prisma, {
      q:      undefined,
      minLat: 51.0, maxLat: 52.0, minLng: -0.5, maxLng: 0.5,
      lat:    51.5, lng: -0.1,
      limit:  20,
      offset: 0,
      userId: null,
    } as any)

    const covelumBranches = result.branches.filter(t => t.merchant.id === MERCHANT_ID)
    expect(covelumBranches).toHaveLength(0)
  })
})
