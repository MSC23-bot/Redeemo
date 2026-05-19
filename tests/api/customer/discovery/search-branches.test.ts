// tests/api/customer/discovery/search-branches.test.ts
//
// Discovery Rebaseline Phase 1 Task 1.5 — `searchBranches` service.
// Spec: docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md §3.
//
// Pins:
//   1. Multi-branch (load-bearing — closes Covelum / Brightlingsea bug at the
//      service layer). A free-text query matching a multi-branch merchant
//      surfaces ALL of that merchant's matching branches as independent tiles.
//   2. Branch-level identity matches (branch.name / localityName / postTown)
//      surface tiles even when the merchant text doesn't match.
//   3. POSTCODE_CENTROID branches appear in list output (Spec §4.1.1) with
//      null supplyRung / proximityBand / coords / distance.
//   4. totalBranches reflects post-filter branch count (not merchant count).
//   5. Pagination unit is the branch tile.
//
// Real-DB integration pattern (consistent with branch-tile-contract.test.ts).
// FIXTURE_PREFIX = `rbl-1-5-` so afterAll cleanup is deterministic.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { searchBranches } from '../../../../src/api/customer/discovery/service'
import { branchTileSchema } from '../../../../src/api/customer/discovery/branchTileSchema'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const FIXTURE_PREFIX = 'rbl-1-5-'

const COVELUM_ID            = `${FIXTURE_PREFIX}covelum-merchant`
const COVELUM_BRIGHT_ID     = `${FIXTURE_PREFIX}covelum-brightlingsea`
const COVELUM_COLCH_ID      = `${FIXTURE_PREFIX}covelum-colchester`
const SOLO_ID               = `${FIXTURE_PREFIX}solo-merchant`
const SOLO_BRANCH_ID        = `${FIXTURE_PREFIX}solo-branch`
const PC_MERCHANT_ID        = `${FIXTURE_PREFIX}pc-merchant`
const PC_BRANCH_ID          = `${FIXTURE_PREFIX}pc-branch`
const PAGINATION_MERCHANT_ID = `${FIXTURE_PREFIX}pag-merchant`

// Reference coordinates (real-world UK localities, all MANUALLY_CONFIRMED).
const BRIGHTLINGSEA = { lat: 51.81, lng: 1.02 }
const COLCHESTER    = { lat: 51.89, lng: 0.90 }
const HUDDERSFIELD  = { lat: 53.6463, lng: -1.7809 }
const LONDON        = { lat: 51.5074, lng: -0.1278 }

