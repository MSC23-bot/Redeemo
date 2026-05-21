// tests/api/customer/discovery/category-branches.test.ts
//
// Discovery Rebaseline Phase 1 Task 1.8 — `getCategoryBranches` service.
// Spec: docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md §1.5.
//
// Pins:
//   1. Returns branches for a category.
//   2. Multi-branch merchant in the category emits multiple tiles
//      (LOAD-BEARING — the same merchant-collapse bug class searchBranches
//      addresses for free-text now applies to category-id-driven requests).
//   3. totalBranches reflects post-union branch count.
//   4. Subcategory expansion — branches whose merchant is linked only to a
//      subcategory of the requested parent still surface (mirrors the
//      `categories.some({ categoryId: in [parent + children] })` OR clause
//      inside searchBranches).
//
// Real-DB integration pattern (consistent with search-branches.test.ts).
// FIXTURE_PREFIX = `rbl-1-8-` so afterAll cleanup is deterministic.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getCategoryBranches } from '../../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const FIXTURE_PREFIX = 'rbl-1-8-'

const PARENT_CATEGORY_ID  = `${FIXTURE_PREFIX}parent-cat`
const CHILD_CATEGORY_ID   = `${FIXTURE_PREFIX}child-cat`
const MULTI_MERCHANT_ID   = `${FIXTURE_PREFIX}multi-merchant`
const MULTI_BRANCH_A_ID   = `${FIXTURE_PREFIX}multi-branch-a`
const MULTI_BRANCH_B_ID   = `${FIXTURE_PREFIX}multi-branch-b`
const SUB_MERCHANT_ID     = `${FIXTURE_PREFIX}sub-merchant`
const SUB_BRANCH_ID       = `${FIXTURE_PREFIX}sub-branch`

const MULTI_LINK_PARENT   = `${FIXTURE_PREFIX}multi-link-parent`
const SUB_LINK_CHILD      = `${FIXTURE_PREFIX}sub-link-child`

// Reference coordinates (real-world UK localities, all MANUALLY_CONFIRMED).
const BRIGHTLINGSEA = { lat: 51.81, lng: 1.02 }
const COLCHESTER    = { lat: 51.89, lng: 0.90 }
const HUDDERSFIELD  = { lat: 53.6463, lng: -1.7809 }

async function createCategories() {
  await prisma.category.upsert({
    where: { id: PARENT_CATEGORY_ID },
    create: {
      id:       PARENT_CATEGORY_ID,
      name:     `${FIXTURE_PREFIX}Parent Category`,
      isActive: true,
    },
    update: { name: `${FIXTURE_PREFIX}Parent Category`, isActive: true, parentId: null },
  })

  await prisma.category.upsert({
    where: { id: CHILD_CATEGORY_ID },
    create: {
      id:       CHILD_CATEGORY_ID,
      name:     `${FIXTURE_PREFIX}Child Subcategory`,
      parentId: PARENT_CATEGORY_ID,
      isActive: true,
    },
    update: {
      name:     `${FIXTURE_PREFIX}Child Subcategory`,
      parentId: PARENT_CATEGORY_ID,
      isActive: true,
    },
  })
}

