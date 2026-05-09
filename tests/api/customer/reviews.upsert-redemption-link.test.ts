import { describe, it, expect, beforeEach, vi } from 'vitest'
import { upsertBranchReview } from '../../../src/api/customer/reviews/service'

// PR-C T2 (LOCKED 2026-05-09 §0.3) — the 5-condition rule for
// `review.isVerified === true`:
//   1. The review has a non-null `redemptionId` (caller passes it).
//   2. The redemption belongs to the authenticated customer.
//   3. The redemption's branch matches the review's target branch.
//   4. The redemption's voucher merchant matches the review branch's merchant.
//   5. The redemption was successfully created (existence covers it).
// Staff validation (`isValidated === true`) is explicitly NOT required.
//
// Unit-test scope: redemption-link validation paths only.  Fake
// Prisma — no Neon round-trip.  The revive semantics (soft-delete
// path) are covered by the existing reviews.upsert-revive
// integration suite; this file focuses on the new redemptionId
// linkage.

const fakePrisma = () => {
  const tx = {
    review:        { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    reviewHelpful: { deleteMany: vi.fn() },
    reviewReport:  { deleteMany: vi.fn() },
  }
  return {
    branch:            { findFirst: vi.fn() },
    voucherRedemption: { findFirst: vi.fn() },
    // PR-C T15 (§0.3.1): autoLinkRedemption reads subscription.cycleAnchorDate.
    // The Path A tests don't exercise auto-link (explicit redemptionId always
    // wins), but the helper still needs `subscription.findUnique` to exist on
    // the fake when no-existing-no-explicit cases fall through to Path B —
    // mock returns null so auto-link short-circuits (no cycle window).
    subscription:      { findUnique: vi.fn().mockResolvedValue(null) },
    reviewHelpful:     { findMany: vi.fn().mockResolvedValue([]) },
    $transaction:      vi.fn(async (fn: any) => fn(tx)),
    __tx:              tx,
  }
}

const SEED_REVIEW_ROW = {
  id: 'review-1', branchId: 'branch-1', userId: 'user-1',
  rating: 5, comment: 'Great', redemptionId: 'redemption-1',
  createdAt: new Date(), updatedAt: new Date(),
  branch: { name: 'Brightlingsea' },
  user:   { firstName: 'Alex', lastName: 'B' },
  _count: { helpfuls: 0 },
}

describe('upsertBranchReview — PR-C redemption-link validation', () => {
  let prisma: ReturnType<typeof fakePrisma>

  beforeEach(() => {
    prisma = fakePrisma()
    prisma.branch.findFirst.mockResolvedValue({
      id: 'branch-1', merchantId: 'merchant-1',
    })
    prisma.__tx.review.findUnique.mockResolvedValue(null)  // no existing review
    prisma.__tx.review.upsert.mockResolvedValue(SEED_REVIEW_ROW)
  })

  it('SUCCESS: review with valid redemptionId persists redemptionId on the row', async () => {
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      id: 'redemption-1', userId: 'user-1', branchId: 'branch-1',
      voucher: { merchantId: 'merchant-1' },
    })
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', {
      rating: 5, comment: 'Great', redemptionId: 'redemption-1',
    })
    expect(prisma.__tx.review.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ redemptionId: 'redemption-1' }),
      update: expect.objectContaining({ redemptionId: 'redemption-1' }),
    }))
  })

  it('SUCCESS: review without redemptionId still creates (backwards-compat)', async () => {
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', {
      rating: 4, comment: 'Good',
    })
    expect(prisma.voucherRedemption.findFirst).not.toHaveBeenCalled()
    // Without redemptionId in the data, the row gets redemptionId: null on
    // both create + update paths (not undefined — explicit null clears any
    // prior linkage on UPDATE).
    expect(prisma.__tx.review.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ rating: 4, comment: 'Good', redemptionId: null }),
      update: expect.objectContaining({ rating: 4, comment: 'Good', redemptionId: null }),
    }))
  })

  it('REJECT: redemption owned by different user → REDEMPTION_NOT_FOUND', async () => {
    // findFirst with userId scoping returns null when the redemption isn't
    // owned by the calling user.  We use REDEMPTION_NOT_FOUND (not a
    // "wrong owner" code) to avoid leaking that the redemption exists
    // for a different user.
    prisma.voucherRedemption.findFirst.mockResolvedValue(null)
    await expect(
      upsertBranchReview(prisma as any, 'branch-1', 'user-1', {
        rating: 5, redemptionId: 'redemption-other-user',
      }),
    ).rejects.toMatchObject({ code: 'REDEMPTION_NOT_FOUND' })
    expect(prisma.__tx.review.upsert).not.toHaveBeenCalled()
  })

  it('REJECT: redemption.branchId does not match → REDEMPTION_BRANCH_MISMATCH', async () => {
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      id: 'redemption-1', userId: 'user-1', branchId: 'branch-other',
      voucher: { merchantId: 'merchant-1' },
    })
    await expect(
      upsertBranchReview(prisma as any, 'branch-1', 'user-1', {
        rating: 5, redemptionId: 'redemption-1',
      }),
    ).rejects.toMatchObject({ code: 'REDEMPTION_BRANCH_MISMATCH' })
    expect(prisma.__tx.review.upsert).not.toHaveBeenCalled()
  })

  it('REJECT: redemption.voucher.merchantId does not match → REDEMPTION_MERCHANT_MISMATCH', async () => {
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      id: 'redemption-1', userId: 'user-1', branchId: 'branch-1',
      voucher: { merchantId: 'merchant-other' },
    })
    await expect(
      upsertBranchReview(prisma as any, 'branch-1', 'user-1', {
        rating: 5, redemptionId: 'redemption-1',
      }),
    ).rejects.toMatchObject({ code: 'REDEMPTION_MERCHANT_MISMATCH' })
    expect(prisma.__tx.review.upsert).not.toHaveBeenCalled()
  })

  it('UPDATE path: existing review row gains redemptionId via upsert', async () => {
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      id: 'redemption-2', userId: 'user-1', branchId: 'branch-1',
      voucher: { merchantId: 'merchant-1' },
    })
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', {
      rating: 5, redemptionId: 'redemption-2',
    })
    expect(prisma.__tx.review.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ redemptionId: 'redemption-2' }),
    }))
  })

  it('STAFF VALIDATION not required — verified linkage works on un-validated redemption', async () => {
    // Locked rule §0.3: verified-review status does NOT require
    // `isValidated === true` on the redemption.  Many merchants
    // validate later or never; gating verification on staff action
    // would lock customers out of their own attribution.
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      id: 'redemption-unvalidated', userId: 'user-1', branchId: 'branch-1',
      voucher: { merchantId: 'merchant-1' },
      // NB: no isValidated field returned in the select projection —
      // the service must not branch on it.
    })
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', {
      rating: 5, redemptionId: 'redemption-unvalidated',
    })
    expect(prisma.__tx.review.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ redemptionId: 'redemption-unvalidated' }),
    }))
  })

  it('voucherRedemption.findFirst is scoped to the calling user (security pin)', async () => {
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      id: 'redemption-1', userId: 'user-1', branchId: 'branch-1',
      voucher: { merchantId: 'merchant-1' },
    })
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', {
      rating: 5, redemptionId: 'redemption-1',
    })
    // Critical: the where clause MUST include userId to prevent a
    // user attaching another user's redemption.  This pin will fire
    // if the implementation drops the userId scope.
    const findFirstCall = prisma.voucherRedemption.findFirst.mock.calls[0][0]
    expect(findFirstCall.where).toEqual(expect.objectContaining({
      id:     'redemption-1',
      userId: 'user-1',
    }))
  })
})
