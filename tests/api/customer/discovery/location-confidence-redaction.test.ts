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
})
