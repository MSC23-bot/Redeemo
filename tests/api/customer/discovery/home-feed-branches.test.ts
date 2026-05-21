// tests/api/customer/discovery/home-feed-branches.test.ts
//
// Discovery Rebaseline Phase 1 Task 1.7 — `getHomeFeed` additive
// branch-themed fields.
//
// Spec: docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md
//       §1.5 (response shape) + §5.2 (Featured/Trending fan-out, interim).
//
// Pins (locked):
//   1. Response shape carries BOTH legacy merchant-themed fields AND the
//      new branch-themed fields. `campaigns` remains banner-level and
//      UNCHANGED.
//   2. A multi-branch Featured merchant fans out to multiple
//      `featuredBranches` tiles (one per active branch). LOAD-BEARING for
//      Spec §5.2 interim behaviour pre-FeaturedMerchant.branchId? migration.
//   3. `campaignBranches` MUST NOT exist on the home feed — campaigns are
//      banner-level (CampaignBannerTile[]), not a merchant/branch tile
//      list. Negative pin so a future task PR cannot accidentally add it.
//   4. Legacy `featured: MerchantTile[]` shape is preserved — its entries
//      are merchant-shaped (`id` is a merchantId; no `branchName` field).
//
// Real-DB integration pattern (mirrors in-area-branches.test.ts +
// search-branches.test.ts). FIXTURE_PREFIX = `rbl-1-7-` so afterAll
// cleanup is deterministic and bounded to this suite's fixtures.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getHomeFeed } from '../../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const FIXTURE_PREFIX = 'rbl-1-7-'

const MULTI_MERCHANT_ID    = `${FIXTURE_PREFIX}multi-merchant`
const MULTI_BRANCH_A_ID    = `${FIXTURE_PREFIX}multi-branch-a`
const MULTI_BRANCH_B_ID    = `${FIXTURE_PREFIX}multi-branch-b`
const FEATURED_ROW_ID      = `${FIXTURE_PREFIX}featured-row`
const VOUCHER_ONE_ID       = `${FIXTURE_PREFIX}voucher-1`
const VOUCHER_TWO_ID       = `${FIXTURE_PREFIX}voucher-2`

// Per the locked rounding rule at src/api/customer/discovery/service.ts:1028-1033:
//   totalEstimatedSaving = Math.round(sum(savings) * 100) / 100
// For these two vouchers (5.00 + 7.50) the expected total is 12.50.
const EXPECTED_TOTAL_ESTIMATED_SAVING = 12.5

// Reference coordinates (real-world UK localities). Brightlingsea +
// Colchester are ~10km apart, both inside an Essex-ish region. The user
// position used in the test calls is Colchester; both branches are
// MANUALLY_CONFIRMED so they emit non-null distance.
const BRIGHTLINGSEA = { lat: 51.81, lng: 1.02 }
const COLCHESTER    = { lat: 51.89, lng: 0.90 }

