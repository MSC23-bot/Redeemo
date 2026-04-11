import { PrismaClient } from '../../../../generated/prisma/client'
import { SubscriptionStatus } from '../../../../generated/prisma/enums'

export async function getSavingsSummary(
  prisma: PrismaClient,
  userId: string,
) {
  // All-time aggregates
  const allTime = await prisma.voucherRedemption.aggregate({
    where: { userId },
    _sum: { estimatedSaving: true },
    _count: { id: true },
  })

  const totalSavedPence = Math.round(
    Number(allTime._sum.estimatedSaving ?? 0) * 100,
  )
  const redemptionCount = allTime._count.id

  // Current cycle: look up active subscription's currentPeriodStart
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { currentPeriodStart: true, status: true },
  })

  let currentCycleSavedPence = 0
  let currentCycleRedemptionCount = 0

  if (
    subscription &&
    (subscription.status === SubscriptionStatus.ACTIVE ||
      subscription.status === SubscriptionStatus.TRIALLING)
  ) {
    const cycleAgg = await prisma.voucherRedemption.aggregate({
      where: {
        userId,
        redeemedAt: { gte: subscription.currentPeriodStart },
      },
      _sum: { estimatedSaving: true },
      _count: { id: true },
    })

    currentCycleSavedPence = Math.round(
      Number(cycleAgg._sum.estimatedSaving ?? 0) * 100,
    )
    currentCycleRedemptionCount = cycleAgg._count.id
  }

  return {
    totalSavedPence,
    redemptionCount,
    currentCycleSavedPence,
    currentCycleRedemptionCount,
    allTimeRank: null,
  }
}

export async function getSavingsRedemptions(
  prisma: PrismaClient,
  userId: string,
  params: { limit: number; offset: number },
) {
  const { limit, offset } = params

  const [rows, total] = await Promise.all([
    prisma.voucherRedemption.findMany({
      where: { userId },
      orderBy: { redeemedAt: 'desc' },
      skip: offset,
      take: limit,
      select: {
        id: true,
        redeemedAt: true,
        estimatedSaving: true,
        isValidated: true,
        voucher: {
          select: {
            id: true,
            title: true,
            voucherType: true,
            merchant: {
              select: { id: true, name: true, logoUrl: true },
            },
          },
        },
        branch: {
          select: { id: true, name: true },
        },
      },
    }),
    prisma.voucherRedemption.count({ where: { userId } }),
  ])

  const redemptions = rows.map((r) => ({
    id: r.id,
    createdAt: r.redeemedAt,
    estimatedSaving: Math.round(Number(r.estimatedSaving) * 100),
    isValidated: r.isValidated,
    merchant: {
      id: r.voucher.merchant.id,
      name: r.voucher.merchant.name,
      logoUrl: r.voucher.merchant.logoUrl,
    },
    voucher: {
      id: r.voucher.id,
      title: r.voucher.title,
      voucherType: r.voucher.voucherType,
    },
    branch: {
      id: r.branch.id,
      name: r.branch.name,
    },
  }))

  return { redemptions, total }
}
