import { PrismaClient, Prisma, ReviewReportReason } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { getCurrentCycleWindow } from '../../subscription/cycle'

export function buildDisplayName(firstName: string | null, lastName: string | null): string {
  if (!firstName) return 'Anonymous'
  if (!lastName) return firstName
  return `${firstName} ${lastName.charAt(0)}.`
}

// PR-C 2026-05-09 (Path A): the previous `batchGetVerifiedSet` helper
// derived `isVerified` from "user has any validated redemption at this
// branch" — a reviewer-level trust signal that REQUIRED isValidated.
// Replaced by row-level `Review.redemptionId !== null` derivation
// inside `formatReview`.  Locked rule §0.3: a review is verified iff
// its redemptionId column points to a real redemption owned by the
// user, at the same branch, for the same merchant.  Staff validation
// is NOT required.

// Which of the given reviewIds has the user marked as helpful? Returns a Set
// of reviewId for O(1) lookup. Empty when the user is unauthenticated or the
// review list is empty — both are valid no-ops.
async function batchGetUserHelpfulSet(
  prisma: PrismaClient,
  userId: string | null,
  reviewIds: string[],
): Promise<Set<string>> {
  if (userId === null || reviewIds.length === 0) return new Set()
  const rows = await prisma.reviewHelpful.findMany({
    where:  { userId, reviewId: { in: reviewIds } },
    select: { reviewId: true },
  })
  return new Set(rows.map(r => r.reviewId))
}

export function formatReview(
  review: {
    id: string; branchId: string
    redemptionId: string | null
    branch: { name: string }
    user: { firstName: string | null; lastName: string | null }
    rating: number; comment: string | null
    createdAt: Date; updatedAt: Date
    _count?: { helpfuls: number }
  },
  opts: {
    requestingUserId: string | null
    reviewUserId: string
    userMarkedHelpful: boolean
  },
) {
  return {
    id:                 review.id,
    branchId:           review.branchId,
    branchName:         review.branch.name,
    displayName:        buildDisplayName(review.user.firstName, review.user.lastName),
    rating:             review.rating,
    comment:            review.comment,
    // PR-C §0.3 (Path A): row-level verified-review derivation.
    // True iff the review row is linked to a specific redemption
    // (validated server-side at create/update time per the
    // 5-condition rule).  Replaces the old reviewer-level
    // batchGetVerifiedSet which required isValidated.
    isVerified:         review.redemptionId !== null,
    isOwnReview:        opts.requestingUserId !== null && opts.requestingUserId === opts.reviewUserId,
    createdAt:          review.createdAt.toISOString(),
    updatedAt:          review.updatedAt.toISOString(),
    helpfulCount:       review._count?.helpfuls ?? 0,
    userMarkedHelpful:  opts.userMarkedHelpful,
  }
}

const REVIEW_SELECT = {
  id: true, branchId: true, userId: true, rating: true, comment: true,
  // PR-C 2026-05-09 (Path A): drives row-level isVerified derivation
  // inside formatReview.  Null when the review wasn't submitted from
  // the redemption flow (= isVerified === false).
  redemptionId: true,
  createdAt: true, updatedAt: true,
  branch: { select: { name: true } },
  user:   { select: { firstName: true, lastName: true } },
  _count: { select: { helpfuls: true } },
} as const

type ReviewRow = Prisma.ReviewGetPayload<{ select: typeof REVIEW_SELECT }>

