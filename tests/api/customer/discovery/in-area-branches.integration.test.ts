// tests/api/customer/discovery/in-area-branches.test.ts
//
// Discovery Rebaseline Phase 1 Task 1.6 — `getInAreaBranches` service.
// Spec: docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md §4.1.1.
//
// Pins (locked):
//   1. MANUALLY_CONFIRMED branches inside the bbox surface as tiles.
//   2. POSTCODE_CENTROID branches inside the bbox are EXCLUDED (PR #81 +
//      §4.1.1 list-vs-map asymmetry).
//   3. ADDRESS_GEOCODED branches inside the bbox are EXCLUDED (Map requires
//      exact coords; the merchant-variant of searchBranches accepts them in
//      its rankable half, but Map does NOT).
//   4. Branches outside the bbox are excluded.
//   5. Inactive branches inside the bbox are excluded.
//
// Real-DB integration pattern (consistent with branch-tile-contract.test.ts
// and search-branches.test.ts). FIXTURE_PREFIX = `rbl-1-6-` so afterAll
// cleanup is deterministic and the suite is bounded to its own fixtures.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getInAreaBranches } from '../../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const FIXTURE_PREFIX = 'rbl-1-6-'

const COVELUM_ID            = `${FIXTURE_PREFIX}covelum-merchant`
const COVELUM_BRIGHT_ID     = `${FIXTURE_PREFIX}covelum-brightlingsea`
const COVELUM_COLCH_ID      = `${FIXTURE_PREFIX}covelum-colchester`
const MIXED_MERCHANT_ID     = `${FIXTURE_PREFIX}mixed-merchant`
const MIXED_MC_BRANCH_ID    = `${FIXTURE_PREFIX}mixed-mc-branch`
const MIXED_PC_BRANCH_ID    = `${FIXTURE_PREFIX}mixed-pc-branch`
const MIXED_AG_BRANCH_ID    = `${FIXTURE_PREFIX}mixed-ag-branch`
const FAR_MERCHANT_ID       = `${FIXTURE_PREFIX}far-merchant`
const FAR_BRANCH_ID         = `${FIXTURE_PREFIX}far-branch`
const INACTIVE_MERCHANT_ID  = `${FIXTURE_PREFIX}inactive-merchant`
const INACTIVE_BRANCH_ID    = `${FIXTURE_PREFIX}inactive-branch`

// Reference coordinates (real-world UK localities).
// Brightlingsea + Colchester are ~10km apart, both well inside the BBOX below.
const BRIGHTLINGSEA = { lat: 51.81, lng: 1.02 }
const COLCHESTER    = { lat: 51.89, lng: 0.90 }
const LONDON        = { lat: 51.5074, lng: -0.1278 } // outside Essex bbox

// A bbox covering greater-Essex (Brightlingsea + Colchester are inside;
// London is outside).
const ESSEX_BBOX = {
  minLat: 51.70,
  maxLat: 52.00,
  minLng: 0.70,
  maxLng: 1.30,
}

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

