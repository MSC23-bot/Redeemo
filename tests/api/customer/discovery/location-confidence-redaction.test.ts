// tests/api/customer/discovery/location-confidence-redaction.test.ts
//
// Plan 4 M1 PR #81 review — Blocker 2 regression pin.
//
// Server-side enforcement that branches with locationConfidence !==
// 'MANUALLY_CONFIRMED' MUST NOT expose latitude / longitude in customer-
// facing discovery responses. Distance / map-bbox / nearest-branch
// derivations must also gate on this so the customer-app never sees an
// "exact" position computed from postcode-centroid coordinates.
//
// Validates against the dev DB (Neon test branch) so it catches real
// schema/serialization drift the unit-level Prisma mocks would miss.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../../src/api/app'
import { getCustomerMerchant, getCustomerMerchantBranches } from '../../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// Existing seeded fixtures:
//   - tax-branch-karaara-001 (Karaara, Huddersfield, MANUALLY_CONFIRMED)
//   - The Karaara merchant should expose its branch lat/lng.
// We additionally create a second branch on a transient test merchant set
// to POSTCODE_CENTROID and validate its lat/lng is NULL on the response.

const TEST_MERCHANT_ID = 'plan4-pr81-redaction-test-merchant'
const APPROX_BRANCH_ID = 'plan4-pr81-redaction-test-branch-approximate'
const APPROX_BRANCH_POSTCODE_CENTROID_LAT = 53.6463
const APPROX_BRANCH_POSTCODE_CENTROID_LNG = -1.7809

// Task 1.11 — BranchTile redaction pins (Discovery Rebaseline Phase 1).
// Separate FIXTURE_PREFIX so the route-shape fixtures stay isolated from
// the long-standing service-layer fixtures above. FK-safe cleanup in the
// shared afterAll below.
const FIXTURE_PREFIX = 'rbl-1-11-'
const T11_MERCHANT_ID         = `${FIXTURE_PREFIX}merchant`
const T11_BRANCH_MC_ID        = `${FIXTURE_PREFIX}branch-mc`           // MANUALLY_CONFIRMED
const T11_BRANCH_PC_ID        = `${FIXTURE_PREFIX}branch-pc`           // POSTCODE_CENTROID
const T11_BRANCH_AG_ID        = `${FIXTURE_PREFIX}branch-ag`           // ADDRESS_GEOCODED
// Search-q token unique to the fixture so the search endpoint
// deterministically surfaces it (no collision with any seeded merchant).
const T11_SEARCH_Q = `${FIXTURE_PREFIX}Searchable`
// Tight bbox surrounding all three Task-1.11 fixture branches (Huddersfield
// area, mirrors the existing service-level pin coordinates).
const T11_BBOX = { minLat: 53.64, maxLat: 53.66, minLng: -1.79, maxLng: -1.77 }
const T11_GPS  = { lat: 53.65, lng: -1.78 }

let app: FastifyInstance

