// tests/api/customer/discovery/campaign-branches.test.ts
//
// Discovery Rebaseline Phase 1 Task 1.9 — `getCampaignBranches` service.
// Spec: docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md §8.1.
//
// Pins:
//   1. Fans out one tile per active branch of each campaign merchant
//      (LOAD-BEARING — the branch-first contract for campaigns).
//   2. Inactive branches excluded.
//   3. Non-ACTIVE campaigns return empty branches (no throw).
//   4. `total` reflects the post-fan-out branch count.
//
// Real-DB integration pattern (consistent with category-branches.test.ts).
// FIXTURE_PREFIX = `rbl-1-9-` so afterAll cleanup is deterministic.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getCampaignBranches } from '../../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const FIXTURE_PREFIX = 'rbl-1-9-'

const CAMPAIGN_ID         = `${FIXTURE_PREFIX}campaign`
const INACTIVE_CAMPAIGN_ID = `${FIXTURE_PREFIX}inactive-campaign`

const MERCHANT_A_ID       = `${FIXTURE_PREFIX}merchant-a`
const MERCHANT_B_ID       = `${FIXTURE_PREFIX}merchant-b`
const BRANCH_A1_ID        = `${FIXTURE_PREFIX}branch-a1`
const BRANCH_A2_ID        = `${FIXTURE_PREFIX}branch-a2`
const BRANCH_A3_INACTIVE  = `${FIXTURE_PREFIX}branch-a3-inactive`
const BRANCH_B1_ID        = `${FIXTURE_PREFIX}branch-b1`

const CM_A_ID             = `${FIXTURE_PREFIX}cm-a`
const CM_B_ID             = `${FIXTURE_PREFIX}cm-b`
const CM_INACTIVE_A_ID    = `${FIXTURE_PREFIX}cm-inactive-a`

// Reference coordinates (real-world UK localities, all MANUALLY_CONFIRMED).
const BRIGHTLINGSEA = { lat: 51.81, lng: 1.02 }
const COLCHESTER    = { lat: 51.89, lng: 0.90 }
const HUDDERSFIELD  = { lat: 53.6463, lng: -1.7809 }

// Campaign date window — start last year, end next year — so the live `now`
// check at service.ts:3382 always passes for the ACTIVE-campaign fixture.
const FAR_PAST   = new Date('2020-01-01T00:00:00Z')
const FAR_FUTURE = new Date('2099-01-01T00:00:00Z')

async function createCampaigns() {
  await prisma.campaign.upsert({
    where:  { id: CAMPAIGN_ID },
    create: {
      id:        CAMPAIGN_ID,
      name:      `${FIXTURE_PREFIX}Active Campaign`,
      status:    'ACTIVE',
      startDate: FAR_PAST,
      endDate:   FAR_FUTURE,
    },
    update: {
      name:      `${FIXTURE_PREFIX}Active Campaign`,
      status:    'ACTIVE',
      startDate: FAR_PAST,
      endDate:   FAR_FUTURE,
    },
  })

  await prisma.campaign.upsert({
    where:  { id: INACTIVE_CAMPAIGN_ID },
    create: {
      id:        INACTIVE_CAMPAIGN_ID,
      name:      `${FIXTURE_PREFIX}Inactive Campaign`,
      status:    'DRAFT',
      startDate: FAR_PAST,
      endDate:   FAR_FUTURE,
    },
    update: {
      name:      `${FIXTURE_PREFIX}Inactive Campaign`,
      status:    'DRAFT',
      startDate: FAR_PAST,
      endDate:   FAR_FUTURE,
    },
  })
}

