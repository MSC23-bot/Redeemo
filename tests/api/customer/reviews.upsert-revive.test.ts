// Integration tests for upsertBranchReview revive semantics (PR #33 fix-up #6).
// Confirms that resurrecting a soft-deleted review clears stale `Helpful`
// and `ReviewReport` rows AND resets `createdAt` so the revived row behaves
// like a brand-new review. Caught in 2026-05-04 on-device QA: a freshly
// written review showed "3 people found this helpful" inherited from a
// previously deleted review on the same (userId, branchId) slot.
//
// Real-Neon integration. Mirrors the pattern in reviews.summary.test.ts.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { upsertBranchReview } from '../../../src/api/customer/reviews/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

type Seeded = {
  merchantId:  string
  branchId:    string
  authorId:    string  // the user whose review gets soft-deleted then re-written
  voterIds:    string[]  // 3 OTHER users whose Helpful + Report rows we attach to the soft-deleted review
}

let seeded: Seeded
let oldReviewId: string  // the id of the seed-time review (carried across the revive — same row by @@unique)
let oldCreatedAt: Date

beforeAll(async () => {
  const stamp = Date.now()

  const merchant = await prisma.merchant.create({
    data: {
      businessName: `UpsertRevive-${stamp}`,
      status: 'ACTIVE',
      branches: {
        create: [
          { name: 'Brightlingsea', isMainBranch: true, isActive: true,
            addressLine1: '1 High St', city: 'Brightlingsea', postcode: 'CO7 0AA' },
        ],
      },
    },
    include: { branches: true },
  })
  const branch = merchant.branches[0]!

  const author = await prisma.user.create({
    data: { email: `upsert-author-${stamp}@test.example`, passwordHash: 'x', status: 'ACTIVE' },
  })

  const voterIds: string[] = []
  for (let i = 0; i < 3; i++) {
    const v = await prisma.user.create({
      data: { email: `upsert-voter-${stamp}-${i}@test.example`, passwordHash: 'x', status: 'ACTIVE' },
    })
    voterIds.push(v.id)
  }

  // Seed-time review: author writes, 3 voters mark Helpful, then author deletes.
  const oldReview = await prisma.review.create({
    data: {
      userId:    author.id,
      branchId:  branch.id,
      rating:    4,
      comment:   'Original content (about to be deleted)',
      // Pin createdAt to a date well in the past so the post-revive
      // assertion (createdAt > oldCreatedAt) is unambiguous.
      createdAt: new Date('2026-01-01T12:00:00Z'),
    },
  })
  oldReviewId  = oldReview.id
  oldCreatedAt = oldReview.createdAt

  // 3 Helpful rows from 3 different voters.
  for (const voterId of voterIds) {
    await prisma.reviewHelpful.create({
      data: { reviewId: oldReview.id, userId: voterId },
    })
  }

  // 1 Report row from one of the voters (not strictly needed for the
  // helpfulCount bug, but the user asked us to clear ReviewReport too).
  await prisma.reviewReport.create({
    data: {
      reviewId:         oldReview.id,
      reportedByUserId: voterIds[0]!,
      reason:           'OFFENSIVE',
      comment:          'Stale report on now-deleted content',
    },
  })

  // Author soft-deletes via the customer-side path: isHidden:true.
  await prisma.review.update({
    where: { id: oldReview.id },
    data:  { isHidden: true },
  })

  seeded = {
    merchantId: merchant.id,
    branchId:   branch.id,
    authorId:   author.id,
    voterIds,
  }
}, 60_000)

afterAll(async () => {
  if (seeded) {
    // Order matters because of FK constraints. The current Review row
    // (potentially revived during tests) needs reports + helpfuls cleared
    // before the row itself can be deleted.
    await prisma.reviewHelpful.deleteMany({ where: { review: { branchId: seeded.branchId } } })
    await prisma.reviewReport.deleteMany({  where: { review: { branchId: seeded.branchId } } })
    await prisma.review.deleteMany({        where: { branchId: seeded.branchId } })
    await prisma.branch.deleteMany({        where: { id: seeded.branchId } })
    await prisma.merchant.deleteMany({      where: { id: seeded.merchantId } })
    const allUserIds = [seeded.authorId, ...seeded.voterIds]
    await prisma.user.deleteMany({          where: { id: { in: allUserIds } } })
  }
  await prisma.$disconnect()
})