beforeAll(async () => {
  // Build a transient ACTIVE merchant + one POSTCODE_CENTROID branch we can
  // exercise the redaction against. Cleaned up in afterAll.
  await prisma.merchant.upsert({
    where: { id: TEST_MERCHANT_ID },
    create: {
      id: TEST_MERCHANT_ID,
      businessName: 'PR81 Redaction Test Merchant',
      tradingName: 'PR81 Redaction Test',
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus: 'SIGNED',
    },
    update: { status: 'ACTIVE' },
  })
  await prisma.branch.upsert({
    where: { id: APPROX_BRANCH_ID },
    create: {
      id: APPROX_BRANCH_ID,
      merchantId: TEST_MERCHANT_ID,
      name: 'PR81 Approximate Branch',
      isMainBranch: true,
      addressLine1: '1 Test St',
      city: 'Huddersfield',
      postcode: 'HD1 2PY',
      country: 'GB',
      latitude: APPROX_BRANCH_POSTCODE_CENTROID_LAT,
      longitude: APPROX_BRANCH_POSTCODE_CENTROID_LNG,
      isActive: true,
      // The critical setup — confidence is the schema default, NOT
      // MANUALLY_CONFIRMED.
      locationConfidence: 'POSTCODE_CENTROID',
    },
    update: {
      latitude: APPROX_BRANCH_POSTCODE_CENTROID_LAT,
      longitude: APPROX_BRANCH_POSTCODE_CENTROID_LNG,
      locationConfidence: 'POSTCODE_CENTROID',
      isActive: true,
    },
  })

  // ── Task 1.11 fixtures — three branches at three confidences on a
  // single transient merchant. The branch names embed T11_SEARCH_Q so
  // the `searchBranches` route deterministically surfaces them.
  // §BU pattern — warm the connection before fresh-per-test fixtures.
  await prisma.$queryRaw`SELECT 1`

  await prisma.merchant.upsert({
    where: { id: T11_MERCHANT_ID },
    create: {
      id:                 T11_MERCHANT_ID,
      businessName:       `${T11_SEARCH_Q} Merchant`,
      tradingName:        `${T11_SEARCH_Q} Merchant`,
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: {
      businessName: `${T11_SEARCH_Q} Merchant`,
      status:       'ACTIVE',
    },
  })

  // MANUALLY_CONFIRMED branch (positive case — surfaces with real coords).
  await prisma.branch.upsert({
    where: { id: T11_BRANCH_MC_ID },
    create: {
      id:                 T11_BRANCH_MC_ID,
      merchantId:         T11_MERCHANT_ID,
      name:               `${T11_SEARCH_Q} MC Branch`,
      isMainBranch:       true,
      addressLine1:       '1 Test St',
      city:               'Huddersfield',
      postcode:           'HD1 2PY',
      country:            'GB',
      latitude:           53.6463,
      longitude:          -1.7809,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
    },
    update: {
      latitude:           53.6463,
      longitude:          -1.7809,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
    },
  })

  // POSTCODE_CENTROID branch — surfaces in list views with null coords;
  // excluded from Map in-area.
  await prisma.branch.upsert({
    where: { id: T11_BRANCH_PC_ID },
    create: {
      id:                 T11_BRANCH_PC_ID,
      merchantId:         T11_MERCHANT_ID,
      name:               `${T11_SEARCH_Q} PC Branch`,
      isMainBranch:       false,
      addressLine1:       '2 Test St',
      city:               'Huddersfield',
      postcode:           'HD1 2PZ',
      country:            'GB',
      latitude:           53.6480,
      longitude:          -1.7820,
      isActive:           true,
      locationConfidence: 'POSTCODE_CENTROID',
    },
    update: {
      latitude:           53.6480,
      longitude:          -1.7820,
      isActive:           true,
      locationConfidence: 'POSTCODE_CENTROID',
    },
  })

  // ADDRESS_GEOCODED branch — list-view eligible but excluded from Map
  // in-area (the in-area predicate is MANUALLY_CONFIRMED-only per
  // service.ts:3124, mirroring spec §4.1.1 list-vs-map asymmetry).
  await prisma.branch.upsert({
    where: { id: T11_BRANCH_AG_ID },
    create: {
      id:                 T11_BRANCH_AG_ID,
      merchantId:         T11_MERCHANT_ID,
      name:               `${T11_SEARCH_Q} AG Branch`,
      isMainBranch:       false,
      addressLine1:       '3 Test St',
      city:               'Huddersfield',
      postcode:           'HD1 2QA',
      country:            'GB',
      latitude:           53.6500,
      longitude:          -1.7830,
      isActive:           true,
      locationConfidence: 'ADDRESS_GEOCODED',
    },
    update: {
      latitude:           53.6500,
      longitude:          -1.7830,
      isActive:           true,
      locationConfidence: 'ADDRESS_GEOCODED',
    },
  })

  // Build the Fastify app and decorate with our Prisma connection (§BU
  // pattern). `buildApp` skips the prisma plugin in test mode (app.ts:33),
  // so explicit decoration is the intended seam.
  app = await buildApp()
  app.decorate('prisma', prisma as any)
  app.decorate('redis', {
    get: async () => null,
    set: async () => 'OK',
    del: async () => 1,
  } as any)
  await app.ready()
}, 60_000)

afterAll(async () => {
  if (app) {
    await app.close()
  }
  // FK-safe cleanup: branches → merchants. Task 1.11 fixtures cleaned by
  // FIXTURE_PREFIX; PR #81 legacy fixtures cleaned by explicit id.
  await prisma.branch.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } })
  await prisma.merchant.deleteMany({ where: { id: { startsWith: FIXTURE_PREFIX } } })
  await prisma.branch.deleteMany({ where: { id: APPROX_BRANCH_ID } })
  await prisma.merchant.deleteMany({ where: { id: TEST_MERCHANT_ID } })
  await prisma.$disconnect()
})

