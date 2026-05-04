import {
  PrismaClient, MerchantStatus, VoucherStatus, ApprovalStatus, CampaignStatus,
  MerchantSuggestedTagStatus,
  type Prisma,
} from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { haversineMetres } from '../../shared/haversine'
import { isOpenNow } from '../../shared/isOpenNow'
import { resolveProfileCity } from '../../lib/userCity'
import {
  rankMerchants,
  resolveCategoryIntent,
  computeRatingsByMerchant,
  type CategoryIntentType,
  type SupplyTier,
} from '../../lib/ranking'
import { buildDescriptor, descriptorSuffixFor, filterRedundantHighlights } from '../../lib/tile'
import { resolveSelectedBranch } from './branch-resolver'
import { buildDisplayName, formatReview } from '../reviews/service'

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
  primaryCategory: {
    select: {
      id: true, name: true, pinColour: true, pinIcon: true,
      descriptorSuffix: true, parentId: true,
    },
  },
  primaryDescriptorTag: { select: { id: true, label: true } },
  categories: {
    select: {
      category: {
        select: { id: true, name: true, parentId: true },
      },
    },
  },
  highlights: {
    include: { tag: { select: { id: true, label: true } } },
    orderBy: { sortOrder: 'asc' },
    take: 3,
  },
  vouchers: {
    where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
    select: { id: true, estimatedSaving: true },
  },
  branches: {
    where: { isActive: true },
    select: { id: true, latitude: true, longitude: true, city: true, isActive: true },
  },
  _count: {
    select: {
      vouchers: {
        where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
      },
    },
  },
} as const

type RequestedScope = 'nearby' | 'city' | 'region' | 'platform' | undefined

type ScopeResolution = {
  retainedTiers: SupplyTier[]
  scopeExpanded: boolean
  resolvedScope: 'nearby' | 'city' | 'region' | 'platform'
}

/**
 * Determines which tiers to keep, given the caller's requested scope (or
 * default-by-intent), tier counts of available supply, and cascading expansion.
 *
 *   LOCAL/MIXED default = NEARBY+CITY → cascade to DISTANT if both empty
 *   DESTINATION default = ALL tiers
 *   scope=nearby   = NEARBY only → cascade through CITY → DISTANT if empty
 *   scope=city     = NEARBY+CITY → cascade to DISTANT if both empty
 *   scope=platform = ALL tiers (no expansion possible)
 */
function resolveScopeForRanking(
  requested: RequestedScope,
  intent: CategoryIntentType,
  counts: { nearbyCount: number; cityCount: number; distantCount: number },
): ScopeResolution {
  const initial: SupplyTier[] = (() => {
    if (requested === 'platform') return ['NEARBY', 'CITY', 'DISTANT']
    if (requested === 'nearby')   return ['NEARBY']
    if (requested === 'city' || requested === 'region') return ['NEARBY', 'CITY']
    if (intent === 'DESTINATION') return ['NEARBY', 'CITY', 'DISTANT']
    return ['NEARBY', 'CITY']
  })()

  let retained = initial
  let expanded = false
  while (retained.length < 3 && retainedHasZeroSupply(retained, counts)) {
    if (!retained.includes('CITY'))    { retained = [...retained, 'CITY'];    expanded = true; continue }
    if (!retained.includes('DISTANT')) { retained = [...retained, 'DISTANT']; expanded = true; continue }
    break
  }

  const resolvedScope: ScopeResolution['resolvedScope'] =
    retained.includes('DISTANT') ? 'platform' :
    retained.includes('CITY')    ? 'city' :
    'nearby'

  return { retainedTiers: retained, scopeExpanded: expanded, resolvedScope }
}

function retainedHasZeroSupply(
  retained: SupplyTier[],
  counts: { nearbyCount: number; cityCount: number; distantCount: number },
): boolean {
  let total = 0
  if (retained.includes('NEARBY'))  total += counts.nearbyCount
  if (retained.includes('CITY'))    total += counts.cityCount
  if (retained.includes('DISTANT')) total += counts.distantCount
  return total === 0
}

/**
 * Computes the empty-state reason from total (post-tier-filter, pre-pagination)
 * and total-supply (sum of all tier counts, regardless of which tiers were retained).
 *
 * Pre-pagination `total` is the right signal — `paginated.length === 0` can happen
 * when offset > total even though supply exists. Using `total` avoids false
 * `'no_uk_supply'` on infinite-scroll pagination overflow.
 */
function buildEmptyStateReason(
  total: number,
  scopeExpanded: boolean,
  totalSupply: number,
): 'none' | 'expanded_to_wider' | 'no_uk_supply' {
  if (totalSupply === 0) return 'no_uk_supply'
  if (total === 0)       return 'no_uk_supply'
  if (scopeExpanded)     return 'expanded_to_wider'
  return 'none'
}

