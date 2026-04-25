import {
  PrismaClient, MerchantStatus, VoucherStatus, ApprovalStatus, CampaignStatus,
  MerchantTagStatus,
  type Prisma,
} from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { haversineMetres } from '../../shared/haversine'
import { isOpenNow } from '../../shared/isOpenNow'

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

const MERCHANT_TILE_SELECT = {
  id:           true,
  businessName: true,
  tradingName:  true,
  logoUrl:      true,
  bannerUrl:    true,
  primaryCategoryId: true,
  primaryCategory: { select: { id: true, name: true, pinColour: true, pinIcon: true } },
  categories: {
    select: {
      category: {
        select: { id: true, name: true, parentId: true },
      },
    },
  },
  vouchers: {
    where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
    select: { id: true, estimatedSaving: true },
  },
  branches: {
    where: { isActive: true },
    select: { id: true, latitude: true, longitude: true },
  },
  _count: {
    select: {
      vouchers: {
        where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
      },
    },
  },
} as const

function enrichMerchantTile(
  merchant: {
    id: string
    businessName: string
    tradingName: string | null
    logoUrl: string | null
    bannerUrl: string | null
    primaryCategory: { id: string; name: string; pinColour: string | null; pinIcon: string | null } | null
    categories: { category: { id: string; name: string; parentId: string | null } }[]
    vouchers: { id: string; estimatedSaving: unknown }[]
    branches: { id: string; latitude: unknown; longitude: unknown }[]
    _count: { vouchers: number }
  },
  opts: {
    lat: number | null
    lng: number | null
    isFavourited: boolean
    avgRating: number | null
    reviewCount: number
  },
) {
  let distance: number | null = null
  let nearestBranchId: string | null = null
  if (opts.lat !== null && opts.lng !== null) {
    for (const branch of merchant.branches) {
      const bLat = branch.latitude !== null ? Number(branch.latitude) : null
      const bLng = branch.longitude !== null ? Number(branch.longitude) : null
      if (bLat === null || bLng === null) continue
      const d = haversineMetres(opts.lat, opts.lng, bLat, bLng)
      if (distance === null || d < distance) {
        distance = d
        nearestBranchId = branch.id
      }
    }
  }

  const subcategory = merchant.categories
    .map(c => c.category)
    .find(c => c.parentId !== null && c.id !== merchant.primaryCategory?.id) ?? null

  const savings = merchant.vouchers.map(v => Number(v.estimatedSaving)).filter(n => !isNaN(n))
  const maxEstimatedSaving = savings.length > 0 ? Math.max(...savings) : null

  return {
    id:                  merchant.id,
    businessName:        merchant.businessName,
    tradingName:         merchant.tradingName,
    logoUrl:             merchant.logoUrl,
    bannerUrl:           merchant.bannerUrl,
    primaryCategory:     merchant.primaryCategory,
    subcategory:         subcategory ? { id: subcategory.id, name: subcategory.name } : null,
    avgRating:           opts.avgRating,
    reviewCount:         opts.reviewCount,
    voucherCount:        merchant._count.vouchers,
    maxEstimatedSaving,
    isFavourited:        opts.isFavourited,
    distance,
    nearestBranchId,
  }
}

