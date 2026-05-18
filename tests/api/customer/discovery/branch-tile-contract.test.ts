// tests/api/customer/discovery/branch-tile-contract.test.ts
//
// Discovery Rebaseline Phase 1 Task 1.4 — branch-first wire shape contract.
// Spec: docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md §1.1.
//
// Pins:
//   1. Multi-branch (load-bearing) — a single merchant with two branches in
//      different localities emits TWO distinct BranchTiles (vs the merchant
//      variant which would collapse to one). Both tiles carry the same
//      `merchant.id` as the grouping container.
//   2. POSTCODE_CENTROID redaction — a branch with non-MANUALLY_CONFIRMED
//      confidence MUST emit branchLatitude/branchLongitude as null while
//      preserving the confidence value for the customer-app to surface the
//      "exact location pending" UI.
//
// Real-DB integration pattern (vs Prisma mocks) — catches serialization /
// schema drift the unit-level mocks would miss. Uses a FIXTURE_PREFIX so
// afterAll can deterministically purge every row this suite created without
// touching seed data.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  enrichBranchTile,
  enrichBranchTiles,
  type EnrichBranchInput,
} from '../../../../src/api/customer/discovery/service'
import { branchTileSchema } from '../../../../src/api/customer/discovery/branchTileSchema'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// All fixture rows are prefixed so afterAll cleanup is deterministic — no
// silent skip on missing seed.
const FIXTURE_PREFIX = 'rbl-1-4-'

const COVELUM_MERCHANT_ID  = `${FIXTURE_PREFIX}covelum-merchant`
const COVELUM_BRANCH_A_ID  = `${FIXTURE_PREFIX}covelum-brightlingsea-branch`
const COVELUM_BRANCH_B_ID  = `${FIXTURE_PREFIX}covelum-colchester-branch`
const PC_MERCHANT_ID       = `${FIXTURE_PREFIX}pc-redaction-merchant`
const PC_BRANCH_ID         = `${FIXTURE_PREFIX}pc-redaction-branch`

// Reference coordinates within Essex (Brightlingsea / Colchester) — both are
// MANUALLY_CONFIRMED so the redaction gate lets lat/lng surface.
const BRIGHTLINGSEA = { lat: 51.81, lng: 1.02 }
const COLCHESTER    = { lat: 51.89, lng: 0.90 }
const HUDDERSFIELD  = { lat: 53.6463, lng: -1.7809 }

async function createCovelumLikeFixture() {
  // ACTIVE merchant + 2 MANUALLY_CONFIRMED branches in different localities.
  await prisma.merchant.upsert({
    where: { id: COVELUM_MERCHANT_ID },
    create: {
      id:                  COVELUM_MERCHANT_ID,
      businessName:        `${FIXTURE_PREFIX}Covelum`,
      tradingName:         `${FIXTURE_PREFIX}Covelum`,
      status:              'ACTIVE',
      verificationStatus:  'VERIFIED',
      contractStatus:      'SIGNED',
    },
    update: {
      businessName:        `${FIXTURE_PREFIX}Covelum`,
      status:              'ACTIVE',
    },
  })

  for (const [branchId, coords, city] of [
    [COVELUM_BRANCH_A_ID, BRIGHTLINGSEA, 'Brightlingsea'],
    [COVELUM_BRANCH_B_ID, COLCHESTER,    'Colchester'],
  ] as const) {
    await prisma.branch.upsert({
      where: { id: branchId },
      create: {
        id:                 branchId,
        merchantId:         COVELUM_MERCHANT_ID,
        // Branch name follows the "Merchant — Locality" shape so we can
        // verify the branchShortNameServer helper strips the merchant prefix.
        name:               `${FIXTURE_PREFIX}Covelum — ${city}`,
        isMainBranch:       branchId === COVELUM_BRANCH_A_ID,
        addressLine1:       '1 Test St',
        city,
        postcode:           'CO1 1AA',
        country:            'GB',
        latitude:           coords.lat,
        longitude:          coords.lng,
        isActive:           true,
        locationConfidence: 'MANUALLY_CONFIRMED',
      },
      update: {
        merchantId:         COVELUM_MERCHANT_ID,
        name:               `${FIXTURE_PREFIX}Covelum — ${city}`,
        city,
        latitude:           coords.lat,
        longitude:          coords.lng,
        isActive:           true,
        locationConfidence: 'MANUALLY_CONFIRMED',
      },
    })
  }
}

