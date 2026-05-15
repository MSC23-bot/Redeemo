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
})

afterAll(async () => {
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
})