async function enrichMerchantTiles(
  prisma: PrismaClient,
  merchants: Array<{
    id: string
    businessName: string
    tradingName: string | null
    logoUrl: string | null
    bannerUrl: string | null
    primaryCategory: { id: string; name: string; pinColour: string | null; pinIcon: string | null } | null
    categories: { category: { id: string; name: string; parentId: string | null } }[]
    vouchers: { id: string; estimatedSaving: unknown }[]
    branches: { id: string; latitude: unknown; longitude: unknown }[]
    _count: { vouchers: number }
  }>,
  opts: { lat: number | null; lng: number | null; userId: string | null },
) {
  if (merchants.length === 0) return []

  const merchantIds = merchants.map(m => m.id)
  const branchIds = merchants.flatMap(m => m.branches.map(b => b.id))

  // Single groupBy for all branch ratings
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

  const ratingByMerchant: Record<string, { avgRating: number | null; reviewCount: number }> = {}
  for (const m of merchants) {
    let totalRating = 0; let totalCount = 0
    for (const b of m.branches) {
      const r = ratingByBranch[b.id]
      if (r) { totalRating += r.avg * r.count; totalCount += r.count }
    }
    ratingByMerchant[m.id] = {
      avgRating:   totalCount > 0 ? Math.round((totalRating / totalCount) * 10) / 10 : null,
      reviewCount: totalCount,
    }
  }

  const favouritedSet = new Set<string>()
  if (opts.userId) {
    const favs = await prisma.favouriteMerchant.findMany({
      where: { userId: opts.userId, merchantId: { in: merchantIds } },
      select: { merchantId: true },
    })
    for (const f of favs as any[]) favouritedSet.add(f.merchantId)
  }

  return merchants.map(m =>
    enrichMerchantTile(m, {
      lat:          opts.lat,
      lng:          opts.lng,
      isFavourited: favouritedSet.has(m.id),
      avgRating:    ratingByMerchant[m.id]?.avgRating ?? null,
      reviewCount:  ratingByMerchant[m.id]?.reviewCount ?? 0,
    }),
  )
}

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
      merchant: { select: MERCHANT_TILE_SELECT as any },
    },
    orderBy: { startDate: 'asc' },
    take: 10,
  })
  const featured = featuredRows.map((f: any) => ({ ...f.merchant, featuredId: f.id, radiusMiles: f.radiusMiles }))

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
        select: MERCHANT_TILE_SELECT as any,
      })
    : []
  // Re-sort by redemption count order (Prisma `in` does not preserve order)
  const trending = trendingMerchantIds
    .map(id => trendingMerchants.find((m: any) => m.id === id))
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

  // Nearby by category — MANDATORY: single query — do NOT loop per category
  const nearbyMerchantsRaw = locationCtx.city || (locationCtx.lat !== null)
    ? await prisma.merchant.findMany({
        where: {
          status: MerchantStatus.ACTIVE,
          branches: {
            some: {
              isActive: true,
              ...(locationCtx.city ? { city: { equals: locationCtx.city, mode: 'insensitive' } } : {}),
            },
          },
        },
        select: MERCHANT_TILE_SELECT as any,
        take: 60,
      })
    : []

  // Group by primaryCategoryId in JS — up to 6 categories, up to 5 merchants each
  const byCategory: Record<string, typeof nearbyMerchantsRaw> = {}
  for (const m of nearbyMerchantsRaw) {
    const cat = (m as any).primaryCategoryId
    if (!cat) continue
    if (!byCategory[cat]) byCategory[cat] = []
    if (byCategory[cat].length < 5) byCategory[cat].push(m)
  }

  const nearbyByCategory = Object.entries(byCategory)
    .slice(0, 6)
    .map(([catId, merchants]) => ({
      category: (merchants[0] as any).primaryCategory ?? { id: catId, name: '' },
      merchants,
    }))

  const [enrichedFeatured, enrichedTrending] = await Promise.all([
    enrichMerchantTiles(prisma, featured as any, { lat: locationCtx.lat, lng: locationCtx.lng, userId }),
    enrichMerchantTiles(prisma, trending as any, { lat: locationCtx.lat, lng: locationCtx.lng, userId }),
  ])

  // Enrich all nearbyByCategory merchants in a single batch (one groupBy + one findMany total)
  const allNearbyMerchants = nearbyByCategory.flatMap(item => item.merchants)
  const allNearbyEnriched = await enrichMerchantTiles(prisma, allNearbyMerchants as any, { lat: locationCtx.lat, lng: locationCtx.lng, userId })
  const enrichedById = Object.fromEntries(allNearbyEnriched.map(m => [m.id, m]))
  const enrichedNearby = nearbyByCategory.map(item => ({
    category: item.category,
    merchants: item.merchants.map((m: any) => enrichedById[m.id]),
  }))

  return {
    locationContext: { city: locationCtx.city, source: locationCtx.source },
    featured: enrichedFeatured,
    trending: enrichedTrending,
    campaigns,
    nearbyByCategory: enrichedNearby,
  }
}

// ─── Merchant Profile ─────────────────────────────────────────────────────────