describe('upsertBranchReview — revive of soft-deleted review (PR #33 fix-up #6)', () => {
  // Single integration scenario: revive the seeded hidden review and assert
  // every cleanup contract. Splitting into multiple tests would require
  // re-seeding for each (slow, and the assertions are tightly correlated).
  it('clears stale helpfuls + reports + resets createdAt + helpfulCount=0 in response', async () => {
    const result = await upsertBranchReview(
      prisma,
      seeded.branchId,
      seeded.authorId,
      { rating: 5, comment: 'Brand-new content after revive' },
    )

    // Reuses the same Review.id (forced by @@unique([userId, branchId]) — we
    // cannot insert a second row for the same slot). The revive path
    // updates the existing row rather than creating a new one.
    expect(result.id).toBe(oldReviewId)

    // The headline bug: response helpfulCount must be 0. The previous
    // implementation inherited the 3 helpfuls because the Review.id was
    // preserved and the helpfuls table referenced it.
    expect(result.helpfulCount).toBe(0)
    expect(result.userMarkedHelpful).toBe(false)

    // New content surfaced.
    expect(result.rating).toBe(5)
    expect(result.comment).toBe('Brand-new content after revive')

    // Helpful rows for this reviewId are gone from the DB.
    const remainingHelpfuls = await prisma.reviewHelpful.count({ where: { reviewId: oldReviewId } })
    expect(remainingHelpfuls).toBe(0)

    // Report rows for this reviewId are gone too.
    const remainingReports = await prisma.reviewReport.count({ where: { reviewId: oldReviewId } })
    expect(remainingReports).toBe(0)

    // createdAt reset — the revived row's createdAt is recent, NOT the
    // seed-time 2026-01-01 timestamp. Strict inequality is fine because
    // the seed pinned an absolute past date.
    const refreshed = await prisma.review.findUnique({ where: { id: oldReviewId } })
    expect(refreshed!.createdAt.getTime()).toBeGreaterThan(oldCreatedAt.getTime())
    expect(refreshed!.isHidden).toBe(false)
  })
})

// Separate test file boundary keeps these scenarios isolated from the revive
// fixture — each scenario seeds its own row to avoid coupling assertion order
// to the revive test above.
describe('upsertBranchReview — non-revive paths (regression guard)', () => {
  it('initial create: no existing row → fresh row, helpfulCount=0', async () => {
    const stamp = Date.now()
    const merchant = await prisma.merchant.create({
      data: {
        businessName: `UpsertCreate-${stamp}`,
        status: 'ACTIVE',
        branches: { create: [{ name: 'X', isMainBranch: true, isActive: true,
          addressLine1: '1 X St', city: 'X', postcode: 'X1 1XX' }] },
      },
      include: { branches: true },
    })
    const author = await prisma.user.create({
      data: { email: `upsert-create-${stamp}@test.example`, passwordHash: 'x', status: 'ACTIVE' },
    })

    try {
      const result = await upsertBranchReview(
        prisma,
        merchant.branches[0]!.id,
        author.id,
        { rating: 4, comment: 'First review' },
      )
      expect(result.rating).toBe(4)
      expect(result.helpfulCount).toBe(0)
    } finally {
      await prisma.review.deleteMany({   where: { branchId: merchant.branches[0]!.id } })
      await prisma.branch.deleteMany({   where: { id: merchant.branches[0]!.id } })
      await prisma.merchant.deleteMany({ where: { id: merchant.id } })
      await prisma.user.deleteMany({     where: { id: author.id } })
    }
  })

  it('edit (existing row, NOT hidden): preserves helpfuls', async () => {
    // Visible review with 2 helpfuls. Edit to new content. Helpful rows
    // must persist — the edit path is NOT the revive path. Without this
    // guard the revive cleanup could be over-applied to ordinary edits.
    const stamp = Date.now()
    const merchant = await prisma.merchant.create({
      data: {
        businessName: `UpsertEdit-${stamp}`,
        status: 'ACTIVE',
        branches: { create: [{ name: 'X', isMainBranch: true, isActive: true,
          addressLine1: '1 X St', city: 'X', postcode: 'X1 1XX' }] },
      },
      include: { branches: true },
    })
    const author = await prisma.user.create({
      data: { email: `upsert-edit-author-${stamp}@test.example`, passwordHash: 'x', status: 'ACTIVE' },
    })
    const voter1 = await prisma.user.create({
      data: { email: `upsert-edit-voter-1-${stamp}@test.example`, passwordHash: 'x', status: 'ACTIVE' },
    })
    const voter2 = await prisma.user.create({
      data: { email: `upsert-edit-voter-2-${stamp}@test.example`, passwordHash: 'x', status: 'ACTIVE' },
    })
    const branchId = merchant.branches[0]!.id

    // Seed visible review + 2 helpfuls.
    const review = await prisma.review.create({
      data: { userId: author.id, branchId, rating: 3, comment: 'v1', isHidden: false },
    })
    await prisma.reviewHelpful.create({ data: { reviewId: review.id, userId: voter1.id } })
    await prisma.reviewHelpful.create({ data: { reviewId: review.id, userId: voter2.id } })

    try {
      const result = await upsertBranchReview(
        prisma,
        branchId,
        author.id,
        { rating: 5, comment: 'v2 — edited' },
      )
      // Same row updated.
      expect(result.id).toBe(review.id)
      expect(result.rating).toBe(5)
      expect(result.comment).toBe('v2 — edited')
      // Edit path preserves helpfuls — they were 2 before, still 2.
      expect(result.helpfulCount).toBe(2)
      const helpfulRows = await prisma.reviewHelpful.count({ where: { reviewId: review.id } })
      expect(helpfulRows).toBe(2)
    } finally {
      await prisma.reviewHelpful.deleteMany({ where: { review: { branchId } } })
      await prisma.review.deleteMany({       where: { branchId } })
      await prisma.branch.deleteMany({       where: { id: branchId } })
      await prisma.merchant.deleteMany({     where: { id: merchant.id } })
      await prisma.user.deleteMany({         where: { id: { in: [author.id, voter1.id, voter2.id] } } })
    }
  })
})