async function createMixedConfidenceFixture() {
  // A merchant with three branches at the SAME coordinate inside the bbox,
  // but each with a different `locationConfidence`. Pins that the bbox
  // predicate excludes both POSTCODE_CENTROID and ADDRESS_GEOCODED even
  // though their raw coords lie inside the bbox.
  await prisma.merchant.upsert({
    where: { id: MIXED_MERCHANT_ID },
    create: {
      id:                 MIXED_MERCHANT_ID,
      businessName:       `${FIXTURE_PREFIX}MixedConfidence Co`,
      tradingName:        `${FIXTURE_PREFIX}MixedConfidence Co`,
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: { status: 'ACTIVE' },
  })

  for (const [branchId, confidence] of [
    [MIXED_MC_BRANCH_ID, 'MANUALLY_CONFIRMED'],
    [MIXED_PC_BRANCH_ID, 'POSTCODE_CENTROID'],
    [MIXED_AG_BRANCH_ID, 'ADDRESS_GEOCODED'],
  ] as const) {
    await prisma.branch.upsert({
      where: { id: branchId },
      create: {
        id:                 branchId,
        merchantId:         MIXED_MERCHANT_ID,
        name:               `${FIXTURE_PREFIX}MixedConfidence Co — ${confidence}`,
        isMainBranch:       branchId === MIXED_MC_BRANCH_ID,
        addressLine1:       '2 Test St',
        city:               'Colchester',
        postcode:           'CO2 1AA',
        country:            'GB',
        latitude:           COLCHESTER.lat,
        longitude:          COLCHESTER.lng,
        isActive:           true,
        locationConfidence: confidence,
        localityName:       'Colchester',
      },
      update: {
        merchantId:         MIXED_MERCHANT_ID,
        latitude:           COLCHESTER.lat,
        longitude:          COLCHESTER.lng,
        isActive:           true,
        locationConfidence: confidence,
        localityName:       'Colchester',
      },
    })
  }
}

async function createFarFixture() {
  // A MANUALLY_CONFIRMED branch in London — outside the Essex bbox. Pins
  // that the bbox predicate excludes branches whose coords lie outside.
  await prisma.merchant.upsert({
    where: { id: FAR_MERCHANT_ID },
    create: {
      id:                 FAR_MERCHANT_ID,
      businessName:       `${FIXTURE_PREFIX}London Far Cafe`,
      tradingName:        `${FIXTURE_PREFIX}London Far Cafe`,
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: { status: 'ACTIVE' },
  })
  await prisma.branch.upsert({
    where: { id: FAR_BRANCH_ID },
    create: {
      id:                 FAR_BRANCH_ID,
      merchantId:         FAR_MERCHANT_ID,
      name:               `${FIXTURE_PREFIX}London Far Cafe — Central`,
      isMainBranch:       true,
      addressLine1:       '3 Test St',
      city:               'London',
      postcode:           'EC1A 1AA',
      country:            'GB',
      latitude:           LONDON.lat,
      longitude:          LONDON.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       'London',
    },
    update: {
      merchantId:         FAR_MERCHANT_ID,
      latitude:           LONDON.lat,
      longitude:          LONDON.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       'London',
    },
  })
}

async function createInactiveFixture() {
  // An INACTIVE MANUALLY_CONFIRMED branch inside the bbox. Pins that
  // isActive=false branches do NOT surface.
  await prisma.merchant.upsert({
    where: { id: INACTIVE_MERCHANT_ID },
    create: {
      id:                 INACTIVE_MERCHANT_ID,
      businessName:       `${FIXTURE_PREFIX}Inactive Branch Co`,
      tradingName:        `${FIXTURE_PREFIX}Inactive Branch Co`,
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: { status: 'ACTIVE' },
  })
  await prisma.branch.upsert({
    where: { id: INACTIVE_BRANCH_ID },
    create: {
      id:                 INACTIVE_BRANCH_ID,
      merchantId:         INACTIVE_MERCHANT_ID,
      name:               `${FIXTURE_PREFIX}Inactive Branch Co — Brightlingsea`,
      isMainBranch:       true,
      addressLine1:       '4 Test St',
      city:               'Brightlingsea',
      postcode:           'CO7 1AA',
      country:            'GB',
      latitude:           BRIGHTLINGSEA.lat,
      longitude:          BRIGHTLINGSEA.lng,
      isActive:           false,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       'Brightlingsea',
    },
    update: {
      merchantId:         INACTIVE_MERCHANT_ID,
      latitude:           BRIGHTLINGSEA.lat,
      longitude:          BRIGHTLINGSEA.lng,
      isActive:           false,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       'Brightlingsea',
    },
  })
}

beforeAll(async () => {
  // Warm up the connection (§BU pattern).
  await prisma.$queryRaw`SELECT 1`
  await createCovelumFixture()
  await createMixedConfidenceFixture()
  await createFarFixture()
  await createInactiveFixture()
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

describe('Discovery Rebaseline Phase 1 — getInAreaBranches', () => {
  it('MANUALLY_CONFIRMED branches inside the bbox emit one tile per branch', async () => {
    const result = await getInAreaBranches(prisma, {
      bbox:   ESSEX_BBOX,
      userId: null,
      // Use Colchester as the user position so distance is meaningful.
      lat:    COLCHESTER.lat,
      lng:    COLCHESTER.lng,
      limit:  100,
    })

    const ids = new Set(result.branches.map(t => t.id))
    // Both Covelum branches must surface.
    expect(ids.has(COVELUM_BRIGHT_ID)).toBe(true)
    expect(ids.has(COVELUM_COLCH_ID)).toBe(true)

    // Both are independent branch tiles for the same merchant.
    const covelumTiles = result.branches.filter(t => t.merchant.id === COVELUM_ID)
    expect(covelumTiles).toHaveLength(2)
  })

  it('POSTCODE_CENTROID branches inside the bbox are EXCLUDED (PR #81 redaction + §4.1.1 asymmetry)', async () => {
    const result = await getInAreaBranches(prisma, {
      bbox:   ESSEX_BBOX,
      userId: null,
      lat:    COLCHESTER.lat,
      lng:    COLCHESTER.lng,
      limit:  100,
    })

    const ids = new Set(result.branches.map(t => t.id))
    // The MANUALLY_CONFIRMED branch of MixedConfidence Co surfaces.
    expect(ids.has(MIXED_MC_BRANCH_ID)).toBe(true)
    // The POSTCODE_CENTROID sibling at the same coords does NOT.
    expect(ids.has(MIXED_PC_BRANCH_ID)).toBe(false)
  })

  it('ADDRESS_GEOCODED branches inside the bbox are EXCLUDED (Map requires exact coords)', async () => {
    const result = await getInAreaBranches(prisma, {
      bbox:   ESSEX_BBOX,
      userId: null,
      lat:    COLCHESTER.lat,
      lng:    COLCHESTER.lng,
      limit:  100,
    })

    const ids = new Set(result.branches.map(t => t.id))
    // The ADDRESS_GEOCODED sibling at the same coords as the MC branch does
    // NOT surface — unlike searchBranches which would include it in the
    // rankable half, Map gates strictly on MANUALLY_CONFIRMED.
    expect(ids.has(MIXED_AG_BRANCH_ID)).toBe(false)
  })

  it('branches OUTSIDE the bbox are excluded', async () => {
    const result = await getInAreaBranches(prisma, {
      bbox:   ESSEX_BBOX,
      userId: null,
      lat:    COLCHESTER.lat,
      lng:    COLCHESTER.lng,
      limit:  100,
    })

    const ids = new Set(result.branches.map(t => t.id))
    // London Far Cafe (MANUALLY_CONFIRMED, but coordinates outside the
    // Essex bbox) MUST NOT surface.
    expect(ids.has(FAR_BRANCH_ID)).toBe(false)
  })

  it('inactive branches are excluded even when MANUALLY_CONFIRMED and inside the bbox', async () => {
    const result = await getInAreaBranches(prisma, {
      bbox:   ESSEX_BBOX,
      userId: null,
      lat:    COLCHESTER.lat,
      lng:    COLCHESTER.lng,
      limit:  100,
    })

    const ids = new Set(result.branches.map(t => t.id))
    // The INACTIVE branch is MANUALLY_CONFIRMED and inside the bbox, but
    // isActive=false → must NOT surface.
    expect(ids.has(INACTIVE_BRANCH_ID)).toBe(false)
  })
})