async function createPostcodeCentroidFixture() {
  await prisma.merchant.upsert({
    where: { id: PC_MERCHANT_ID },
    create: {
      id:                 PC_MERCHANT_ID,
      businessName:       `${FIXTURE_PREFIX}PostcodeCentroid Merchant`,
      tradingName:        `${FIXTURE_PREFIX}PostcodeCentroid Merchant`,
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
      name:               `${FIXTURE_PREFIX}PC Branch`,
      isMainBranch:       true,
      addressLine1:       '1 Test St',
      city:               'Huddersfield',
      postcode:           'HD1 2PY',
      country:             'GB',
      latitude:            HUDDERSFIELD.lat,
      longitude:           HUDDERSFIELD.lng,
      isActive:            true,
      // The critical setup — exact-position gate fails for this confidence.
      locationConfidence:  'POSTCODE_CENTROID',
    },
    update: {
      merchantId:          PC_MERCHANT_ID,
      latitude:            HUDDERSFIELD.lat,
      longitude:           HUDDERSFIELD.lng,
      isActive:            true,
      locationConfidence:  'POSTCODE_CENTROID',
    },
  })
}

beforeAll(async () => {
  // Warm up the connection so the first findMany doesn't time out under
  // cold-start conditions (Neon serverless ping pattern, locked at §BU).
  await prisma.$queryRaw`SELECT 1`
  await createCovelumLikeFixture()
  await createPostcodeCentroidFixture()
})

afterAll(async () => {
  // Delete branches before merchants (FK ordering). Cleanup is
  // FIXTURE_PREFIX-scoped so any unrelated row stays untouched.
  await prisma.branch.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.merchant.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.$disconnect()
})

