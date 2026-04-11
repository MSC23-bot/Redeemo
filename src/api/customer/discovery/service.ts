import {
  PrismaClient, MerchantStatus, VoucherStatus, ApprovalStatus, CampaignStatus,
} from '../../../generated/prisma/client'
import { AppError } from '../../shared/errors'

// Location context helper — resolves what location label + source to return
// Priority: live coordinates > stored profile city > none
async function resolveLocationContext(
  prisma: PrismaClient,
  userId: string | null,
  lat: number | null,
  lng: number | null,
): Promise<{ city: string | null; lat: number | null; lng: number | null; source: 'coordinates' | 'profile' | 'none' }> {
  if (lat !== null && lng !== null) {
    // Coordinates supplied — use them for proximity, reverse geocode label deferred to Phase 3C
    return { city: null, lat, lng, source: 'coordinates' }
  }
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { city: true },
    })
    if (user?.city) return { city: user.city, lat: null, lng: null, source: 'profile' }
  }
  return { city: null, lat: null, lng: null, source: 'none' }
}

const MERCHANT_PREVIEW_SELECT = {
  id: true, businessName: true, tradingName: true,
  logoUrl: true, bannerUrl: true, description: true,
  primaryCategory: { select: { id: true, name: true } },
  vouchers: {
    where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
    select: { id: true, title: true, estimatedSaving: true, type: true },
    take: 2,
  },
} as const

// ─── Home Feed ───────────────────────────────────────────────────────────────

export async function getHomeFeed(
  prisma: PrismaClient,
  options: { userId: string | null; lat: number | null; lng: number | null },
) {
  const now = new Date()
  const { userId, lat, lng } = options
  const locationCtx = await resolveLocationContext(prisma, userId, lat, lng)

  // Featured merchants — active FeaturedMerchant records within date range
  const featuredRows = await prisma.featuredMerchant.findMany({
    where: {
      isActive:  true,
      startDate: { lte: now },
      endDate:   { gte: now },
      merchant:  { status: MerchantStatus.ACTIVE },
    },
    select: {
      id: true, radiusMiles: true,
      merchant: { select: MERCHANT_PREVIEW_SELECT },
    },
    orderBy: { startDate: 'asc' },
    take: 10,
  })
  const featured = featuredRows.map(f => ({ ...f.merchant, featuredId: f.id, radiusMiles: f.radiusMiles }))

  // Trending merchants — ACTIVE merchants with the most redemptions this calendar month,
  // scoped to user's location (city match if no coordinates; unfiltered if no location context)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const recentRedemptions = await prisma.voucherRedemption.findMany({
    where: { redeemedAt: { gte: monthStart } },
    select: { branch: { select: { merchantId: true, city: true } } },
  })

  // Count redemptions per merchant, apply city filter if available
  const merchantRedemptionCount: Record<string, number> = {}
  for (const r of recentRedemptions) {
    const { merchantId, city } = r.branch
    if (locationCtx.city && city.toLowerCase() !== locationCtx.city.toLowerCase()) continue
    merchantRedemptionCount[merchantId] = (merchantRedemptionCount[merchantId] ?? 0) + 1
  }

  const trendingMerchantIds = Object.entries(merchantRedemptionCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id]) => id)

  const trendingMerchants = trendingMerchantIds.length > 0
    ? await prisma.merchant.findMany({
        where: { id: { in: trendingMerchantIds }, status: MerchantStatus.ACTIVE },
        select: MERCHANT_PREVIEW_SELECT,
      })
    : []
  // Re-sort by redemption count order (Prisma `in` does not preserve order)
  const trending = trendingMerchantIds
    .map(id => trendingMerchants.find(m => m.id === id))
    .filter(Boolean)

  // Active campaigns — for home carousel banners
  const campaigns = await prisma.campaign.findMany({
    where: {
      status:    CampaignStatus.ACTIVE,
      startDate: { lte: now },
      endDate:   { gte: now },
    },
    select: { id: true, name: true, description: true, bannerImageUrl: true },
    orderBy: { startDate: 'asc' },
    take: 5,
  })

  // Nearby by category — active merchants grouped by primary category
  // Phase 3B: "nearby" = city match (if location available); radius filtering deferred to Phase 3C
  const nearbyByCategory: { category: { id: string; name: string }; merchants: any[] }[] = []
  if (locationCtx.city || (locationCtx.lat !== null && locationCtx.lng !== null)) {
    const activeCategories = await prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
      take: 6,
    })

    for (const category of activeCategories) {
      const nearbyMerchants = await prisma.merchant.findMany({
        where: {
          status: MerchantStatus.ACTIVE,
          primaryCategoryId: category.id,
          ...(locationCtx.city
            ? { branches: { some: { isActive: true, city: { equals: locationCtx.city, mode: 'insensitive' } } } }
            : {}),
        },
        select: MERCHANT_PREVIEW_SELECT,
        take: 5,
      })
      if (nearbyMerchants.length > 0) {
        nearbyByCategory.push({ category, merchants: nearbyMerchants })
      }
    }
  }

  return {
    locationContext: { city: locationCtx.city, source: locationCtx.source },
    featured,
    trending,
    campaigns,
    nearbyByCategory,
  }
}

