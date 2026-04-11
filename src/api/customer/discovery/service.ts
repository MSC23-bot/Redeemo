import { PrismaClient, MerchantStatus, VoucherStatus, ApprovalStatus, CampaignStatus } from '../../../generated/prisma/client'
import { AppError } from '../../shared/errors'

export async function getHomeFeed(prisma: PrismaClient, lat?: number, lng?: number) {
  // lat/lng accepted for future radius filtering — ignored in MVP
  void lat
  void lng

  const now = new Date()

  // Featured merchants: FeaturedMerchant where isActive=true and endDate > now, ordered by cost desc (proxy for priority)
  const featuredListings = await prisma.featuredMerchant.findMany({
    where: {
      isActive: true,
      endDate: { gt: now },
      merchant: { status: MerchantStatus.ACTIVE },
    },
    orderBy: { costGbp: 'desc' },
    include: {
      merchant: {
        select: {
          id: true,
          businessName: true,
          tradingName: true,
          logoUrl: true,
          bannerUrl: true,
          description: true,
          primaryCategoryId: true,
        },
      },
    },
  })

  const featured = featuredListings.map((f) => ({
    ...f.merchant,
    featuredId: f.id,
  }))

  // Trending merchants: ACTIVE merchants with redemptions in current calendar month, limit 10
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const redemptionGroups = await prisma.voucherRedemption.groupBy({
    by: ['voucherId'],
    where: {
      redeemedAt: { gte: startOfMonth },
    },
    _count: { voucherId: true },
    orderBy: { _count: { voucherId: 'desc' } },
  })

  // Get merchant IDs from voucher IDs
  const voucherIds = redemptionGroups.map((r) => r.voucherId)
  const trendingVouchers = voucherIds.length > 0
    ? await prisma.voucher.findMany({
        where: { id: { in: voucherIds } },
        select: { id: true, merchantId: true },
      })
    : []

  // Map voucher redemption counts to merchants
  const merchantRedemptionCount = new Map<string, number>()
  for (const group of redemptionGroups) {
    const voucher = trendingVouchers.find((v) => v.id === group.voucherId)
    if (voucher) {
      const current = merchantRedemptionCount.get(voucher.merchantId) ?? 0
      merchantRedemptionCount.set(voucher.merchantId, current + group._count.voucherId)
    }
  }

  const sortedMerchantIds = [...merchantRedemptionCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id)

  const trendingMerchants = sortedMerchantIds.length > 0
    ? await prisma.merchant.findMany({
        where: { id: { in: sortedMerchantIds }, status: MerchantStatus.ACTIVE },
        select: {
          id: true,
          businessName: true,
          tradingName: true,
          logoUrl: true,
          bannerUrl: true,
          description: true,
          primaryCategoryId: true,
        },
      })
    : []

  // Preserve ordering by redemption count
  const trending = sortedMerchantIds
    .map((id) => trendingMerchants.find((m) => m.id === id))
    .filter(Boolean)

  // Active campaigns
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: CampaignStatus.ACTIVE,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    include: {
      _count: { select: { merchants: true } },
    },
    orderBy: { startDate: 'desc' },
  })

  const campaignSummaries = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    bannerImageUrl: c.bannerImageUrl,
    startDate: c.startDate,
    endDate: c.endDate,
    merchantCount: c._count.merchants,
  }))

  return { featured, trending, campaigns: campaignSummaries }
}

export async function getCustomerMerchant(
  prisma: PrismaClient,
  merchantId: string,
  userId: string | null,
) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: {
      branches: {
        where: { isActive: true },
        include: {
          openingHours: true,
          amenities: {
            include: { amenity: true },
          },
          photos: { orderBy: { sortOrder: 'asc' } },
        },
      },
      tags: true,
      categories: {
        include: { category: true },
      },
    },
  })

  if (!merchant || merchant.status !== MerchantStatus.ACTIVE) {
    throw new AppError('MERCHANT_UNAVAILABLE')
  }

  // Get ratings per branch
  const branchesWithRatings = await Promise.all(
    merchant.branches.map(async (branch) => {
      const agg = await prisma.review.aggregate({
        where: { branchId: branch.id, isDeleted: false },
        _avg: { rating: true },
        _count: { rating: true },
      })
      return {
        ...branch,
        avgRating: agg._avg.rating ?? null,
        reviewCount: agg._count.rating,
      }
    }),
  )

  // isFavourited lookup
  let isFavourited = false
  if (userId) {
    const fav = await prisma.favouriteMerchant.findUnique({
      where: { userId_merchantId: { userId, merchantId } },
      select: { id: true },
    })
    isFavourited = fav !== null
  }

  return { ...merchant, branches: branchesWithRatings, isFavourited }
}

