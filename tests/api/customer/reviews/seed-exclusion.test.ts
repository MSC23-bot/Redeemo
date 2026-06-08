// tests/api/customer/reviews/seed-exclusion.test.ts
//
// F5 (SEC-C3 parity) — FUNCTIONAL exclusion proof for the unauthenticated review
// endpoints (real DB). Review has no isTestData of its own, so the exclusion runs
// through the related branch + merchant. Fixtures:
//   - REAL merchant (false): real branch (false) [INCLUDED] + a test branch (true)
//     [EXCLUDED via the branch arm].
//   - TEST merchant (true): a non-test branch (false) [EXCLUDED via the merchant arm].
// One reviewer leaves a review on each branch (unique per (user, branch)).
//
// Calls the service functions directly (they take prisma) — no buildApp needed.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  listMerchantReviews,
  listBranchReviews,
  getReviewSummary,
} from '../../../../src/api/customer/reviews/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const P = 'sec-f5-'
const USER_ID = `${P}user-1`
const ID = {
  mReal: `${P}m-real`,
  mTest: `${P}m-test`,
  bReal: `${P}b-real`,
  bTestBranch: `${P}b-testbranch`,
  bUnderTest: `${P}b-undertest`,
}

function branchData(suffix: string, isTestData: boolean) {
  return {
    id: `${P}b-${suffix}`,
    name: 'F5 Branch',
    addressLine1: '1 Test St',
    city: 'Huddersfield',
    postcode: 'HD1 1AA',
    country: 'United Kingdom',
    isActive: true,
    isTestData,
    locationConfidence: 'MANUALLY_CONFIRMED' as const,
    latitude: 53.6463,
    longitude: -1.7809,
    ladDistrict: 'Kirklees',
    adminCounty: 'West Yorkshire',
    region: 'Yorkshire and the Humber',
    locationCountry: 'England',
  }
}

async function cleanup() {
  await prisma.review.deleteMany({ where: { userId: USER_ID } }) // FK: reviews before branches
  await prisma.branch.deleteMany({ where: { id: { startsWith: `${P}b-` } } })
  await prisma.merchant.deleteMany({ where: { id: { startsWith: `${P}m-` } } })
  await prisma.user.deleteMany({ where: { id: USER_ID } })
}

beforeAll(async () => {
  await cleanup()

  await prisma.user.create({
    data: { id: USER_ID, email: `${P}reviewer@example.test`, passwordHash: 'x', status: 'ACTIVE', firstName: 'F5' },
  })

  // REAL merchant: a real branch (included) + a test branch (branch-arm excluded).
  await prisma.merchant.create({
    data: {
      id: ID.mReal,
      businessName: 'F5 Real Co',
      status: 'ACTIVE',
      isTestData: false,
      branches: { create: [branchData('real', false), branchData('testbranch', true)] },
    },
  })

  // TEST merchant: a NON-test branch under it (merchant-arm excluded).
  await prisma.merchant.create({
    data: {
      id: ID.mTest,
      businessName: 'F5 Test Co',
      status: 'ACTIVE',
      isTestData: true,
      branches: { create: [branchData('undertest', false)] },
    },
  })

  // One reviewer, three branches. R1 real (5★); R2 on the test branch (1★); R3 on
  // the test merchant's branch (1★). Only R1 should ever surface.
  await prisma.review.createMany({
    data: [
      { userId: USER_ID, branchId: ID.bReal, rating: 5 },
      { userId: USER_ID, branchId: ID.bTestBranch, rating: 1 },
      { userId: USER_ID, branchId: ID.bUnderTest, rating: 1 },
    ],
  })
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

const PARAMS = { limit: 20, offset: 0, requestingUserId: null }

describe('F5 — review endpoints exclude seed/test supply (real DB)', () => {
  it('listBranchReviews returns a real review and excludes a seed/test BRANCH review', async () => {
    const real = await listBranchReviews(prisma, ID.bReal, PARAMS)
    expect(real.total).toBe(1)
    expect(real.reviews).toHaveLength(1)

    const testBranch = await listBranchReviews(prisma, ID.bTestBranch, PARAMS) // branch.isTestData = true
    expect(testBranch.total).toBe(0)
    expect(testBranch.reviews).toHaveLength(0)
  })

  it("listBranchReviews excludes a review on a seed MERCHANT's (non-test) branch", async () => {
    const underTest = await listBranchReviews(prisma, ID.bUnderTest, PARAMS) // merchant.isTestData = true
    expect(underTest.total).toBe(0)
    expect(underTest.reviews).toHaveLength(0)
  })

  it('listMerchantReviews excludes seed reviews (real merchant returns only its real-branch review)', async () => {
    const real = await listMerchantReviews(prisma, ID.mReal, PARAMS)
    expect(real.total).toBe(1) // R1 only; R2 on the test branch excluded
    expect(real.reviews).toHaveLength(1)

    const testMerchant = await listMerchantReviews(prisma, ID.mTest, PARAMS)
    expect(testMerchant.total).toBe(0)
    expect(testMerchant.reviews).toHaveLength(0)
  })

  it('getReviewSummary total/average/distribution exclude seed reviews and stay consistent with the list', async () => {
    // Real merchant: only R1 (5★) counts. Unfiltered this would be total=2, avg=3.
    const sum = await getReviewSummary(prisma, ID.mReal)
    expect(sum.totalReviews).toBe(1) // matches listMerchantReviews(mReal).total
    expect(sum.averageRating).toBe(5) // R1 only; R2 (1★, test branch) excluded
    expect(sum.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 })

    // Branch-scoped summary on the test branch → 0 (branch arm in the summary).
    const sumTestBranch = await getReviewSummary(prisma, ID.mReal, { branchId: ID.bTestBranch })
    expect(sumTestBranch.totalReviews).toBe(0)

    // Seed merchant → 0 (merchant arm in the summary).
    const sumTestMerchant = await getReviewSummary(prisma, ID.mTest)
    expect(sumTestMerchant.totalReviews).toBe(0)
  })
})