function buildResolvedArea(
  resolvedScope: ScopeResolution['resolvedScope'],
  profileCity: string | null,
): string {
  if (resolvedScope === 'nearby') return 'Nearby'
  if (resolvedScope === 'city')   return profileCity ?? 'Your city'
  if (resolvedScope === 'region') return 'Wider area'
  return 'United Kingdom'
}

// Tile-shape of a `MerchantHighlight` row with the `tag` join included.
type TileHighlight = {
  id: string
  highlightTagId: string
  sortOrder: number
  tag: { id: string; label: string }
}

// Shared empty set used as the redundant-highlight fallback. Module-level so
// it is allocated once rather than once per enrichMerchantTiles call.
const EMPTY_REDUNDANT_SET: ReadonlySet<string> = new Set<string>()

// Pure helper: given a merchant's primary subcategory + descriptor tag, build
// the rendered descriptor string with the §3.6 de-dup rule applied. Returns
// null when no primary subcategory is set. Shared by `enrichMerchantTile`
// (list endpoints) and `getCustomerMerchant` (single-merchant detail).
function descriptorForMerchant(merchant: {
  primaryCategory: { name: string; descriptorSuffix: string | null } | null
  primaryDescriptorTag: { label: string } | null
}): string | null {
  if (!merchant.primaryCategory) return null
  const tagLabel = merchant.primaryDescriptorTag?.label ?? null
  const suffix = descriptorSuffixFor(merchant.primaryCategory)
  return buildDescriptor(tagLabel, suffix)
}

// Pure helper: given a merchant's `MerchantHighlight` rows and the redundant
// tag-id set for its subcategory (per §3.4), return the visible subset capped
// at 3. Shared by both the list and detail paths.
function visibleHighlightsFor<T extends { highlightTagId: string }>(
  highlights: T[],
  redundantSet: ReadonlySet<string>,
): T[] {
  return filterRedundantHighlights(highlights, redundantSet).slice(0, 3)
}