async function createMerchants() {
  await prisma.merchant.upsert({
    where:  { id: MERCHANT_A_ID },
    create: {
      id:                 MERCHANT_A_ID,
      businessName:       `${FIXTURE_PREFIX}Merchant A`,
      tradingName:        `${FIXTURE_PREFIX}Merchant A`,
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: { businessName: `${FIXTURE_PREFIX}Merchant A`, status: 'ACTIVE' },
  })

  await prisma.merchant.upsert({
    where:  { id: MERCHANT_B_ID },
    create: {
      id:                 MERCHANT_B_ID,
      businessName:       `${FIXTURE_PREFIX}Merchant B`,
      tradingName:        `${FIXTURE_PREFIX}Merchant B`,
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: { businessName: `${FIXTURE_PREFIX}Merchant B`, status: 'ACTIVE' },
  })
}

async function createBranches() {
  // Merchant A — 2 active branches + 1 inactive branch.
  for (const [branchId, coords, locality, isMain, isActive] of [
    [BRANCH_A1_ID,       BRIGHTLINGSEA, 'Brightlingsea', true,  true],
    [BRANCH_A2_ID,       COLCHESTER,    'Colchester',    false, true],
    [BRANCH_A3_INACTIVE, HUDDERSFIELD,  'Huddersfield',  false, false],
  ] as const) {
    await prisma.branch.upsert({
      where:  { id: branchId },
      create: {
        id:                 branchId,
        merchantId:         MERCHANT_A_ID,
        name:               `${FIXTURE_PREFIX}A — ${locality}`,
        isMainBranch:       isMain,
        addressLine1:       '1 Test St',
        city:               locality,
        postcode:           'CO1 1AA',
        country:            'GB',
        latitude:           coords.lat,
        longitude:          coords.lng,
        isActive:           isActive,
        locationConfidence: 'MANUALLY_CONFIRMED',
        localityName:       locality,
      },
      update: {
        merchantId:         MERCHANT_A_ID,
        name:               `${FIXTURE_PREFIX}A — ${locality}`,
        city:               locality,
        latitude:           coords.lat,
        longitude:          coords.lng,
        isActive:           isActive,
        locationConfidence: 'MANUALLY_CONFIRMED',
        localityName:       locality,
      },
    })
  }

  // Merchant B — 1 active branch.
  await prisma.branch.upsert({
    where:  { id: BRANCH_B1_ID },
    create: {
      id:                 BRANCH_B1_ID,
      merchantId:         MERCHANT_B_ID,
      name:               `${FIXTURE_PREFIX}B — Huddersfield`,
      isMainBranch:       true,
      addressLine1:       '2 Test St',
      city:               'Huddersfield',
      postcode:           'HD1 2PY',
      country:            'GB',
      latitude:           HUDDERSFIELD.lat,
      longitude:          HUDDERSFIELD.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       'Huddersfield',
    },
    update: {
      merchantId:         MERCHANT_B_ID,
      name:               `${FIXTURE_PREFIX}B — Huddersfield`,
      latitude:           HUDDERSFIELD.lat,
      longitude:          HUDDERSFIELD.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       'Huddersfield',
    },
  })
}

async function createCampaignMerchantLinks() {
  // Active campaign — both merchants enrolled, each active.
  for (const [cmId, merchantId, campaignId] of [
    [CM_A_ID,          MERCHANT_A_ID, CAMPAIGN_ID],
    [CM_B_ID,          MERCHANT_B_ID, CAMPAIGN_ID],
    [CM_INACTIVE_A_ID, MERCHANT_A_ID, INACTIVE_CAMPAIGN_ID],
  ] as const) {
    await prisma.campaignMerchant.upsert({
      where:  { id: cmId },
      create: {
        id:            cmId,
        campaignId:    campaignId,
        merchantId:    merchantId,
        startDate:     FAR_PAST,
        endDate:       FAR_FUTURE,
        costGbp:       '0.00',
        paymentStatus: 'PAID',
        isActive:      true,
      },
      update: {
        campaignId:    campaignId,
        merchantId:    merchantId,
        startDate:     FAR_PAST,
        endDate:       FAR_FUTURE,
        paymentStatus: 'PAID',
        isActive:      true,
      },
    })
  }
}

beforeAll(async () => {
  // Warm up the connection (§BU pattern).
  await prisma.$queryRaw`SELECT 1`
  await createMerchants()
  await createBranches()
  await createCampaigns()
  await createCampaignMerchantLinks()
})

afterAll(async () => {
  // FK ordering: campaignMerchant → campaign / branches → merchants.
  await prisma.campaignMerchant.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.campaign.deleteMany({
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

describe('Discovery Rebaseline Phase 1 — getCampaignBranches', () => {
  it('fans out one tile per active branch of each campaign merchant (LOAD-BEARING)', async () => {
    // Merchant A has 2 active branches (A1 + A2; A3 is inactive); merchant B
    // has 1 active branch (B1). Branch-first fan-out must emit 3 distinct
    // tiles, one per active branch.
    const result = await getCampaignBranches(prisma, CAMPAIGN_ID, {
      userId: null,
    })

    const fixtureTiles = result.branches.filter(
      t => t.merchant.id === MERCHANT_A_ID || t.merchant.id === MERCHANT_B_ID,
    )
    expect(fixtureTiles).toHaveLength(3)

    const branchIds = fixtureTiles.map(t => t.id).sort()
    expect(branchIds).toEqual([BRANCH_A1_ID, BRANCH_A2_ID, BRANCH_B1_ID].sort())

    // Defensive: tile→merchant mapping per fan-out row.
    const a1 = fixtureTiles.find(t => t.id === BRANCH_A1_ID)
    const a2 = fixtureTiles.find(t => t.id === BRANCH_A2_ID)
    const b1 = fixtureTiles.find(t => t.id === BRANCH_B1_ID)
    expect(a1?.merchant.id).toBe(MERCHANT_A_ID)
    expect(a2?.merchant.id).toBe(MERCHANT_A_ID)
    expect(b1?.merchant.id).toBe(MERCHANT_B_ID)
  })

  it('inactive branches are excluded from fan-out', async () => {
    const result = await getCampaignBranches(prisma, CAMPAIGN_ID, {
      userId: null,
    })

    // BRANCH_A3_INACTIVE belongs to merchant A but is isActive=false, so it
    // MUST NOT surface even though merchant A is enrolled in the campaign.
    const inactive = result.branches.find(t => t.id === BRANCH_A3_INACTIVE)
    expect(inactive).toBeUndefined()
  })

  it('non-ACTIVE campaigns return empty branches', async () => {
    // INACTIVE_CAMPAIGN_ID has status DRAFT — must return empty, not throw.
    const result = await getCampaignBranches(prisma, INACTIVE_CAMPAIGN_ID, {
      userId: null,
    })

    expect(result.branches).toEqual([])
    expect(result.total).toBe(0)
  })

  it('total reflects the post-fan-out branch count', async () => {
    const result = await getCampaignBranches(prisma, CAMPAIGN_ID, {
      userId: null,
    })

    // 2 active A-branches + 1 active B-branch = 3 tiles.
    const fixtureTiles = result.branches.filter(
      t => t.merchant.id === MERCHANT_A_ID || t.merchant.id === MERCHANT_B_ID,
    )
    // `total` is the global fan-out count for the campaign — it may include
    // other shared-DB campaign-merchant fixtures, but it MUST be at least 3
    // and equal to the number of branches we observe when no pagination is
    // applied. Within an isolated fixture (no other rbl-1-9- campaigns or
    // shared CampaignMerchant rows referencing our merchants), the math is
    // exact:
    expect(result.total).toBe(fixtureTiles.length)
    expect(result.total).toBe(3)
  })
})
