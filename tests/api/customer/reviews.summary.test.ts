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
})
