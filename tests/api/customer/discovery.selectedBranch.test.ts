// Integration tests for getCustomerMerchant selectedBranch (P1.3).
// Runs against the real Neon DB — requires DATABASE_URL in .env.
// Pattern mirrors discovery.merchant.test.ts.

import 'dotenv/config'
import { describe, it, expect, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getCustomerMerchant } from '../../../src/api/customer/discovery/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

type SeededMerchant = {
  id: string
  branches: Array<{
    id: string
    name: string
    isMainBranch: boolean
    isActive: boolean
    photos: Array<{ url: string; sortOrder: number }>
  }>
}

async function seedMultiBranchMerchant(): Promise<SeededMerchant> {
  const merchant = await prisma.merchant.create({
    data: {
      businessName: `P1Test-${Date.now()}`,
      status: 'ACTIVE',
      branches: {
        create: [
          {
            name: 'Brightlingsea',
            isMainBranch: true,
            isActive: true,
            addressLine1: '1 High St',
            city: 'Brightlingsea',
            postcode: 'CO7 0AA',
            latitude: 51.81,
            longitude: 1.02,
            openingHours: {
              create: [
                { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false },
              ],
            },
            photos: {
              create: [{ url: 'https://example.com/p1.jpg', sortOrder: 0 }],
            },
          },
          {
            name: 'Frinton',
            isMainBranch: false,
            isActive: true,
            addressLine1: '2 Sea Rd',
            city: 'Frinton-on-Sea',
            postcode: 'CO13 0AA',
            latitude: 51.84,
            longitude: 1.24,
            openingHours: {
              create: [
                { dayOfWeek: 1, openTime: '10:00', closeTime: '18:00', isClosed: false },
              ],
            },
            // No photos — exercises the §5.4 fallback path
          },
        ],
      },
    },
    include: {
      branches: {
        include: { photos: true },
        orderBy: [{ isMainBranch: 'desc' }, { createdAt: 'asc' }],
      },
    },
  })
  return {
    id: merchant.id,
    branches: merchant.branches.map(b => ({
      id: b.id,
      name: (b as any).name,
      isMainBranch: b.isMainBranch,
      isActive: b.isActive,
      photos: (b as any).photos ?? [],
    })),
  }
}

// seedAuthedCustomer — creates a real user row; returns its id.
// Tests call the service directly (no HTTP), so no JWT generation is needed —
// userId is passed straight into getCustomerMerchant's userId argument.
async function seedAuthedCustomer(): Promise<{ id: string }> {
  const user = await prisma.user.create({
    data: {
      email: `p1test-${Date.now()}@example.com`,
      passwordHash: 'irrelevant',
      status: 'ACTIVE',
    },
  })
  return { id: user.id }
}

// Track IDs for cleanup
const createdMerchantIds: string[] = []
const createdUserIds: string[] = []

// Wrap seed helpers to register for cleanup
async function createMerchant(): Promise<SeededMerchant> {
  const m = await seedMultiBranchMerchant()
  createdMerchantIds.push(m.id)
  return m
}