function enrichMerchantTile(
  merchant: {
    id: string
    businessName: string
    tradingName: string | null
    logoUrl: string | null
    bannerUrl: string | null
    primaryCategoryId: string | null
    primaryCategory: { id: string; name: string; pinColour: string | null; pinIcon: string | null; descriptorSuffix: string | null; parentId: string | null } | null
    primaryDescriptorTag: { id: string; label: string } | null
    categories: { category: { id: string; name: string; parentId: string | null } }[]
    highlights: TileHighlight[]
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
    redundantHighlightTagIds: ReadonlySet<string>
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

  const descriptor = descriptorForMerchant(merchant)
  const visibleHighlights = visibleHighlightsFor(merchant.highlights ?? [], opts.redundantHighlightTagIds)

  return {
    id:                  merchant.id,
    businessName:        merchant.businessName,
    tradingName:         merchant.tradingName,
    logoUrl:             merchant.logoUrl,
    bannerUrl:           merchant.bannerUrl,
    primaryCategory:     merchant.primaryCategory,
    primaryDescriptorTag: merchant.primaryDescriptorTag,
    subcategory:         subcategory ? { id: subcategory.id, name: subcategory.name } : null,
    descriptor,
    highlights:          visibleHighlights,
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
    primaryCategoryId: string | null
    primaryCategory: { id: string; name: string; pinColour: string | null; pinIcon: string | null; descriptorSuffix: string | null; parentId: string | null } | null
    primaryDescriptorTag: { id: string; label: string } | null
    categories: { category: { id: string; name: string; parentId: string | null } }[]
    highlights: TileHighlight[]
    vouchers: { id: string; estimatedSaving: unknown }[]
    branches: { id: string; latitude: unknown; longitude: unknown }[]
    _count: { vouchers: number }
  }>,
  opts: { lat: number | null; lng: number | null; userId: string | null },
) {
  if (merchants.length === 0) return []

  const merchantIds = merchants.map(m => m.id)
  const branchIds = merchants.flatMap(m => m.branches.map(b => b.id))

  // Batch-fetch RedundantHighlight rules for every primary subcategory in this
  // result set. Group by subcategoryId so each per-merchant call below can look
  // up its own redundant set in O(1). Empty set when the merchant has no
  // primaryCategoryId, or when the subcategory has no rules configured.
  const subcategoryIds = [
    ...new Set(merchants.map(m => m.primaryCategoryId).filter((id): id is string => Boolean(id))),
  ]
  const redundantRows = subcategoryIds.length === 0
    ? []
    : await prisma.redundantHighlight.findMany({
        where:  { subcategoryId: { in: subcategoryIds } },
        select: { subcategoryId: true, highlightTagId: true },
      })
  const redundantBySubcat = new Map<string, Set<string>>()
  for (const r of redundantRows) {
    let bucket = redundantBySubcat.get(r.subcategoryId)
    if (!bucket) {
      bucket = new Set<string>()
      redundantBySubcat.set(r.subcategoryId, bucket)
    }
    bucket.add(r.highlightTagId)
  }

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
    for (const f of favs) favouritedSet.add(f.merchantId)
  }

  return merchants.map(m =>
    enrichMerchantTile(m, {
      lat:          opts.lat,
      lng:          opts.lng,
      isFavourited: favouritedSet.has(m.id),
      avgRating:    ratingByMerchant[m.id]?.avgRating ?? null,
      reviewCount:  ratingByMerchant[m.id]?.reviewCount ?? 0,
      redundantHighlightTagIds: m.primaryCategoryId
        ? (redundantBySubcat.get(m.primaryCategoryId) ?? EMPTY_REDUNDANT_SET)
        : EMPTY_REDUNDANT_SET,
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
  opts: { lat?: number; lng?: number; branchId?: string } = {},
) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      // phone + email intentionally omitted — they live on Branch (per
      // privacy-review note in CLAUDE.md). Customer-facing /merchants/:id
      // exposes contact details only via nearestBranch + branches[].
      id: true, businessName: true, tradingName: true,
      status: true, logoUrl: true, bannerUrl: true,
      description: true, websiteUrl: true,
      primaryCategoryId: true,
      primaryCategory: {
        select: {
          id: true, name: true, pinColour: true, pinIcon: true,
          descriptorSuffix: true, parentId: true,
        },
      },
      primaryDescriptorTag: { select: { id: true, label: true } },
      highlights: {
        include: { tag: { select: { id: true, label: true } } },
        orderBy: { sortOrder: 'asc' },
        take: 3,
      },
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
        // No isActive filter — P2 branch picker needs suspended branches (greyed out).
        // Legacy distance/nearest/rating logic filters to activeBranches locally.
        select: {
          id: true, name: true, isMainBranch: true, isActive: true,
          addressLine1: true, addressLine2: true, city: true, postcode: true, country: true,
          phone: true, email: true, latitude: true, longitude: true,
          websiteUrl: true, logoUrl: true, bannerUrl: true, about: true,
          createdAt: true,
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
        orderBy: [{ isActive: 'desc' }, { isMainBranch: 'desc' }, { createdAt: 'asc' }],
      },
    },
  })

  if (!merchant || merchant.status !== MerchantStatus.ACTIVE) {
    throw new AppError('MERCHANT_UNAVAILABLE')
  }

  // activeBranches — used for legacy distance/nearest/rating logic so suspended
  // branches don't skew the legacy fields. The full merchant.branches (incl.
  // suspended) is needed for the P2 picker and selectedBranch resolution.
  const activeBranches = merchant.branches.filter((b: any) => b.isActive)

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

  // Overall merchant rating aggregated across ACTIVE branches only (legacy field)
  let totalRating = 0; let totalCount = 0
  for (const g of ratingGroups as any[]) {
    // Only count ratings from active branches for the merchant-level avgRating
    const branch = activeBranches.find((b: any) => b.id === g.branchId)
    if (!branch) continue
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

  // Legacy distance/nearest — computed from activeBranches only
  let distance: number | null = null
  let nearestBranchId: string | null = null
  const { lat, lng } = opts
  if (lat !== undefined && lng !== undefined) {
    for (const b of activeBranches) {
      const bLat = b.latitude !== null ? Number(b.latitude) : null
      const bLng = b.longitude !== null ? Number(b.longitude) : null
      if (bLat === null || bLng === null) continue
      const d = haversineMetres(lat, lng, bLat, bLng)
      if (distance === null || d < distance) { distance = d; nearestBranchId = b.id }
    }
  }

  const nearestBranch = nearestBranchId
    ? activeBranches.find((b: any) => b.id === nearestBranchId) ?? null
    : (activeBranches[0] ?? null)

  const nearestHours = nearestBranch?.openingHours ?? []
  const openNow = isOpenNow(nearestHours)

  const subcategory = merchant.categories
    .map((c: any) => c.category)
    .find((c: any) => c.parentId !== null && c.id !== merchant.primaryCategory?.id) ?? null

  // Legacy photos — flatten across ACTIVE branches only so suspended branches
  // don't contribute to the merchant-wide gallery (mirrors the R1 dual-write
  // contract for distance/nearest/rating which are also gated on activeBranches).
  const photos = activeBranches.flatMap((b: any) => b.photos.map((p: any) => p.url))

  // Descriptor + filtered highlights — same logic as the list endpoints (see
  // enrichMerchantTile + the helper extractions above). Single fetch by
  // subcategoryId rather than the batch path used for lists.
  const redundantSet: ReadonlySet<string> = (merchant as any).primaryCategoryId
    ? new Set(
        (await prisma.redundantHighlight.findMany({
          where:  { subcategoryId: (merchant as any).primaryCategoryId },
          select: { highlightTagId: true },
        })).map((r: { highlightTagId: string }) => r.highlightTagId),
      )
    : new Set<string>()
  const descriptor = descriptorForMerchant(merchant as any)
  const visibleHighlights = visibleHighlightsFor((merchant as any).highlights ?? [], redundantSet)

  // ─── selectedBranch (P1.3) ───────────────────────────────────────────────────
  // Resolve which branch to show in the P2 branch-scoped detail panel.
  // Validates the ?branch= candidate; falls back gracefully when missing/inactive/foreign.
  const resolveResult = resolveSelectedBranch(
    merchant.branches.map((b: any) => ({
      id: b.id,
      isActive: b.isActive,
      isMainBranch: b.isMainBranch,
      latitude:  b.latitude  !== null ? Number(b.latitude)  : null,
      longitude: b.longitude !== null ? Number(b.longitude) : null,
      createdAt: b.createdAt,
    })),
    opts.branchId ?? null,
    opts.lat,
    opts.lng,
  )

  const selectedBranchRaw = resolveResult.resolvedBranchId
    ? merchant.branches.find((b: any) => b.id === resolveResult.resolvedBranchId) ?? null
    : null

  // Brand-default fallback: branch value takes precedence; merchant value is the default.
  const fallback = <T>(branchVal: T | null | undefined, merchantVal: T | null | undefined): T | null =>
    (branchVal !== null && branchVal !== undefined ? branchVal : (merchantVal ?? null)) as T | null

  // Photos: branch photos → merchant gallery fallback (§5.4)
  const selectedBranchPhotos: string[] = selectedBranchRaw
    ? (selectedBranchRaw.photos.length > 0
        ? selectedBranchRaw.photos.map((p: any) => p.url)
        : photos)  // fall back to merchant gallery
    : []

  // myReview — null for guests; branch-scoped lookup for authed users.
  // CRITICAL: filter `isHidden: false`. The `@@unique([userId, branchId])`
  // constraint means a soft-deleted review still occupies the slot; without
  // this filter the deleted row leaks into selectedBranch.myReview, the
  // customer app thinks the user has an existing review, the CTA renders
  // as "Edit Your Review", and tapping it pre-fills the form with the
  // deleted content. Confirmed in 2026-05-04 on-device QA. `findFirst`
  // lets us add the non-unique condition to the where clause; the
  // `userId_branchId` index still serves the lookup.
  let myReview: ReturnType<typeof formatReview> | null = null
  if (userId && selectedBranchRaw) {
    const [row, verifiedRow] = await Promise.all([
      prisma.review.findFirst({
        where: { userId, branchId: selectedBranchRaw.id, isHidden: false },
        select: {
          id: true, branchId: true, userId: true, rating: true, comment: true,
          createdAt: true, updatedAt: true,
          branch: { select: { name: true } },
          user:   { select: { firstName: true, lastName: true } },
          _count: { select: { helpfuls: true } },
        },
      }),
      prisma.voucherRedemption.findFirst({
        where: { userId, branchId: selectedBranchRaw.id, isValidated: true },
        select: { id: true },
      }),
    ])
    if (row) {
      myReview = formatReview(row, {
        isVerified: verifiedRow !== null,
        requestingUserId: userId,
        reviewUserId: userId,
        userMarkedHelpful: false,
      })
    }
  }

  const selectedBranch = selectedBranchRaw ? {
    id:           selectedBranchRaw.id,
    name:         selectedBranchRaw.name,
    isMainBranch: selectedBranchRaw.isMainBranch,
    isActive:     selectedBranchRaw.isActive,
    addressLine1: selectedBranchRaw.addressLine1, addressLine2: (selectedBranchRaw as any).addressLine2,
    city: selectedBranchRaw.city, postcode: selectedBranchRaw.postcode,
    country: (selectedBranchRaw as any).country,
    latitude:  selectedBranchRaw.latitude  !== null ? Number(selectedBranchRaw.latitude)  : null,
    longitude: selectedBranchRaw.longitude !== null ? Number(selectedBranchRaw.longitude) : null,
    phone:      fallback((selectedBranchRaw as any).phone,      null),
    email:      fallback((selectedBranchRaw as any).email,      null),
    websiteUrl: fallback((selectedBranchRaw as any).websiteUrl, merchant.websiteUrl),
    logoUrl:    fallback((selectedBranchRaw as any).logoUrl,    merchant.logoUrl),
    bannerUrl:  fallback((selectedBranchRaw as any).bannerUrl,  merchant.bannerUrl),
    about:      fallback((selectedBranchRaw as any).about,      merchant.description),
    openingHours: selectedBranchRaw.openingHours,
    photos: selectedBranchPhotos,
    amenities: selectedBranchRaw.amenities.map((a: any) => a.amenity),
    distance: (opts.lat !== undefined && opts.lng !== undefined &&
               selectedBranchRaw.latitude !== null && selectedBranchRaw.longitude !== null)
      ? haversineMetres(opts.lat, opts.lng, Number(selectedBranchRaw.latitude), Number(selectedBranchRaw.longitude))
      : null,
    isOpenNow: isOpenNow(selectedBranchRaw.openingHours),
    avgRating:   ratingByBranch[selectedBranchRaw.id]?.avgRating   ?? null,
    reviewCount: ratingByBranch[selectedBranchRaw.id]?.reviewCount ?? 0,
    myReview,
  } : null

  return {
    ...merchant,
    vouchers: merchant.vouchers.map((v: any) => ({
      ...v,
      estimatedSaving: Number(v.estimatedSaving),
    })),
    about:       merchant.description,
    subcategory: subcategory ? { id: subcategory.id, name: subcategory.name } : null,
    descriptor,
    highlights:  visibleHighlights,
    avgRating,
    reviewCount,
    isFavourited,
    distance,
    nearestBranch: nearestBranch ? {
      id: nearestBranch.id, name: nearestBranch.name,
      addressLine1: nearestBranch.addressLine1, addressLine2: (nearestBranch as any).addressLine2,
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
      isMainBranch: b.isMainBranch,   // NEW — picker needs this
      isActive: b.isActive,           // NEW — picker needs this to grey out suspended
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
      // Task 1 — Merchant Profile UX refinement: per-branch openingHours so
      // picker rows + Other Locations cards + HoursPreviewSheet can render
      // real smart-status text and full week schedules for non-current
      // branches. Same shape as selectedBranch.openingHours and the existing
      // per-branch openingHours already loaded by the select at line ~552.
      // No new query.
      openingHours: b.openingHours,
    })),
    // P1.3 additions — selectedBranch block + fallback reason for client banner
    selectedBranch,
    selectedBranchFallbackReason: resolveResult.fallbackReason,
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
    tagIds?: string[]
    scope?: 'nearby' | 'city' | 'region' | 'platform'
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
          minSaving, voucherTypes, amenityIds, tagIds, scope, openNow, featured, topRated,
          sortBy, limit, offset, userId } = params

  if (!q && !categoryId && !subcategoryId && minLat === undefined) {
    throw new AppError('SEARCH_QUERY_REQUIRED')
  }

  const where: Prisma.MerchantWhereInput = { status: MerchantStatus.ACTIVE }

  if (q) {
    const tags = await prisma.merchantSuggestedTag.findMany({
      where: { tag: { contains: q, mode: 'insensitive' }, status: MerchantSuggestedTagStatus.APPROVED },
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

  if (tagIds && tagIds.length > 0) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      {
        OR: [
          { tags:       { some: { tagId:          { in: tagIds } } } },
          { highlights: { some: { highlightTagId: { in: tagIds } } } },
          { primaryDescriptorTagId: { in: tagIds } },
        ],
      },
    ]
  }

  // Resolve user location context (no scope filtering at the SQL level — done
  // by tier classification + filter post-rank).
  const profileCity = await resolveProfileCity(prisma, userId)

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

  const rawMerchants = await prisma.merchant.findMany({
    where,
    select: MERCHANT_TILE_SELECT as any,
    orderBy: { businessName: 'asc' },
  })

  let sorted = rawMerchants as any[]
  if (sortBy === 'nearest' && lat !== undefined && lng !== undefined) {
    sorted = [...rawMerchants].sort((a: any, b: any) => {
      const distA = Math.min(...(a.branches as any[]).filter((br: any) => br.latitude !== null && br.longitude !== null).map((br: any) => haversineMetres(lat!, lng!, Number(br.latitude), Number(br.longitude))).concat([Infinity]))
      const distB = Math.min(...(b.branches as any[]).filter((br: any) => br.latitude !== null && br.longitude !== null).map((br: any) => haversineMetres(lat!, lng!, Number(br.latitude), Number(br.longitude))).concat([Infinity]))
      return distA - distB
    })
  }

  let final: any[] = sorted

  if (params.maxDistanceMiles && lat !== undefined && lng !== undefined) {
    const maxMetres = params.maxDistanceMiles * 1609.34
    final = final.filter((m: any) => {
      const minDist = Math.min(...(m.branches as any[]).filter((br: any) => br.latitude !== null && br.longitude !== null).map((br: any) => haversineMetres(lat!, lng!, Number(br.latitude), Number(br.longitude))).concat([Infinity]))
      return minDist <= maxMetres
    })
  }

  // openNow secondary query — intentional for MVP (small result set after other filters)
  if (openNow) {
    const finalIds = final.map((m: any) => m.id)
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
    final = final.filter((m: any) => openMerchantIds.has(m.id))
  }

  // Determine intent: from category if categoryId given, else default LOCAL for free-text.
  let intentType: CategoryIntentType = 'LOCAL'
  if (categoryId) {
    const catRow = await prisma.category.findUnique({
      where:  { id: categoryId },
      select: { intentType: true, parent: { select: { intentType: true } } },
    })
    if (catRow) intentType = resolveCategoryIntent(catRow)
  }

  // Pre-compute ratings for ranking (the existing search filters give us `final`,
  // a list of merchants matching the search criteria UK-wide).
  const ratingByMerchant = await computeRatingsByMerchant(
    prisma,
    final.map((m: any) => ({ id: m.id, branches: m.branches })),
  )
  const augmented = final.map((m: any) => ({
    ...m,
    avgRating:   ratingByMerchant.get(m.id)?.avgRating   ?? null,
    reviewCount: ratingByMerchant.get(m.id)?.reviewCount ?? 0,
  }))

  // Apply topRated filter now that ratings are available.
  const augmentedFiltered = topRated
    ? augmented.filter((m: any) => (m.avgRating ?? 0) >= 4.0 && m.reviewCount >= 5)
    : augmented

  // Rank by intent.
  const { ordered: rankedTiles, counts: tierCounts } = rankMerchants(augmentedFiltered as any, {
    intentType, userLat: lat ?? null, userLng: lng ?? null, profileCity,
  })

  // Apply sort overrides post-rank.
  let postSorted = rankedTiles as any[]
  if (sortBy === 'top_rated') {
    postSorted = rankedTiles.filter((m: any) => (m.avgRating ?? 0) >= 4.0 && m.reviewCount >= 3)
      .sort((a: any, b: any) => (b.avgRating ?? 0) - (a.avgRating ?? 0))
      .concat(rankedTiles.filter((m: any) => !((m.avgRating ?? 0) >= 4.0 && m.reviewCount >= 3)))
  } else if (sortBy === 'highest_saving') {
    // Compute max saving per merchant in a side map so the sort key never
    // spreads onto the merchant object (would otherwise leak into the API
    // response via the post-enrich spread below).
    const maxSavingById = new Map<string, number>()
    for (const m of rankedTiles as any[]) {
      const savings = (m.vouchers as any[]).map((v: any) => Number(v.estimatedSaving)).filter((n: number) => !isNaN(n))
      maxSavingById.set(m.id, savings.length > 0 ? Math.max(...savings) : 0)
    }
    postSorted = [...rankedTiles].sort(
      (a: any, b: any) => (maxSavingById.get(b.id) ?? 0) - (maxSavingById.get(a.id) ?? 0),
    )
  }

  // Filter to retained tiers (default-by-intent or explicit scope, with cascade).
  const resolution = resolveScopeForRanking(scope as RequestedScope, intentType, tierCounts)
  const filteredByTier = postSorted.filter((m: any) => resolution.retainedTiers.includes(m.supplyTier))
  const total = filteredByTier.length

  // Paginate.
  const page = filteredByTier.slice(offset, offset + limit)

  // Enrich the page slice (descriptor, redundancy filter, favourites).
  const enriched = await enrichMerchantTiles(prisma, page as any, {
    lat: lat ?? null, lng: lng ?? null, userId,
  })
  const merchants = enriched.map((tile: any, i: number) => ({
    ...tile,
    supplyTier: page[i].supplyTier,
  }))

  return {
    merchants,
    total,
    meta: {
      scope:            resolution.resolvedScope,
      resolvedArea:     buildResolvedArea(resolution.resolvedScope, profileCity),
      scopeExpanded:    resolution.scopeExpanded,
      nearbyCount:      tierCounts.nearbyCount,
      cityCount:        tierCounts.cityCount,
      distantCount:     tierCounts.distantCount,
      emptyStateReason: buildEmptyStateReason(
        total,
        resolution.scopeExpanded,
        tierCounts.nearbyCount + tierCounts.cityCount + tierCounts.distantCount,
      ),
    },
  }
}