export async function listMerchantReviews(
  prisma: PrismaClient,
  merchantId: string,
  params: { branchId?: string; limit: number; offset: number; requestingUserId: string | null },
) {
  const where: Prisma.ReviewWhereInput = {
    isHidden: false,
    branch: { merchantId, isActive: true },
    ...(params.branchId ? { branchId: params.branchId } : {}),
  }

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      select: REVIEW_SELECT,
      orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
      take: params.limit,
      skip: params.offset,
    }) as Promise<ReviewRow[]>,
    prisma.review.count({ where }),
  ])

  const helpfulSet = await batchGetUserHelpfulSet(
    prisma, params.requestingUserId, reviews.map(r => r.id),
  )

  const formatted = reviews.map(r =>
    formatReview(r, {
      requestingUserId:  params.requestingUserId,
      reviewUserId:      r.userId,
      userMarkedHelpful: helpfulSet.has(r.id),
    }),
  )

  formatted.sort((a, b) => {
    if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return { reviews: formatted, total }
}

// MANDATORY: standalone implementation — do NOT delegate to listMerchantReviews.
// Delegating with empty merchantId would use `branch: { merchantId: '' }` which does not constrain results.
export async function listBranchReviews(
  prisma: PrismaClient,
  branchId: string,
  params: { limit: number; offset: number; requestingUserId: string | null },
) {
  const where: Prisma.ReviewWhereInput = { isHidden: false, branchId }

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      select: REVIEW_SELECT,
      orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
      take: params.limit,
      skip: params.offset,
    }) as Promise<ReviewRow[]>,
    prisma.review.count({ where }),
  ])

  const helpfulSet = await batchGetUserHelpfulSet(
    prisma, params.requestingUserId, reviews.map(r => r.id),
  )

  const formatted = reviews.map(r =>
    formatReview(r, {
      requestingUserId:  params.requestingUserId,
      reviewUserId:      r.userId,
      userMarkedHelpful: helpfulSet.has(r.id),
    }),
  )

  formatted.sort((a, b) => {
    if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return { reviews: formatted, total }
}

// PR-C T15 + Codex review F1 (LOCKED 2026-05-09 §0.3.1) — fetch
// the calling user's current subscription cycle window, or null
// when no subscription exists.  Shared by BOTH Path A (strict
// validation of an explicit redemptionId) AND Path B (auto-link
// most-recent eligible).  Both paths must apply the same cycle-
// window constraint — the locked verified-review rule says a
// review is verified iff it links to a redemption "within the
// current customer cycle" regardless of whether the customer
// supplied the id explicitly or the backend inferred it.
async function getUserCycleWindowOrNull(
  prisma: PrismaClient,
  userId: string,
  now: Date,
): Promise<{ cycleStart: Date; cycleEnd: Date } | null> {
  const sub = await prisma.subscription.findUnique({
    where:  { userId },
    select: { cycleAnchorDate: true },
  })
  if (!sub) return null
  return getCurrentCycleWindow(sub.cycleAnchorDate, now)
}

// PR-C T15 (LOCKED 2026-05-09 §0.3.1) — auto-link helper for Path B.
// Returns the most-recent eligible redemption id for (user, branch,
// branch's merchant) inside the user's current cycle window, or null
// if none qualifies.  The 4-condition rule:
//   1. redemption.userId    === userId
//   2. redemption.branchId  === branchId
//   3. redemption.voucher.merchantId === branch.merchantId
//   4. redemption.redeemedAt ∈ [cycleStart, cycleEnd) for the user's
//      current subscription cycle window
// isValidated is intentionally NOT checked (staff validation is not
// required for verified-review per §0.3).
//
// No Subscription record → return null.  We can't compute a cycle
// window without an anchor date, and the auto-link is best-effort
// (a missing subscription should NOT block the review write).
async function autoLinkRedemption(
  prisma: PrismaClient,
  userId: string,
  branchId: string,
  branchMerchantId: string,
  now: Date,
): Promise<string | null> {
  const cycleWindow = await getUserCycleWindowOrNull(prisma, userId, now)
  if (!cycleWindow) return null
  const redemption = await prisma.voucherRedemption.findFirst({
    where: {
      userId,
      branchId,
      voucher:    { merchantId: branchMerchantId },
      redeemedAt: { gte: cycleWindow.cycleStart, lt: cycleWindow.cycleEnd },
    },
    orderBy: { redeemedAt: 'desc' },
    select:  { id: true },
  })
  return redemption?.id ?? null
}

export async function upsertBranchReview(
  prisma: PrismaClient,
  branchId: string,
  userId: string,
  data: { rating: number; comment?: string; redemptionId?: string },
) {
  // PR-C 2026-05-09 (locked §0.3 + §0.3.1): three derivation paths
  // for the resulting Review.redemptionId:
  //
  //   Path A — strict (caller passed data.redemptionId): validate
  //     the 5-condition rule BEFORE the upsert so a failed
  //     validation never persists a row.  Conditions:
  //       1. review has a non-null redemptionId — caller passed it
  //       2. redemption belongs to the calling user
  //          (findFirst's userId scope handles this — null result
  //           is reported as REDEMPTION_NOT_FOUND to avoid leaking
  //           that the redemption exists for a different user)
  //       3. redemption.branchId === target branchId
  //          (REDEMPTION_BRANCH_MISMATCH otherwise)
  //       4. redemption.voucher.merchantId === branch.merchantId
  //          (REDEMPTION_MERCHANT_MISMATCH otherwise)
  //       5. redemption was successfully created — its existence
  //          in VoucherRedemption covers it
  //     isValidated is intentionally NOT checked.
  //
  //   Path B — auto-link (no explicit redemptionId AND no existing
  //     linkage): try to find the most-recent eligible redemption
  //     in the user's current cycle window via autoLinkRedemption.
  //     None → write with redemptionId=null (unverified), no error.
  //
  //   Path C — preserve (no explicit redemptionId AND existing
  //     review row already has redemptionId set): keep the existing
  //     linkage.  Editing a verified review without re-supplying
  //     redemptionId must NOT silently strip the verified flag.
  const branch = await prisma.branch.findFirst({
    where:  { id: branchId, isActive: true },
    select: { id: true, merchantId: true },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')

  if (data.redemptionId) {
    // PR-C Codex review F1 (LOCKED 2026-05-09 §0.3.1): apply the
    // SAME current-cycle constraint as Path B's auto-link.  The
    // locked rule is "a review is verified iff it links to a real
    // redemption by the same customer, at the same branch, for
    // the same merchant, within the current customer cycle" —
    // owner-supplied redemptionId is no exception.  Without this
    // check, a customer could explicitly re-claim a stale (previous
    // cycle) redemption on a fresh review and bypass the cycle
    // boundary that Path B already enforces.
    //
    // Error code: a stale/cross-cycle redemption surfaces as
    // REDEMPTION_NOT_FOUND (NOT a distinct cycle-mismatch code).
    // Same rationale as the wrong-user case above: don't leak
    // "the redemption exists but is too old".  Customers reaching
    // Path A always come from a fresh redemption flow whose id
    // is by construction in the current cycle, so this code path
    // is purely defensive against malicious/manual API calls.
    const cycleWindow = await getUserCycleWindowOrNull(prisma, userId, new Date())
    if (!cycleWindow) throw new AppError('REDEMPTION_NOT_FOUND')
    const redemption = await prisma.voucherRedemption.findFirst({
      where: {
        id: data.redemptionId, userId,
        redeemedAt: { gte: cycleWindow.cycleStart, lt: cycleWindow.cycleEnd },
      },
      select: {
        id:       true,
        branchId: true,
        voucher:  { select: { merchantId: true } },
      },
    })
    if (!redemption) throw new AppError('REDEMPTION_NOT_FOUND')
    if (redemption.branchId !== branchId) throw new AppError('REDEMPTION_BRANCH_MISMATCH')
    if (redemption.voucher.merchantId !== branch.merchantId) {
      throw new AppError('REDEMPTION_MERCHANT_MISMATCH')
    }
  }

  // Three transactional sub-paths so the read-then-write is consistent
  // (no race between findUnique and update):
  //
  //   1. Initial create — no existing row → upsert's `create` branch runs
  //      (Prisma defaults set createdAt:now, isHidden:false). `helpfuls`
  //      and `reports` start empty.
  //
  //   2. Edit of a CURRENTLY VISIBLE review (existing row, isHidden=false)
  //      → upsert's `update` branch runs. createdAt, helpfuls, reports
  //      preserved. `updatedAt` auto-updates via @updatedAt.
  //
  //   3. Revive of a SOFT-DELETED review (existing row, isHidden=true) →
  //      MUST clear stale state.  Without this branch, the revived row
  //      inherits old `helpfuls` rows + reports from the previous content,
  //      so a brand-new review by the user shows up with "3 people found
  //      this helpful" inherited from a deleted review (caught in
  //      2026-05-04 on-device QA).  Resets:
  //        - delete all `ReviewHelpful` rows for this reviewId
  //        - delete all `ReviewReport`  rows for this reviewId
  //        - explicit `createdAt: new Date()` so any future analytics
  //          that read createdAt sees this as a fresh review
  //        - `isHidden: false` to surface the row again
  //      Path C still applies on revive: if existing.redemptionId is
  //      set and the caller didn't pass redemptionId, preserve it.
  //
  // The @@unique([userId, branchId]) constraint forces us to reuse the
  // same `Review.id` across delete→re-write cycles (we can't insert a
  // second row), but the revive path strips every piece of state that
  // could leak old activity onto new content.
  const review = await prisma.$transaction(async (tx) => {
    const existing = await tx.review.findUnique({
      where:  { userId_branchId: { userId, branchId } },
      select: { id: true, isHidden: true, redemptionId: true },
    })

    // Resolve the effective redemptionId per the three derivation paths.
    let resolvedRedemptionId: string | null
    if (data.redemptionId) {
      // Path A — explicit (already validated above).
      resolvedRedemptionId = data.redemptionId
    } else if (existing && existing.redemptionId) {
      // Path C — preserve existing linkage.  Skip auto-link entirely.
      resolvedRedemptionId = existing.redemptionId
    } else {
      // Path B — auto-link.  Best-effort; null result = unverified.
      resolvedRedemptionId = await autoLinkRedemption(
        prisma, userId, branchId, branch.merchantId, new Date(),
      )
    }

    if (existing && existing.isHidden) {
      await tx.reviewHelpful.deleteMany({ where: { reviewId: existing.id } })
      await tx.reviewReport.deleteMany({  where: { reviewId: existing.id } })
      return tx.review.update({
        where:  { id: existing.id },
        data:   {
          rating:       data.rating,
          comment:      data.comment ?? null,
          redemptionId: resolvedRedemptionId,
          isHidden:     false,
          createdAt:    new Date(),
        },
        select: REVIEW_SELECT,
      })
    }

    return tx.review.upsert({
      where:  { userId_branchId: { userId, branchId } },
      create: {
        userId, branchId,
        rating:       data.rating,
        comment:      data.comment ?? null,
        redemptionId: resolvedRedemptionId,
      },
      update: {
        rating:       data.rating,
        comment:      data.comment ?? null,
        redemptionId: resolvedRedemptionId,
        isHidden:     false,
      },
      select: REVIEW_SELECT,
    })
  }) as ReviewRow

  const helpfulSet = await batchGetUserHelpfulSet(prisma, userId, [review.id])
  return formatReview(review, {
    requestingUserId:  userId,
    reviewUserId:      userId,
    userMarkedHelpful: helpfulSet.has(review.id),
  })
}

export async function deleteBranchReview(
  prisma: PrismaClient,
  reviewId: string,
  userId: string,
) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { userId: true },
  })
  if (!review) throw new AppError('REVIEW_NOT_FOUND')
  if (review.userId !== userId) throw new AppError('REVIEW_NOT_OWNED')

  await prisma.review.update({
    where: { id: reviewId },
    data:  { isHidden: true },
  })
  return { success: true }
}