async function createUser(): Promise<{ id: string }> {
  const u = await seedAuthedCustomer()
  createdUserIds.push(u.id)
  return u
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────

afterAll(async () => {
  // Delete order: voucherRedemptions → reviews → vouchers → branchAmenities → branches (cascades photos + hours) → merchants → users
  if (createdMerchantIds.length > 0) {
    const branchRows = await prisma.branch.findMany({
      where: { merchantId: { in: createdMerchantIds } },
      select: { id: true },
    })
    const branchIds = branchRows.map(b => b.id)
    if (branchIds.length > 0) {
      await prisma.voucherRedemption.deleteMany({ where: { branchId: { in: branchIds } } })
      await prisma.review.deleteMany({ where: { branchId: { in: branchIds } } })
      await prisma.branchAmenity.deleteMany({ where: { branchId: { in: branchIds } } })
      // Branch cascade deletes BranchOpeningHours, BranchPhoto
      await prisma.branch.deleteMany({ where: { id: { in: branchIds } } })
    }
    await prisma.voucher.deleteMany({ where: { merchantId: { in: createdMerchantIds } } })
    await prisma.merchant.deleteMany({ where: { id: { in: createdMerchantIds } } })
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
  }
  await prisma.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/customer/merchants/:id — selectedBranch (P1)', () => {
  it('returns selectedBranch alongside legacy fields when no branchId is passed', async () => {
    const m = await createMerchant()

    const body = await getCustomerMerchant(prisma, m.id, null, { lat: 51.5, lng: -0.1 })

    // Legacy preserved (R1 dual-write)
    expect(body.openingHours).toBeDefined()
    expect(body.photos).toBeDefined()
    expect(body.amenities).toBeDefined()
    expect(body.distance).toBeDefined()
    expect(body.isOpenNow).toBeDefined()
    expect(body.nearestBranch).toBeDefined()

    // selectedBranch block present
    expect(body.selectedBranch).toBeDefined()
    expect(body.selectedBranch!.id).toBeTruthy()
    expect(body.selectedBranch!.openingHours).toBeDefined()
    expect(body.selectedBranch!.photos).toBeDefined()
    expect(body.selectedBranch!.amenities).toBeDefined()
    expect(body.selectedBranch!.isOpenNow).toBeDefined()
    expect(body.selectedBranch!.distance).toBeDefined()
    expect(body.selectedBranch!.avgRating).toBeDefined()
    expect(body.selectedBranch!.reviewCount).toBeDefined()
    expect(body.selectedBranch!.myReview).toBeDefined()  // null when guest

    // branches[] gets isActive + isMainBranch
    expect((body.branches[0] as any).isActive).toBeDefined()
    expect((body.branches[0] as any).isMainBranch).toBeDefined()
  })

  it('honours a valid branchId for selectedBranch', async () => {
    const m = await createMerchant()
    // branches[0] is the main (Brightlingsea), branches[1] is Frinton
    const targetBranchId = m.branches.find(b => !b.isMainBranch)!.id

    const body = await getCustomerMerchant(prisma, m.id, null, { branchId: targetBranchId })

    expect(body.selectedBranch!.id).toBe(targetBranchId)
    expect((body as any).selectedBranchFallbackReason).toBe('used-candidate')
  })

  it('falls back silently when branchId belongs to a different merchant', async () => {
    const m1 = await createMerchant()
    const m2 = await createMerchant()
    const wrongBranchId = m2.branches[0]!.id

    const body = await getCustomerMerchant(prisma, m1.id, null, { branchId: wrongBranchId })

    expect(body.selectedBranch!.id).not.toBe(wrongBranchId)
    expect((body as any).selectedBranchFallbackReason).toBe('candidate-not-found')
  })

  it('flags candidate-inactive when the requested branch is suspended', async () => {
    const m = await createMerchant()
    const suspendedId = m.branches[0]!.id
    await prisma.branch.update({ where: { id: suspendedId }, data: { isActive: false } })

    const body = await getCustomerMerchant(prisma, m.id, null, { branchId: suspendedId })

    expect(body.selectedBranch!.id).not.toBe(suspendedId)
    expect((body as any).selectedBranchFallbackReason).toBe('candidate-inactive')
    // The greyed branch still appears in branches[] for the picker
    expect((body.branches as any[]).find(b => b.id === suspendedId)?.isActive).toBe(false)
  })

  it('all-branches-suspended → selectedBranch is null', async () => {
    const m = await createMerchant()
    await prisma.branch.updateMany({ where: { merchantId: m.id }, data: { isActive: false } })

    const body = await getCustomerMerchant(prisma, m.id, null)

    expect(body.selectedBranch).toBeNull()
    expect((body as any).selectedBranchFallbackReason).toBe('all-suspended')
  })

  it('selectedBranch.isOpenNow is a boolean (computed in Europe/London)', async () => {
    const m = await createMerchant()

    const body = await getCustomerMerchant(prisma, m.id, null)

    expect(typeof body.selectedBranch!.isOpenNow).toBe('boolean')
  })

  it('selectedBranch.myReview is null for unauthenticated requests', async () => {
    const m = await createMerchant()

    const body = await getCustomerMerchant(prisma, m.id, null)

    expect(body.selectedBranch!.myReview).toBeNull()
  })

  it("selectedBranch.myReview returns the user's existing review when present", async () => {
    const m = await createMerchant()
    const { id: userId } = await createUser()
    const targetBranch = m.branches[0]!
    await prisma.review.create({
      data: {
        userId,
        branchId: targetBranch.id,
        rating: 5,
        comment: 'Loved it',
      },
    })

    // Service is called directly — userId is passed as the authed-user argument
    const body = await getCustomerMerchant(prisma, m.id, userId, { branchId: targetBranch.id })

    expect(body.selectedBranch!.myReview).toMatchObject({
      rating: 5,
      comment: 'Loved it',
    })
  })

  // PR #33 fix-up #5 (2026-05-04 on-device QA blocker). The myReview lookup
  // previously used findUnique on (userId, branchId) without filtering by
  // `isHidden`, so a user-deleted review still leaked into the response —
  // the customer-app then rendered "Edit Your Review" + pre-filled the
  // form with the deleted content + lets the user re-submit it back into
  // the visible list. Pin: hidden review must NOT surface as myReview.
  it('selectedBranch.myReview is null when the user has deleted (isHidden=true) their review', async () => {
    const m = await createMerchant()
    const { id: userId } = await createUser()
    const targetBranch = m.branches[0]!
    await prisma.review.create({
      data: {
        userId,
        branchId: targetBranch.id,
        rating: 5,
        comment: 'About to be deleted',
        isHidden: true,  // user-side soft-delete
      },
    })

    const body = await getCustomerMerchant(prisma, m.id, userId, { branchId: targetBranch.id })

    expect(body.selectedBranch!.myReview).toBeNull()
  })

  it('selectedBranch.myReview.isVerified is true when the user has a validated redemption at the branch', async () => {
    const m = await createMerchant()
    const targetBranch = m.branches[0]!
    const { id: userId } = await createUser()

    // Seed an active voucher + a validated redemption so the verified check has something to find.
    const voucher = await prisma.voucher.create({
      data: {
        merchantId: m.id,
        code: `RCV-VRTEST-${Date.now()}`,
        title: 'Test voucher',
        type: 'DISCOUNT_PERCENT',
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        estimatedSaving: 5,
      },
    })
    await prisma.voucherRedemption.create({
      data: {
        userId,
        branchId: targetBranch.id,
        voucherId: voucher.id,
        redemptionCode: `VRTEST${Date.now().toString().slice(-6)}`,
        isValidated: true,
        validatedAt: new Date(),
        validationMethod: 'MANUAL',
        estimatedSaving: 5,
      },
    })
    await prisma.review.create({
      data: { userId, branchId: targetBranch.id, rating: 5, comment: 'Verified review' },
    })

    const body = await getCustomerMerchant(prisma, m.id, userId, { branchId: targetBranch.id })

    expect(body.selectedBranch!.myReview).toMatchObject({
      rating: 5,
      comment: 'Verified review',
      isVerified: true,
    })
  })

  // PR — UX refinement: every entry in `branches[]` must carry `reviewCount`,
  // `avgRating`, AND `openingHours` so the chip picker rows + Reviews toggle
  // can show per-branch counts AND the picker rows + HoursPreviewSheet for
  // Other Locations can render real smart-status text + full week schedule
  // for branches OTHER than the currently selected one.
  //
  // reviewCount + avgRating already ship; this test guards them as a
  // regression. openingHours is the new addition for §6.3 (HoursPreviewSheet)
  // and §7.2 (smart-status text in picker rows).
  it('every branches[] entry includes reviewCount, avgRating, and openingHours', async () => {
    const m = await createMerchant()
    const branchA = m.branches[0]!
    const branchB = m.branches[1]!

    // Seed two distinct users so the @@unique([userId, branchId]) on Review
    // doesn't block — one review on A (rating 4), two reviews on B (rating 5 + 3).
    const user1 = await createUser()
    const user2 = await createUser()
    const user3 = await createUser()
    await prisma.review.create({ data: { userId: user1.id, branchId: branchA.id, rating: 4 } })
    await prisma.review.create({ data: { userId: user2.id, branchId: branchB.id, rating: 5 } })
    await prisma.review.create({ data: { userId: user3.id, branchId: branchB.id, rating: 3 } })

    const body = await getCustomerMerchant(prisma, m.id, null, { lat: 51.5, lng: -0.1 })

    const tileA = body.branches.find((b: any) => b.id === branchA.id)!
    const tileB = body.branches.find((b: any) => b.id === branchB.id)!

    // Existing per-branch ratings — regression guard.
    expect(tileA.reviewCount).toBe(1)
    expect(tileA.avgRating).toBe(4.0)
    expect(tileB.reviewCount).toBe(2)
    expect(tileB.avgRating).toBe(4.0)  // (5+3)/2

    // NEW — openingHours per tile. seedMultiBranchMerchant seeds 1 entry per branch.
    expect(tileA.openingHours).toBeDefined()
    expect(Array.isArray(tileA.openingHours)).toBe(true)
    expect(tileA.openingHours.length).toBe(1)
    expect(tileA.openingHours[0]).toMatchObject({
      dayOfWeek: expect.any(Number),
      openTime:  expect.anything(),
      closeTime: expect.anything(),
      isClosed:  expect.any(Boolean),
    })
    expect(tileB.openingHours.length).toBe(1)
  })

  it('selectedBranch.photos falls back to merchant gallery when branch has none', async () => {
    const m = await createMerchant()
    // Frinton has no photos in the fixture
    const branchWithoutPhotos = m.branches.find(b => b.photos.length === 0)
    if (!branchWithoutPhotos) throw new Error('fixture must have a branch without photos')

    const body = await getCustomerMerchant(prisma, m.id, null, {
      branchId: branchWithoutPhotos.id,
    })

    // Should fall back to the merchant gallery (Brightlingsea's photo)
    expect(Array.isArray(body.selectedBranch!.photos)).toBe(true)
    expect((body.selectedBranch!.photos as string[]).length).toBeGreaterThan(0)
  })
})