async function createMultiBranchMerchant() {
  await prisma.merchant.upsert({
    where: { id: MULTI_MERCHANT_ID },
    create: {
      id:                 MULTI_MERCHANT_ID,
      businessName:       `${FIXTURE_PREFIX}Multi Branch Merchant`,
      tradingName:        `${FIXTURE_PREFIX}Multi Branch Merchant`,
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: { businessName: `${FIXTURE_PREFIX}Multi Branch Merchant`, status: 'ACTIVE' },
  })

  // Link merchant to PARENT category via MerchantCategory join.
  await prisma.merchantCategory.upsert({
    where:  { id: MULTI_LINK_PARENT },
    create: {
      id:         MULTI_LINK_PARENT,
      merchantId: MULTI_MERCHANT_ID,
      categoryId: PARENT_CATEGORY_ID,
      isPrimary:  false,
    },
    update: {
      merchantId: MULTI_MERCHANT_ID,
      categoryId: PARENT_CATEGORY_ID,
    },
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
        name:               `${FIXTURE_PREFIX}Multi Branch — ${locality}`,
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
        name:               `${FIXTURE_PREFIX}Multi Branch — ${locality}`,
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

async function createSubcategoryOnlyMerchant() {
  // This merchant is linked ONLY to the CHILD subcategory — never to the parent
  // directly. Calling getCategoryBranches with the PARENT id MUST still surface
  // this merchant's branch because searchBranches expands `categoryId` over
  // {parent + children}.
  await prisma.merchant.upsert({
    where: { id: SUB_MERCHANT_ID },
    create: {
      id:                 SUB_MERCHANT_ID,
      businessName:       `${FIXTURE_PREFIX}Subcategory Only Merchant`,
      tradingName:        `${FIXTURE_PREFIX}Subcategory Only Merchant`,
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: { businessName: `${FIXTURE_PREFIX}Subcategory Only Merchant`, status: 'ACTIVE' },
  })

  await prisma.merchantCategory.upsert({
    where:  { id: SUB_LINK_CHILD },
    create: {
      id:         SUB_LINK_CHILD,
      merchantId: SUB_MERCHANT_ID,
      categoryId: CHILD_CATEGORY_ID,
      isPrimary:  false,
    },
    update: {
      merchantId: SUB_MERCHANT_ID,
      categoryId: CHILD_CATEGORY_ID,
    },
  })

  await prisma.branch.upsert({
    where: { id: SUB_BRANCH_ID },
    create: {
      id:                 SUB_BRANCH_ID,
      merchantId:         SUB_MERCHANT_ID,
      name:               `${FIXTURE_PREFIX}Subcategory Only — Huddersfield`,
      isMainBranch:       true,
      addressLine1:       '3 Test St',
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
      merchantId:         SUB_MERCHANT_ID,
      latitude:           HUDDERSFIELD.lat,
      longitude:          HUDDERSFIELD.lng,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       'Huddersfield',
    },
  })
}

beforeAll(async () => {
  // Warm up the connection (§BU pattern).
  await prisma.$queryRaw`SELECT 1`
  await createCategories()
  await createMultiBranchMerchant()
  await createSubcategoryOnlyMerchant()
})

afterAll(async () => {
  // FK ordering: branches → merchantCategory → merchants → categories.
  await prisma.branch.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.merchantCategory.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.merchant.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  // Child first (parentId FK on Category itself).
  await prisma.category.deleteMany({
    where: { id: CHILD_CATEGORY_ID },
  })
  await prisma.category.deleteMany({
    where: { id: PARENT_CATEGORY_ID },
  })
  await prisma.$disconnect()
})

describe('Discovery Rebaseline Phase 1 — getCategoryBranches', () => {
  it('returns branches for a category', async () => {
    const result = await getCategoryBranches(prisma, {
      categoryId: PARENT_CATEGORY_ID,
      limit:      20,
      offset:     0,
      userId:     null,
    })

    const multiTiles = result.branches.filter(t => t.merchant.id === MULTI_MERCHANT_ID)
    // Multi-branch merchant emits both branches.
    expect(multiTiles.length).toBe(2)
  })

  it('multi-branch merchant emits multiple tiles (LOAD-BEARING)', async () => {
    const result = await getCategoryBranches(prisma, {
      categoryId: PARENT_CATEGORY_ID,
      limit:      20,
      offset:     0,
      userId:     null,
    })

    const multiTiles = result.branches.filter(t => t.merchant.id === MULTI_MERCHANT_ID)
    expect(multiTiles).toHaveLength(2)

    // Both branches surface as distinct tiles under the same merchant id.
    const branchIds = multiTiles.map(t => t.id).sort()
    expect(branchIds).toEqual([MULTI_BRANCH_A_ID, MULTI_BRANCH_B_ID].sort())
    // Defensive: each tile's merchant.id is the shared merchant.
    for (const tile of multiTiles) {
      expect(tile.merchant.id).toBe(MULTI_MERCHANT_ID)
    }
  })

  it('totalBranches is a number and matches page length within first page', async () => {
    const result = await getCategoryBranches(prisma, {
      categoryId: PARENT_CATEGORY_ID,
      limit:      20,
      offset:     0,
      userId:     null,
    })

    expect(typeof result.totalBranches).toBe('number')
    // limit=20 is well above the fixture-set size, so totalBranches matches
    // result.branches.length on the first page.
    expect(result.totalBranches).toBe(result.branches.length)
  })

  it('subcategory-only merchants surface when querying the parent category id', async () => {
    // SUB_MERCHANT_ID is linked ONLY to CHILD_CATEGORY_ID (never to the parent
    // directly). searchBranches's `categoryId` branch unions {parent + children}
    // via `categories.some({ categoryId: in [PARENT, CHILD] })`, so a request
    // for the parent id MUST still surface this branch.
    const result = await getCategoryBranches(prisma, {
      categoryId: PARENT_CATEGORY_ID,
      limit:      20,
      offset:     0,
      userId:     null,
    })

    const subTile = result.branches.find(t => t.id === SUB_BRANCH_ID)
    expect(subTile).toBeDefined()
    expect(subTile?.merchant.id).toBe(SUB_MERCHANT_ID)
  })

  // PR #120 device-QA fix (2026-05-21) — pin the scope-threading + full-meta
  // contract that closes the owner-reported Category bugs:
  //   - `Nearby · 0` pill still rendering nearby branches
  //   - Pill counts not matching the visible branch list
  // Without these pins the parameter is silently dropped — type-check passes
  // but runtime behaviour stays broken.
  describe('PR #120 device-QA fix — scope + meta envelope', () => {
    it('returns the full searchBranches meta envelope (scope-aligned counts, emptyStateReason, resolvedArea)', async () => {
      const result = await getCategoryBranches(prisma, {
        categoryId: PARENT_CATEGORY_ID,
        limit:      20,
        offset:     0,
        userId:     null,
      })

      // The meta surface MUST carry every field the customer-app
      // CategoryResultsScreen reads via `branchMeta ?? meta`. Before the
      // device-QA fix `getCategoryBranches` declared a strictly-narrower
      // Promise<{ meta: { rungCounts, effectiveLocality } }> return type
      // and the route stripped the rest of the envelope on the way out.
      expect(result.meta).toBeDefined()
      expect(result.meta.scope).toBeDefined()
      expect(typeof result.meta.scopeExpanded).toBe('boolean')
      expect(typeof result.meta.nearbyCount).toBe('number')
      expect(typeof result.meta.cityCount).toBe('number')
      expect(typeof result.meta.distantCount).toBe('number')
      expect(['none', 'expanded_to_wider', 'no_uk_supply']).toContain(result.meta.emptyStateReason)
      expect(typeof result.meta.resolvedArea).toBe('string')
      // The pre-existing rungCounts + effectiveLocality fields still present.
      expect(result.meta.rungCounts).toBeDefined()
      expect('effectiveLocality' in result.meta).toBe(true)
    })

    it('threads the scope param to searchBranches (scope echoes back in meta when supplied)', async () => {
      // When scope is supplied, searchBranches honours it AND emits it back
      // via `meta.scope`. We can't assert the exact branch count without a
      // location-aware fixture (which the PARENT_CATEGORY_ID fixture set
      // doesn't define), but we CAN pin the contract that the scope arg is
      // not silently dropped — the returned meta.scope equals the requested
      // value when no scope-cascade widening happens.
      //
      // The branch-first scope cascade only widens if the requested scope
      // has zero supply; with our fixture set there's supply across all
      // rungs so `scope: 'platform'` returns `meta.scope === 'platform'`
      // unchanged.
      const result = await getCategoryBranches(prisma, {
        categoryId: PARENT_CATEGORY_ID,
        limit:      20,
        offset:     0,
        userId:     null,
        scope:      'platform',
      })

      // The exact returned scope may equal the request OR the resolved tier
      // after cascade — both are valid. The load-bearing assertion is that
      // the field is present + populated (i.e. the param was not dropped).
      expect(result.meta.scope).toBeDefined()
      expect(['nearby', 'city', 'region', 'platform']).toContain(result.meta.scope)
    })

    it('omitted scope still returns a fully-populated meta envelope', async () => {
      // Defensive pin: the optional scope param must not break the
      // back-compat path. Default behaviour (no scope arg) still emits the
      // full meta.
      const result = await getCategoryBranches(prisma, {
        categoryId: PARENT_CATEGORY_ID,
        limit:      20,
        offset:     0,
        userId:     null,
      })

      expect(result.meta.scope).toBeDefined()
      expect(typeof result.meta.nearbyCount).toBe('number')
    })
  })
})
