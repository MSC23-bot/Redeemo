import {
  PrismaClient, Prisma, MerchantStatus, VoucherStatus, ApprovalStatus,
} from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { isOpenNow } from '../../shared/isOpenNow'
import { getCurrentCycleWindow } from '../../subscription/cycle'

export async function addFavouriteMerchant(prisma: PrismaClient, userId: string, merchantId: string) {
  try {
    return await prisma.favouriteMerchant.create({
      data: { userId, merchantId },
      select: { id: true, merchantId: true, createdAt: true },
    })
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError('ALREADY_FAVOURITED')
    }
    throw e
  }
}

export async function removeFavouriteMerchant(prisma: PrismaClient, userId: string, merchantId: string) {
  try {
    await prisma.favouriteMerchant.delete({ where: { userId_merchantId: { userId, merchantId } } })
    return { success: true }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      throw new AppError('FAVOURITE_NOT_FOUND')
    }
    throw e
  }
}

export async function listFavouriteMerchants(
  prisma: PrismaClient,
  userId: string,
  opts: { page: number; limit: number },
) {
  const { page, limit } = opts
  const skip = (page - 1) * limit

  const [rows, total] = await Promise.all([
    prisma.favouriteMerchant.findMany({
      where: { userId },
      select: {
        createdAt: true,
        merchant: {
          select: {
            id: true, businessName: true, tradingName: true,
            logoUrl: true, bannerUrl: true, status: true,
            primaryCategory: { select: { id: true, name: true } },
            vouchers: {
              where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
              select: { estimatedSaving: true },
            },
            branches: {
              where: { isActive: true },
              orderBy: { isMainBranch: 'desc' },
              take: 1,
              select: {
                id: true, name: true, addressLine1: true,
                latitude: true, longitude: true, isMainBranch: true,
                openingHours: {
                  select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.favouriteMerchant.count({ where: { userId } }),
  ])

  // Compute ratings via branch groupBy (same pattern as discovery service)
  const branchIds = rows.flatMap(r => r.merchant.branches.map(b => b.id))
  const ratingGroups = branchIds.length > 0
    ? await prisma.review.groupBy({
        by: ['branchId'],
        where: { branchId: { in: branchIds }, isHidden: false },
        _avg: { rating: true },
        _count: { id: true },
      })
    : []
  const ratingByBranch = Object.fromEntries(
    ratingGroups.map((g: any) => [g.branchId, { avg: g._avg.rating ?? 0, count: g._count.id }]),
  )

  const enriched = rows.map(r => {
    const m = r.merchant
    const branch = m.branches[0] ?? null
    const isUnavailable = m.status !== MerchantStatus.ACTIVE
    const isOpen = !isUnavailable && branch ? isOpenNow(branch.openingHours as any) : false
    const activeVouchers = m.vouchers
    const voucherCount = activeVouchers.length
    const maxEstimatedSaving = activeVouchers.length > 0
      ? Math.max(...activeVouchers.map(v => Number(v.estimatedSaving)))
      : 0

    let totalRating = 0; let totalCount = 0
    for (const b of m.branches) {
      const rb = ratingByBranch[b.id]
      if (rb) { totalRating += rb.avg * rb.count; totalCount += rb.count }
    }
    const avgRating   = totalCount > 0 ? Math.round((totalRating / totalCount) * 10) / 10 : null
    const reviewCount = totalCount

    return {
      id: m.id,
      businessName: m.businessName,
      tradingName:  m.tradingName,
      logoUrl:      m.logoUrl,
      bannerUrl:    m.bannerUrl,
      status:       m.status,
      primaryCategory: m.primaryCategory,
      voucherCount,
      maxEstimatedSaving,
      avgRating,
      reviewCount,
      isOpen,
      branch: branch ? {
        id:           branch.id,
        name:         branch.name,
        addressLine1: branch.addressLine1,
        latitude:     branch.latitude ? Number(branch.latitude) : null,
        longitude:    branch.longitude ? Number(branch.longitude) : null,
      } : null,
      favouritedAt: r.createdAt,
      isUnavailable,
    }
  })

  // Sort: open first, suspended last; within group order is already by favouritedAt desc from DB
  const sorted = enriched.sort((a, b) => {
    if (a.isUnavailable !== b.isUnavailable) return a.isUnavailable ? 1 : -1
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1
    return 0
  })

  const items = sorted.slice(skip, skip + limit)
  return { items, total, page, limit }
}

export async function addFavouriteVoucher(prisma: PrismaClient, userId: string, voucherId: string) {
  try {
    return await prisma.favouriteVoucher.create({
      data: { userId, voucherId },
      select: { id: true, voucherId: true, createdAt: true },
    })
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError('ALREADY_FAVOURITED')
    }
    throw e
  }
}

export async function removeFavouriteVoucher(prisma: PrismaClient, userId: string, voucherId: string) {
  try {
    await prisma.favouriteVoucher.delete({ where: { userId_voucherId: { userId, voucherId } } })
    return { success: true }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      throw new AppError('FAVOURITE_NOT_FOUND')
    }
    throw e
  }
}

export async function listFavouriteVouchers(
  prisma: PrismaClient,
  userId: string,
  opts: { page: number; limit: number },
) {
  const { page, limit } = opts
  const skip = (page - 1) * limit

  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { cycleAnchorDate: true },
  })
  let cycleStart: Date | null = null
  if (subscription?.cycleAnchorDate) {
    const window = getCurrentCycleWindow(subscription.cycleAnchorDate)
    cycleStart = window.cycleStart
  }

  const [rows, total] = await Promise.all([
    prisma.favouriteVoucher.findMany({
      where: { userId },
      select: {
        createdAt: true,
        voucher: {
          select: {
            id: true, title: true, type: true, estimatedSaving: true,
            description: true, expiryDate: true,
            status: true, approvalStatus: true,
            merchant: {
              select: { id: true, businessName: true, logoUrl: true, status: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.favouriteVoucher.count({ where: { userId } }),
  ])

  const voucherIds = rows.map(r => r.voucher.id)
  const cycleStates = cycleStart && voucherIds.length > 0
    ? await prisma.userVoucherCycleState.findMany({
        where: {
          userId,
          voucherId: { in: voucherIds },
          cycleStartDate: { gte: cycleStart },
          isRedeemedInCurrentCycle: true,
        },
        select: { voucherId: true },
      })
    : []
  const redeemedSet = new Set(cycleStates.map(s => s.voucherId))

  const enriched = rows.map(r => {
    const v = r.voucher
    const voucherActive  = v.status === VoucherStatus.ACTIVE && v.approvalStatus === ApprovalStatus.APPROVED
    const merchantActive = v.merchant.status === MerchantStatus.ACTIVE
    const isUnavailable  = !voucherActive || !merchantActive
    return {
      id:                       v.id,
      title:                    v.title,
      type:                     v.type,
      estimatedSaving:          Number(v.estimatedSaving),
      description:              v.description ?? null,
      expiresAt:                v.expiryDate ?? null,
      status:                   v.status,
      approvalStatus:           v.approvalStatus,
      isRedeemedInCurrentCycle: redeemedSet.has(v.id),
      merchant:                 v.merchant,
      favouritedAt:             r.createdAt,
      isUnavailable,
    }
  })

  const sorted = enriched.sort((a, b) => {
    if (a.isUnavailable !== b.isUnavailable) return a.isUnavailable ? 1 : -1
    return 0
  })

  const items = sorted.slice(skip, skip + limit)
  return { items, total, page, limit }
}
