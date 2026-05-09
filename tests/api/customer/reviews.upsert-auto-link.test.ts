import { describe, it, expect, beforeEach, vi } from 'vitest'
import { upsertBranchReview } from '../../../src/api/customer/reviews/service'

// PR-C T15 (LOCKED 2026-05-09 §0.3.1) — auto-link + preserve.
//
// upsertBranchReview now has THREE derivation paths for the
// resulting Review.redemptionId:
//
//   Path A — strict (existing T3): explicit data.redemptionId →
//     validate 5-condition rule; reject mismatches.
//   Path B — auto-link (T15): no explicit redemptionId AND no
//     existing linkage → most-recent eligible redemption in current
//     cycle window (cycleStart, cycleEnd) wins.
//   Path C — preserve (T15): no explicit redemptionId AND existing
//     redemptionId is set → keep it.
//
// Cycle window via getCurrentCycleWindow(sub.cycleAnchorDate, now).
// No subscription → no auto-link (returns null).
//
// Tests use the same fake-Prisma harness as T2.  The cycle window
// is computed from the real getCurrentCycleWindow helper, so we
// fix `now` indirectly by feeding redeemedAt timestamps relative
// to the system's "now" (subscription anchorDate set so the cycle
// window straddles `now`).  Specifically: anchorDate = 30 days
// before now → current cycle is [anchor, anchor + 1 month) →
// redemption.redeemedAt = now (well within window) for happy path,
// or now - 60 days (previous cycle) for negative.

const now = Date.now()
const TEST_NOW = new Date(now)

// Anchor in the past so the cycle window straddles `now`:
//   anchor = now - 10 days
//   cycleStart = anchor (clamped to anchor's day-of-month in current month)
//   cycleEnd   = cycleStart + 1 month
const TEN_DAYS_AGO = new Date(now - 10 * 24 * 60 * 60 * 1000)
// Way back in the previous cycle:
const SIXTY_DAYS_AGO = new Date(now - 60 * 24 * 60 * 60 * 1000)
// Most-recent-wins probe: a redemption from earlier today (eligible).
const ONE_HOUR_AGO = new Date(now - 60 * 60 * 1000)

const fakePrisma = () => {
  const tx = {
    review:        { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    reviewHelpful: { deleteMany: vi.fn() },
    reviewReport:  { deleteMany: vi.fn() },
  }
  return {
    branch:            { findFirst: vi.fn() },
    voucherRedemption: { findFirst: vi.fn() },
    subscription:      { findUnique: vi.fn() },
    reviewHelpful:     { findMany: vi.fn().mockResolvedValue([]) },
    $transaction:      vi.fn(async (fn: any) => fn(tx)),
    __tx:              tx,
  }
}

const SEED_REVIEW_ROW = {
  id: 'review-1', branchId: 'branch-1', userId: 'user-1',
  rating: 5, comment: 'Great', redemptionId: null,
  createdAt: TEST_NOW, updatedAt: TEST_NOW,
  branch: { name: 'Brightlingsea' },
  user:   { firstName: 'Alex', lastName: 'B' },
  _count: { helpfuls: 0 },
}

describe('upsertBranchReview — Path B auto-link (T15 §0.3.1)', () => {
  let prisma: ReturnType<typeof fakePrisma>

  beforeEach(() => {
    prisma = fakePrisma()
    prisma.branch.findFirst.mockResolvedValue({ id: 'branch-1', merchantId: 'merchant-1' })
    prisma.subscription.findUnique.mockResolvedValue({ cycleAnchorDate: TEN_DAYS_AGO })
    prisma.__tx.review.findUnique.mockResolvedValue(null)  // no existing review
    prisma.__tx.review.upsert.mockResolvedValue(SEED_REVIEW_ROW)
  })

  it('AUTO-LINK happy: eligible redemption in current cycle → attached + isVerified=true', async () => {
    prisma.voucherRedemption.findFirst.mockResolvedValue({ id: 'red-current' })
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', { rating: 5, comment: 'Great' })

    // The auto-link query was issued with the cycle filter.
    expect(prisma.voucherRedemption.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId:   'user-1',
        branchId: 'branch-1',
        voucher:  { merchantId: 'merchant-1' },
        redeemedAt: expect.objectContaining({
          gte: expect.any(Date),
          lt:  expect.any(Date),
        }),
      }),
      orderBy: { redeemedAt: 'desc' },
    }))
    expect(prisma.__tx.review.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ redemptionId: 'red-current' }),
      update: expect.objectContaining({ redemptionId: 'red-current' }),
    }))
  })

  it('AUTO-LINK no eligible: persists with redemptionId=null (no error)', async () => {
    prisma.voucherRedemption.findFirst.mockResolvedValue(null)
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', { rating: 4, comment: 'OK' })
    expect(prisma.__tx.review.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ redemptionId: null }),
      update: expect.objectContaining({ redemptionId: null }),
    }))
  })

  it('AUTO-LINK previous-cycle redemption is NOT eligible (cycle filter applied)', async () => {
    // Simulate Prisma honouring our where filter — the previous-cycle
    // redemption doesn't match `redeemedAt: { gte, lt }` so the query
    // returns null.  We assert the filter shape matches what Prisma
    // would need to apply this constraint.
    prisma.voucherRedemption.findFirst.mockImplementation(async (args: any) => {
      const filter = args.where.redeemedAt
      // Defensive simulation: only return a row if the candidate's
      // redeemedAt is within the [gte, lt) bounds.
      const candidate = SIXTY_DAYS_AGO
      if (candidate < filter.gte || candidate >= filter.lt) return null
      return { id: 'red-prev' }
    })
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', { rating: 4 })
    expect(prisma.__tx.review.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ redemptionId: null }),
    }))
  })

  it('AUTO-LINK uses orderBy redeemedAt desc (most recent wins)', async () => {
    prisma.voucherRedemption.findFirst.mockResolvedValue({ id: 'red-most-recent' })
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', { rating: 5 })
    const findCall = prisma.voucherRedemption.findFirst.mock.calls[0][0]
    expect(findCall.orderBy).toEqual({ redeemedAt: 'desc' })
  })

  it('AUTO-LINK ignores wrong-branch redemption (filter pinned)', async () => {
    prisma.voucherRedemption.findFirst.mockResolvedValue(null)
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', { rating: 4 })
    const findCall = prisma.voucherRedemption.findFirst.mock.calls[0][0]
    expect(findCall.where.branchId).toBe('branch-1')
  })

  it('AUTO-LINK ignores wrong-merchant redemption (filter pinned)', async () => {
    prisma.voucherRedemption.findFirst.mockResolvedValue(null)
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', { rating: 4 })
    const findCall = prisma.voucherRedemption.findFirst.mock.calls[0][0]
    expect(findCall.where.voucher).toEqual({ merchantId: 'merchant-1' })
  })

  it('AUTO-LINK no Subscription record → returns null (no auto-link possible)', async () => {
    prisma.subscription.findUnique.mockResolvedValue(null)
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', { rating: 4 })
    // The voucher-redemption auto-link query is skipped entirely — no
    // cycle window can be computed without an anchor.
    expect(prisma.voucherRedemption.findFirst).not.toHaveBeenCalled()
    expect(prisma.__tx.review.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ redemptionId: null }),
    }))
  })

  it('AUTO-LINK does NOT run when explicit redemptionId is provided (Path A wins)', async () => {
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      id: 'redemption-explicit',
      userId: 'user-1', branchId: 'branch-1',
      voucher: { merchantId: 'merchant-1' },
    })
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', {
      rating: 5, redemptionId: 'redemption-explicit',
    })
    // The strict-validation findFirst was called with id+userId
    // scope (Path A).  Auto-link must NOT have been called — there
    // should be exactly ONE findFirst call total (the strict one).
    expect(prisma.voucherRedemption.findFirst).toHaveBeenCalledTimes(1)
    const findCall = prisma.voucherRedemption.findFirst.mock.calls[0][0]
    expect(findCall.where).toMatchObject({ id: 'redemption-explicit', userId: 'user-1' })
    // Strict-validation query has no orderBy (single id lookup); auto-link
    // would have orderBy.  This pins the path distinction.
    expect(findCall.orderBy).toBeUndefined()
  })
})

