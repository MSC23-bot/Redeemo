import { PrismaClient, Prisma } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'

function buildDisplayName(firstName: string, lastName: string | null): string {
  if (!lastName) return firstName
  return `${firstName} ${lastName.charAt(0)}.`
}

async function computeIsVerified(
  prisma: PrismaClient,
  userId: string,
  branchId: string,
): Promise<boolean> {
  const redemption = await prisma.voucherRedemption.findFirst({
    where: { userId, branchId, isValidated: true },
    select: { id: true },
  })
  return redemption !== null
}

function formatReview(
  review: {
    id: string; branchId: string
    branch: { name: string }
    user: { firstName: string; lastName: string | null }
    rating: number; comment: string | null
    createdAt: Date; updatedAt: Date
  },
  opts: { isVerified: boolean; requestingUserId: string | null; reviewUserId: string },
) {
  return {
    id:          review.id,
    branchId:    review.branchId,
    branchName:  review.branch.name,
    displayName: buildDisplayName(review.user.firstName, review.user.lastName),
    rating:      review.rating,
    comment:     review.comment,
    isVerified:  opts.isVerified,
    isOwnReview: opts.requestingUserId === opts.reviewUserId,
    createdAt:   review.createdAt.toISOString(),
    updatedAt:   review.updatedAt.toISOString(),
  }
}

const REVIEW_SELECT = {
  id: true, branchId: true, userId: true, rating: true, comment: true,
  createdAt: true, updatedAt: true,
  branch: { select: { name: true } },
  user:   { select: { firstName: true, lastName: true } },
} as const

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
      select: REVIEW_SELECT as any,
      orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
      take: params.limit,
      skip: params.offset,
    }),
    prisma.review.count({ where }),
  ])

  const formatted = await Promise.all(
    (reviews as any[]).map(async (r) => {
      const isVerified = await computeIsVerified(prisma, r.userId, r.branchId)
      return formatReview(r, { isVerified, requestingUserId: params.requestingUserId, reviewUserId: r.userId })
    }),
  )

  formatted.sort((a, b) => {
    if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1
    return b.rating - a.rating
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
      select: REVIEW_SELECT as any,
      orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
      take: params.limit,
      skip: params.offset,
    }),
    prisma.review.count({ where }),
  ])

  const formatted = await Promise.all(
    (reviews as any[]).map(async (r) => {
      const isVerified = await computeIsVerified(prisma, r.userId, r.branchId)
      return formatReview(r, { isVerified, requestingUserId: params.requestingUserId, reviewUserId: r.userId })
    }),
  )

  formatted.sort((a, b) => {
    if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1
    return b.rating - a.rating
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
    select: REVIEW_SELECT as any,
  })

  const isVerified = await computeIsVerified(prisma, userId, branchId)
  return formatReview(review as any, { isVerified, requestingUserId: userId, reviewUserId: userId })
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
        reason:  data.reason as any,
        comment: data.comment ?? null,
      },
    })
  } catch (e) {
    // Duplicate report (same user, same review) — silently ignored
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { success: true }
    }
    throw e
  }
  return { success: true }
}