// ─── Category Merchants ──────────────────────────────────────────────────────
//
// Group 4c (Task 19) — paginated merchants for a single category id, with the
// same scope/meta envelope used by /search. Matches against merchants linked
// via primaryCategoryId OR the MerchantCategory join, so callers can pass
// either a top-level or subcategory id without precomputing the union.
//
// Response shape mirrors /search: { merchants, total, meta }.
//
// Uses the rank-then-enrich pipeline: fetch raw (UK-wide) → compute ratings →
// augment → rank → filter by retained tiers (with cascade expansion) →
// paginate → enrich page slice → attach supplyTier.
export async function getCategoryMerchants(
  prisma: PrismaClient,
  categoryId: string,
  options: {
    scope?: RequestedScope
    lat?: number | null
    lng?: number | null
    userId?: string | null
    limit: number
    offset: number
  },
) {
  const profileCity = await resolveProfileCity(prisma, options.userId ?? null)
  const userLat = options.lat ?? null
  const userLng = options.lng ?? null

  // 1. Resolve effective intent (with parent inheritance)
  const cat = await prisma.category.findUnique({
    where:  { id: categoryId },
    select: { id: true, intentType: true, parent: { select: { intentType: true } } },
  })
  const intentType: CategoryIntentType = cat ? resolveCategoryIntent(cat) : 'LOCAL'

  // 2. Fetch UK-wide matching merchants (raw, with branches)
  const where: Prisma.MerchantWhereInput = {
    status: MerchantStatus.ACTIVE,
    OR: [
      { primaryCategoryId: categoryId },
      { categories: { some: { categoryId } } },
    ],
  }
  const rawMerchants = await prisma.merchant.findMany({
    where,
    select: MERCHANT_TILE_SELECT as any,
    orderBy: { businessName: 'asc' },
  })

  // 3. Pre-compute ratings (single review.groupBy across all branches)
  const ratingByMerchant = await computeRatingsByMerchant(
    prisma,
    rawMerchants.map((m: any) => ({ id: m.id, branches: m.branches })),
  )

  // 4. Augment raw merchants with rating fields for ranking
  const augmented = rawMerchants.map((m: any) => ({
    ...m,
    avgRating:   ratingByMerchant.get(m.id)?.avgRating   ?? null,
    reviewCount: ratingByMerchant.get(m.id)?.reviewCount ?? 0,
  }))

  // 5. Rank by intent (raw merchants — branches still present for classifyTier)
  const { ordered, counts } = rankMerchants(augmented as any, {
    intentType, userLat, userLng, profileCity,
  })

  // 6. Filter to retained tiers (default-by-intent or explicit scope, with cascade)
  const resolution = resolveScopeForRanking(options.scope, intentType, counts)
  const filtered = ordered.filter(m => resolution.retainedTiers.includes(m.supplyTier))
  const total = filtered.length

  // 7. Paginate
  const page = filtered.slice(options.offset, options.offset + options.limit)

  // 8. Enrich the page slice (descriptor, redundancy filter, favourites, distances)
  const enriched = await enrichMerchantTiles(prisma, page as any, {
    lat: userLat, lng: userLng, userId: options.userId ?? null,
  })

  // 9. Forward supplyTier from the rank step onto each enriched tile
  const merchants = enriched.map((tile: any, i: number) => ({
    ...tile,
    supplyTier: page[i].supplyTier,
  }))

  return {
    merchants,
    total,
    meta: {
      scope:            resolution.resolvedScope,
      resolvedArea:     buildResolvedArea(resolution.resolvedScope, profileCity),
      scopeExpanded:    resolution.scopeExpanded,
      nearbyCount:      counts.nearbyCount,
      cityCount:        counts.cityCount,
      distantCount:     counts.distantCount,
      emptyStateReason: buildEmptyStateReason(
        total,
        resolution.scopeExpanded,
        counts.nearbyCount + counts.cityCount + counts.distantCount,
      ),
    },
  }
}