export async function reportReview(
  prisma: PrismaClient,
  reviewId: string,
  userId: string,
  data: { reason: string; comment?: string },
) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true },
  })
  if (!review) throw new AppError('REVIEW_NOT_FOUND')

  try {
    await prisma.reviewReport.create({
      data: {
        reviewId,
        reportedByUserId: userId,
        reason:  data.reason as ReviewReportReason,
        comment: data.comment ?? null,
      },
    })
  } catch (e) {
    // Duplicate report (same user, same review) — silently ignored
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { success: true, created: false }
    }
    throw e
  }
  return { success: true, created: true }
}

export async function getReviewSummary(
  prisma: PrismaClient,
  merchantId: string,
  opts: { branchId?: string } = {},
) {
  // When branchId is supplied the where clause additionally pins the row to
  // that branch AND requires the branch to belong to merchantId. Mismatched
  // (branchId, merchantId) → zero rows, no error needed (returns the empty
  // shape: averageRating=0, totalReviews=0, distribution all zero).
  //
  // Filter on `isHidden: false` (NOT `isDeleted: false`). User-side review
  // delete sets `isHidden: true` (see `deleteBranchReview` above);
  // `isDeleted` is reserved for future admin-moderation hard-deletes and
  // is never set today. The previous `isDeleted: false` filter was a no-op
  // and let user-deleted reviews leak into rating histograms / total
  // counts on the Reviews tab — confirmed in 2026-05-04 on-device QA.
  // Every other review-aggregation site in the codebase already uses
  // `isHidden: false` (discovery service, ranking helper, list endpoints);
  // this brings the summary into line with that contract.
  const where: Prisma.ReviewWhereInput = {
    isHidden: false,
    branch: opts.branchId
      ? { id: opts.branchId, merchantId, isActive: true }
      : { merchantId, isActive: true },
  }

  const [total, avgAgg, dist] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.aggregate({ where, _avg: { rating: true } }),
    prisma.review.groupBy({
      by: ['rating'],
      where,
      _count: { id: true },
    }),
  ])

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const d of dist) {
    distribution[d.rating] = d._count.id
  }

  return {
    averageRating: avgAgg._avg.rating !== null ? Math.round(avgAgg._avg.rating * 10) / 10 : 0,
    totalReviews: total,
    distribution,
  }
}

export async function toggleHelpful(
  prisma: PrismaClient,
  reviewId: string,
  userId: string,
) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true },
  })
  if (!review) throw new AppError('REVIEW_NOT_FOUND')

  const existing = await prisma.reviewHelpful.findUnique({
    where: { userId_reviewId: { userId, reviewId } },
  })

  if (existing) {
    await prisma.reviewHelpful.delete({
      where: { userId_reviewId: { userId, reviewId } },
    })
    return { helpful: false }
  }

  await prisma.reviewHelpful.create({
    data: { userId, reviewId },
  })
  return { helpful: true }
}