async function createCovelumFixture() {
  await prisma.merchant.upsert({
    where: { id: COVELUM_ID },
    create: {
      id:                 COVELUM_ID,
      businessName:       `${FIXTURE_PREFIX}Covelum`,
      tradingName:        `${FIXTURE_PREFIX}Covelum`,
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: { businessName: `${FIXTURE_PREFIX}Covelum`, status: 'ACTIVE' },
  })

  for (const [branchId, coords, locality] of [
    [COVELUM_BRIGHT_ID, BRIGHTLINGSEA, 'Brightlingsea'],
    [COVELUM_COLCH_ID,  COLCHESTER,    'Colchester'],
  ] as const) {
    await prisma.branch.upsert({
      where: { id: branchId },
      create: {
        id:                 branchId,
        merchantId:         COVELUM_ID,
        name:               `${FIXTURE_PREFIX}Covelum — ${locality}`,
        isMainBranch:       branchId === COVELUM_BRIGHT_ID,
        addressLine1:       '1 Test St',
        city:               locality,
        postcode:           'CO1 1AA',
        country:            'GB',
        latitude:           coords.lat,
        longitude:          coords.lng,
        isActive:           true,
        locationConfidence: 'MANUALLY_CONFIRMED',
        localityName:       locality,
      },
      update: {
        merchantId:         COVELUM_ID,
        name:               `${FIXTURE_PREFIX}Covelum — ${locality}`,
        city:               locality,
        latitude:           coords.lat,
        longitude:          coords.lng,
        isActive:           true,
        locationConfidence: 'MANUALLY_CONFIRMED',
        localityName:       locality,
      },
    })
  }
}

// A test-only unique locality token. Real DB has many "Brightlingsea" rows
// from leftover test fixtures; using a prefixed locality keeps the
// branch-identity test deterministic and bounded to fixtures THIS suite
// created.
const TEST_LOCALITY = `${FIXTURE_PREFIX}TestLocality`

async function createSoloFixture() {
  // Single-branch merchant where the merchant business name does NOT match
  // TEST_LOCALITY but the branch localityName DOES. Used to pin that
  // branch-level identity matches surface tiles.
  await prisma.merchant.upsert({
    where: { id: SOLO_ID },
    create: {
      id:                 SOLO_ID,
      businessName:       `${FIXTURE_PREFIX}Solo Cafe`,
      tradingName:        `${FIXTURE_PREFIX}Solo Cafe`,
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: { businessName: `${FIXTURE_PREFIX}Solo Cafe`, status: 'ACTIVE' },
  })
  await prisma.branch.upsert({
    where: { id: SOLO_BRANCH_ID },
    create: {
      id:                 SOLO_BRANCH_ID,
      merchantId:         SOLO_ID,
      name:               `${FIXTURE_PREFIX}Solo Cafe — ${TEST_LOCALITY}`,
      isMainBranch:       true,
      addressLine1:       '2 Test St',
      city:               TEST_LOCALITY,
      postcode:           'CO7 1AA',
      country:            'GB',
      latitude:           BRIGHTLINGSEA.lat,
      longitude:          BRIGHTLINGSEA.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       TEST_LOCALITY,
    },
    update: {
      merchantId:         SOLO_ID,
      city:               TEST_LOCALITY,
      latitude:           BRIGHTLINGSEA.lat,
      longitude:          BRIGHTLINGSEA.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       TEST_LOCALITY,
    },
  })
}

async function createPostcodeCentroidFixture() {
  await prisma.merchant.upsert({
    where: { id: PC_MERCHANT_ID },
    create: {
      id:                 PC_MERCHANT_ID,
      businessName:       `${FIXTURE_PREFIX}Covelum PC Variant`,
      tradingName:        `${FIXTURE_PREFIX}Covelum PC Variant`,
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: { status: 'ACTIVE' },
  })
  await prisma.branch.upsert({
    where: { id: PC_BRANCH_ID },
    create: {
      id:                 PC_BRANCH_ID,
      merchantId:         PC_MERCHANT_ID,
      name:               `${FIXTURE_PREFIX}Covelum PC Variant — Huddersfield`,
      isMainBranch:       true,
      addressLine1:       '1 Test St',
      city:               'Huddersfield',
      postcode:           'HD1 2PY',
      country:            'GB',
      latitude:           HUDDERSFIELD.lat,
      longitude:          HUDDERSFIELD.lng,
      isActive:           true,
      locationConfidence: 'POSTCODE_CENTROID',
      localityName:       'Huddersfield',
    },
    update: {
      merchantId:         PC_MERCHANT_ID,
      latitude:           HUDDERSFIELD.lat,
      longitude:          HUDDERSFIELD.lng,
      isActive:           true,
      locationConfidence: 'POSTCODE_CENTROID',
      localityName:       'Huddersfield',
    },
  })
}

async function createPaginationFixture() {
  await prisma.merchant.upsert({
    where: { id: PAGINATION_MERCHANT_ID },
    create: {
      id:                 PAGINATION_MERCHANT_ID,
      businessName:       `${FIXTURE_PREFIX}Pagination Tester`,
      tradingName:        `${FIXTURE_PREFIX}Pagination Tester`,
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: { businessName: `${FIXTURE_PREFIX}Pagination Tester`, status: 'ACTIVE' },
  })
  // 5 branches all in London — same locality, MANUALLY_CONFIRMED — to verify
  // pagination cuts. Spread the lat/lng slightly so they're not identical.
  for (let i = 0; i < 5; i++) {
    const branchId = `${FIXTURE_PREFIX}pag-branch-${i}`
    await prisma.branch.upsert({
      where: { id: branchId },
      create: {
        id:                 branchId,
        merchantId:         PAGINATION_MERCHANT_ID,
        name:               `${FIXTURE_PREFIX}Pagination Tester — Branch ${i}`,
        isMainBranch:       i === 0,
        addressLine1:       `${i} Test Ave`,
        city:               'London',
        postcode:           'EC1A 1AA',
        country:            'GB',
        latitude:           LONDON.lat + i * 0.001,
        longitude:          LONDON.lng + i * 0.001,
        isActive:           true,
        locationConfidence: 'MANUALLY_CONFIRMED',
        localityName:       'London',
      },
      update: {
        merchantId:         PAGINATION_MERCHANT_ID,
        latitude:           LONDON.lat + i * 0.001,
        longitude:          LONDON.lng + i * 0.001,
        isActive:           true,
        locationConfidence: 'MANUALLY_CONFIRMED',
        localityName:       'London',
      },
    })
  }
}

beforeAll(async () => {
  // Warm up the connection (§BU pattern).
  await prisma.$queryRaw`SELECT 1`
  await createCovelumFixture()
  await createSoloFixture()
  await createPostcodeCentroidFixture()
  await createPaginationFixture()
})

afterAll(async () => {
  // Delete branches before merchants (FK ordering).
  await prisma.branch.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.merchant.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.$disconnect()
})

describe('Discovery Rebaseline Phase 1 — searchBranches', () => {
  it('q="Covelum" returns BOTH Covelum branches (closes Covelum bug at service layer)', async () => {
    const result = await searchBranches(prisma, {
      q:      `${FIXTURE_PREFIX}Covelum`,
      limit:  20,
      offset: 0,
      userId: null,
    })

    const covelumTiles = result.branches.filter(t => t.merchant.id === COVELUM_ID)
    expect(covelumTiles).toHaveLength(2)
    const branchIds = covelumTiles.map(t => t.id).sort()
    expect(branchIds).toEqual([COVELUM_BRIGHT_ID, COVELUM_COLCH_ID].sort())

    // Both tiles MUST schema-validate.
    for (const tile of covelumTiles) {
      const parsed = branchTileSchema.safeParse(tile)
      if (!parsed.success) {
        throw new Error(`BranchTile schema rejected tile ${tile.id}: ${JSON.stringify(parsed.error.issues, null, 2)}`)
      }
    }
  })

  it('branch-level identity match surfaces tiles when only branch.name / localityName / postTown contains the query (Spec §3.1)', async () => {
    // Solo Cafe's merchant.businessName is "rbl-1-5-Solo Cafe" — does NOT
    // contain TEST_LOCALITY. Its branch row's name + localityName + city
    // all contain TEST_LOCALITY. The branch-level OR-clause must surface
    // this tile.
    const result = await searchBranches(prisma, {
      q:      TEST_LOCALITY,
      limit:  20,
      offset: 0,
      userId: null,
    })

    const hitIds = new Set(result.branches.map(t => t.id))
    // Branch surfaces via branch-identity match alone — merchant name
    // doesn't contain the query.
    expect(hitIds.has(SOLO_BRANCH_ID)).toBe(true)
    // Covelum's branches don't contain TEST_LOCALITY in branch.name or
    // localityName, so they MUST NOT surface — proves the predicate is
    // per-branch, not whole-merchant ORing.
    expect(hitIds.has(COVELUM_BRIGHT_ID)).toBe(false)
    expect(hitIds.has(COVELUM_COLCH_ID)).toBe(false)
  })

  it('POSTCODE_CENTROID branches appear in list output with null rung/coords/distance', async () => {
    const result = await searchBranches(prisma, {
      q:      `${FIXTURE_PREFIX}Covelum PC Variant`,
      limit:  20,
      offset: 0,
      userId: null,
    })

    // The PC variant fixture's merchant.businessName matches — its only
    // branch is POSTCODE_CENTROID, so it MUST surface in the tail.
    const tile = result.branches.find(t => t.id === PC_BRANCH_ID)
    expect(tile).toBeDefined()
    if (!tile) return // narrow for TS

    expect(tile.supplyRung).toBeNull()
    expect(tile.proximityBand).toBeNull()
    expect(tile.distance).toBeNull()
    expect(tile.distanceMetres).toBeNull()
    expect(tile.branchLatitude).toBeNull()
    expect(tile.branchLongitude).toBeNull()
    expect(tile.branchLocationConfidence).toBe('POSTCODE_CENTROID')
  })

  it('totalBranches reflects post-filter branch count (not merchant count)', async () => {
    // Pagination Tester has 5 branches, all matching "Pagination Tester".
    const result = await searchBranches(prisma, {
      q:      `${FIXTURE_PREFIX}Pagination Tester`,
      limit:  20,
      offset: 0,
      userId: null,
    })

    const pagTiles = result.branches.filter(t => t.merchant.id === PAGINATION_MERCHANT_ID)
    expect(pagTiles).toHaveLength(5)
    // totalBranches reflects the entire matching set. With limit=20 (>5)
    // the page returns all of them, so totalBranches === page length here.
    // Other suite fixtures (Covelum / Solo / PC variant) don't match
    // "Pagination Tester", so totalBranches should equal exactly 5.
    expect(result.totalBranches).toBe(5)
  })

  it('pagination unit is the branch tile (limit cuts at branch level)', async () => {
    // Same query but limit 2 — first page returns 2 tiles, totalBranches
    // still reports the full matching set.
    const page1 = await searchBranches(prisma, {
      q:      `${FIXTURE_PREFIX}Pagination Tester`,
      limit:  2,
      offset: 0,
      userId: null,
    })
    expect(page1.branches).toHaveLength(2)
    expect(page1.totalBranches).toBe(5)

    const page2 = await searchBranches(prisma, {
      q:      `${FIXTURE_PREFIX}Pagination Tester`,
      limit:  2,
      offset: 2,
      userId: null,
    })
    expect(page2.branches).toHaveLength(2)
    expect(page2.totalBranches).toBe(5)

    const page3 = await searchBranches(prisma, {
      q:      `${FIXTURE_PREFIX}Pagination Tester`,
      limit:  2,
      offset: 4,
      userId: null,
    })
    expect(page3.branches).toHaveLength(1)
    expect(page3.totalBranches).toBe(5)

    // Page contents must not overlap.
    const seen = new Set<string>()
    for (const t of [...page1.branches, ...page2.branches, ...page3.branches]) {
      expect(seen.has(t.id)).toBe(false)
      seen.add(t.id)
    }
    expect(seen.size).toBe(5)
  })

  it('throws SEARCH_QUERY_REQUIRED when no bounded predicate supplied', async () => {
    await expect(
      searchBranches(prisma, { limit: 20, offset: 0, userId: null }),
    ).rejects.toThrow('SEARCH_QUERY_REQUIRED')
  })
})