// ─── In-area (Map) ────────────────────────────────────────────────────────────

type Bbox = { minLat: number; maxLat: number; minLng: number; maxLng: number }

/**
 * True iff at least one of the merchant's active branches lies inside the bbox.
 * Branches in MERCHANT_TILE_SELECT are pre-filtered to isActive=true, so we
 * only check lat/lng presence and bounds. Coords are coerced from Decimal-like
 * to Number consistent with the rest of the discovery pipeline.
 */
function merchantHasBranchInBbox(
  merchant: { branches: Array<{ latitude: unknown; longitude: unknown }> },
  bbox: Bbox,
): boolean {
  for (const b of merchant.branches) {
    if (b.latitude === null || b.longitude === null) continue
    const lat = Number(b.latitude)
    const lng = Number(b.longitude)
    if (lat >= bbox.minLat && lat <= bbox.maxLat && lng >= bbox.minLng && lng <= bbox.maxLng) {
      return true
    }
  }
  return false
}

/**
 * Returns merchants whose active branches intersect the given bbox.
 *
 * Pipeline mirrors getCategoryMerchants step-by-step (same intent resolution,
 * same rankMerchants + computeRatingsByMerchant, same enrichment) with two
 * deliberate divergences per the Discovery Surface Rebaseline plan:
 *
 *   1. **bbox filter is applied at the application level (post-rank), NOT at
 *      the SQL level.** This preserves the Plan 1.5 invariant that tier counts
 *      reflect the full UK input set, not the post-filter slice. Map UI needs
 *      `nearbyCount`/`cityCount`/`distantCount` to message things like
 *      "47 in your city — tap to expand".
 *
 *   2. **Meta envelope drops `scope` and `scopeExpanded`.** The bbox IS the
 *      user's chosen area; in-area has no scope cascade, so forcing those
 *      fields would be artificial. emptyStateReason narrows in practice to
 *      `'none' | 'no_uk_supply'` — the enum union is unchanged. Map UI derives
 *      "viewport empty but UK has supply" client-side from
 *      `merchants.length === 0 && (nearbyCount + cityCount + distantCount) > 0`.
 *
 * No pagination — Map shows all pins in the viewport up to `limit`. Total
 * reflects pre-cap matches inside the bbox.
 */
