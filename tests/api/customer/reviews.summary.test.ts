// Integration tests for getReviewSummary branch-scoping (PR #33 fix-up).
// Mirrors the discovery.selectedBranch.test.ts pattern — runs against the
// real Neon DB (DATABASE_URL in .env). Verifies that the new opts.branchId
// argument scopes the rating/breakdown to a single branch and rejects
// branchIds that don't belong to the merchant.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getReviewSummary } from '../../../src/api/customer/reviews/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

type Seeded = {
  merchantId:            string
  otherMerchantId:       string
  brightlingseaId:       string
  colchesterId:          string
  otherMerchantBranchId: string
  userIds:               string[]
}

let seeded: Seeded

// Single seed shared across all tests in this file. Each `await seed()`
// against Neon was ~5s + the first warmed up the connection pool, so calling
// it per-test pushed the first case past the 5s default timeout. Once-only
// fixture mirrors the discovery.selectedBranch test pattern.
beforeAll(async () => {
  const stamp = Date.now()

  // Two merchants. The first has 2 branches with different review counts;
  // the second has 1 branch — used to verify that a branchId from a
  // *different* merchant returns the empty shape, not the other merchant's stats.
  const merchant = await prisma.merchant.create({
    data: {
      businessName: `SummaryTest-${stamp}`,
      status: 'ACTIVE',
      branches: {
        create: [
          { name: 'Brightlingsea', isMainBranch: true,  isActive: true, addressLine1: '1 High St',     city: 'Brightlingsea', postcode: 'CO7 0AA' },
          { name: 'Colchester',    isMainBranch: false, isActive: true, addressLine1: '2 Castle Park', city: 'Colchester',    postcode: 'CO1 1AA' },
        ],
      },
    },
    include: { branches: { orderBy: { createdAt: 'asc' } } },
  })
  const otherMerchant = await prisma.merchant.create({
    data: {
      businessName: `SummaryTestOther-${stamp}`,
      status: 'ACTIVE',
      branches: {
        create: [
          { name: 'Other', isMainBranch: true, isActive: true, addressLine1: '3 Cornhill', city: 'Ipswich', postcode: 'IP1 1AA' },
        ],
      },
    },
    include: { branches: true },
  })

  const brightlingsea = merchant.branches[0]!
  const colchester    = merchant.branches[1]!
  const otherBranch   = otherMerchant.branches[0]!

  // Six reviews on Brightlingsea: ratings 5,5,5,4,4,3 → avg 4.333… → rounds
  // to 4.3. One review on Colchester: rating 4. The Colchester rating is
  // chosen so it's identical to a value that appears in Brightlingsea (4) —
  // means the per-branch summary couldn't pass the totalReviews assertion
  // by accidentally summing across.
  const userIds: string[] = []
  const ratings = [5, 5, 5, 4, 4, 3] as const
  for (let i = 0; i < ratings.length; i++) {
    const u = await prisma.user.create({
      data: { email: `summary-bl-${stamp}-${i}@test.example`, passwordHash: 'x', status: 'ACTIVE' },
    })
    userIds.push(u.id)
    await prisma.review.create({
      data: { branchId: brightlingsea.id, userId: u.id, rating: ratings[i]!, isDeleted: false },
    })
  }
  const colUser = await prisma.user.create({
    data: { email: `summary-col-${stamp}@test.example`, passwordHash: 'x', status: 'ACTIVE' },
  })
  userIds.push(colUser.id)
  await prisma.review.create({
    data: { branchId: colchester.id, userId: colUser.id, rating: 4, isDeleted: false },
  })

  // Add 2 HIDDEN reviews — one on each branch — to guard against the
  // 2026-05-04 regression where getReviewSummary filtered on `isDeleted`
  // (always false in current code) instead of `isHidden`. With these
  // present, any test that doesn't filter on isHidden would over-count.
  // Ratings 1 and 2 are intentionally outliers so a leak would also skew
  // the avgRating assertions, not just the totalReviews counts.
  for (let i = 0; i < 2; i++) {
    const u = await prisma.user.create({
      data: { email: `summary-hidden-${stamp}-${i}@test.example`, passwordHash: 'x', status: 'ACTIVE' },
    })
    userIds.push(u.id)
    await prisma.review.create({
      data: {
        branchId: i === 0 ? brightlingsea.id : colchester.id,
        userId:   u.id,
        rating:   i === 0 ? 1 : 2,
        isDeleted: false,
        isHidden:  true,  // user-side soft-delete state
      },
    })
  }

  seeded = {
    merchantId:            merchant.id,
    otherMerchantId:       otherMerchant.id,
    brightlingseaId:       brightlingsea.id,
    colchesterId:          colchester.id,
    otherMerchantBranchId: otherBranch.id,
    userIds,
  }
}, 60_000)

