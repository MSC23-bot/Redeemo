// tests/api/customer/discovery/routes-additive-shape.test.ts
//
// Discovery Rebaseline Phase 1 Task 1.10 — additive route shape contract.
// Spec: docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md §1.5.
//
// Pins for each of the 4 affected route handlers (search / category /
// in-area / campaign) that BOTH the legacy `merchants` field AND the new
// branch-themed `branches` field are present on the response. Search /
// category / campaign also pin the `total` + `totalBranches` pair.
//
// `getHomeFeed` (the 5th endpoint) had its return shape extended directly
// in Task 1.7 and is already pinned by `home-feed-branches.test.ts`; this
// file does NOT re-pin Home.
//
// Real-DB integration pattern. We decorate the test app with a real
// PrismaClient bound to the worktree's Neon DB (mirrors the §BU pattern
// referenced in deferred-followups), then use `app.inject(...)` so the
// route handler — including its `Promise.all` of `<merchant>` + `<branch>`
// service calls — runs end-to-end. FIXTURE_PREFIX = `rbl-1-10-` so the
// afterAll cleanup is deterministic.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../../src/api/app'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const FIXTURE_PREFIX = 'rbl-1-10-'

const MERCHANT_ID         = `${FIXTURE_PREFIX}merchant`
const BRANCH_A_ID         = `${FIXTURE_PREFIX}branch-a`
const BRANCH_B_ID         = `${FIXTURE_PREFIX}branch-b`
const CAMPAIGN_ID         = `${FIXTURE_PREFIX}campaign`
const CM_ID               = `${FIXTURE_PREFIX}cm`

// Search-q is a unique prefix shared by the merchant's name so the search
// endpoint is guaranteed to surface our fixture.
const SEARCH_Q = `${FIXTURE_PREFIX}Search`

// Brightlingsea + Colchester — both inside the in-area bbox.
const BRIGHTLINGSEA = { lat: 51.81, lng: 1.02 }
const COLCHESTER    = { lat: 51.89, lng: 0.90 }

// Campaign date window — far past → far future so the live `now` check
// in `getCampaignMerchants` / `getCampaignBranches` always passes.
const FAR_PAST   = new Date('2020-01-01T00:00:00Z')
const FAR_FUTURE = new Date('2099-01-01T00:00:00Z')

let app: FastifyInstance
let seededCategoryId: string