export async function getInAreaMerchants(
  prisma: PrismaClient,
  options: {
    bbox: Bbox
    categoryId?: string
    lat?: number | null
    lng?: number | null
    userId?: string | null
    limit: number
  },
) {
  const profileCity = await resolveProfileCity(prisma, options.userId ?? null)
  const userLat = options.lat ?? null
  const userLng = options.lng ?? null

  // 1. Resolve effective intent — from category if given, else default LOCAL
  let intentType: CategoryIntentType = 'LOCAL'
  if (options.categoryId) {
    const cat = await prisma.category.findUnique({
      where:  { id: options.categoryId },
      select: { id: true, intentType: true, parent: { select: { intentType: true } } },
    })
    if (cat) intentType = resolveCategoryIntent(cat)
  }

  // 2. Fetch UK-wide matching merchants (categoryId filter only — NO bbox at SQL)
  const where: Prisma.MerchantWhereInput = {
    status: MerchantStatus.ACTIVE,
    ...(options.categoryId
      ? { OR: [
          { primaryCategoryId: options.categoryId },
          { categories: { some: { categoryId: options.categoryId } } },
        ] }
      : {}),
  }
  const rawMerchants = await prisma.merchant.findMany({
    where,
    select: MERCHANT_TILE_SELECT as any,
    orderBy: { businessName: 'asc' },
  })

  // 3. Pre-compute ratings (single review.groupBy across all branches)
  const ratingByMerchant = await computeRatingsByMerchant(
    prisma,
    rawMerchants.map((m: any) => ({ id: m.id, branches: m.branches })),
  )

  // 4. Augment for ranking
  const augmented = rawMerchants.map((m: any) => ({
    ...m,
    avgRating:   ratingByMerchant.get(m.id)?.avgRating   ?? null,
    reviewCount: ratingByMerchant.get(m.id)?.reviewCount ?? 0,
  }))

  // 5. Rank by intent — counts reflect the UK-wide input set (Plan 1.5 invariant)
  const { ordered, counts } = rankMerchants(augmented as any, {
    intentType, userLat, userLng, profileCity,
  })

  // 6. Filter by bbox (application level — see docstring)
  const filtered = ordered.filter(m => merchantHasBranchInBbox(m as any, options.bbox))
  const total = filtered.length

  // 7. Cap at limit (no offset; Map shows all pins in viewport up to cap)
  const page = filtered.slice(0, options.limit)

  // 8. Enrich the page slice
  const enriched = await enrichMerchantTiles(prisma, page as any, {
    lat: userLat, lng: userLng, userId: options.userId ?? null,
  })

  // 9. Forward supplyTier from the rank step onto each enriched tile
  const merchants = enriched.map((tile: any, i: number) => ({
    ...tile,
    supplyTier: page[i].supplyTier,
  }))

  // emptyStateReason for in-area: only 'none' or 'no_uk_supply'. The
  // 'expanded_to_wider' value is impossible (no scope cascade). The
  // "viewport empty but UK has supply" state is derived client-side.
  const totalSupply = counts.nearbyCount + counts.cityCount + counts.distantCount
  const emptyStateReason: 'none' | 'no_uk_supply' = totalSupply === 0 ? 'no_uk_supply' : 'none'

  // resolvedArea labels the user's location context (used by Map UI for
  // messaging like "47 in {resolvedArea}"), NOT the viewport. The viewport
  // doesn't carry a name without geocoding.
  return {
    merchants,
    total,
    meta: {
      resolvedArea:     profileCity ?? 'Your area',
      nearbyCount:      counts.nearbyCount,
      cityCount:        counts.cityCount,
      distantCount:     counts.distantCount,
      emptyStateReason,
    },
  }
}