describe('upsertBranchReview — Path C preserve (T15 §0.3.1)', () => {
  let prisma: ReturnType<typeof fakePrisma>

  beforeEach(() => {
    prisma = fakePrisma()
    prisma.branch.findFirst.mockResolvedValue({ id: 'branch-1', merchantId: 'merchant-1' })
    prisma.subscription.findUnique.mockResolvedValue({ cycleAnchorDate: TEN_DAYS_AGO })
    prisma.__tx.review.upsert.mockResolvedValue(SEED_REVIEW_ROW)
  })

  it('PRESERVE: existing review has redemptionId=X, edit without redemptionId → still X', async () => {
    prisma.__tx.review.findUnique.mockResolvedValue({
      id: 'review-1', isHidden: false, redemptionId: 'red-existing',
    })
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', { rating: 4, comment: 'Updated' })
    // Auto-link must NOT have run because the existing row already
    // had redemptionId.
    expect(prisma.voucherRedemption.findFirst).not.toHaveBeenCalled()
    expect(prisma.__tx.review.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ redemptionId: 'red-existing' }),
      update: expect.objectContaining({ redemptionId: 'red-existing' }),
    }))
  })

  it('PRESERVE: existing review has null redemptionId → auto-link runs (falls through to Path B)', async () => {
    prisma.__tx.review.findUnique.mockResolvedValue({
      id: 'review-1', isHidden: false, redemptionId: null,
    })
    prisma.voucherRedemption.findFirst.mockResolvedValue({ id: 'red-newly-found' })
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', { rating: 4 })
    expect(prisma.voucherRedemption.findFirst).toHaveBeenCalled()
    expect(prisma.__tx.review.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ redemptionId: 'red-newly-found' }),
    }))
  })

  it('STRICT-WINS: existing review has redemptionId=X, user submits explicit Y (valid) → switches to Y', async () => {
    prisma.__tx.review.findUnique.mockResolvedValue({
      id: 'review-1', isHidden: false, redemptionId: 'red-existing',
    })
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      id: 'redemption-Y', userId: 'user-1', branchId: 'branch-1',
      voucher: { merchantId: 'merchant-1' },
    })
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', {
      rating: 5, redemptionId: 'redemption-Y',
    })
    expect(prisma.__tx.review.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ redemptionId: 'redemption-Y' }),
    }))
  })

  it('REVIVE path (soft-deleted) without explicit redemptionId: existing redemptionId is preserved', async () => {
    prisma.__tx.review.findUnique.mockResolvedValue({
      id: 'review-1', isHidden: true, redemptionId: 'red-prev-cycle',
    })
    prisma.__tx.review.update.mockResolvedValue(SEED_REVIEW_ROW)
    await upsertBranchReview(prisma as any, 'branch-1', 'user-1', { rating: 5, comment: 'Back' })
    expect(prisma.__tx.review.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ redemptionId: 'red-prev-cycle' }),
    }))
  })
})