async function createMerchantAndBranches() {
  await prisma.merchant.upsert({
    where:  { id: MERCHANT_ID },
    create: {
      id:                 MERCHANT_ID,
      businessName:       `${SEARCH_Q} Merchant`,
      tradingName:        `${SEARCH_Q} Merchant`,
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: { businessName: `${SEARCH_Q} Merchant`, status: 'ACTIVE' },
  })

  for (const [branchId, coords, locality] of [
    [BRANCH_A_ID, BRIGHTLINGSEA, 'Brightlingsea'],
    [BRANCH_B_ID, COLCHESTER,    'Colchester'],
  ] as const) {
    await prisma.branch.upsert({
      where:  { id: branchId },
      create: {
        id:                 branchId,
        merchantId:         MERCHANT_ID,
        name:               `${FIXTURE_PREFIX}${locality}`,
        isMainBranch:       branchId === BRANCH_A_ID,
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
        merchantId:         MERCHANT_ID,
        name:               `${FIXTURE_PREFIX}${locality}`,
        latitude:           coords.lat,
        longitude:          coords.lng,
        isActive:           true,
        locationConfidence: 'MANUALLY_CONFIRMED',
        localityName:       locality,
      },
    })
  }
}

async function createCampaign() {
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

  await prisma.campaignMerchant.upsert({
    where:  { id: CM_ID },
    create: {
      id:            CM_ID,
      campaignId:    CAMPAIGN_ID,
      merchantId:    MERCHANT_ID,
      startDate:     FAR_PAST,
      endDate:       FAR_FUTURE,
      costGbp:       '0.00',
      paymentStatus: 'PAID',
      isActive:      true,
    },
    update: {
      campaignId:    CAMPAIGN_ID,
      merchantId:    MERCHANT_ID,
      startDate:     FAR_PAST,
      endDate:       FAR_FUTURE,
      paymentStatus: 'PAID',
      isActive:      true,
    },
  })
}

async function resolveSeededCategoryId(): Promise<string> {
  // Pick any active top-level category from the seed. `top-level` here
  // means `parentId IS NULL`; we don't depend on a specific id because
  // seed contents drift across reseed cycles. The deterministic rule:
  // alphabetical order on name, so the same row is picked every run.
  const cat = await prisma.category.findFirst({
    where:   { isActive: true, parentId: null },
    orderBy: { name: 'asc' },
    select:  { id: true },
  })
  if (!cat) {
    throw new Error(
      'No active Category — run `npx prisma db seed` first to seed the discovery taxonomy.',
    )
  }
  return cat.id
}

beforeAll(async () => {
  // Warm up the connection (§BU pattern — same as campaign-branches.test.ts).
  await prisma.$queryRaw`SELECT 1`

  await createMerchantAndBranches()
  await createCampaign()
  seededCategoryId = await resolveSeededCategoryId()

  // Build the Fastify app once and decorate it with the same Prisma
  // connection we own here. `buildApp()` in test mode skips the prisma
  // plugin (see src/api/app.ts:33), so explicit decoration is the
  // intended seam for integration tests.
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

describe('Discovery Rebaseline Phase 1 Task 1.10 — additive route shape', () => {
  it('GET /api/v1/customer/search — carries BOTH `merchants` + `branches` + totals', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/search?q=${encodeURIComponent(SEARCH_Q)}`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    // Legacy fields preserved (non-removal contract).
    expect(body).toHaveProperty('merchants')
    expect(Array.isArray(body.merchants)).toBe(true)
    expect(body).toHaveProperty('total')
    expect(typeof body.total).toBe('number')

    // New additive branch-themed fields present.
    expect(body).toHaveProperty('branches')
    expect(Array.isArray(body.branches)).toBe(true)
    expect(body).toHaveProperty('totalBranches')
    expect(typeof body.totalBranches).toBe('number')

    // For our two-branch single-merchant fixture, `branches` >= 2 (fan-out)
    // while `merchants` >= 1. This is the load-bearing Phase 1 contract:
    // the same merchant shows once in `merchants` but twice in `branches`.
    expect(body.merchants.length).toBeGreaterThanOrEqual(1)
    expect(body.branches.length).toBeGreaterThanOrEqual(2)
    expect(body.totalBranches).toBeGreaterThanOrEqual(2)
  }, 30_000)

  it('GET /api/v1/customer/categories/:id/merchants — carries BOTH `merchants` + `branches` + totals', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/categories/${seededCategoryId}/merchants`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    // Legacy preserved.
    expect(body).toHaveProperty('merchants')
    expect(Array.isArray(body.merchants)).toBe(true)
    expect(body).toHaveProperty('total')
    expect(typeof body.total).toBe('number')

    // Additive branch-themed fields present.
    expect(body).toHaveProperty('branches')
    expect(Array.isArray(body.branches)).toBe(true)
    expect(body).toHaveProperty('totalBranches')
    expect(typeof body.totalBranches).toBe('number')
  }, 30_000)

  it('GET /api/v1/customer/discovery/in-area — carries BOTH `merchants` + `branches`', async () => {
    // bbox encloses Brightlingsea + Colchester (both fixture branches).
    const res = await app.inject({
      method: 'GET',
      url:    '/api/v1/customer/discovery/in-area?minLat=51.79&maxLat=51.90&minLng=0.85&maxLng=1.05',
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    // Legacy preserved.
    expect(body).toHaveProperty('merchants')
    expect(Array.isArray(body.merchants)).toBe(true)

    // Additive branches present (no `totalBranches` for in-area — Map has
    // no pagination, mirrors the legacy `getInAreaMerchants` envelope).
    expect(body).toHaveProperty('branches')
    expect(Array.isArray(body.branches)).toBe(true)

    // Our fixture has 2 MANUALLY_CONFIRMED branches inside the bbox; expect
    // them to surface on the branch list (the fan-out contract for in-area).
    expect(body.branches.length).toBeGreaterThanOrEqual(2)
  }, 30_000)

  it('GET /api/v1/customer/campaigns/:id/merchants — carries BOTH `merchants` + `branches` + totals', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/campaigns/${CAMPAIGN_ID}/merchants`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    // Legacy preserved.
    expect(body).toHaveProperty('merchants')
    expect(Array.isArray(body.merchants)).toBe(true)
    // PR-110 review fix: `total` is the TRUE matching count from
    // `getCampaignMerchants.total` (`prisma.campaignMerchant.count(...)`),
    // NOT derived from `merchants.length`.  Always present + always a
    // number — pin hard.
    expect(body).toHaveProperty('total')
    expect(typeof body.total).toBe('number')
    expect(body.total).toBeGreaterThanOrEqual(body.merchants.length)

    // Additive branch-themed fields present. `totalBranches` re-keys the
    // service-layer `total` (post-fan-out branch count) to avoid colliding
    // with the legacy merchant `total`.
    expect(body).toHaveProperty('branches')
    expect(Array.isArray(body.branches)).toBe(true)
    expect(body).toHaveProperty('totalBranches')
    expect(typeof body.totalBranches).toBe('number')

    // Our fixture is 1 merchant × 2 active branches → totalBranches >= 2.
    expect(body.totalBranches).toBeGreaterThanOrEqual(2)
    expect(body.branches.length).toBeGreaterThanOrEqual(2)
  }, 30_000)
})