// ─── Categories ───────────────────────────────────────────────────────────────

/**
 * Returns the locked discovery taxonomy:
 *   - Top-level categories: ALWAYS visible (all 11 returned regardless of supply).
 *   - Subcategories: returned only when ≥1 active UK merchant exists.
 *
 * Parameter-less. Earlier scope/lat/lng/userId options were tied to the rejected
 * hide-on-low-supply rule and have been removed (see Plan 1.5 spec).
 */
export async function listActiveCategories(prisma: PrismaClient) {
  // Top-levels — always visible
  const topLevels = await prisma.category.findMany({
    where: { parentId: null, isActive: true },
    select: {
      id:               true,
      name:             true,
      iconUrl:          true,
      illustrationUrl:  true,
      parentId:         true,
      pinColour:        true,
      pinIcon:          true,
      sortOrder:        true,
      intentType:       true,
      descriptorState:  true,
      descriptorSuffix: true,
      merchantCountByCity: true,
    },
    orderBy: { sortOrder: 'asc' },
  })

  // Subcategories — only those with ≥1 ACTIVE merchant UK-wide
  const subs = await prisma.category.findMany({
    where: {
      parentId:  { not: null },
      isActive:  true,
      merchants: { some: { merchant: { status: MerchantStatus.ACTIVE } } },
    },
    select: {
      id:               true,
      name:             true,
      iconUrl:          true,
      illustrationUrl:  true,
      parentId:         true,
      pinColour:        true,
      pinIcon:          true,
      sortOrder:        true,
      intentType:       true,
      descriptorState:  true,
      descriptorSuffix: true,
      merchantCountByCity: true,
    },
    orderBy: { sortOrder: 'asc' },
  })

  return [...topLevels, ...subs]
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