describe('Branch locationConfidence redaction (PR #81 review B2)', () => {
  it('getCustomerMerchant: MANUALLY_CONFIRMED branch keeps its lat/lng', async () => {
    // Karaara is seeded as MANUALLY_CONFIRMED (M1.16 helper).
    const merchant = await getCustomerMerchant(prisma, 'tax-merchant-karaara-001', null, {})
    const branch = merchant.branches[0]
    expect(branch).toBeDefined()
    // Pin: actual numeric coords (not null) for a MANUALLY_CONFIRMED branch.
    expect(branch.latitude).toBe(53.6463)
    expect(branch.longitude).toBe(-1.7809)
    expect(branch.locationConfidence).toBe('MANUALLY_CONFIRMED')
  })

  it('getCustomerMerchant: POSTCODE_CENTROID branch has lat/lng redacted to null', async () => {
    const merchant = await getCustomerMerchant(prisma, TEST_MERCHANT_ID, null, {})
    const branch = merchant.branches.find((b) => b.id === APPROX_BRANCH_ID)
    expect(branch).toBeDefined()
    // The redaction contract:
    expect(branch!.latitude).toBeNull()
    expect(branch!.longitude).toBeNull()
    expect(branch!.locationConfidence).toBe('POSTCODE_CENTROID')
  })

  it('getCustomerMerchant: distance is null for an approximate selected branch even when user GPS is provided', async () => {
    // Caller provides GPS coords AND the approximate branch is the only one
    // available; distance MUST stay null because the branch's position can't
    // be trusted as exact.
    const merchant = await getCustomerMerchant(prisma, TEST_MERCHANT_ID, null, {
      lat: 53.65, lng: -1.78,
    })
    expect(merchant.selectedBranch?.distance).toBeNull()
  })

  it('getCustomerMerchant: MANUALLY_CONFIRMED branch surfaces a real distance', async () => {
    // Karaara coords: 53.6463, -1.7809. From (53.65, -1.78) ~ several
    // hundred metres. We don't pin the exact number (it depends on the
    // haversine formula), just that it's > 0 and not null.
    const merchant = await getCustomerMerchant(prisma, 'tax-merchant-karaara-001', null, {
      lat: 53.65, lng: -1.78,
    })
    expect(merchant.selectedBranch?.distance).not.toBeNull()
    expect(merchant.selectedBranch?.distance).toBeGreaterThan(0)
  })

  it('getCustomerMerchantBranches: POSTCODE_CENTROID branch has lat/lng redacted to null', async () => {
    const branches = await getCustomerMerchantBranches(prisma, TEST_MERCHANT_ID)
    const branch = branches.find((b) => b.id === APPROX_BRANCH_ID)
    expect(branch).toBeDefined()
    expect(branch!.latitude).toBeNull()
    expect(branch!.longitude).toBeNull()
    expect(branch!.locationConfidence).toBe('POSTCODE_CENTROID')
  })

  it('getCustomerMerchantBranches: MANUALLY_CONFIRMED branch keeps its lat/lng', async () => {
    const branches = await getCustomerMerchantBranches(prisma, 'tax-merchant-karaara-001')
    const branch = branches[0]
    expect(branch).toBeDefined()
    expect(branch.latitude).toBe(53.6463)
    expect(branch.longitude).toBe(-1.7809)
    expect(branch.locationConfidence).toBe('MANUALLY_CONFIRMED')
  })

  // ─────────────────────────────────────────────────────────────────────────
  // PR #81 Codex re-review — gate the three tile / map / cold-open paths
  // that were missed in the first round of Blocker 2.
  // ─────────────────────────────────────────────────────────────────────────

  it('enrichMerchantTile: MANUALLY_CONFIRMED merchant in-area tile carries a real distance + nearestBranchId', async () => {
    // Karaara (MANUALLY_CONFIRMED) inside a bbox around Huddersfield.
    // enrichMerchantTile is invoked for every in-area match; this test
    // pins the positive case (the gate doesn't break confirmed branches
    // — tile.distance + nearestBranchId are populated as expected).
    //
    // The negative case (POSTCODE_CENTROID merchant excluded entirely
    // from the bbox via merchantHasBranchInBbox) is pinned by the
    // separate "Map bbox in-area query" test below.
    const { getInAreaMerchants } = await import('../../../../src/api/customer/discovery/service')
    const result = await getInAreaMerchants(prisma, {
      bbox: { minLat: 53.60, maxLat: 53.70, minLng: -1.85, maxLng: -1.75 },
      lat: 53.65, lng: -1.78,
      userId: null,
      limit: 50,
    })
    const tile = result.merchants.find((m: { id: string }) => m.id === 'tax-merchant-karaara-001') as
      | { distance: number | null; nearestBranchId: string | null }
      | undefined
    expect(tile).toBeDefined()
    expect(tile!.distance).not.toBeNull()
    expect(tile!.distance).toBeGreaterThan(0)
    expect(tile!.nearestBranchId).toBe('tax-branch-karaara-001')
  })

  it('selectedBranch GPS-ranking on cold-open is NOT influenced by approximate coords', async () => {
    // Test merchant has one POSTCODE_CENTROID branch. Cold-open with user
    // GPS coords near that branch's postcode centroid would historically
    // pick it via GPS-rank — but since we null out approximate branch
    // coords before the resolver, the resolver falls back to mainBranch /
    // oldest. With only one branch, mainBranch is always picked. The
    // selectedBranch.distance stays null (gated by hasExactPosition).
    const merchant = await getCustomerMerchant(prisma, TEST_MERCHANT_ID, null, {
      lat: 53.65, lng: -1.78,
    })
    expect(merchant.selectedBranch?.id).toBe(APPROX_BRANCH_ID)   // mainBranch fallback
    expect(merchant.selectedBranch?.distance).toBeNull()         // gated
    expect(merchant.selectedBranch?.latitude).toBeNull()         // redacted
    expect(merchant.selectedBranch?.longitude).toBeNull()        // redacted
  })

  it('Map bbox in-area query: POSTCODE_CENTROID branch is NOT matched even when its postcode-centroid is inside the bbox', async () => {
    const { getInAreaMerchants } = await import('../../../../src/api/customer/discovery/service')
    // Tight bbox around the transient test branch's coordinates
    // (53.6463, -1.7809). Pre-fix, this would match the merchant via the
    // approximate coords. Post-fix, the merchant must NOT appear because
    // its only branch is POSTCODE_CENTROID.
    const bbox = { minLat: 53.64, maxLat: 53.66, minLng: -1.79, maxLng: -1.77 }
    const result = await getInAreaMerchants(prisma, {
      bbox,
      lat: 53.65, lng: -1.78,
      userId: null,
      limit: 50,
    })
    const found = result.merchants.find((m: { id: string }) => m.id === TEST_MERCHANT_ID)
    expect(found).toBeUndefined()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Map tile coordinates (so MapPins can render).
  //
  // The tile serializer (`enrichMerchantTile`) must expose nearest-branch
  // `latitude` + `longitude` on the tile root so the customer-app's
  // `MapPins` component can render markers. The redaction rule still
  // applies: only MANUALLY_CONFIRMED branches surface coordinates;
  // POSTCODE_CENTROID / NEEDS_REVIEW / ADDRESS_GEOCODED stay null.
  // ─────────────────────────────────────────────────────────────────────────

  it('tile coordinates: MANUALLY_CONFIRMED merchant tile (in-area) exposes nearest-branch latitude + longitude', async () => {
    const { getInAreaMerchants } = await import('../../../../src/api/customer/discovery/service')
    const result = await getInAreaMerchants(prisma, {
      bbox: { minLat: 53.60, maxLat: 53.70, minLng: -1.85, maxLng: -1.75 },
      lat: 53.65, lng: -1.78,
      userId: null,
      limit: 50,
    })
    const tile = result.merchants.find((m: { id: string }) => m.id === 'tax-merchant-karaara-001') as
      | { latitude: number | null; longitude: number | null; nearestBranchId: string | null }
      | undefined
    expect(tile).toBeDefined()
    // Karaara branch seed coords (MANUALLY_CONFIRMED) — same numbers the
    // existing branch-level redaction test pins.
    expect(tile!.latitude).toBe(53.6463)
    expect(tile!.longitude).toBe(-1.7809)
    expect(tile!.nearestBranchId).toBe('tax-branch-karaara-001')
  })

  it('tile coordinates: POSTCODE_CENTROID merchant tile (search route) has latitude + longitude both null', async () => {
    // The transient test merchant (set up in beforeAll) has one
    // POSTCODE_CENTROID branch and is excluded from in-area bbox matches
    // by design — see the prior pin. searchMerchants does NOT exclude it,
    // so we use that route to verify the redaction at the tile boundary.
    const { searchMerchants } = await import('../../../../src/api/customer/discovery/service')
    const result = await searchMerchants(prisma, {
      q: 'PR81 Redaction',
      limit: 50,
      offset: 0,
      userId: null,
    })
    const tile = result.merchants.find((m: { id: string }) => m.id === TEST_MERCHANT_ID) as
      | { latitude: number | null; longitude: number | null; nearestBranchId: string | null }
      | undefined
    expect(tile).toBeDefined()
    // Redaction at the tile boundary: even though the branch row has
    // numeric lat/lng in the DB, the tile must surface null because the
    // confidence is not MANUALLY_CONFIRMED.
    expect(tile!.latitude).toBeNull()
    expect(tile!.longitude).toBeNull()
    // nearestBranchId is also null because hasExactPosition gates the
    // server-side nearest-branch loop. Both signals collapse together.
    expect(tile!.nearestBranchId).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // §AX — Map GPS-less sessions still show pins.
  //
  // When a Map session has a valid bbox but no caller GPS lat/lng (user
  // skipped location permission, or no §AU override), the in-area route
  // must still resolve a nearest-branch + tile coordinates so MapPins
  // can render. Fallback: use the bbox centre as the location context
  // for selecting the nearest MANUALLY_CONFIRMED branch. Redaction
  // contract unchanged — only MANUALLY_CONFIRMED branches emit
  // coordinates.
  // ─────────────────────────────────────────────────────────────────────────

  it('§AX: in-area without caller GPS — MANUALLY_CONFIRMED merchant tile carries real lat/lng (bbox-centre fallback)', async () => {
    const { getInAreaMerchants } = await import('../../../../src/api/customer/discovery/service')
    // Same bbox as the existing GPS-present in-area Karaara pin, but
    // intentionally omit lat/lng so the GPS-less code path runs.
    const result = await getInAreaMerchants(prisma, {
      bbox: { minLat: 53.60, maxLat: 53.70, minLng: -1.85, maxLng: -1.75 },
      userId: null,
      limit: 50,
    })
    const tile = result.merchants.find((m: { id: string }) => m.id === 'tax-merchant-karaara-001') as
      | { latitude: number | null; longitude: number | null; nearestBranchId: string | null }
      | undefined
    expect(tile).toBeDefined()
    expect(tile!.latitude).toBe(53.6463)
    expect(tile!.longitude).toBe(-1.7809)
    expect(tile!.nearestBranchId).toBe('tax-branch-karaara-001')
  })

  it('§AX: in-area without caller GPS — POSTCODE_CENTROID merchant stays excluded (no tile, not even with null coords)', async () => {
    const { getInAreaMerchants } = await import('../../../../src/api/customer/discovery/service')
    // Same tight bbox the existing PR #81 pin uses, but with no caller
    // GPS. POSTCODE_CENTROID merchants are excluded by
    // merchantHasBranchInBbox regardless of caller GPS, so the bbox-
    // centre fallback does not regress the redaction.
    const result = await getInAreaMerchants(prisma, {
      bbox: { minLat: 53.64, maxLat: 53.66, minLng: -1.79, maxLng: -1.77 },
      userId: null,
      limit: 50,
    })
    const found = result.merchants.find((m: { id: string }) => m.id === TEST_MERCHANT_ID)
    expect(found).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Task 1.11 — PR #81 redaction across the new `BranchTile` shape (Phase 1).
//
// Spec: docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md §4.1.1.
// PR #81 (Plan 4 M1) locked the rule: only `MANUALLY_CONFIRMED` branches
// expose exact `latitude` / `longitude`. POSTCODE_CENTROID / NEEDS_REVIEW /
// ADDRESS_GEOCODED redact to `branchLatitude: null` + `branchLongitude: null`
// on the wire. Spec §4.1.1 then layers the list-vs-map asymmetry on top:
//
//   * LIST views (Search / Home / Category / Campaign): admit all confidences
//     EXCEPT NEEDS_REVIEW — POSTCODE_CENTROID + ADDRESS_GEOCODED still surface
//     as tiles, just with null coordinates.
//   * MAP `in-area`: MANUALLY_CONFIRMED ONLY — POSTCODE_CENTROID and
//     ADDRESS_GEOCODED are EXCLUDED from the response entirely so an
//     approximate-coord pin never appears on the map.
//
// These pins exercise the route layer (`app.inject`) so the full Phase 1
// branch-tile pipeline — service fetch → `enrichBranchTile` → wire — is
// covered end-to-end on the `branches` arm of each of the four affected
// routes.
// ─────────────────────────────────────────────────────────────────────────────

describe('PR #81 redaction — BranchTile (Phase 1)', () => {
  it('search route: POSTCODE_CENTROID branch tile surfaces with null lat/lng + confidence label', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=${encodeURIComponent(T11_SEARCH_Q)}`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      branches: Array<{
        id: string
        branchLatitude: number | null
        branchLongitude: number | null
        branchLocationConfidence: string
      }>
    }
    const tile = body.branches.find((b) => b.id === T11_BRANCH_PC_ID)
    expect(tile).toBeDefined()
    expect(tile!.branchLatitude).toBeNull()
    expect(tile!.branchLongitude).toBeNull()
    expect(tile!.branchLocationConfidence).toBe('POSTCODE_CENTROID')
  }, 30_000)

  it('search route: POSTCODE_CENTROID branch IS admitted to list views (§4.1.1 list admission)', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=${encodeURIComponent(T11_SEARCH_Q)}`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { branches: Array<{ id: string }> }
    // Pin: the POSTCODE_CENTROID branch appears as its own tile (not
    // excluded). The list-view admission is what gives the customer
    // a clickable card even though the map pin would be unsafe.
    const ids = body.branches.map((b) => b.id)
    expect(ids).toContain(T11_BRANCH_PC_ID)
  }, 30_000)

  it('in-area route: POSTCODE_CENTROID branch is EXCLUDED from Map bbox (§4.1.1 list-vs-map asymmetry)', async () => {
    // Bbox surrounds the POSTCODE_CENTROID branch's stored coords. The
    // MANUALLY_CONFIRMED-only predicate in `getInAreaBranches`
    // (service.ts:3124) must keep it OUT of the `branches` arm.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/discovery/in-area?minLat=${T11_BBOX.minLat}&maxLat=${T11_BBOX.maxLat}&minLng=${T11_BBOX.minLng}&maxLng=${T11_BBOX.maxLng}&lat=${T11_GPS.lat}&lng=${T11_GPS.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { branches: Array<{ id: string }> }
    const ids = body.branches.map((b) => b.id)
    expect(ids).not.toContain(T11_BRANCH_PC_ID)
  }, 30_000)

  it('in-area route: ADDRESS_GEOCODED branch is EXCLUDED from Map bbox (PR #81 redaction lock)', async () => {
    // ADDRESS_GEOCODED is geocoded but not human-verified — same exclusion
    // as POSTCODE_CENTROID per the in-area predicate. The list-vs-map
    // asymmetry holds: ADDRESS_GEOCODED surfaces in list views with null
    // coords but never lands a Map pin.
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/discovery/in-area?minLat=${T11_BBOX.minLat}&maxLat=${T11_BBOX.maxLat}&minLng=${T11_BBOX.minLng}&maxLng=${T11_BBOX.maxLng}&lat=${T11_GPS.lat}&lng=${T11_GPS.lng}`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { branches: Array<{ id: string }> }
    const ids = body.branches.map((b) => b.id)
    expect(ids).not.toContain(T11_BRANCH_AG_ID)
  }, 30_000)

  it('MANUALLY_CONFIRMED branch surfaces with REAL lat/lng on BOTH search AND in-area (positive sanity pin)', async () => {
    // Search route — list view, MANUALLY_CONFIRMED branch carries real coords.
    const searchRes = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=${encodeURIComponent(T11_SEARCH_Q)}`,
    })
    expect(searchRes.statusCode).toBe(200)
    const searchBody = searchRes.json() as {
      branches: Array<{
        id: string
        branchLatitude: number | null
        branchLongitude: number | null
        branchLocationConfidence: string
      }>
    }
    const searchTile = searchBody.branches.find((b) => b.id === T11_BRANCH_MC_ID)
    expect(searchTile).toBeDefined()
    expect(searchTile!.branchLatitude).toBe(53.6463)
    expect(searchTile!.branchLongitude).toBe(-1.7809)
    expect(searchTile!.branchLocationConfidence).toBe('MANUALLY_CONFIRMED')

    // In-area route — Map view, MANUALLY_CONFIRMED is the ONLY confidence
    // admitted, so the same branch shows up with the same real coords.
    const inAreaRes = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/discovery/in-area?minLat=${T11_BBOX.minLat}&maxLat=${T11_BBOX.maxLat}&minLng=${T11_BBOX.minLng}&maxLng=${T11_BBOX.maxLng}&lat=${T11_GPS.lat}&lng=${T11_GPS.lng}`,
    })
    expect(inAreaRes.statusCode).toBe(200)
    const inAreaBody = inAreaRes.json() as {
      branches: Array<{
        id: string
        branchLatitude: number | null
        branchLongitude: number | null
        branchLocationConfidence: string
      }>
    }
    const inAreaTile = inAreaBody.branches.find((b) => b.id === T11_BRANCH_MC_ID)
    expect(inAreaTile).toBeDefined()
    expect(inAreaTile!.branchLatitude).toBe(53.6463)
    expect(inAreaTile!.branchLongitude).toBe(-1.7809)
    expect(inAreaTile!.branchLocationConfidence).toBe('MANUALLY_CONFIRMED')
  }, 30_000)
})
