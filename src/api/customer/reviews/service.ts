import { PrismaClient, Prisma, ReviewReportReason } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'

export function buildDisplayName(firstName: string | null, lastName: string | null): string {
  if (!firstName) return 'Anonymous'
  if (!lastName) return firstName
  return `${firstName} ${lastName.charAt(0)}.`
}

async function batchGetVerifiedSet(
  prisma: PrismaClient,
  pairs: Array<{ userId: string; branchId: string }>,
): Promise<Set<string>> {
  if (pairs.length === 0) return new Set()
  const redemptions = await prisma.voucherRedemption.findMany({
    where: { OR: pairs.map(p => ({ userId: p.userId, branchId: p.branchId, isValidated: true })) },
    select: { userId: true, branchId: true },
  })
  return new Set(redemptions.map(r => `${r.userId}:${r.branchId}`))
}

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
    branch: { name: string }
    user: { firstName: string | null; lastName: string | null }
    rating: number; comment: string | null
    createdAt: Date; updatedAt: Date
    _count?: { helpfuls: number }
  },
  opts: {
    isVerified: boolean
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
    isVerified:         opts.isVerified,
    isOwnReview:        opts.requestingUserId !== null && opts.requestingUserId === opts.reviewUserId,
    createdAt:          review.createdAt.toISOString(),
    updatedAt:          review.updatedAt.toISOString(),
    helpfulCount:       review._count?.helpfuls ?? 0,
    userMarkedHelpful:  opts.userMarkedHelpful,
  }
}

const REVIEW_SELECT = {
  id: true, branchId: true, userId: true, rating: true, comment: true,
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

  const [verifiedSet, helpfulSet] = await Promise.all([
    batchGetVerifiedSet(prisma, reviews.map(r => ({ userId: r.userId, branchId: r.branchId }))),
    batchGetUserHelpfulSet(prisma, params.requestingUserId, reviews.map(r => r.id)),
  ])

  const formatted = reviews.map(r =>
    formatReview(r, {
      isVerified:        verifiedSet.has(`${r.userId}:${r.branchId}`),
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

  const [verifiedSet, helpfulSet] = await Promise.all([
    batchGetVerifiedSet(prisma, reviews.map(r => ({ userId: r.userId, branchId: r.branchId }))),
    batchGetUserHelpfulSet(prisma, params.requestingUserId, reviews.map(r => r.id)),
  ])

  const formatted = reviews.map(r =>
    formatReview(r, {
      isVerified:        verifiedSet.has(`${r.userId}:${r.branchId}`),
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

export async function upsertBranchReview(
  prisma: PrismaClient,
  branchId: string,
  userId: string,
  data: { rating: number; comment?: string },
) {
  const review = await prisma.review.upsert({
    where:  { userId_branchId: { userId, branchId } },
    create: { userId, branchId, rating: data.rating, comment: data.comment ?? null },
    update: { rating: data.rating, comment: data.comment ?? null, isHidden: false },
    select: REVIEW_SELECT,
  }) as ReviewRow

  const [verifiedSet, helpfulSet] = await Promise.all([
    batchGetVerifiedSet(prisma, [{ userId, branchId }]),
    batchGetUserHelpfulSet(prisma, userId, [review.id]),
  ])
  return formatReview(review, {
    isVerified:        verifiedSet.has(`${userId}:${branchId}`),
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
) {
  const where: Prisma.ReviewWhereInput = {
    isDeleted: false,
    branch: { merchantId, isActive: true },
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
