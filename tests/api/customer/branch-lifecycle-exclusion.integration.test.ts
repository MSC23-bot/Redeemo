// Branches PR-5 (§5) — FUNCTIONAL customer-exclusion proof (real DB).
//
// A PENDING_CREATE branch must be INVISIBLE on every customer surface; a
// PENDING_CLOSE branch must STAY visible (still live); a CLOSED branch is excluded
// by the existing deletedAt filter. Fixture: ONE active merchant with three
// branches —
//   - LIVE main (visible)
//   - PENDING_CREATE secondary (excluded everywhere)
//   - PENDING_CLOSE secondary (visible — still live until admin approval)
//
// Calls the service functions directly (they take prisma) — no buildApp needed.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  getCustomerMerchant,
  getCustomerMerchantBranches,
} from '../../../src/api/customer/discovery/service'
import {
  listMerchantReviews,
  listBranchReviews,
  upsertBranchReview,
} from '../../../src/api/customer/reviews/service'
import {
  addFavouriteBranch,
  listFavouriteBranches,
} from '../../../src/api/customer/favourites/service'
import { resolveSelectedBranch } from '../../../src/api/customer/discovery/branch-resolver'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const P = 'pr5-excl-'
const USER_ID = `${P}user-1`
const MERCHANT_ID = `${P}m-1`
const ID = {
  live:          `${P}b-live`,
  pendingCreate: `${P}b-pendingcreate`,
  pendingClose:  `${P}b-pendingclose`,
}

