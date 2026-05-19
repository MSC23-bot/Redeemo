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

  // PR #112 fixup-6.3 (2026-05-20) — owner regression pin.
  //
  // Owner-flagged device-QA: searching `restaurant` from Huddersfield
  // returned Pino's Pizzeria + The Coffee House but NOT Covelum
  // Restaurant.  Root cause: the original fallback gate was
  // `rankedTiles.length === 0`; when Pino's ranked into NEARBY,
  // rankedTiles=1, the fallback skipped, and Covelum (classified
  // COUNTRY > REGION maxRung) disappeared entirely.
  //
  // Fix relaxes the gate so the fallback runs whenever q is non-empty
  // AND effLoc is resolved.  This pin asserts that contract: a query
  // with BOTH a ranking branch (in some other fixture) AND a
  // text-match-dropped branch (this fixture's Covelum) must surface
  // BOTH.
  //
  // The Covelum fixture sits at lat=54.5, lng=5.0 (North Sea) with all
  // locality fields null → classifyRung returns NATIONAL > maxRung
  // REGION → dropped.  Plus the dev DB contains Pino's Pizzeria
  // around Huddersfield, which DOES rank.  So for `q=COVELUM_NAME`
  // there are zero ranking branches (only Covelum matches the
  // predicate), but for a broader query like merchant-name substring
  // matching both fixtures, both must surface.
  //
  // We pin the specific case by querying for the fixture's prefixed
  // name (only matches Covelum) but adding an English-effLoc — Covelum
  // MUST still surface even though no broader matches rank, AND for the
  // owner case we just need the gate to be relaxed (covered by all
  // existing tests in this file post-fix).  This new test adds an
  // EXPLICIT pin for the "rankable matches but also dropped matches"
  // scenario by simulating a query against the dev DB's seeded
  // Restaurant subcategory — Pino's ranks NEARBY from Huddersfield,
  // Covelum branches at the fixture coords are dropped, and both
  // must appear when the fixture name AND Pino's both match.
  //
  // To avoid coupling to seed-data ordering, we use a more constrained
  // query that pins the contract directly: branches that match the
  // fixture name surface even WHEN a ranking branch for the same
  // merchant exists in another locality.  We create one EXTRA branch
  // for the same merchant at Huddersfield coords (will rank NEARBY)
  // and assert that the fixture's North-Sea branches still surface.
  it('relaxed gate: fixture branches surface EVEN WHEN another branch of the same merchant ranks NEARBY (PR #112 fixup-6.3)', async () => {
    // Add a 3rd branch right next to Huddersfield — this will rank NEARBY
    // for the upcoming searchBranches call with Huddersfield coords.
    const huddBranch = await prisma.branch.create({
      data: {
        merchantId:         MERCHANT_ID,
        name:               `${FIXTURE_PREFIX}Covelum-Huddersfield`,
        addressLine1:       '99 Test St',
        city:               'Huddersfield',
        postcode:           'HD1 1XX',
        country:            'GB',
        latitude:           53.6463, // Huddersfield centre
        longitude:          -1.7809,
        locationConfidence: 'MANUALLY_CONFIRMED',
        isActive:           true,
      },
    })

    try {
      const result = await searchBranches(prisma, {
        q:      COVELUM_NAME,
        lat:    53.6463, // Huddersfield
        lng:    -1.7809,
        limit:  20,
        offset: 0,
        userId: null,
      } as any)

      const covelumBranches = result.branches.filter(t => t.merchant.id === MERCHANT_ID)
      // BOTH the Huddersfield branch (rank NEARBY) AND the two North-Sea
      // fixture branches (text-match fallback) MUST surface.  Pre-fix,
      // the Huddersfield ranking branch satisfied rankedTiles.length>0
      // and the gate skipped the fallback, dropping branches A and B.
      const branchIds = new Set(covelumBranches.map(t => t.id))
      expect(branchIds.has(huddBranch.id)).toBe(true)
      expect(branchIds.has(BRANCH_A_ID)).toBe(true)
      expect(branchIds.has(BRANCH_B_ID)).toBe(true)
      expect(covelumBranches).toHaveLength(3)
    } finally {
      // Always clean up the extra fixture, even if assertions throw.
      await prisma.branch.delete({ where: { id: huddBranch.id } })
    }
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