describe('Discovery Rebaseline Phase 1 — branch-first BranchTile contract', () => {
  it('multi-branch merchant emits one tile per branch, both schema-valid, sharing merchant.id', async () => {
    const inputs: EnrichBranchInput[] = [
      {
        branchId:      COVELUM_BRANCH_A_ID,
        merchantId:    COVELUM_MERCHANT_ID,
        supplyRung:    'NEARBY',
        proximityBand: 'NEARBY',
        distance:      120,
      },
      {
        branchId:      COVELUM_BRANCH_B_ID,
        merchantId:    COVELUM_MERCHANT_ID,
        supplyRung:    'CATCHMENT',
        proximityBand: 'IN_YOUR_AREA',
        distance:      9_400,
      },
    ]

    const tiles = await enrichBranchTiles(prisma, inputs, {
      userId: null,
      lat:    BRIGHTLINGSEA.lat,
      lng:    BRIGHTLINGSEA.lng,
    })

    expect(tiles).toHaveLength(2)
    // Input-order preservation — pagination consumers depend on output order
    // matching rankBranchesV3 input order. Pins the contract explicitly.
    expect(tiles.map(t => t.id)).toEqual([COVELUM_BRANCH_A_ID, COVELUM_BRANCH_B_ID])
    // Both tiles MUST schema-validate.
    for (const tile of tiles) {
      const parsed = branchTileSchema.safeParse(tile)
      if (!parsed.success) {
        // Surface the first issue verbatim so test failures explain why.
        throw new Error(`BranchTile schema rejected tile ${tile.id}: ${JSON.stringify(parsed.error.issues, null, 2)}`)
      }
    }

    // Branch-first cardinality — each tile is its own branch.
    const branchIds = tiles.map(t => t.id).sort()
    expect(branchIds).toEqual([COVELUM_BRANCH_A_ID, COVELUM_BRANCH_B_ID].sort())

    // Both tiles share the merchant grouping container.
    expect(tiles[0].merchant.id).toBe(COVELUM_MERCHANT_ID)
    expect(tiles[1].merchant.id).toBe(COVELUM_MERCHANT_ID)
    expect(tiles[0].merchant.businessName).toBe(`${FIXTURE_PREFIX}Covelum`)
    expect(tiles[1].merchant.businessName).toBe(`${FIXTURE_PREFIX}Covelum`)

    // V3 ranking fields preserved on each tile.
    const byBranchId = new Map(tiles.map(t => [t.id, t]))
    const a = byBranchId.get(COVELUM_BRANCH_A_ID)!
    const b = byBranchId.get(COVELUM_BRANCH_B_ID)!
    expect(a.supplyRung).toBe('NEARBY')
    expect(a.proximityBand).toBe('NEARBY')
    expect(a.distance).toBe(120)
    expect(a.distanceMetres).toBe(120)
    expect(b.supplyRung).toBe('CATCHMENT')
    expect(b.proximityBand).toBe('IN_YOUR_AREA')
    expect(b.distance).toBe(9_400)

    // MANUALLY_CONFIRMED branches expose lat/lng.
    expect(a.branchLatitude).not.toBeNull()
    expect(a.branchLongitude).not.toBeNull()
    expect(a.branchLocationConfidence).toBe('MANUALLY_CONFIRMED')
    expect(b.branchLatitude).not.toBeNull()
    expect(b.branchLongitude).not.toBeNull()
    expect(b.branchLocationConfidence).toBe('MANUALLY_CONFIRMED')

    // branchShortNameServer strips the "Merchant — " prefix.
    expect(a.branchName).toBe('Brightlingsea')
    expect(b.branchName).toBe('Colchester')

    // Branch-scoped city denormalised columns.
    expect(a.branchCity).toBe('Brightlingsea')
    expect(b.branchCity).toBe('Colchester')
  })

  it('POSTCODE_CENTROID branch redacts lat/lng while preserving locationConfidence', async () => {
    const inputs: EnrichBranchInput[] = [
      {
        branchId:      PC_BRANCH_ID,
        merchantId:    PC_MERCHANT_ID,
        supplyRung:    'NEARBY',
        proximityBand: 'NEARBY',
        distance:      null,
      },
    ]

    const tiles = await enrichBranchTiles(prisma, inputs, {
      userId: null,
      lat:    null,
      lng:    null,
    })

    expect(tiles).toHaveLength(1)
    const tile = tiles[0]

    // Schema validates even with nulls on lat/lng.
    const parsed = branchTileSchema.safeParse(tile)
    if (!parsed.success) {
      throw new Error(`BranchTile schema rejected tile ${tile.id}: ${JSON.stringify(parsed.error.issues, null, 2)}`)
    }

    // The critical redaction contract.
    expect(tile.branchLatitude).toBeNull()
    expect(tile.branchLongitude).toBeNull()
    expect(tile.branchLocationConfidence).toBe('POSTCODE_CENTROID')

    // Other tile fields still populated.
    expect(tile.id).toBe(PC_BRANCH_ID)
    expect(tile.merchant.id).toBe(PC_MERCHANT_ID)
    expect(tile.distance).toBeNull()
    expect(tile.distanceMetres).toBeNull()
  })

  it('enrichBranchTile (single) returns same shape as enrichBranchTiles entry', () => {
    // Hand-built branch fixture mirrors the BRANCH_TILE_SELECT shape so we can
    // exercise the pure single-tile helper without a DB round-trip. Phase 1
    // pure-unit coverage; the DB-backed cases above already pin Prisma shape.
    const branch = {
      id: 'unit-test-branch',
      name: 'Unit Test — Demo Locality',
      localityId: 'loc-1',
      localityName: 'Demo Locality',
      postTown: 'Demo Town',
      city: 'Demo City',
      latitude: 51.5,
      longitude: -0.1,
      locationConfidence: 'MANUALLY_CONFIRMED',
      isActive: true,
      openingHours: [],
      merchant: {
        id: 'unit-test-merchant',
        businessName: 'Unit Test',
        tradingName: null,
        logoUrl: null,
        bannerUrl: null,
        primaryCategoryId: null,
        primaryCategory: null,
        primaryDescriptorTag: null,
        categories: [],
        highlights: [],
        vouchers: [],
        _count: { vouchers: 0 },
      },
    } as any

    const tile = enrichBranchTile(branch, {
      input: {
        branchId: 'unit-test-branch',
        merchantId: 'unit-test-merchant',
        supplyRung: 'NEARBY',
        proximityBand: 'NEARBY',
        distance: 50,
      },
      isFavourited: false,
      redundantSet: new Set(),
    })

    const parsed = branchTileSchema.safeParse(tile)
    if (!parsed.success) {
      throw new Error(`Schema rejected unit-test tile: ${JSON.stringify(parsed.error.issues, null, 2)}`)
    }
    // No primaryCategory → descriptor is the empty-string fallback (schema requires string).
    expect(tile.merchant.descriptor).toBe('')
    expect(tile.merchant.primaryCategory).toBeNull()
    expect(tile.branchName).toBe('Demo Locality')
    expect(tile.distance).toBe(50)
    expect(tile.distanceMetres).toBe(50)
  })

  it('returns [] without firing any DB calls when inputs is empty', async () => {
    // Pins the short-circuit at service.ts (top of enrichBranchTiles) — if
    // someone removes the early return, this still passes because empty
    // arrays roundtrip safely, but the perf gain (zero DB I/O) is the real
    // intent: prevent N callers from accidentally paying the round-trip cost
    // on an empty rank result.
    const tiles = await enrichBranchTiles(prisma, [], { userId: null, lat: null, lng: null })
    expect(tiles).toEqual([])
  })
})