// ─── Merchant Profile ─────────────────────────────────────────────────────────

export async function getCustomerMerchant(
  prisma: PrismaClient,
  merchantId: string,
  userId: string | null,   // null for guest — returns isFavourited: false
) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      id:           true,
      businessName: true,
      tradingName:  true,
      status:       true,
      logoUrl:      true,
      bannerUrl:    true,
      description:  true,
      websiteUrl:   true,
      primaryCategory: { select: { id: true, name: true } },
      categories: {
        select: { category: { select: { id: true, name: true } } },
      },
      vouchers: {
        where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
        select: {
          id: true, title: true, type: true, description: true,
          terms: true, imageUrl: true, estimatedSaving: true,
          expiryDate: true, code: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      branches: {
        where: { isActive: true },
        select: {
          id: true, name: true, isMainBranch: true,
          addressLine1: true, addressLine2: true, city: true, postcode: true,
          phone: true, latitude: true, longitude: true,
          openingHours: {
            select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
            orderBy: { dayOfWeek: 'asc' },
          },
          amenities: {
            select: { amenity: { select: { id: true, name: true, iconUrl: true } } },
          },
          _count: { select: { reviews: { where: { isDeleted: false } } } },
        },
        orderBy: { isMainBranch: 'desc' },
      },
    },
  })

  if (!merchant || merchant.status !== MerchantStatus.ACTIVE) {
    throw new AppError('MERCHANT_UNAVAILABLE')
  }

  // Fix 4: Replace N+1 per-branch aggregate calls with a single groupBy
  const branchIds = merchant.branches.map(b => b.id)
  const ratingGroups = branchIds.length > 0
    ? await prisma.review.groupBy({
        by: ['branchId'],
        where: { branchId: { in: branchIds }, isDeleted: false },
        _avg: { rating: true },
        _count: { id: true },
      })
    : []
  const ratingByBranch = Object.fromEntries(
    ratingGroups.map(g => [g.branchId, { avgRating: g._avg.rating, reviewCount: g._count.id }]),
  )

  // isFavourited — optional-auth pattern: token decoded (not verified), not a security boundary
  let isFavourited = false
  if (userId) {
    const fav = await prisma.favouriteMerchant.findUnique({
      where: { userId_merchantId: { userId, merchantId } },
      select: { id: true },
    })
    isFavourited = fav !== null
  }

  return {
    ...merchant,
    isFavourited,
    branches: merchant.branches.map(b => ({
      ...b,
      avgRating:   ratingByBranch[b.id]?.avgRating   ?? null,
      reviewCount: ratingByBranch[b.id]?.reviewCount ?? 0,
    })),
  }
}

// ─── Branch List (for branch selector in redemption flow) ────────────────────

export async function getCustomerMerchantBranches(prisma: PrismaClient, merchantId: string) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { status: true },
  })
  if (!merchant || merchant.status !== MerchantStatus.ACTIVE) {
    throw new AppError('MERCHANT_UNAVAILABLE')
  }

  return prisma.branch.findMany({
    where: { merchantId, isActive: true },
    select: {
      id: true, name: true, isMainBranch: true,
      addressLine1: true, addressLine2: true, city: true, postcode: true,
      phone: true, latitude: true, longitude: true,
      openingHours: {
        select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
        orderBy: { dayOfWeek: 'asc' },
      },
    },
    orderBy: { isMainBranch: 'desc' },
  })
}