afterAll(async () => {
  if (seeded) {
    const branchIds = [seeded.brightlingseaId, seeded.colchesterId, seeded.otherMerchantBranchId]
    await prisma.review.deleteMany({ where: { branchId: { in: branchIds } } })
    await prisma.branch.deleteMany({ where: { id: { in: branchIds } } })
    await prisma.merchant.deleteMany({ where: { id: { in: [seeded.merchantId, seeded.otherMerchantId] } } })
    if (seeded.userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: seeded.userIds } } })
    }
  }
  await prisma.$disconnect()
})

describe('getReviewSummary — branch scoping (PR #33 fix-up)', () => {
  it('returns merchant-wide aggregate when no branchId is supplied', async () => {
    const result = await getReviewSummary(prisma, seeded.merchantId)
    // 7 reviews total: 6 on Brightlingsea (5,5,5,4,4,3) + 1 on Colchester (4)
    // avg = (5+5+5+4+4+3+4)/7 = 30/7 ≈ 4.2857 → rounded to 4.3
    expect(result.totalReviews).toBe(7)
    expect(result.averageRating).toBe(4.3)
    expect(result.distribution).toEqual({ 1: 0, 2: 0, 3: 1, 4: 3, 5: 3 })
  })

  it('returns branch-scoped stats when branchId pins to Brightlingsea', async () => {
    const result = await getReviewSummary(prisma, seeded.merchantId, { branchId: seeded.brightlingseaId })
    // 6 reviews: 5,5,5,4,4,3 → avg = 26/6 ≈ 4.333 → rounded to 4.3
    expect(result.totalReviews).toBe(6)
    expect(result.averageRating).toBe(4.3)
    expect(result.distribution).toEqual({ 1: 0, 2: 0, 3: 1, 4: 2, 5: 3 })
  })

  it('returns branch-scoped stats when branchId pins to Colchester', async () => {
    const result = await getReviewSummary(prisma, seeded.merchantId, { branchId: seeded.colchesterId })
    // 1 review: 4 → avg 4.0 (Math.round(4*10)/10 yields 4 — JS strips the .0)
    expect(result.totalReviews).toBe(1)
    expect(result.averageRating).toBe(4)
    expect(result.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 })
  })

  it('returns the empty shape when branchId belongs to a different merchant', async () => {
    const result = await getReviewSummary(prisma, seeded.merchantId, { branchId: seeded.otherMerchantBranchId })
    expect(result.totalReviews).toBe(0)
    expect(result.averageRating).toBe(0)
    expect(result.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })
  })

  it('returns the empty shape when branchId does not exist', async () => {
    const result = await getReviewSummary(prisma, seeded.merchantId, { branchId: 'branch-that-does-not-exist' })
    expect(result.totalReviews).toBe(0)
    expect(result.averageRating).toBe(0)
    expect(result.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })
  })

  // Explicit regression guard for the 2026-05-04 bug: getReviewSummary
  // previously filtered on `isDeleted: false` (a no-op flag — never set
  // in code) instead of `isHidden: false` (the actual user-delete flag).
  // Hidden reviews leaked into rating histogram + totalReviews + average.
  // The seed includes 2 hidden reviews (rating 1 on Brightlingsea, rating
  // 2 on Colchester); this test pins that they're excluded from all
  // scopes and all aggregate fields.
  it('excludes user-deleted (isHidden=true) reviews from totalReviews + averageRating + distribution', async () => {
    const merchantWide = await getReviewSummary(prisma, seeded.merchantId)
    // 7 visible (6 BL + 1 COL), NOT 9 (would-be if hidden leaked)
    expect(merchantWide.totalReviews).toBe(7)
    // Outlier ratings (1, 2) belong ONLY to hidden rows — must be 0
    expect(merchantWide.distribution[1]).toBe(0)
    expect(merchantWide.distribution[2]).toBe(0)

    const brightlingseaScope = await getReviewSummary(prisma, seeded.merchantId, { branchId: seeded.brightlingseaId })
    // 6 visible on Brightlingsea, NOT 7 (would-be with the hidden rating-1 row)
    expect(brightlingseaScope.totalReviews).toBe(6)
    expect(brightlingseaScope.distribution[1]).toBe(0)

    const colchesterScope = await getReviewSummary(prisma, seeded.merchantId, { branchId: seeded.colchesterId })
    // 1 visible on Colchester, NOT 2 (would-be with the hidden rating-2 row)
    expect(colchesterScope.totalReviews).toBe(1)
    expect(colchesterScope.distribution[2]).toBe(0)
  })
})