export async function getCustomerMerchant(
  prisma: PrismaClient,
  merchantId: string,
  userId: string | null,   // null for guest — returns isFavourited: false
  opts: { lat?: number; lng?: number } = {},
) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      id: true, businessName: true, tradingName: true,
      status: true, logoUrl: true, bannerUrl: true,
      description: true, websiteUrl: true,
      phone: true, email: true,
      primaryCategory: { select: { id: true, name: true, pinColour: true, pinIcon: true } },
      categories: { select: { category: { select: { id: true, name: true, parentId: true } } } },
      vouchers: {
        where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
        select: {
          id: true, title: true, type: true, description: true,
          terms: true, imageUrl: true, estimatedSaving: true, expiryDate: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      branches: {
        where: { isActive: true },
        select: {
          id: true, name: true, isMainBranch: true,
          addressLine1: true, addressLine2: true, city: true, postcode: true,
          phone: true, email: true, latitude: true, longitude: true,
          openingHours: {
            select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
            orderBy: { dayOfWeek: 'asc' },
          },
          amenities: {
            select: { amenity: { select: { id: true, name: true, iconUrl: true } } },
          },
          photos: {
            select: { url: true, sortOrder: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { isMainBranch: 'desc' },
      },
    },
  })

  if (!merchant || merchant.status !== MerchantStatus.ACTIVE) {
    throw new AppError('MERCHANT_UNAVAILABLE')
  }

  const branchIds = merchant.branches.map((b: any) => b.id)
  const ratingGroups = branchIds.length > 0
    ? await prisma.review.groupBy({
        by: ['branchId'],
        where: { branchId: { in: branchIds }, isHidden: false },
        _avg: { rating: true },
        _count: { id: true },
      })
    : []
  const ratingByBranch = Object.fromEntries(
    ratingGroups.map((g: any) => [g.branchId, { avgRating: g._avg.rating, reviewCount: g._count.id }]),
  )

  let totalRating = 0; let totalCount = 0
  for (const g of ratingGroups as any[]) {
    totalRating += (g._avg.rating ?? 0) * g._count.id
    totalCount  += g._count.id
  }
  const avgRating   = totalCount > 0 ? Math.round((totalRating / totalCount) * 10) / 10 : null
  const reviewCount = totalCount

  // isFavourited — optional-auth pattern: token decoded (not verified), not a security boundary
  let isFavourited = false
  if (userId) {
    const fav = await prisma.favouriteMerchant.findUnique({
      where: { userId_merchantId: { userId, merchantId } },
      select: { id: true },
    })
    isFavourited = fav !== null
  }

  let distance: number | null = null
  let nearestBranchId: string | null = null
  const { lat, lng } = opts
  if (lat !== undefined && lng !== undefined) {
    for (const b of merchant.branches) {
      const bLat = b.latitude !== null ? Number(b.latitude) : null
      const bLng = b.longitude !== null ? Number(b.longitude) : null
      if (bLat === null || bLng === null) continue
      const d = haversineMetres(lat, lng, bLat, bLng)
      if (distance === null || d < distance) { distance = d; nearestBranchId = b.id }
    }
  }

  const nearestBranch = nearestBranchId
    ? merchant.branches.find((b: any) => b.id === nearestBranchId) ?? null
    : (merchant.branches[0] ?? null)

  const nearestHours = nearestBranch?.openingHours ?? []
  const openNow = isOpenNow(nearestHours)

  const subcategory = merchant.categories
    .map((c: any) => c.category)
    .find((c: any) => c.parentId !== null && c.id !== merchant.primaryCategory?.id) ?? null

  const photos = merchant.branches.flatMap((b: any) => b.photos.map((p: any) => p.url))

  return {
    ...merchant,
    vouchers: merchant.vouchers.map((v: any) => ({
      ...v,
      estimatedSaving: Number(v.estimatedSaving),
    })),
    about:       merchant.description,
    subcategory: subcategory ? { id: subcategory.id, name: subcategory.name } : null,
    avgRating,
    reviewCount,
    isFavourited,
    distance,
    nearestBranch: nearestBranch ? {
      id: nearestBranch.id, name: nearestBranch.name,
      addressLine1: nearestBranch.addressLine1, addressLine2: nearestBranch.addressLine2,
      city: nearestBranch.city, postcode: nearestBranch.postcode,
      latitude:  nearestBranch.latitude  !== null ? Number(nearestBranch.latitude)  : null,
      longitude: nearestBranch.longitude !== null ? Number(nearestBranch.longitude) : null,
      phone: nearestBranch.phone, email: nearestBranch.email,
      distance,
      isOpenNow: openNow,
    } : null,
    isOpenNow:    openNow,
    openingHours: nearestHours,
    amenities:    (nearestBranch?.amenities ?? []).map((a: any) => a.amenity),
    photos,
    branches: merchant.branches.map((b: any) => ({
      id: b.id, name: b.name,
      addressLine1: b.addressLine1, addressLine2: b.addressLine2,
      city: b.city, postcode: b.postcode,
      latitude:  b.latitude  !== null ? Number(b.latitude)  : null,
      longitude: b.longitude !== null ? Number(b.longitude) : null,
      phone: b.phone, email: b.email,
      distance: (lat !== undefined && lng !== undefined)
        ? (() => {
            const bLat = b.latitude !== null ? Number(b.latitude) : null
            const bLng = b.longitude !== null ? Number(b.longitude) : null
            return bLat !== null && bLng !== null ? haversineMetres(lat, lng, bLat, bLng) : null
          })()
        : null,
      isOpenNow:   isOpenNow(b.openingHours),
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

  return {
    ...voucher,
    estimatedSaving: Number(voucher.estimatedSaving),
    isRedeemedThisCycle,
    isFavourited,
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchMerchants(
  prisma: PrismaClient,
  params: {
    q?: string
    categoryId?: string
    subcategoryId?: string
    lat?: number
    lng?: number
    minLat?: number; maxLat?: number; minLng?: number; maxLng?: number
    maxDistanceMiles?: number
    minSaving?: number
    voucherTypes?: string[]
    amenityIds?: string[]
    openNow?: boolean
    featured?: boolean
    topRated?: boolean
    sortBy?: 'relevance' | 'nearest' | 'top_rated' | 'highest_saving'
    // TODO: most_popular sort — requires redemption count join; not implemented in MVP
    limit: number
    offset: number
    userId: string | null
  },
) {
  const { q, categoryId, subcategoryId, lat, lng, minLat, maxLat, minLng, maxLng,
          minSaving, voucherTypes, amenityIds, openNow, featured, topRated,
          sortBy, limit, offset, userId } = params

  if (!q && !categoryId && !subcategoryId && minLat === undefined) {
    throw new AppError('SEARCH_QUERY_REQUIRED')
  }

  const where: Prisma.MerchantWhereInput = { status: MerchantStatus.ACTIVE }

  if (q) {
    const tags = await prisma.merchantTag.findMany({
      where: { tag: { contains: q, mode: 'insensitive' }, status: MerchantTagStatus.APPROVED },
      select: { merchantId: true },
    })
    const tagMerchantIds = [...new Set(tags.map((t: any) => t.merchantId))]
    where.OR = [
      { businessName:    { contains: q, mode: 'insensitive' } },
      { tradingName:     { contains: q, mode: 'insensitive' } },
      { description:     { contains: q, mode: 'insensitive' } },
      { primaryCategory: { name: { contains: q, mode: 'insensitive' } } },
      { categories:      { some: { category: { name: { contains: q, mode: 'insensitive' } } } } },
      ...(tagMerchantIds.length > 0 ? [{ id: { in: tagMerchantIds } }] : []),
    ]
  }

  if (categoryId) {
    const children = await prisma.category.findMany({
      where: { parentId: categoryId },
      select: { id: true },
    })
    const catIds = [categoryId, ...children.map((c: any) => c.id)]
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { OR: [
        { primaryCategoryId: { in: catIds } },
        { categories: { some: { categoryId: { in: catIds } } } },
      ]},
    ]
  }

  if (subcategoryId) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { OR: [
        { primaryCategoryId: subcategoryId },
        { categories: { some: { categoryId: subcategoryId } } },
      ]},
    ]
  }

  if (minSaving) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { vouchers: { some: {
        status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED,
        estimatedSaving: { gte: minSaving },
      }}},
    ]
  }

  if (voucherTypes && voucherTypes.length > 0) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { vouchers: { some: {
        status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED,
        type: { in: voucherTypes as any },
      }}},
    ]
  }

  if (amenityIds && amenityIds.length > 0) {
    for (const amenityId of amenityIds) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        { branches: { some: { isActive: true, amenities: { some: { amenityId } } } } },
      ]
    }
  }

  if (featured) {
    const now = new Date()
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { featuredListings: { some: { isActive: true, startDate: { lte: now }, endDate: { gte: now } } } },
    ]
  }

  if (minLat !== undefined && maxLat !== undefined && minLng !== undefined && maxLng !== undefined) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { branches: { some: {
        isActive: true,
        latitude:  { gte: minLat, lte: maxLat },
        longitude: { gte: minLng, lte: maxLng },
      }}},
    ]
  }

  const needsPostSort = ['highest_saving', 'top_rated', 'nearest'].includes(sortBy ?? '')

  const rawMerchants = await prisma.merchant.findMany({
    where,
    select: MERCHANT_TILE_SELECT as any,
    orderBy: { businessName: 'asc' },
    take: needsPostSort ? 500 : limit,
    skip: needsPostSort ? 0 : offset,
  })

  const enriched = await enrichMerchantTiles(prisma, rawMerchants as any, { lat: lat ?? null, lng: lng ?? null, userId })

  let sorted = enriched
  if (sortBy === 'nearest') {
    sorted = enriched
      .filter(m => m.distance !== null)
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
      .concat(enriched.filter(m => m.distance === null))
  } else if (sortBy === 'top_rated') {
    sorted = enriched.filter(m => (m.avgRating ?? 0) >= 4.0 && m.reviewCount >= 3)
      .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))
      .concat(enriched.filter(m => !((m.avgRating ?? 0) >= 4.0 && m.reviewCount >= 3)))
  } else if (sortBy === 'highest_saving') {
    sorted = [...enriched].sort((a, b) => (b.maxEstimatedSaving ?? 0) - (a.maxEstimatedSaving ?? 0))
  }

  let final = topRated
    ? sorted.filter(m => (m.avgRating ?? 0) >= 4.0 && m.reviewCount >= 5)
    : sorted

  if (params.maxDistanceMiles && lat !== undefined && lng !== undefined) {
    const maxMetres = params.maxDistanceMiles * 1609.34
    final = final.filter(m => m.distance !== null && m.distance <= maxMetres)
  }

  // openNow secondary query — intentional for MVP (small result set after other filters)
  if (openNow) {
    const finalIds = final.map(m => m.id)
    const merchantsWithHours = await prisma.merchant.findMany({
      where: { id: { in: finalIds } },
      select: {
        id: true,
        branches: {
          where: { isActive: true },
          select: {
            openingHours: {
              select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
            },
          },
        },
      },
    })
    const openMerchantIds = new Set(
      merchantsWithHours
        .filter((m: any) => m.branches.some((b: any) => isOpenNow(b.openingHours)))
        .map((m: any) => m.id),
    )
    final = final.filter(m => openMerchantIds.has(m.id))
  }

  const paginated = needsPostSort ? final.slice(offset, offset + limit) : final
  return { merchants: paginated, total: final.length }
}

// ─── Categories ───────────────────────────────────────────────────────────────

// Fix 5: filter by active merchants via the MerchantCategory join relation
export async function listActiveCategories(prisma: PrismaClient) {
  return prisma.category.findMany({
    where: {
      isActive: true,
      merchants: { some: { merchant: { status: MerchantStatus.ACTIVE } } },
    },
    select: { id: true, name: true, iconUrl: true, illustrationUrl: true, parentId: true, pinColour: true },
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
  params: { categoryId?: string; limit: number; offset: number; lat?: number; lng?: number; userId?: string | null },
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
    select: { merchant: { select: MERCHANT_TILE_SELECT as any } },
    orderBy: { merchant: { businessName: 'asc' } },
    take:   params.limit,
    skip:   params.offset,
  })

  const rawMerchants = rows.map((r: any) => r.merchant)
  return enrichMerchantTiles(prisma, rawMerchants, {
    lat: params.lat ?? null,
    lng: params.lng ?? null,
    userId: params.userId ?? null,
  })
}
