// PR #112 fixup-6 (2026-05-20) — whitespace-normalisation regression pin.
//
// Owner-flagged: `restaurant` and `restaurant ` returned different result
// sets via `searchBranches`.  Pinned regression: identical normalised
// query must yield identical match set regardless of leading/trailing/
// internal whitespace shape.
//
// Real-DB integration pattern (consistent with branch-tile-contract.test.ts).

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { searchBranches } from '../../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const FIXTURE_PREFIX = 'rbl-ws-norm-'

const RESTAURANT_A_ID        = `${FIXTURE_PREFIX}restaurant-a-merchant`
const RESTAURANT_A_BRANCH_ID = `${FIXTURE_PREFIX}restaurant-a-branch`
const RESTAURANT_B_ID        = `${FIXTURE_PREFIX}restaurant-b-merchant`
const RESTAURANT_B_BRANCH_ID = `${FIXTURE_PREFIX}restaurant-b-branch`
const COFFEE_ID              = `${FIXTURE_PREFIX}coffee-merchant`
const COFFEE_BRANCH_ID       = `${FIXTURE_PREFIX}coffee-branch`

const TEST_LAT = 51.81
const TEST_LNG = 1.02

async function createFixtures() {
  // Two merchants whose businessName contains "restaurant" (case-insensitive
  // strong match path).  Both must surface for any "restaurant" query
  // regardless of whitespace shape.
  await prisma.merchant.upsert({
    where: { id: RESTAURANT_A_ID },
    create: {
      id:                 RESTAURANT_A_ID,
      businessName:       `${FIXTURE_PREFIX}Covelum Restaurant`,
      tradingName:        `${FIXTURE_PREFIX}Covelum`,
      description:        'Pleasant dining.',
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: {
      businessName: `${FIXTURE_PREFIX}Covelum Restaurant`,
      tradingName:  `${FIXTURE_PREFIX}Covelum`,
      status:       'ACTIVE',
    },
  })
  await prisma.branch.upsert({
    where: { id: RESTAURANT_A_BRANCH_ID },
    create: {
      id:                 RESTAURANT_A_BRANCH_ID,
      merchantId:         RESTAURANT_A_ID,
      name:               `${FIXTURE_PREFIX}A Main`,
      isMainBranch:       true,
      addressLine1:       '1 Test St',
      city:               `${FIXTURE_PREFIX}TestVille`,
      postcode:           'CO1 1AA',
      country:            'GB',
      latitude:           TEST_LAT,
      longitude:          TEST_LNG,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       `${FIXTURE_PREFIX}TestVille`,
    },
    update: {
      merchantId:         RESTAURANT_A_ID,
      latitude:           TEST_LAT,
      longitude:          TEST_LNG,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       `${FIXTURE_PREFIX}TestVille`,
    },
  })

  await prisma.merchant.upsert({
    where: { id: RESTAURANT_B_ID },
    create: {
      id:                 RESTAURANT_B_ID,
      businessName:       `${FIXTURE_PREFIX}My Kerala Restaurant`,
      tradingName:        `${FIXTURE_PREFIX}Kerala`,
      description:        'South Indian cuisine.',
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: {
      businessName: `${FIXTURE_PREFIX}My Kerala Restaurant`,
      status:       'ACTIVE',
    },
  })
  await prisma.branch.upsert({
    where: { id: RESTAURANT_B_BRANCH_ID },
    create: {
      id:                 RESTAURANT_B_BRANCH_ID,
      merchantId:         RESTAURANT_B_ID,
      name:               `${FIXTURE_PREFIX}B Main`,
      isMainBranch:       true,
      addressLine1:       '2 Test St',
      city:               `${FIXTURE_PREFIX}TestVille`,
      postcode:           'CO1 1BB',
      country:            'GB',
      latitude:           TEST_LAT,
      longitude:          TEST_LNG,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       `${FIXTURE_PREFIX}TestVille`,
    },
    update: {
      merchantId:         RESTAURANT_B_ID,
      latitude:           TEST_LAT,
      longitude:          TEST_LNG,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       `${FIXTURE_PREFIX}TestVille`,
    },
  })

  // Non-restaurant fixture for the "coffee" / "coffee " parity pin.
  await prisma.merchant.upsert({
    where: { id: COFFEE_ID },
    create: {
      id:                 COFFEE_ID,
      businessName:       `${FIXTURE_PREFIX}Brew Lab Coffee`,
      tradingName:        `${FIXTURE_PREFIX}Brew Lab`,
      description:        'Speciality coffee bar.',
      status:             'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus:     'SIGNED',
    },
    update: {
      businessName: `${FIXTURE_PREFIX}Brew Lab Coffee`,
      status:       'ACTIVE',
    },
  })
  await prisma.branch.upsert({
    where: { id: COFFEE_BRANCH_ID },
    create: {
      id:                 COFFEE_BRANCH_ID,
      merchantId:         COFFEE_ID,
      name:               `${FIXTURE_PREFIX}C Main`,
      isMainBranch:       true,
      addressLine1:       '3 Test St',
      city:               `${FIXTURE_PREFIX}TestVille`,
      postcode:           'CO1 1CC',
      country:            'GB',
      latitude:           TEST_LAT,
      longitude:          TEST_LNG,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       `${FIXTURE_PREFIX}TestVille`,
    },
    update: {
      merchantId:         COFFEE_ID,
      latitude:           TEST_LAT,
      longitude:          TEST_LNG,
      isActive:           true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      localityName:       `${FIXTURE_PREFIX}TestVille`,
    },
  })
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`
  await createFixtures()
})

afterAll(async () => {
  await prisma.branch.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.merchant.deleteMany({
    where: { id: { startsWith: FIXTURE_PREFIX } },
  })
  await prisma.$disconnect()
})

function fixtureMerchantIds(branches: { merchant: { id: string } }[]): string[] {
  return branches
    .map(b => b.merchant.id)
    .filter(id => id.startsWith(FIXTURE_PREFIX))
    .sort()
}

describe('searchBranches — whitespace normalisation (PR #112 fixup-6)', () => {
  it('"restaurant" and "restaurant " return identical fixture-merchant matches', async () => {
    const a = await searchBranches(prisma, { q: 'restaurant',  limit: 100, offset: 0, userId: null })
    const b = await searchBranches(prisma, { q: 'restaurant ', limit: 100, offset: 0, userId: null })
    expect(fixtureMerchantIds(a.branches)).toEqual(fixtureMerchantIds(b.branches))
    // Both fixture restaurants must surface (owner regression pin).
    expect(fixtureMerchantIds(a.branches)).toContain(RESTAURANT_A_ID)
    expect(fixtureMerchantIds(a.branches)).toContain(RESTAURANT_B_ID)
  })

  it('leading whitespace does not change results', async () => {
    const a = await searchBranches(prisma, { q: 'restaurant',  limit: 100, offset: 0, userId: null })
    const c = await searchBranches(prisma, { q: ' restaurant', limit: 100, offset: 0, userId: null })
    const d = await searchBranches(prisma, { q: '  restaurant  ', limit: 100, offset: 0, userId: null })
    expect(fixtureMerchantIds(a.branches)).toEqual(fixtureMerchantIds(c.branches))
    expect(fixtureMerchantIds(a.branches)).toEqual(fixtureMerchantIds(d.branches))
  })

  it('repeated internal whitespace does not change results', async () => {
    // Both forms hit the businessName substring match via the same normalised
    // "kerala restaurant".
    const a = await searchBranches(prisma, { q: 'kerala restaurant',    limit: 100, offset: 0, userId: null })
    const b = await searchBranches(prisma, { q: 'kerala   restaurant',  limit: 100, offset: 0, userId: null })
    const c = await searchBranches(prisma, { q: 'kerala\trestaurant',   limit: 100, offset: 0, userId: null })
    expect(fixtureMerchantIds(a.branches)).toEqual(fixtureMerchantIds(b.branches))
    expect(fixtureMerchantIds(a.branches)).toEqual(fixtureMerchantIds(c.branches))
  })

  it('non-restaurant keyword: "coffee" and "coffee " return identical results', async () => {
    const a = await searchBranches(prisma, { q: 'coffee',  limit: 100, offset: 0, userId: null })
    const b = await searchBranches(prisma, { q: 'coffee ', limit: 100, offset: 0, userId: null })
    expect(fixtureMerchantIds(a.branches)).toEqual(fixtureMerchantIds(b.branches))
    expect(fixtureMerchantIds(a.branches)).toContain(COFFEE_ID)
  })
})