function branchData(suffix: string, isMain: boolean, lifecycleStatus: string, isActive = true) {
  return {
    id: `${P}b-${suffix}`,
    name: `PR5 ${suffix}`,
    isMainBranch: isMain,
    addressLine1: '1 Test St',
    city: 'Huddersfield',
    postcode: 'HD1 1AA',
    country: 'GB',
    isActive,
    isTestData: false,
    lifecycleStatus: lifecycleStatus as any,
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
  await prisma.favouriteBranch.deleteMany({ where: { userId: USER_ID } })
  await prisma.review.deleteMany({ where: { userId: USER_ID } })
  await prisma.branch.deleteMany({ where: { id: { startsWith: `${P}b-` } } })
  await prisma.merchant.deleteMany({ where: { id: { startsWith: `${P}m-` } } })
  await prisma.user.deleteMany({ where: { id: USER_ID } })
}

beforeAll(async () => {
  await cleanup()
  await prisma.user.create({
    data: { id: USER_ID, email: `${P}reviewer@example.test`, passwordHash: 'x', status: 'ACTIVE', firstName: 'PR5' },
  })
  await prisma.merchant.create({
    data: {
      id: MERCHANT_ID,
      businessName: 'PR5 Excl Co',
      status: 'ACTIVE',
      isTestData: false,
      branches: {
        create: [
          branchData('live', true, 'LIVE'),
          // PENDING_CREATE is isActive=false in production (belt-and-braces) — set
          // it here so the test mirrors the real staged shape.
          branchData('pendingcreate', false, 'PENDING_CREATE', false),
          branchData('pendingclose', false, 'PENDING_CLOSE'),
        ],
      },
    },
  })
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

describe('Branches PR-5 §5 — PENDING_CREATE excluded / PENDING_CLOSE visible (real DB)', () => {
  it('getCustomerMerchant PICKER (primary leak) excludes PENDING_CREATE, keeps PENDING_CLOSE + LIVE', async () => {
    const merchant = await getCustomerMerchant(prisma, MERCHANT_ID, USER_ID, {})
    const ids = (merchant as any).branches.map((b: any) => b.id)
    expect(ids).toContain(ID.live)
    expect(ids).toContain(ID.pendingClose)
    expect(ids).not.toContain(ID.pendingCreate)
  })

  it('getCustomerMerchantBranches (redemption selector) excludes PENDING_CREATE, keeps PENDING_CLOSE', async () => {
    // getCustomerMerchantBranches returns the branch array directly.
    const result: any[] = await getCustomerMerchantBranches(prisma, MERCHANT_ID)
    const ids = result.map((b: any) => b.id)
    expect(ids).toContain(ID.live)
    expect(ids).toContain(ID.pendingClose)
    expect(ids).not.toContain(ID.pendingCreate)
  })

  it('resolveSelectedBranch never selects / cold-opens a PENDING_CREATE branch (defence-in-depth)', () => {
    const branches = [
      { id: ID.live, isActive: true, isMainBranch: true, lifecycleStatus: 'LIVE', latitude: 1, longitude: 1, createdAt: new Date(1) },
      { id: ID.pendingCreate, isActive: false, isMainBranch: false, lifecycleStatus: 'PENDING_CREATE', latitude: 1, longitude: 1, createdAt: new Date(2) },
      { id: ID.pendingClose, isActive: true, isMainBranch: false, lifecycleStatus: 'PENDING_CLOSE', latitude: 1, longitude: 1, createdAt: new Date(3) },
    ]
    // A pending-create candidate is treated as not-found and falls back.
    const candidate = resolveSelectedBranch(branches, ID.pendingCreate, undefined, undefined)
    expect(candidate.resolvedBranchId).not.toBe(ID.pendingCreate)
    expect(candidate.fallbackReason).toBe('candidate-not-found')
    // Cold-open never resolves to the pending branch.
    const coldOpen = resolveSelectedBranch(branches, null, undefined, undefined)
    expect(coldOpen.resolvedBranchId).not.toBe(ID.pendingCreate)
    // A PENDING_CLOSE candidate IS selectable (still live).
    const pendingCloseCandidate = resolveSelectedBranch(branches, ID.pendingClose, undefined, undefined)
    expect(pendingCloseCandidate.resolvedBranchId).toBe(ID.pendingClose)
    expect(pendingCloseCandidate.fallbackReason).toBe('used-candidate')
  })

  it('listFavouriteBranches excludes a favourite pointing at a PENDING_CREATE branch, keeps PENDING_CLOSE', async () => {
    // Seed favourites directly (bypassing the addFavouriteBranch guard) so the
    // LIST-side exclusion is what is under test.
    await prisma.favouriteBranch.createMany({
      data: [
        { userId: USER_ID, branchId: ID.live },
        { userId: USER_ID, branchId: ID.pendingCreate },
        { userId: USER_ID, branchId: ID.pendingClose },
      ],
    })
    const result: any = await listFavouriteBranches(prisma, USER_ID, { page: 1, limit: 50 })
    // listFavouriteBranches returns { items, total, page, limit }; each item.id is the branch id.
    const ids = result.items.map((b: any) => b.id)
    expect(result.total).toBe(2)
    expect(ids).toContain(ID.live)
    expect(ids).toContain(ID.pendingClose)
    expect(ids).not.toContain(ID.pendingCreate)
    // cleanup for the addFavourite test below
    await prisma.favouriteBranch.deleteMany({ where: { userId: USER_ID } })
  })

  it('addFavouriteBranch REFUSES a PENDING_CREATE branch (BRANCH_NOT_FOUND), allows PENDING_CLOSE + LIVE', async () => {
    await expect(addFavouriteBranch(prisma, USER_ID, ID.pendingCreate)).rejects.toThrow(
      expect.objectContaining({ code: 'BRANCH_NOT_FOUND' }),
    )
    // PENDING_CLOSE + LIVE are favouritable.
    const fav1 = await addFavouriteBranch(prisma, USER_ID, ID.pendingClose)
    expect(fav1.branchId).toBe(ID.pendingClose)
    const fav2 = await addFavouriteBranch(prisma, USER_ID, ID.live)
    expect(fav2.branchId).toBe(ID.live)
    await prisma.favouriteBranch.deleteMany({ where: { userId: USER_ID } })
  })

  it('upsertBranchReview REFUSES a review on a PENDING_CREATE branch (BRANCH_NOT_FOUND), allows PENDING_CLOSE', async () => {
    await expect(
      upsertBranchReview(prisma, ID.pendingCreate, USER_ID, { rating: 5 }),
    ).rejects.toThrow(expect.objectContaining({ code: 'BRANCH_NOT_FOUND' }))

    // A PENDING_CLOSE branch is still live and reviewable.
    const review = await upsertBranchReview(prisma, ID.pendingClose, USER_ID, { rating: 4 })
    expect(review).toBeTruthy()
    await prisma.review.deleteMany({ where: { userId: USER_ID } })
  })

  it('listMerchantReviews / listBranchReviews never surface a PENDING_CREATE branch review', async () => {
    // Seed a review directly on each branch (bypassing the upsert guard) so the
    // LIST-side exclusion is what is under test.
    await prisma.review.createMany({
      data: [
        { userId: USER_ID, branchId: ID.live, rating: 5 },
        { userId: USER_ID, branchId: ID.pendingCreate, rating: 1 },
        { userId: USER_ID, branchId: ID.pendingClose, rating: 4 },
      ],
    })
    const PARAMS = { limit: 50, offset: 0, requestingUserId: null }

    const merchantReviews = await listMerchantReviews(prisma, MERCHANT_ID, PARAMS)
    // LIVE (5) + PENDING_CLOSE (4) surface; PENDING_CREATE (1) excluded -> total 2.
    expect(merchantReviews.total).toBe(2)

    const pendingCreateReviews = await listBranchReviews(prisma, ID.pendingCreate, PARAMS)
    expect(pendingCreateReviews.total).toBe(0)

    const pendingCloseReviews = await listBranchReviews(prisma, ID.pendingClose, PARAMS)
    expect(pendingCloseReviews.total).toBe(1)

    await prisma.review.deleteMany({ where: { userId: USER_ID } })
  })
})