// ─── Voucher Detail ───────────────────────────────────────────────────────────

export async function getCustomerVoucher(
  prisma: PrismaClient,
  voucherId: string,
  userId: string | null,   // null for guest — returns isRedeemedThisCycle: false
) {
  const voucher = await prisma.voucher.findUnique({
    where: { id: voucherId },
    select: {
      id: true, title: true, type: true, description: true,
      terms: true, imageUrl: true, estimatedSaving: true,
      expiryDate: true, code: true, status: true, approvalStatus: true,
      merchant: {
        select: {
          id: true, businessName: true, tradingName: true, logoUrl: true, status: true,
        },
      },
    },
  })

  if (
    !voucher ||
    voucher.status         !== VoucherStatus.ACTIVE  ||
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

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchMerchants(
  prisma: PrismaClient,
  params: { q?: string; categoryId?: string; limit: number; offset: number },
) {
  const { q, categoryId, limit, offset } = params

  const where: any = { status: MerchantStatus.ACTIVE }

  if (q) {
    where.OR = [
      { businessName: { contains: q, mode: 'insensitive' } },
      { tradingName:  { contains: q, mode: 'insensitive' } },
      { description:  { contains: q, mode: 'insensitive' } },
    ]
  }

  if (categoryId) {
    where.AND = [
      {
        OR: [
          { primaryCategoryId: categoryId },
          { categories: { some: { categoryId: categoryId } } },
        ],
      },
    ]
  }

  const [merchants, total] = await Promise.all([
    prisma.merchant.findMany({
      where,
      select: {
        id: true, businessName: true, tradingName: true,
        logoUrl: true, description: true,
        primaryCategory: { select: { id: true, name: true } },
        vouchers: {
          where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
          select: { id: true, title: true, estimatedSaving: true, type: true },
          take: 2,
        },
        branches: {
          where: { isActive: true },
          select: { id: true, city: true, latitude: true, longitude: true },
        },
      },
      orderBy: { businessName: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.merchant.count({ where }),
  ])

  return { merchants, total }
}

// ─── Categories ───────────────────────────────────────────────────────────────

// Fix 5: filter by active merchants via the MerchantCategory join relation
export async function listActiveCategories(prisma: PrismaClient) {
  return prisma.category.findMany({
    where: {
      isActive: true,
      merchants: { some: { merchant: { status: MerchantStatus.ACTIVE } } },
    },
    select: { id: true, name: true, iconUrl: true, illustrationUrl: true },
    orderBy: { sortOrder: 'asc' },
  })
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

export async function getActiveCampaigns(prisma: PrismaClient) {
  const now = new Date()
  return prisma.campaign.findMany({
    where: {
      status:    CampaignStatus.ACTIVE,
      startDate: { lte: now },
      endDate:   { gte: now },
    },
    select: { id: true, name: true, description: true, bannerImageUrl: true },
    orderBy: { startDate: 'asc' },
  })
}

export async function getCampaignMerchants(
  prisma: PrismaClient,
  campaignId: string,
  params: { categoryId?: string; limit: number; offset: number },
) {
  const now = new Date()
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, status: true, startDate: true, endDate: true },
  })

  if (!campaign || campaign.status !== CampaignStatus.ACTIVE || campaign.startDate > now || campaign.endDate < now) {
    throw new AppError('CAMPAIGN_NOT_FOUND')
  }

  const rows = await prisma.campaignMerchant.findMany({
    where: {
      campaignId,
      isActive: true,
      startDate: { lte: now },
      endDate:   { gte: now },
      merchant: {
        status: MerchantStatus.ACTIVE,
        ...(params.categoryId ? {
          OR: [
            { primaryCategoryId: params.categoryId },
            { categories: { some: { categoryId: params.categoryId } } },
          ],
        } : {}),
      },
    },
    select: { merchant: { select: MERCHANT_PREVIEW_SELECT } },
    orderBy: { merchant: { businessName: 'asc' } },
    take:   params.limit,
    skip:   params.offset,
  })

  return rows.map(r => r.merchant)
}