export async function getMerchantBranches(prisma: PrismaClient, merchantId: string) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { status: true },
  })

  if (!merchant || merchant.status !== MerchantStatus.ACTIVE) {
    throw new AppError('MERCHANT_UNAVAILABLE')
  }

  const branches = await prisma.branch.findMany({
    where: { merchantId, isActive: true },
    include: {
      openingHours: true,
      amenities: {
        include: { amenity: true },
      },
    },
    orderBy: [{ isMainBranch: 'desc' }, { name: 'asc' }],
  })

  return branches
}

export async function getCustomerVoucher(
  prisma: PrismaClient,
  voucherId: string,
  userId: string | null,
) {
  const voucher = await prisma.voucher.findUnique({
    where: { id: voucherId },
    include: {
      merchant: {
        select: {
          id: true,
          businessName: true,
          tradingName: true,
          logoUrl: true,
          status: true,
        },
      },
    },
  })

  if (
    !voucher ||
    voucher.status !== VoucherStatus.ACTIVE ||
    voucher.approvalStatus !== ApprovalStatus.APPROVED ||
    voucher.merchant.status !== MerchantStatus.ACTIVE
  ) {
    throw new AppError('VOUCHER_NOT_FOUND')
  }

  let isRedeemedThisCycle = false
  let isFavourited = false

  if (userId) {
    const [cycleState, fav] = await Promise.all([
      prisma.userVoucherCycleState.findUnique({
        where: { userId_voucherId: { userId, voucherId } },
        select: { isRedeemedInCurrentCycle: true },
      }),
      prisma.favouriteVoucher.findUnique({
        where: { userId_voucherId: { userId, voucherId } },
        select: { id: true },
      }),
    ])
    isRedeemedThisCycle = cycleState?.isRedeemedInCurrentCycle ?? false
    isFavourited = fav !== null
  }

  return { ...voucher, isRedeemedThisCycle, isFavourited }
}

export async function searchMerchants(
  prisma: PrismaClient,
  q: string | undefined,
  categoryId: string | undefined,
  lat: number | undefined,
  lng: number | undefined,
  limit: number,
  offset: number,
) {
  // lat/lng accepted for future radius filtering — ignored in MVP
  void lat
  void lng

  if (!q && !categoryId) {
    throw new AppError('SEARCH_QUERY_REQUIRED')
  }

  // Build category filter: include the category and its children
  let categoryIds: string[] | undefined
  if (categoryId) {
    const children = await prisma.category.findMany({
      where: { parentId: categoryId },
      select: { id: true },
    })
    categoryIds = [categoryId, ...children.map((c) => c.id)]
  }

  const whereClause = {
    status: MerchantStatus.ACTIVE,
    AND: [
      // Text search
      q
        ? {
            OR: [
              { businessName: { contains: q, mode: 'insensitive' as const } },
              { tradingName: { contains: q, mode: 'insensitive' as const } },
              { description: { contains: q, mode: 'insensitive' as const } },
              { tags: { some: { tag: { contains: q, mode: 'insensitive' as const } } } },
              {
                categories: {
                  some: {
                    category: { name: { contains: q, mode: 'insensitive' as const } },
                  },
                },
              },
            ],
          }
        : {},
      // Category filter
      categoryIds
        ? {
            OR: [
              { primaryCategoryId: { in: categoryIds } },
              { categories: { some: { categoryId: { in: categoryIds } } } },
            ],
          }
        : {},
    ],
  }

  const [merchants, total] = await Promise.all([
    prisma.merchant.findMany({
      where: whereClause,
      select: {
        id: true,
        businessName: true,
        tradingName: true,
        logoUrl: true,
        bannerUrl: true,
        description: true,
        primaryCategoryId: true,
      },
      orderBy: { businessName: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.merchant.count({ where: whereClause }),
  ])

  return { merchants, total }
}

export async function listCategories(prisma: PrismaClient) {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      iconUrl: true,
      illustrationUrl: true,
      parentId: true,
      sortOrder: true,
    },
    orderBy: { name: 'asc' },
  })
  return categories
}

export async function getCampaign(prisma: PrismaClient, campaignId: string) {
  const now = new Date()

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      merchants: {
        where: { isActive: true },
        include: {
          merchant: {
            select: {
              id: true,
              businessName: true,
              tradingName: true,
              logoUrl: true,
              bannerUrl: true,
              description: true,
              primaryCategoryId: true,
            },
          },
        },
      },
    },
  })

  if (
    !campaign ||
    campaign.status !== CampaignStatus.ACTIVE ||
    campaign.startDate > now ||
    campaign.endDate < now
  ) {
    throw new AppError('CAMPAIGN_NOT_FOUND')
  }

  const participatingMerchants = campaign.merchants.map((cm) => cm.merchant)

  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    bannerImageUrl: campaign.bannerImageUrl,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    status: campaign.status,
    merchants: participatingMerchants,
  }
}
