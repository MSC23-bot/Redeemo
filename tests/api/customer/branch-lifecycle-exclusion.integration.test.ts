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
import { createRedemption } from '../../../src/api/redemption/service'
import { encrypt } from '../../../src/api/shared/encryption'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const P = 'pr5-excl-'
const USER_ID = `${P}user-1`
const MERCHANT_ID = `${P}m-1`
const VOUCHER_ID = `${P}v-1`
const PIN = '1234'
const ID = {
  live:          `${P}b-live`,
  pendingCreate: `${P}b-pendingcreate`,
  pendingClose:  `${P}b-pendingclose`,
}

// In-memory redis shim. createRedemption only touches redis on / after the
// PIN-compare step, which is BELOW the branch-lifecycle gate (line ~131 of
// service.ts). For the PENDING_CREATE rejection these are never called; for
// the flipped-to-LIVE happy path they no-op the rate-limit counter cleanly.
function inMemoryRedisShim(): any {
  return {
    get:    async () => null,
    incr:   async () => 1,
    expire: async () => 1,
    del:    async () => 1,
    ttl:    async () => 900,
    set:    async () => 'OK',
  }
}

const REDEEM_CTX = { ipAddress: '127.0.0.1', userAgent: 'test' }

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
    // Real ciphertext via the shared helper; decrypt() inside createRedemption
    // round-trips it back to PIN when the happy path reaches the PIN compare.
    redemptionPin: encrypt(PIN),
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
  // FK-safe order: redemptions + cycle states + subscription depend on the
  // user / voucher / branch rows, so they are deleted first.
  await prisma.voucherRedemption.deleteMany({ where: { userId: USER_ID } })
  await prisma.userVoucherCycleState.deleteMany({ where: { userId: USER_ID } })
  await prisma.favouriteBranch.deleteMany({ where: { userId: USER_ID } })
  await prisma.review.deleteMany({ where: { userId: USER_ID } })
  await prisma.subscription.deleteMany({ where: { userId: USER_ID } })
  await prisma.voucher.deleteMany({ where: { id: { startsWith: `${P}v-` } } })
  await prisma.branch.deleteMany({ where: { id: { startsWith: `${P}b-` } } })
  await prisma.merchant.deleteMany({ where: { id: { startsWith: `${P}m-` } } })
  await prisma.user.deleteMany({ where: { id: USER_ID } })
}

beforeAll(async () => {
  await cleanup()
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: `${P}reviewer@example.test`,
      passwordHash: 'x',
      status: 'ACTIVE',
      firstName: 'PR5',
      // phoneVerified so the redemption happy path clears the phone gate
      // (gate 6, which sits BELOW the branch-lifecycle gate).
      phoneVerified: true,
    },
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

  // Redemption fixtures (for the createRedemption lifecycle-gate case below).
  // An ACTIVE + APPROVED non-TIME_LIMITED voucher on the active merchant clears
  // redemption gates 1 / 2 / 3 so the branch-lifecycle gate (gate 3b, line ~131
  // of service.ts) is the next thing checked.
  await prisma.voucher.create({
    data: {
      id: VOUCHER_ID,
      merchantId: MERCHANT_ID,
      code: `${P}voucher-code`,
      title: 'PR5 Excl voucher',
      description: 'Redemption lifecycle-gate fixture',
      type: 'BOGO',
      estimatedSaving: '5.00',
      status: 'ACTIVE',
      approvalStatus: 'APPROVED',
      isTestData: false,
    },
  })

  // Reuse a seeded SubscriptionPlan if one exists; otherwise create a throwaway.
  let plan = await prisma.subscriptionPlan.findFirst({ select: { id: true } })
  if (!plan) {
    plan = await prisma.subscriptionPlan.create({
      data: {
        name: 'PR5 Excl test plan',
        priceGbp: '0.00',
        billingInterval: 'MONTHLY',
        stripePriceId: `pr5-excl-price-${Date.now()}`,
        isActive: true,
      },
      select: { id: true },
    })
  }
  const now = new Date()
  const periodEnd = new Date(now)
  periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  await prisma.subscription.create({
    data: {
      userId: USER_ID,
      planId: plan.id,
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cycleAnchorDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
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

  it('createRedemption (redemption hot-path) REJECTS a PENDING_CREATE branch with BRANCH_UNAVAILABLE; the SAME branch flipped to LIVE clears the lifecycle gate', async () => {
    const redis = inMemoryRedisShim()

    // The fixture voucher (ACTIVE + APPROVED, non-TIME_LIMITED) clears
    // redemption gates 1 / 2 / 3; the user has an ACTIVE subscription, a
    // verified phone, and every branch carries a valid PIN. So the ONLY thing
    // that can make the PENDING_CREATE attempt fail with BRANCH_UNAVAILABLE is
    // the branch-lifecycle gate itself (service.ts line ~131), NOT a missing
    // precondition.
    await expect(
      createRedemption(
        prisma,
        redis,
        USER_ID,
        { voucherId: VOUCHER_ID, branchId: ID.pendingCreate, pin: PIN },
        REDEEM_CTX,
      ),
    ).rejects.toThrow(expect.objectContaining({ code: 'BRANCH_UNAVAILABLE' }))

    // Flip the SAME branch to LIVE (and isActive=true, as an approval would).
    // The lifecycle gate must no longer reject it: a real redemption now
    // succeeds end-to-end (it never throws BRANCH_UNAVAILABLE).
    await prisma.branch.update({
      where: { id: ID.pendingCreate },
      data: { lifecycleStatus: 'LIVE' as any, isActive: true },
    })

    const result: any = await createRedemption(
      prisma,
      redis,
      USER_ID,
      { voucherId: VOUCHER_ID, branchId: ID.pendingCreate, pin: PIN },
      REDEEM_CTX,
    )
    expect(result.redemptionCode).toBeTruthy()
    expect(result.branchId).toBe(ID.pendingCreate)

    // Local teardown of the rows this case created (afterAll repeats this for
    // the shared dev DB; doing it here keeps the case self-contained).
    await prisma.voucherRedemption.deleteMany({ where: { userId: USER_ID } })
    await prisma.userVoucherCycleState.deleteMany({ where: { userId: USER_ID } })
  })
})