async function createMultiBranchFeaturedFixture() {
  // One merchant with two active MANUALLY_CONFIRMED branches. The merchant
  // is registered as a FeaturedMerchant so it appears in `feed.featured`,
  // and Spec §5.2 interim fan-out means BOTH branches must emit tiles in
  // `feed.featuredBranches`.
  await prisma.merchant.upsert({
    where: { id: MULTI_MERCHANT_ID },
    create: {
      id:                 MULTI_MERCHANT_ID,
      businessName:       `${FIXTURE_PREFIX}MultiBranch Co`,
      tradingName:        `${FIXTURE_PREFIX}MultiBranch Co`,
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: { businessName: `${FIXTURE_PREFIX}MultiBranch Co`, status: 'ACTIVE' },
  })

  for (const [branchId, coords, locality, isMain] of [
    [MULTI_BRANCH_A_ID, BRIGHTLINGSEA, 'Brightlingsea', true],
    [MULTI_BRANCH_B_ID, COLCHESTER,    'Colchester',    false],
  ] as const) {
    await prisma.branch.upsert({
      where: { id: branchId },
      create: {
        id:                 branchId,
        merchantId:         MULTI_MERCHANT_ID,
        name:               `${FIXTURE_PREFIX}MultiBranch Co — ${locality}`,
        isMainBranch:       isMain,
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
        merchantId:         MULTI_MERCHANT_ID,
        name:               `${FIXTURE_PREFIX}MultiBranch Co — ${locality}`,
        city:               locality,
        latitude:           coords.lat,
        longitude:          coords.lng,
        isActive:           true,
        locationConfidence: 'MANUALLY_CONFIRMED',
        localityName:       locality,
      },
    })
  }

  // Make the merchant active-Featured. startDate <= now <= endDate +
  // isActive=true matches the predicate at service.ts:1057-1063.
  const now = new Date()
  const startsAt = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 1 day ago
  const endsAt   = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // +30 days

  await prisma.featuredMerchant.upsert({
    where: { id: FEATURED_ROW_ID },
    create: {
      id:            FEATURED_ROW_ID,
      merchantId:    MULTI_MERCHANT_ID,
      startDate:     startsAt,
      endDate:       endsAt,
      costGbp:       0,
      radiusMiles:   25,
      isActive:      true,
      paymentStatus: 'PAID',
    },
    update: {
      merchantId:    MULTI_MERCHANT_ID,
      startDate:     startsAt,
      endDate:       endsAt,
      isActive:      true,
      paymentStatus: 'PAID',
    },
  })

  // Two active+approved vouchers so the merchant emits a non-null
  // totalEstimatedSaving on every fanned-out branch tile. Predicate at
  // service.ts:867-869 + 996-1001 — status=ACTIVE, approvalStatus=APPROVED.
  for (const [voucherId, code, saving] of [
    [VOUCHER_ONE_ID, `${FIXTURE_PREFIX}V1`, '5.00'],
    [VOUCHER_TWO_ID, `${FIXTURE_PREFIX}V2`, '7.50'],
  ] as const) {
    await prisma.voucher.upsert({
      where: { id: voucherId },
      create: {
        id:              voucherId,
        merchantId:      MULTI_MERCHANT_ID,
        code,
        type:            'DISCOUNT_FIXED',
        title:           `${FIXTURE_PREFIX}voucher ${code}`,
        estimatedSaving: saving,
        status:          'ACTIVE',
        approvalStatus:  'APPROVED',
        approvedAt:      now,
      },
      update: {
        merchantId:      MULTI_MERCHANT_ID,
        estimatedSaving: saving,
        status:          'ACTIVE',
        approvalStatus:  'APPROVED',
      },
    })
  }
}

beforeAll(async () => {
  // Warm up the connection (§BU pattern).
  await prisma.$queryRaw`SELECT 1`
  await createMultiBranchFeaturedFixture()
}, 30_000)

afterAll(async () => {
  // Order matters: FeaturedMerchant -> Voucher -> Branch -> Merchant.
  await prisma.featuredMerchant.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.voucher.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.branch.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.merchant.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.$disconnect()
})

// `getHomeFeed` runs many sub-queries (featured, trending, redemptions,
// nearbyByCategory, V2 ranker, three branch enrichments). Per-test timeout
// raised to 30s to accommodate the real-DB integration cost — same envelope
// as the other discovery integration suites at this layer.
const TEST_TIMEOUT_MS = 30_000

describe('Discovery Rebaseline Phase 1 — getHomeFeed (branch-themed additive fields)', () => {
  it('response carries BOTH legacy merchant-themed fields AND the new branch-themed fields', async () => {
    const feed = await getHomeFeed(prisma, {
      userId: null,
      lat:    COLCHESTER.lat,
      lng:    COLCHESTER.lng,
    }) as any

    // Legacy fields preserved.
    expect(feed).toHaveProperty('locationContext')
    expect(feed).toHaveProperty('featured')
    expect(feed).toHaveProperty('trending')
    expect(feed).toHaveProperty('campaigns')
    expect(feed).toHaveProperty('nearbyByCategory')
    expect(Array.isArray(feed.featured)).toBe(true)
    expect(Array.isArray(feed.trending)).toBe(true)
    expect(Array.isArray(feed.campaigns)).toBe(true)
    expect(Array.isArray(feed.nearbyByCategory)).toBe(true)

    // New branch-themed fields present.
    expect(feed).toHaveProperty('featuredBranches')
    expect(feed).toHaveProperty('trendingBranches')
    expect(feed).toHaveProperty('nearbyByCategoryBranches')
    expect(Array.isArray(feed.featuredBranches)).toBe(true)
    expect(Array.isArray(feed.trendingBranches)).toBe(true)
    expect(Array.isArray(feed.nearbyByCategoryBranches)).toBe(true)
  }, TEST_TIMEOUT_MS)

  it('a multi-branch Featured merchant fans out to multiple `featuredBranches` tiles (Spec §5.2 interim)', async () => {
    const feed = await getHomeFeed(prisma, {
      userId: null,
      lat:    COLCHESTER.lat,
      lng:    COLCHESTER.lng,
    }) as any

    // Sanity: the fixture merchant must appear in legacy `featured`.
    const legacyHit = feed.featured.find((m: any) => m.id === MULTI_MERCHANT_ID)
    expect(legacyHit).toBeDefined()

    // Spec §5.2 interim — fan out to all active branches.
    const branchTilesForMerchant = (feed.featuredBranches as any[])
      .filter(t => t.merchant?.id === MULTI_MERCHANT_ID)
    expect(branchTilesForMerchant).toHaveLength(2)

    const branchTileIds = new Set(branchTilesForMerchant.map(t => t.id))
    expect(branchTileIds.has(MULTI_BRANCH_A_ID)).toBe(true)
    expect(branchTileIds.has(MULTI_BRANCH_B_ID)).toBe(true)

    // Each tile is BranchTile-shaped (branchName at top level, merchant
    // nested as grouping context).
    for (const tile of branchTilesForMerchant) {
      expect(typeof tile.branchName).toBe('string')
      expect(typeof tile.merchant?.businessName).toBe('string')
      // MANUALLY_CONFIRMED fixture branches at user GPS -> distance non-null.
      expect(tile.distance).not.toBeNull()
      expect(typeof tile.distance).toBe('number')
    }
  }, TEST_TIMEOUT_MS)

  it('NO `campaignBranches` field at the home feed level — campaigns are banner-level, not a tile list', async () => {
    const feed = await getHomeFeed(prisma, {
      userId: null,
      lat:    COLCHESTER.lat,
      lng:    COLCHESTER.lng,
    }) as any

    expect(feed).not.toHaveProperty('campaignBranches')
    // `campaigns` (banner-level) is still present — UNCHANGED.
    expect(feed).toHaveProperty('campaigns')
  }, TEST_TIMEOUT_MS)

  // Phase 2.3 Amendment A — verify totalEstimatedSaving flows through the
  // Home branch-tile projection. Backend field shipped in PR #112 fixup-3
  // (service.ts:1028-1033, 1100) and pre-existing pins above already exercise
  // every Home rail's tile shape, but no prior pin asserts the SUM-rounded
  // value lands on merchant grouping for a multi-voucher Home merchant.
  it('multi-voucher Home merchant tiles carry the rounded sum of estimatedSaving on `merchant.totalEstimatedSaving`', async () => {
    const feed = await getHomeFeed(prisma, {
      userId: null,
      lat:    COLCHESTER.lat,
      lng:    COLCHESTER.lng,
    }) as any

    const branchTilesForMerchant = (feed.featuredBranches as any[])
      .filter(t => t.merchant?.id === MULTI_MERCHANT_ID)
    expect(branchTilesForMerchant.length).toBeGreaterThan(0)

    for (const tile of branchTilesForMerchant) {
      // Field present + numeric + positive.
      expect(tile.merchant.totalEstimatedSaving).not.toBeNull()
      expect(typeof tile.merchant.totalEstimatedSaving).toBe('number')
      expect(tile.merchant.totalEstimatedSaving).toBeGreaterThan(0)
      // Locked rounding rule: Math.round(sum * 100) / 100 of the two
      // fixture vouchers (5.00 + 7.50 = 12.50).
      expect(tile.merchant.totalEstimatedSaving).toBe(EXPECTED_TOTAL_ESTIMATED_SAVING)
      // maxEstimatedSaving stays distinct + correct (highest individual voucher).
      expect(tile.merchant.maxEstimatedSaving).toBe(7.5)
    }
  }, TEST_TIMEOUT_MS)

  it('legacy `featured: MerchantTile[]` shape is unchanged — entries are merchant-shaped, not branch-shaped', async () => {
    const feed = await getHomeFeed(prisma, {
      userId: null,
      lat:    COLCHESTER.lat,
      lng:    COLCHESTER.lng,
    }) as any

    const legacyHit = feed.featured.find((m: any) => m.id === MULTI_MERCHANT_ID)
    expect(legacyHit).toBeDefined()

    // Merchant-shaped: businessName at top level, NO branchName at top level.
    expect(typeof legacyHit.businessName).toBe('string')
    expect(legacyHit).not.toHaveProperty('branchName')
    // The legacy merchant tile does NOT nest a `merchant` grouping container
    // the way BranchTile does — its `id` IS the merchantId.
    expect(legacyHit.id).toBe(MULTI_MERCHANT_ID)
  }, TEST_TIMEOUT_MS)
})
