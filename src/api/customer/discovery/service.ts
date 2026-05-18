import {
  PrismaClient, MerchantStatus, VoucherStatus, ApprovalStatus, CampaignStatus,
  MerchantSuggestedTagStatus,
  type Prisma,
  type VoucherType,
} from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { haversineMetres } from '../../shared/haversine'
import { isOpenNow } from '../../shared/isOpenNow'
import { resolveProfileCity } from '../../lib/userCity'
import { getCurrentCycleWindow } from '../../subscription/cycle'
import {
  rankMerchants,
  rankMerchantsV2,
  resolveCategoryIntent,
  computeRatingsByMerchant,
  type CategoryIntentType,
  type SupplyTier,
  type RankableMerchant,
  type RankMerchantsV2Result,
} from '../../lib/ranking'
import { resolveEffectiveLocation, type EffectiveLocation } from '../../lib/effectiveLocation'
import { getOutgoingCatchmentTargetIds } from '../../lib/catchmentLookup'
import type { LadderProfile } from '../../lib/ladderProfiles'
import { buildDescriptor, descriptorSuffixFor, filterRedundantHighlights } from '../../lib/tile'
import { resolveSelectedBranch } from './branch-resolver'
import { buildDisplayName, formatReview } from '../reviews/service'
import {
  getCurrentWindowOccurrence,
  getNextWindowOccurrence,
  getMostRecentlyClosedWindowOccurrence,
  type AvailabilityWindow,
} from '../../shared/voucherAvailability'
import {
  effectiveCooldownSeconds,
  computeAvailableAgainAt,
} from '../../redemption/reusable'
import { PRESENTATION_WINDOW_MS } from '../../redemption/presentation-window'
import { type BranchTile } from './branchTileSchema'

/**
 * Plan 4 M1 PR #81 review — server-side enforcement that approximate branch
 * coordinates (POSTCODE_CENTROID, NEEDS_REVIEW, anything other than
 * MANUALLY_CONFIRMED) MUST NOT reach the customer-app as exact positions.
 * Owner-locked 2026-05-14:
 *
 *   The important product principle is: we should not present postcode-
 *   centroid coordinates as an exact merchant location. Exact branch
 *   location matters for distance, directions, user trust, and map pins.
 *   Until a branch is manually confirmed, the backend should prevent the
 *   customer-app from accidentally treating approximate coordinates as
 *   exact.
 *
 * `exposeBranchPosition` is called at every customer-facing serialization
 * point. For non-MANUALLY_CONFIRMED branches it nulls latitude / longitude
 * on the response and exposes `locationConfidence` so the customer-app
 * can surface "exact location pending confirmation" UI in a follow-up PR.
 * Existing client-side null-checks on lat/lng (distance-sort, map-pin,
 * "get directions") degrade gracefully — those paths already skip rows
 * with null coords.
 */
function exposeBranchPosition<B extends {
  locationConfidence?: string | null
  latitude: unknown
  longitude: unknown
}>(b: B): { latitude: number | null; longitude: number | null; locationConfidence: string } {
  const confidence = b.locationConfidence ?? 'POSTCODE_CENTROID'
  if (confidence !== 'MANUALLY_CONFIRMED') {
    return { latitude: null, longitude: null, locationConfidence: confidence }
  }
  return {
    latitude:  b.latitude  !== null ? Number(b.latitude)  : null,
    longitude: b.longitude !== null ? Number(b.longitude) : null,
    locationConfidence: confidence,
  }
}

/**
 * Companion gate for SERVER-SIDE computations that consume branch lat/lng
 * (distance calculations, "near me" sorting, etc.). Returns true only when
 * the branch is MANUALLY_CONFIRMED AND has non-null coordinates — i.e.
 * when the position can be used as an exact reference point. Pre-fix,
 * distance was computed against POSTCODE_CENTROID branches' centroids,
 * which is approximate by ~100-500m and shouldn't be presented as
 * precise distance to the user.
 */
function hasExactPosition(b: {
  locationConfidence?: string | null
  latitude: unknown
  longitude: unknown
}): boolean {
  return b.locationConfidence === 'MANUALLY_CONFIRMED'
    && b.latitude !== null && b.longitude !== null
}

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

/**
 * Build a (voucherId → most-recent redeemedAt) map for the given user
 * across all voucher IDs in one DB round-trip. Used by both
 * getCustomerVoucher (1-key map) and getCustomerMerchant (N-key map)
 * so the per-voucher TIME_LIMITED payload derivation runs without a
 * per-voucher findFirst.
 */
async function batchLastRedemptionsByVoucher(
  prisma: PrismaClient,
  userId: string,
  voucherIds: string[],
): Promise<Map<string, Date>> {
  if (voucherIds.length === 0) return new Map()

  const rows = await prisma.voucherRedemption.groupBy({
    by: ['voucherId'],
    where: { userId, voucherId: { in: voucherIds } },
    _max: { redeemedAt: true },
  })

  const map = new Map<string, Date>()
  for (const r of rows) {
    if (r._max.redeemedAt) map.set(r.voucherId, r._max.redeemedAt)
  }
  return map
}

/**
 * Compute TIME_LIMITED payload fields for a single voucher row IN-MEMORY.
 * PURE FUNCTION — no DB I/O. Shared by getCustomerVoucher (single) and
 * getCustomerMerchant (list).
 */
function computeTimeLimitedPayload(input: {
  type: VoucherType
  rawWindows: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>
  lastRedeemedAt: Date | null
  now: Date
}): {
  availabilityWindows: AvailabilityWindow[]
  currentWindow:  { startsAt: string; endsAt: string } | null
  nextWindow:     { startsAt: string; endsAt: string } | null
  redeemedWindow: { startsAt: string; endsAt: string } | null
} {
  const { type, rawWindows, lastRedeemedAt, now } = input
  const isTimeLimited = type === 'TIME_LIMITED'
  const windows: AvailabilityWindow[] = isTimeLimited ? rawWindows : []
  const currentWindowOcc = isTimeLimited ? getCurrentWindowOccurrence(windows, now) : null
  const nextWindowOcc    = isTimeLimited ? getNextWindowOccurrence(windows, now) : null

  let redeemedWindow: { startsAt: string; endsAt: string } | null = null
  if (isTimeLimited && lastRedeemedAt) {
    if (
      currentWindowOcc &&
      lastRedeemedAt >= currentWindowOcc.startsAt &&
      lastRedeemedAt <  currentWindowOcc.endsAt
    ) {
      redeemedWindow = {
        startsAt: currentWindowOcc.startsAt.toISOString(),
        endsAt:   currentWindowOcc.endsAt.toISOString(),
      }
    } else if (!currentWindowOcc) {
      const prevOcc = getMostRecentlyClosedWindowOccurrence(windows, now)
      if (
        prevOcc &&
        lastRedeemedAt >= prevOcc.startsAt &&
        lastRedeemedAt <  prevOcc.endsAt
      ) {
        redeemedWindow = {
          startsAt: prevOcc.startsAt.toISOString(),
          endsAt:   prevOcc.endsAt.toISOString(),
        }
      }
    }
  }

  return {
    availabilityWindows: windows,
    currentWindow: currentWindowOcc
      ? { startsAt: currentWindowOcc.startsAt.toISOString(), endsAt: currentWindowOcc.endsAt.toISOString() }
      : null,
    nextWindow: nextWindowOcc
      ? { startsAt: nextWindowOcc.startsAt.toISOString(), endsAt: nextWindowOcc.endsAt.toISOString() }
      : null,
    redeemedWindow,
  }
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
    // Branch fields used by:
    //   - exposeBranchPosition / hasExactPosition (PR #81 redaction)
    //   - legacy classifyTier (city match)
    //   - rankMerchantsV2 + classifyRung (M2 / Plan 4 mirror columns)
    // The mirror columns (localityId..locationCountry) were added by Plan
    // 4 M1's resolve-on-write work; including them here lets the M3a
    // hybrid pipeline run V2 alongside legacy without an extra fetch.
    select: {
      id: true, latitude: true, longitude: true, locationConfidence: true,
      city: true, isActive: true,
      localityId: true, postTown: true, ladDistrict: true,
      adminCounty: true, region: true, locationCountry: true,
    },
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

// ─── Plan 4 M3a — hybrid ranking helpers ─────────────────────────────────────
//
// This is the M3 hybrid/deprecation phase. Legacy `rankMerchants` remains the
// inclusion/order source so POSTCODE_CENTROID merchants do not disappear (per
// owner direction 2026-05-15, locked at deferred-followups §AV). `rankMerchantsV2`
// runs alongside and contributes ONLY the new M2 fields (`supplyRung`,
// `proximityBand`, `contextBranchId`, `distanceMetres`, `rungCounts`) — and only
// for merchants whose branches pass `classifyRung`'s discoverability gate
// (MANUALLY_CONFIRMED or ADDRESS_GEOCODED). Merchants V2 rejects keep their legacy
// `supplyTier` and receive null/absent for the new fields. The redaction
// contract for lat/lng/distance is unchanged: `exposeBranchPosition` +
// `hasExactPosition` still gate position exposure at the serialization boundary.
//
// M5 or a later owner-approved policy can flip to V2 as the sole ranking path
// (would exclude POSTCODE_CENTROID merchants entirely — a product-policy change
// tracked at deferred-followups §AV).

/**
 * Resolve the effective LadderProfile for a ranking call given an optional
 * category id and an optional subcategory id. Category self-reference per
 * Plan 4 M3 D1 lock — Prisma schema has no `Subcategory` table; subcategories
 * are Category rows with `parentId` non-null.
 *
 *   subcategory.ladderProfileOverride  → if non-null, win.
 *   subcategory.parent.ladderProfile   → else inherit from parent.
 *   category.ladderProfile             → else if categoryId only.
 *   'MIXED_NORMAL'                     → safe default.
 */
async function resolveLadderProfileForCategory(
  prisma: PrismaClient,
  categoryId: string | undefined | null,
  subcategoryId: string | undefined | null,
): Promise<LadderProfile> {
  if (subcategoryId) {
    const sub = await prisma.category.findUnique({
      where: { id: subcategoryId },
      select: { ladderProfileOverride: true, parent: { select: { ladderProfile: true } } },
    })
    if (sub?.ladderProfileOverride) return sub.ladderProfileOverride
    if (sub?.parent?.ladderProfile) return sub.parent.ladderProfile
  }
  if (categoryId) {
    const cat = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { ladderProfile: true },
    })
    if (cat?.ladderProfile) return cat.ladderProfile
  }
  return 'MIXED_NORMAL'
}

type V2RankAttempt = {
  effLoc: EffectiveLocation | null
  result: RankMerchantsV2Result | null
}

/**
 * Try to run rankMerchantsV2 alongside the legacy ranker. Returns null result
 * when no EffectiveLocation can be resolved (no GPS + no userId-with-locality
 * + no place match) — in that case `effectiveLocality` in meta is null and the
 * new fields are absent on every tile.
 *
 * NOTE: this is the HYBRID-phase wrapper. It does NOT replace the legacy
 * pipeline. Callers run `rankMerchants(...)` for inclusion/order and call
 * this to populate the additive M3 fields. M5 or a future policy change
 * removes the legacy half — see §AV.
 */
async function tryRankMerchantsV2<M extends RankableMerchant<any>>(
  prisma: PrismaClient,
  merchants: M[],
  ctx: {
    userId: string | null
    lat: number | null
    lng: number | null
    categoryId?: string | null
    subcategoryId?: string | null
  },
): Promise<V2RankAttempt> {
  const effLoc = await resolveEffectiveLocation(
    prisma,
    { lat: ctx.lat ?? undefined, lng: ctx.lng ?? undefined },
    ctx.userId,
  )
  if (!effLoc) return { effLoc: null, result: null }

  const [ladderProfile, outgoingCatchmentTargetIds] = await Promise.all([
    resolveLadderProfileForCategory(prisma, ctx.categoryId, ctx.subcategoryId),
    getOutgoingCatchmentTargetIds(prisma, effLoc.locality.id),
  ])

  // For the hybrid phase, categoryIntent feeding into in-rung sort doesn't
  // actually drive the response order (legacy `ordered` does). We still
  // honour it so rungCounts reflect the spec's intended bucketing.
  const result = rankMerchantsV2(merchants, {
    effLoc,
    ladderProfile,
    outgoingCatchmentTargetIds,
    categoryIntent: 'MIXED',
    targetCount: 500,
    hardCap: 1000,
  })
  return { effLoc, result }
}

/**
 * Build a `Map<merchantId, RankedTile>` from a V2 result so the legacy
 * pipeline can attach the new fields to the page tiles by id-lookup.
 */
function v2TilesByMerchantId(result: RankMerchantsV2Result | null) {
  if (!result) return new Map<string, RankMerchantsV2Result['tiles'][number]>()
  return new Map(result.tiles.map(t => [t.merchantId, t]))
}

const EMPTY_RUNG_COUNTS = {
  NEARBY: 0, CATCHMENT: 0, POST_TOWN: 0, LAD: 0,
  COUNTY: 0, REGION: 0, COUNTRY: 0, NATIONAL: 0,
} as const

/**
 * Merge the additive M3 V2 fields onto an enriched tile by `merchantId`
 * lookup. Returns the tile unchanged if V2 didn't classify the merchant
 * (POSTCODE_CENTROID / NEEDS_REVIEW / inactive), with the new fields
 * defaulted to null. Used by all four Discovery surfaces (search,
 * category, in-area, home) so the merge logic stays consistent.
 *
 * The tile object is spread first, so a caller can pre-attach legacy
 * fields (e.g. `supplyTier`) without them being clobbered.
 */
function mergeV2FieldsOntoTile<T extends { id: string }>(
  tile: T,
  v2TileById: Map<string, RankMerchantsV2Result['tiles'][number]>,
): T & {
  supplyRung:      RankMerchantsV2Result['tiles'][number]['supplyRung']      | null
  proximityBand:   RankMerchantsV2Result['tiles'][number]['proximityBand']   | null
  distanceMetres:  number | null
  contextBranchId: string | null
} {
  const v2Tile = v2TileById.get(tile.id)
  return {
    ...tile,
    supplyRung:      v2Tile?.supplyRung      ?? null,
    proximityBand:   v2Tile?.proximityBand   ?? null,
    distanceMetres:  v2Tile?.distanceMetres  ?? null,
    contextBranchId: v2Tile?.contextBranchId ?? null,
  }
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
    // PR #81 Codex re-review — branch type carries locationConfidence so the
    // tile distance computation below can gate on hasExactPosition().
    branches: { id: string; latitude: unknown; longitude: unknown; locationConfidence?: string | null }[]
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
  let nearestBranch: { latitude: unknown; longitude: unknown } | null = null
  if (opts.lat !== null && opts.lng !== null) {
    for (const branch of merchant.branches) {
      // PR #81 Codex re-review — tile distance + nearestBranchId only
      // operates on MANUALLY_CONFIRMED branches. Pre-fix, home / search /
      // category / campaign tiles could surface a tile.distance computed
      // against a POSTCODE_CENTROID branch, presenting approximate
      // proximity as exact.
      if (!hasExactPosition(branch)) continue
      const d = haversineMetres(opts.lat, opts.lng, Number(branch.latitude), Number(branch.longitude))
      if (distance === null || d < distance) {
        distance = d
        nearestBranchId = branch.id
        nearestBranch = branch
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
    // Map tile coordinates — nearest-branch lat/lng so the customer-app
    // `MapPins` component can render a marker. Surfaces ONLY when the
    // for-loop above resolved a MANUALLY_CONFIRMED nearest branch
    // (`hasExactPosition` gated). All other paths — no user GPS, no
    // exact branch, POSTCODE_CENTROID / NEEDS_REVIEW / ADDRESS_GEOCODED
    // branches — return both fields as null, preserving the PR #81
    // exact-position contract at the tile boundary.
    latitude:  nearestBranch !== null ? Number(nearestBranch.latitude)  : null,
    longitude: nearestBranch !== null ? Number(nearestBranch.longitude) : null,
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

// ─── Discovery Rebaseline Phase 1 — branch-first enrichment ──────────────────
//
// Spec: docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md §1.1.
//
// Branch-first variant of `enrichMerchantTile` / `enrichMerchantTiles`. Emits
// ONE BranchTile per branch (vs the merchant variant which collapses every
// branch under each merchant). Coexists with the merchant variants during
// Phase 1 + Phase 2; Phase 3 deletes the merchant variant per the §AT cleanup
// note.
//
// Shape mirrors `branchTileSchema` (src/api/customer/discovery/branchTileSchema.ts):
//   - Top-level keys are BRANCH-scoped (id, branchName, branchLocalityId,
//     branchLatitude, etc.).
//   - `merchant` is the GROUPING container (id, businessName, primaryCategory,
//     etc.), populated once per branch tile from the joined merchant.
//   - `isFavourited` is merchant-keyed per Rev-2 §7 decision #13 — every branch
//     tile of the same merchant shares the same value. Forward-compat with the
//     eventual branch-keyed favourites contract (wire field stays unchanged).
//   - `closesAtLocal` is null in Phase 1 — `isOpenNow` (src/api/shared/isOpenNow.ts)
//     does not return close-time. PR-0.5 gate resolved by reusing the existing
//     helper; extending its signature is out of scope for PR-1.
//   - Position-redaction contract — `exposeBranchPosition` applied at the
//     serialization boundary so POSTCODE_CENTROID / NEEDS_REVIEW /
//     ADDRESS_GEOCODED branches expose null lat/lng (Plan 4 M1 PR #81 lock).

const BRANCH_TILE_SELECT = {
  id:                 true,
  name:               true,
  localityId:         true,
  localityName:       true,
  postTown:           true,
  city:               true,
  latitude:           true,
  longitude:          true,
  locationConfidence: true,
  isActive:           true,
  openingHours: {
    select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
  },
  merchant: {
    select: {
      id:                  true,
      businessName:        true,
      tradingName:         true,
      logoUrl:             true,
      bannerUrl:           true,
      primaryCategoryId:   true,
      primaryCategory: {
        select: {
          id: true, name: true, pinColour: true, pinIcon: true,
          descriptorSuffix: true, parentId: true, intentType: true,
        },
      },
      primaryDescriptorTag: { select: { id: true, label: true } },
      categories: {
        select: {
          category: {
            select: {
              id: true, name: true, parentId: true, pinColour: true,
              pinIcon: true, descriptorSuffix: true, intentType: true,
            },
          },
        },
      },
      highlights: {
        include: { tag: { select: { id: true, label: true } } },
        orderBy: { sortOrder: 'asc' },
        take: 3,
      },
      vouchers: {
        where:  { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
        select: { id: true, estimatedSaving: true },
      },
      _count: {
        select: {
          vouchers: {
            where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
          },
        },
      },
    },
  },
} as const

// Server-side mirror of apps/customer-app/src/features/merchant/utils/branchShortName.ts.
// Strips a "Merchant — Locality" / "Merchant - Locality" / "Merchant Locality"
// prefix from a raw branch name and returns the bare locality. Falls back to
// the raw name when stripping would produce an empty string.
//
// The wire field name `branchName` is forward-compatible with the eventual
// `Branch.shortName` schema migration (deferred under §A in the spec) — once
// the column lands, the server reads it directly and this helper retires.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function branchShortNameServer(rawBranchName: string, businessName: string): string {
  if (!rawBranchName || !businessName) return rawBranchName
  const escaped = escapeRegex(businessName)
  const dashed = new RegExp(`^${escaped}\\s*[\\-–—]\\s*`, 'i')
  const spaced = new RegExp(`^${escaped}\\s+`, 'i')
  const stripped = rawBranchName.replace(dashed, '').replace(spaced, '').trim()
  return stripped.length > 0 ? stripped : rawBranchName
}

// Input shape supplied by the rankBranchesV3 result + per-input distance the
// caller has already computed (or null when no effective location is resolved).
// Mirrors the V3 fields the customer-app surfaces consume.
export type EnrichBranchInput = {
  branchId:      string
  merchantId:    string
  supplyRung:    BranchTile['supplyRung']
  proximityBand: BranchTile['proximityBand']
  distance:      number | null
}

// Per-request context for the enrichment pass. `userId` drives the favourites
// lookup; `lat` / `lng` are reserved for downstream tasks that compute a
// per-branch distance at enrichment time (Phase 1 does NOT, since rankBranchesV3
// already supplies `distance`/`distanceMetres`).
export type EnrichBranchCtx = {
  userId: string | null
  lat:    number | null
  lng:    number | null
}

// Internal: the typed shape returned by a Prisma findMany against
// BRANCH_TILE_SELECT. We construct it via the const-typed select for accuracy.
type BranchSelectResult = Prisma.BranchGetPayload<{ select: typeof BRANCH_TILE_SELECT }>

function enrichBranchTile(
  branch: BranchSelectResult,
  opts: {
    input: EnrichBranchInput
    rating?: { avg: number | null; count: number }
    isFavourited: boolean
    redundantSet: ReadonlySet<string>
  },
): BranchTile {
  const merchant = branch.merchant
  const exposed  = exposeBranchPosition(branch)

  // Subcategory derivation mirrors enrichMerchantTile (service.ts:576-578) —
  // pick the first non-primary subcategory from MerchantCategory rows.
  const subcategory = merchant.categories
    .map(c => c.category)
    .find(c => c.parentId !== null && c.id !== merchant.primaryCategory?.id) ?? null

  // Savings — mirrors enrichMerchantTile (service.ts:580-581). Prisma Decimal
  // serializes as a string; coerce via Number then drop NaNs defensively.
  const savings = merchant.vouchers
    .map(v => Number(v.estimatedSaving))
    .filter(n => !isNaN(n))
  const maxEstimatedSaving = savings.length > 0 ? Math.max(...savings) : null

  // Descriptor — branchTileSchema declares `descriptor: z.string()` (not
  // nullable), so fall back to an empty string when the merchant has no
  // primaryCategory.
  const descriptor = descriptorForMerchant(merchant) ?? ''

  // Highlights — visibleHighlightsFor filters out redundant-by-subcategory
  // tags + caps at 3. `tag` (NOT `highlightTag`) per service.ts:225-228 +
  // schema relation `MerchantHighlight.tag`.
  const visibleHighlights = visibleHighlightsFor(merchant.highlights ?? [], opts.redundantSet)
    .map(h => ({ highlightTagId: h.highlightTagId, label: h.tag.label }))

  return {
    id:                       branch.id,
    branchName:               branchShortNameServer(branch.name, merchant.businessName),
    branchLocalityId:         branch.localityId,
    branchLocalityName:       branch.localityName,
    branchPostTown:           branch.postTown,
    branchCity:               branch.city,
    branchLatitude:           exposed.latitude,
    branchLongitude:          exposed.longitude,
    branchLocationConfidence: exposed.locationConfidence as BranchTile['branchLocationConfidence'],
    isOpenNow:                isOpenNow(branch.openingHours),
    closesAtLocal:            null, // Phase 1 — see header comment above.
    distance:                 opts.input.distance,
    isFavourited:             opts.isFavourited,
    avgRating:                opts.rating?.avg ?? null,
    reviewCount:              opts.rating?.count ?? 0,
    supplyRung:               opts.input.supplyRung,
    proximityBand:            opts.input.proximityBand,
    distanceMetres:           opts.input.distance,
    merchant: {
      id:                  merchant.id,
      businessName:        merchant.businessName,
      tradingName:         merchant.tradingName,
      logoUrl:             merchant.logoUrl,
      bannerUrl:           merchant.bannerUrl,
      primaryCategory:     merchant.primaryCategory
        ? {
            id:               merchant.primaryCategory.id,
            name:             merchant.primaryCategory.name,
            pinColour:        merchant.primaryCategory.pinColour ?? null,
            pinIcon:          merchant.primaryCategory.pinIcon ?? null,
            descriptorSuffix: merchant.primaryCategory.descriptorSuffix ?? null,
            parentId:         merchant.primaryCategory.parentId,
            intentType:       merchant.primaryCategory.intentType ?? null,
          }
        : null,
      primaryDescriptorTag: merchant.primaryDescriptorTag
        ? { id: merchant.primaryDescriptorTag.id, label: merchant.primaryDescriptorTag.label }
        : null,
      subcategory: subcategory
        ? {
            id:               subcategory.id,
            name:             subcategory.name,
            pinColour:        subcategory.pinColour ?? null,
            pinIcon:          subcategory.pinIcon ?? null,
            descriptorSuffix: subcategory.descriptorSuffix ?? null,
            parentId:         subcategory.parentId,
            intentType:       subcategory.intentType ?? null,
          }
        : null,
      descriptor,
      highlights:           visibleHighlights,
      voucherCount:         merchant._count.vouchers,
      maxEstimatedSaving,
    },
  }
}

async function enrichBranchTiles(
  prisma: PrismaClient,
  inputs: EnrichBranchInput[],
  ctx: EnrichBranchCtx,
): Promise<BranchTile[]> {
  if (inputs.length === 0) return []

  const branchIds   = inputs.map(i => i.branchId)
  const merchantIds = Array.from(new Set(inputs.map(i => i.merchantId)))

  // 1. Bulk fetch branches (with merchant + grouping fields pre-joined).
  //    Must complete first — call 4 (redundant highlights) needs the
  //    primaryCategoryId values pulled off each raw branch's merchant.
  const rawBranches = await prisma.branch.findMany({
    where:  { id: { in: branchIds } },
    select: BRANCH_TILE_SELECT,
  })

  // After call 1, calls 2/3/4 are mutually independent — they only depend
  // on branchIds / merchantIds / subcategoryIds, all derivable now. Run
  // them in parallel to save ~2 DB round-trips per Phase 1 endpoint call.
  // The merchant-variant enrichMerchantTiles (service.ts:616-711) keeps
  // the sequential pattern unchanged — Phase 3 deletes it.
  const subcategoryIds = Array.from(new Set(
    rawBranches
      .map(b => b.merchant.primaryCategoryId)
      .filter((id): id is string => Boolean(id)),
  ))

  const [ratingGroups, favs, redundantRows] = await Promise.all([
    // 2. Per-BRANCH rating aggregate — distinct from the merchant variant
    //    which sums across all branches under a merchant. Branch-first
    //    cardinality means each tile's rating is the branch's own rating.
    branchIds.length > 0
      ? prisma.review.groupBy({
          by:     ['branchId'],
          where:  { branchId: { in: branchIds }, isHidden: false },
          _avg:   { rating: true },
          _count: { id: true },
        })
      : Promise.resolve([] as Array<{ branchId: string | null; _avg: { rating: number | null }; _count: { id: number } }>),
    // 3. Favourites — merchant-keyed wire under Rev-2 §7 decision #13.
    //    Every branch tile of the same merchant shares isFavourited.
    ctx.userId && merchantIds.length > 0
      ? prisma.favouriteMerchant.findMany({
          where:  { userId: ctx.userId, merchantId: { in: merchantIds } },
          select: { merchantId: true },
        })
      : Promise.resolve([] as Array<{ merchantId: string }>),
    // 4. Redundant-highlight rules per subcategory — mirrors enrichMerchantTiles
    //    (service.ts:640-661). Group by subcategoryId so each per-branch call
    //    below can look up its own redundant set in O(1).
    subcategoryIds.length > 0
      ? prisma.redundantHighlight.findMany({
          where:  { subcategoryId: { in: subcategoryIds } },
          select: { subcategoryId: true, highlightTagId: true },
        })
      : Promise.resolve([] as Array<{ subcategoryId: string; highlightTagId: string }>),
  ])

  const ratingByBranch = new Map<string, { avg: number | null; count: number }>()
  for (const r of ratingGroups) {
    if (r.branchId === null) continue
    const avgRaw = r._avg.rating
    const avg = avgRaw === null ? null : Math.round(Number(avgRaw) * 10) / 10
    ratingByBranch.set(r.branchId, { avg, count: r._count.id })
  }

  const favouritedMerchantSet = new Set<string>()
  for (const f of favs) favouritedMerchantSet.add(f.merchantId)

  const redundantBySubcat = new Map<string, Set<string>>()
  for (const r of redundantRows) {
    let bucket = redundantBySubcat.get(r.subcategoryId)
    if (!bucket) {
      bucket = new Set<string>()
      redundantBySubcat.set(r.subcategoryId, bucket)
    }
    bucket.add(r.highlightTagId)
  }

  // 5. Build the tile array in input order — preserves the rankBranchesV3
  //    ordering. Drops silently if a branch referenced in inputs no longer
  //    exists (race against deletion); the upstream ranker already filtered
  //    by isActive + locationConfidence so this is an edge case.
  const branchById = new Map(rawBranches.map(b => [b.id, b]))
  const tiles: BranchTile[] = []
  for (const input of inputs) {
    const branch = branchById.get(input.branchId)
    if (!branch) continue
    const redundantSet = branch.merchant.primaryCategoryId
      ? (redundantBySubcat.get(branch.merchant.primaryCategoryId) ?? EMPTY_REDUNDANT_SET)
      : EMPTY_REDUNDANT_SET
    tiles.push(enrichBranchTile(branch, {
      input,
      rating:       ratingByBranch.get(branch.id),
      isFavourited: favouritedMerchantSet.has(branch.merchant.id),
      redundantSet,
    }))
  }
  return tiles
}

export { enrichBranchTile, enrichBranchTiles }

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

  // Plan 4 M3a hybrid — attach V2 fields to ALL home tiles (featured /
  // trending / nearbyByCategory) for merchants V2 admits. Legacy
  // inclusion/order is unchanged: featured is admin-curated, trending
  // is by-redemption-count, nearbyByCategory is the city-filtered
  // grouping. V2 fields are pure metadata on the tile.
  //
  // Ratings are NOT computed for Home today (the legacy ranker isn't
  // called here), and V2's only use of ratings is in-rung sort —
  // which Home doesn't surface. Safe to pass avgRating=null,
  // reviewCount=0 across the board.
  const homeV2EffLoc = await resolveEffectiveLocation(
    prisma,
    { lat: lat ?? undefined, lng: lng ?? undefined },
    userId,
  )
  let homeV2TileById = new Map<string, RankMerchantsV2Result['tiles'][number]>()
  if (homeV2EffLoc) {
    const uniqueMerchants = Array.from(new Map<string, any>(
      [...featured, ...trending, ...allNearbyMerchants].map(m => [m.id, m]),
    ).values())
    if (uniqueMerchants.length > 0) {
      const outgoingCatchmentTargetIds = await getOutgoingCatchmentTargetIds(prisma, homeV2EffLoc.locality.id)
      const v2Result = rankMerchantsV2(
        uniqueMerchants.map(m => ({
          id: m.id, businessName: m.businessName,
          avgRating: null, reviewCount: 0,
          branches: m.branches,
        })),
        {
          effLoc: homeV2EffLoc,
          ladderProfile: 'MIXED_NORMAL',  // Home is category-agnostic — safe default
          outgoingCatchmentTargetIds,
          categoryIntent: 'MIXED',
          targetCount: 1000, hardCap: 2000,
        },
      )
      homeV2TileById = v2TilesByMerchantId(v2Result)
    }
  }

  return {
    locationContext: { city: locationCtx.city, source: locationCtx.source },
    featured: enrichedFeatured.map(t => mergeV2FieldsOntoTile(t, homeV2TileById)),
    trending: enrichedTrending.map(t => mergeV2FieldsOntoTile(t, homeV2TileById)),
    campaigns,
    nearbyByCategory: enrichedNearby.map(item => ({
      category: item.category,
      merchants: item.merchants.map((t: any) => mergeV2FieldsOntoTile(t, homeV2TileById)),
    })),
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
          // M5 Task 6: REUSABLE per-card reusableState derivation reads
          // raw cooldownSeconds via computeAvailableAgainAt(). D19 lock —
          // raw cooldownSeconds is stripped from the response before
          // emission (mirrors getCustomerVoucher's destructure pattern).
          cooldownSeconds: true,
          // M4a-5: TIME_LIMITED window state for per-card display.
          // Non-TIME_LIMITED rows get [] / null via computeTimeLimitedPayload.
          availabilityWindows: {
            select: { dayOfWeek: true, openTime: true, closeTime: true },
            orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }],
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      branches: {
        // No isActive filter — P2 branch picker needs suspended branches (greyed out).
        // Legacy distance/nearest/rating logic filters to activeBranches locally.
        select: {
          id: true, name: true, isMainBranch: true, isActive: true,
          addressLine1: true, addressLine2: true, city: true, postcode: true, country: true,
          phone: true, email: true, latitude: true, longitude: true, locationConfidence: true,
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
      // PR #81 review B2 — distance/nearest only operates on MANUALLY_CONFIRMED
      // branches. POSTCODE_CENTROID coords are approximate; presenting an exact
      // distance from them would mislead the user.
      if (!hasExactPosition(b)) continue
      const d = haversineMetres(lat, lng, Number(b.latitude), Number(b.longitude))
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
    // PR #81 Codex re-review — null out lat/lng for non-MANUALLY_CONFIRMED
    // branches before passing into the resolver. The resolver's pickColdOpen
    // path tries GPS-based nearest first; without this gate, approximate
    // POSTCODE_CENTROID coords would influence which branch is "selected"
    // on cold-open. Branches with null coords still participate in
    // mainBranch / oldest-active fallbacks, so the user still gets a
    // branch — just not one ranked by approximate proximity.
    merchant.branches.map((b: any) => ({
      id: b.id,
      isActive: b.isActive,
      isMainBranch: b.isMainBranch,
      latitude:  hasExactPosition(b) ? Number(b.latitude)  : null,
      longitude: hasExactPosition(b) ? Number(b.longitude) : null,
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
    // PR-C 2026-05-09 (Path A): formatReview now derives isVerified
    // from the row's redemptionId column directly.  Dropped the
    // parallel voucherRedemption.findFirst lookup that previously
    // backed the old reviewer-level isVerified (which required
    // isValidated).  Added redemptionId to the select so the
    // derivation works.
    const row = await prisma.review.findFirst({
      where: { userId, branchId: selectedBranchRaw.id, isHidden: false },
      select: {
        id: true, branchId: true, userId: true, rating: true, comment: true,
        redemptionId: true,
        createdAt: true, updatedAt: true,
        branch: { select: { name: true } },
        user:   { select: { firstName: true, lastName: true } },
        _count: { select: { helpfuls: true } },
      },
    })
    if (row) {
      myReview = formatReview(row, {
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
    // PR #81 review B2 — redact lat/lng + expose locationConfidence.
    ...exposeBranchPosition(selectedBranchRaw),
    phone:      fallback((selectedBranchRaw as any).phone,      null),
    email:      fallback((selectedBranchRaw as any).email,      null),
    websiteUrl: fallback((selectedBranchRaw as any).websiteUrl, merchant.websiteUrl),
    logoUrl:    fallback((selectedBranchRaw as any).logoUrl,    merchant.logoUrl),
    bannerUrl:  fallback((selectedBranchRaw as any).bannerUrl,  merchant.bannerUrl),
    about:      fallback((selectedBranchRaw as any).about,      merchant.description),
    openingHours: selectedBranchRaw.openingHours,
    photos: selectedBranchPhotos,
    amenities: selectedBranchRaw.amenities.map((a: any) => a.amenity),
    // PR #81 review B2 — distance only when the selected branch's position
    // is MANUALLY_CONFIRMED (so the user never sees an "exact" distance
    // computed from postcode-centroid coords).
    distance: (opts.lat !== undefined && opts.lng !== undefined && hasExactPosition(selectedBranchRaw))
      ? haversineMetres(opts.lat, opts.lng, Number(selectedBranchRaw.latitude), Number(selectedBranchRaw.longitude))
      : null,
    isOpenNow: isOpenNow(selectedBranchRaw.openingHours),
    avgRating:   ratingByBranch[selectedBranchRaw.id]?.avgRating   ?? null,
    reviewCount: ratingByBranch[selectedBranchRaw.id]?.reviewCount ?? 0,
    myReview,
  } : null

  // PR-B T8a (§Q4 wiring): compute the per-voucher redeemed-this-
  // cycle set for the calling user.  Mirrors `getCustomerVoucher`'s
  // single-voucher logic (line ~898) but batched: ONE
  // userVoucherCycleState query for all of this merchant's vouchers
  // at once.  Drives the merchant-profile voucher card §Q4 muted
  // state (REDEEMED stamp + 'Already redeemed this cycle' label)
  // shipped in PR-B T5.
  //
  // Same eligibility contract as `getCustomerVoucher`:
  //   - User must be authed (null userId → all vouchers active).
  //   - Subscription must be ACTIVE/TRIALLING (no sub → all active).
  //   - cycleState.isRedeemedInCurrentCycle === true.
  //   - cycleState.cycleStartDate >= current cycle window's start
  //     (catches stale cycle rows after a cycle rollover or a
  //     cycleAnchorDate reset).
  let redeemedVoucherIdSet = new Set<string>()
  if (userId && merchant.vouchers.length > 0) {
    const subscription = await prisma.subscription.findUnique({
      where:  { userId },
      select: { status: true, cycleAnchorDate: true },
    })
    if (
      subscription
      && (subscription.status === 'ACTIVE' || subscription.status === 'TRIALLING')
    ) {
      const window = getCurrentCycleWindow(subscription.cycleAnchorDate, new Date())
      const cycleStates = await prisma.userVoucherCycleState.findMany({
        where: {
          userId,
          voucherId: { in: merchant.vouchers.map((v: any) => v.id) },
          isRedeemedInCurrentCycle: true,
          cycleStartDate: { gte: window.cycleStart },
        },
        select: { voucherId: true },
      })
      redeemedVoucherIdSet = new Set(cycleStates.map(s => s.voucherId))
    }
  }

  // M4a-5: Batched (voucherId → most-recent redeemedAt) lookup for the
  // TIME_LIMITED redeemedWindow derivation.  ONE Prisma groupBy for the
  // whole voucher list — locked "no N+1" contract.  Returns an empty
  // map for guests / merchants with no vouchers; helper handles those
  // cleanly so non-TIME_LIMITED rows still get [] / null.
  const voucherIds = merchant.vouchers.map((v: any) => v.id)
  const lastRedemptionMap = userId
    ? await batchLastRedemptionsByVoucher(prisma, userId, voucherIds)
    : new Map<string, Date>()
  const nowForWindows = new Date()
  const enrichedVouchers = merchant.vouchers.map((v: any) => {
    const lastRedeemedAt = lastRedemptionMap.get(v.id) ?? null
    const tlPayload = computeTimeLimitedPayload({
      type: v.type,
      rawWindows: (v.availabilityWindows ?? []).map((w: any) => ({
        dayOfWeek: w.dayOfWeek,
        openTime:  w.openTime,
        closeTime: w.closeTime,
      })),
      lastRedeemedAt,
      now: nowForWindows,
    })

    // M5 Task 6 (spec §6.4, D17): per-card reusableState for REUSABLE
    // rows. Reuses the SAME batched lastRedemptionMap (one groupBy for
    // the whole voucher list — the M4a-5 N+1 contract locked in
    // discovery.timeLimitedMerchant.test.ts). Convention §7.1 — surface
    // only FUTURE availableAgainAt instants so the client uses
    // truthiness checks without time math.
    let reusableState: { availableAgainAt: string | null } | null = null
    if (v.type === 'REUSABLE') {
      const computed = computeAvailableAgainAt(lastRedeemedAt, v)
      reusableState = {
        availableAgainAt:
          computed && computed.getTime() > nowForWindows.getTime()
            ? computed.toISOString()
            : null,
      }
    }

    // D19 — raw cooldownSeconds is NEVER exposed on the customer card
    // payload. Destructure it out before spreading the remaining
    // voucher fields. Mirrors getCustomerVoucher's pattern.
    const { cooldownSeconds: _serverOnlyCooldownSeconds, ...voucherForResponse } = v

    return {
      ...voucherForResponse,
      estimatedSaving: Number(v.estimatedSaving),
      // PR-B T8a (§Q4): per-voucher redeemed-this-cycle flag drives
      // the merchant-profile voucher card muted state.  False for
      // guests, free users, paused subs, or vouchers not redeemed
      // in the user's current cycle.  TIME_LIMITED + REUSABLE
      // vouchers stay false here (TIME_LIMITED uses window-scoped
      // redeemedWindow instead; REUSABLE has no terminal redeemed
      // state per D13 / D18). Hard-override mirrors getCustomerVoucher
      // line 1270.
      isRedeemedThisCycle:
        v.type === 'TIME_LIMITED' || v.type === 'REUSABLE'
          ? false
          : redeemedVoucherIdSet.has(v.id),
      // M4a-5: TIME_LIMITED state ([] / null for non-TIME_LIMITED).
      availabilityWindows: tlPayload.availabilityWindows,
      currentWindow:       tlPayload.currentWindow,
      nextWindow:          tlPayload.nextWindow,
      redeemedWindow:      tlPayload.redeemedWindow,
      // M5 Task 6 (spec §6.4): per-card REUSABLE state ({} / null for
      // non-REUSABLE). Drives the merchant-card pill state in Task 11.
      reusableState,
    }
  })

  return {
    ...merchant,
    vouchers: enrichedVouchers,
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
      // PR #81 review B2 — redact lat/lng + expose locationConfidence.
      ...exposeBranchPosition(nearestBranch),
      phone: nearestBranch.phone, email: nearestBranch.email,
      // `distance` here is the same `distance` already computed above and
      // already gated on hasExactPosition(); safe to inherit.
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
      // PR #81 review B2 — redact lat/lng + expose locationConfidence.
      ...exposeBranchPosition(b),
      phone: b.phone, email: b.email,
      // PR #81 review B2 — per-branch distance only for MANUALLY_CONFIRMED.
      distance: (lat !== undefined && lng !== undefined && hasExactPosition(b))
        ? haversineMetres(lat, lng, Number(b.latitude), Number(b.longitude))
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

  const branches = await prisma.branch.findMany({
    where: { merchantId, isActive: true },
    select: {
      id: true, name: true, isMainBranch: true,
      addressLine1: true, addressLine2: true, city: true, postcode: true,
      phone: true, latitude: true, longitude: true, locationConfidence: true,
      openingHours: {
        select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
        orderBy: { dayOfWeek: 'asc' },
      },
    },
    orderBy: { isMainBranch: 'desc' },
  })
  // PR #81 review B2 — redact lat/lng + expose locationConfidence on each row.
  return branches.map((b) => ({ ...b, ...exposeBranchPosition(b) }))
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
      // M5 REUSABLE — selected for server-side cooldown math; NEVER
      // included in the response payload (D19). Destructured out
      // before the response spread below.
      cooldownSeconds: true,
      merchant: {
        select: {
          id: true, businessName: true, tradingName: true, logoUrl: true, status: true,
        },
      },
      // NEW (M4a-4):
      availabilityWindows: {
        select: { dayOfWeek: true, openTime: true, closeTime: true },
        orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }],
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
  // ISO timestamp marking when the current cycle ends — i.e. when this
  // voucher's one-per-cycle counter resets. Computed for ACTIVE /
  // TRIALLING subscribers only; null for free users / guests / paused
  // subscriptions (those see subscription copy, not cycle copy).
  let availableAgainAt: string | null = null
  // Cycle window hoisted to outer scope so availableAgainAt,
  // isRedeemedThisCycle, AND lastRedemption all derive from the SAME
  // single getCurrentCycleWindow() call. Locked at M3 plan-time after
  // PR #48 owner review (Fix 1) — see plan §M3a Task 5.
  let cycleStart: Date | null = null
  let cycleEnd:   Date | null = null
  // Hoisted ACTIVE/TRIALLING flag so the REUSABLE branch below can mirror
  // the cycle-branch subscription gating without re-querying. Spec §6.1
  // requires REUSABLE lastRedemption gating to match the cycle branch's
  // subscription requirement exactly (D14 + spec §6.5 — cooldown info is
  // data-only and surfaces regardless of subscription, but the persisted
  // redemption surface is subscription-gated like every other voucher
  // type).
  let hasActiveSubscription = false
  // M3 §P2 — persisted return-visit RedemptionDetailsCard. Non-null
  // ONLY when (1) ACTIVE/TRIALLING sub, (2) isRedeemedThisCycle is
  // true, and (3) a VoucherRedemption row exists in [cycleStart,
  // cycleEnd). After cycle rollover all three flip together by
  // construction — §Q6 invariant. See M3 plan §Persisted return-visit.
  let lastRedemption: {
    code:        string
    redeemedAt:  string
    branch:      { id: string; name: string }
    isValidated: boolean
    validatedAt: string | null
  } | null = null
  if (userId) {
    // Mirror the redemption guard's eligibility check exactly
    // (src/api/redemption/service.ts:108-124). The previous version
    // here returned the raw `isRedeemedInCurrentCycle` flag without
    // checking which cycle the row was last updated in — so after
    // a cycle rollover OR a `cycleAnchorDate` reset (e.g. dev
    // grant-script run, resubscribe scenario), the screen could
    // show "Already redeemed" even though the redemption mutation
    // would happily allow a fresh redeem. The flag becomes "true
    // ONLY when the stored cycle row belongs to the current cycle
    // window and the user has an ACTIVE/TRIALLING subscription."
    const [subscription, cycleState, fav] = await Promise.all([
      prisma.subscription.findUnique({
        where: { userId },
        select: { status: true, cycleAnchorDate: true },
      }),
      prisma.userVoucherCycleState.findUnique({
        where: { userId_voucherId: { userId, voucherId } },
        select: { isRedeemedInCurrentCycle: true, cycleStartDate: true },
      }),
      prisma.favouriteVoucher.findUnique({
        where: { userId_voucherId: { userId, voucherId } },
        select: { id: true },
      }),
    ])
    isFavourited = fav !== null

    if (
      subscription
      && (subscription.status === 'ACTIVE' || subscription.status === 'TRIALLING')
    ) {
      hasActiveSubscription = true
      // Compute the cycle window ONCE; hoist into outer-scope vars so
      // the lastRedemption query below can reuse the exact same range.
      const window = getCurrentCycleWindow(subscription.cycleAnchorDate, new Date())
      cycleStart = window.cycleStart
      cycleEnd   = window.cycleEnd
      availableAgainAt = cycleEnd.toISOString()
      if (cycleState && cycleState.isRedeemedInCurrentCycle) {
        isRedeemedThisCycle = cycleState.cycleStartDate >= cycleStart
      }
    }

    // §P2 lastRedemption — only fetch when the gate is fully open. By
    // construction this is impossible to satisfy without an
    // ACTIVE/TRIALLING subscription, because isRedeemedThisCycle stays
    // false for any other status. After cycle rollover the gate closes
    // automatically — the §Q6 invariant the customer-app's
    // RedemptionDetailsCard depends on.
    if (isRedeemedThisCycle && cycleStart && cycleEnd) {
      const row = await prisma.voucherRedemption.findFirst({
        where: {
          userId,
          voucherId,
          redeemedAt: { gte: cycleStart, lt: cycleEnd },
        },
        orderBy: { redeemedAt: 'desc' },
        include: { branch: { select: { id: true, name: true } } },
      })
      if (row) {
        lastRedemption = {
          code:        row.redemptionCode,
          redeemedAt:  row.redeemedAt.toISOString(),
          branch:      row.branch,
          isValidated: row.isValidated,
          validatedAt: row.validatedAt ? row.validatedAt.toISOString() : null,
        }
      }
    }
  }

  // M4a-5: Refactored from M4a-4's inline findFirst to the batched
  // helper.  For getCustomerVoucher this is a 1-key map (degrades
  // trivially to 1 query); shared with getCustomerMerchant (N-key map)
  // to keep the locked "no N+1" contract for both endpoints.  The pure
  // computeTimeLimitedPayload helper handles the in-memory derivation
  // for both call sites.
  const lastRedemptionMap = userId
    ? await batchLastRedemptionsByVoucher(prisma, userId, [voucherId])
    : new Map<string, Date>()

  const tlPayload = computeTimeLimitedPayload({
    type: voucher.type,
    rawWindows: voucher.availabilityWindows.map(w => ({
      dayOfWeek: w.dayOfWeek,
      openTime:  w.openTime,
      closeTime: w.closeTime,
    })),
    lastRedeemedAt: lastRedemptionMap.get(voucherId) ?? null,
    now: new Date(),
  })

  const isTimeLimited = voucher.type === 'TIME_LIMITED'
  const isReusable    = voucher.type === 'REUSABLE'

  // ─── M5 REUSABLE deltas (spec §6.1, §6.3, D13-D16, D19) ────────────
  //
  // For REUSABLE, the customer payload carries:
  //   - effectiveCooldownSeconds (server-clamped via the reusable
  //     helper; data-only — surfaces regardless of subscription state
  //     per §6.5).
  //   - availableAgainAt = ISO of lastRedeemedAt + effectiveCooldownMs,
  //     OR null when no prior redemption OR cooldown elapsed (Q5
  //     convention: surface only future instants so the client can use
  //     truthiness checks).
  //   - isRedeemedThisCycle = false ALWAYS (D13). REUSABLE bypasses
  //     the cycle-state gate entirely; the cycle-window vars
  //     (cycleStart / cycleEnd / cycleState) are never consulted for
  //     this branch.
  //   - lastRedemption: REUSABLE-specific 2h presentation-window-only
  //     gate (M3 §AE), independent of cycle state and independent of
  //     the cooldown clock. Spec §6.1 + §6.3 + §7.1 state 4. The
  //     presentation window expires at redeemedAt + PRESENTATION_WINDOW_MS,
  //     regardless of cooldown clock position. This is the REUSABLE
  //     distinguisher — state 4 ("cooldown elapsed, presentation still
  //     alive") gets BOTH an active Redeem CTA AND a persisted
  //     RedemptionDetailsCard. Cycle vouchers + TIME_LIMITED keep
  //     their existing cycle-gated lastRedemption above; ONLY REUSABLE
  //     uses this presentation-window-only gate.
  let reusableEffectiveCooldownSeconds: number | null = null
  let reusableAvailableAgainAt: string | null = null
  let reusableLastRedemption: typeof lastRedemption = null
  if (isReusable) {
    reusableEffectiveCooldownSeconds = effectiveCooldownSeconds(voucher)
    // PR #72 review polish — drop redundant findFirst.
    // lastRedemptionMap was already populated above via
    // batchLastRedemptionsByVoucher for ALL voucher types (it's an empty
    // Map for guests/unauthenticated users, so .get() returns undefined →
    // ?? null normalises). Behavior is identical to the prior findFirst.
    const lastRedeemedAt = lastRedemptionMap.get(voucherId) ?? null
    const computed = computeAvailableAgainAt(lastRedeemedAt, voucher)
    if (computed && computed.getTime() > Date.now()) {
      reusableAvailableAgainAt = computed.toISOString()
    }

    // REUSABLE persisted-return-visit lastRedemption — fires only on the
    // 2h presentation window from redeemedAt, gated on the same
    // ACTIVE/TRIALLING subscription state as the cycle branch above
    // (spec §6.1 + §6.5). Independent of cooldown duration: a 30-min
    // cooldown that elapsed 5 min ago still has 1h55m of presentation
    // window remaining → lastRedemption stays populated. Conversely a
    // 4h cooldown with redeemedAt 3h ago has expired the presentation
    // window (>2h) → lastRedemption returns null even though
    // availableAgainAt is still populated. This is the two-clocks
    // independence lock (§6.3).
    if (userId && hasActiveSubscription) {
      const presentationStart = new Date(Date.now() - PRESENTATION_WINDOW_MS)
      const row = await prisma.voucherRedemption.findFirst({
        where: {
          userId,
          voucherId,
          redeemedAt: { gte: presentationStart },
        },
        orderBy: { redeemedAt: 'desc' },
        include: { branch: { select: { id: true, name: true } } },
      })
      if (row) {
        reusableLastRedemption = {
          code:        row.redemptionCode,
          redeemedAt:  row.redeemedAt.toISOString(),
          branch:      row.branch,
          isValidated: row.isValidated,
          validatedAt: row.validatedAt ? row.validatedAt.toISOString() : null,
        }
      }
    }
  }

  // D19 — raw cooldownSeconds is NEVER exposed on the customer payload.
  // Destructure it out before spreading the remaining voucher fields.
  const { cooldownSeconds: _serverOnlyCooldownSeconds, ...voucherForResponse } = voucher

  return {
    ...voucherForResponse,
    estimatedSaving: Number(voucher.estimatedSaving),
    isRedeemedThisCycle: (isTimeLimited || isReusable) ? false : isRedeemedThisCycle,
    isFavourited,
    availableAgainAt: isReusable
      ? reusableAvailableAgainAt
      : (isTimeLimited ? null : availableAgainAt),
    // M3 contract: lastRedemption is cycle-gated for cycle vouchers +
    // TIME_LIMITED, and 2h-presentation-window-gated for REUSABLE
    // (spec §6.1 + §6.3 + §7.1 state 4 — D14 independence from cooldown
    // clock). Same field shape across both branches; the customer-app's
    // Zod schema is type-agnostic.
    lastRedemption: isReusable ? reusableLastRedemption : lastRedemption,
    // NEW M4a-4 (refactored to pure helper in M4a-5):
    availabilityWindows: tlPayload.availabilityWindows,
    currentWindow:       tlPayload.currentWindow,
    nextWindow:          tlPayload.nextWindow,
    redeemedWindow:      tlPayload.redeemedWindow,
    // NEW M5 REUSABLE: server-clamped cooldown; null for non-REUSABLE.
    effectiveCooldownSeconds: reusableEffectiveCooldownSeconds,
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
      // PR #81 review B2 — bbox filter must require MANUALLY_CONFIRMED.
      // Without this, a merchant with only POSTCODE_CENTROID branches in
      // the bbox would surface on the map with an exact-pin position.
      { branches: { some: {
        isActive: true,
        locationConfidence: 'MANUALLY_CONFIRMED',
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
    // PR #81 review B2 — nearest-sort only considers MANUALLY_CONFIRMED
    // branches. Merchants with only approximate branches receive
    // Infinity (rank last) rather than being ordered by approximate
    // proximity that we'd then display as exact.
    sorted = [...rawMerchants].sort((a: any, b: any) => {
      const distA = Math.min(...(a.branches as any[]).filter((br: any) => hasExactPosition(br)).map((br: any) => haversineMetres(lat!, lng!, Number(br.latitude), Number(br.longitude))).concat([Infinity]))
      const distB = Math.min(...(b.branches as any[]).filter((br: any) => hasExactPosition(br)).map((br: any) => haversineMetres(lat!, lng!, Number(br.latitude), Number(br.longitude))).concat([Infinity]))
      return distA - distB
    })
  }

  let final: any[] = sorted

  if (params.maxDistanceMiles && lat !== undefined && lng !== undefined) {
    // PR #81 review B2 — maxDistanceMiles only filters by MANUALLY_CONFIRMED
    // branches. A merchant with only POSTCODE_CENTROID branches is treated
    // as out-of-range (Infinity) rather than letting approximate coords
    // pass the radius filter.
    const maxMetres = params.maxDistanceMiles * 1609.34
    final = final.filter((m: any) => {
      const minDist = Math.min(...(m.branches as any[]).filter((br: any) => hasExactPosition(br)).map((br: any) => haversineMetres(lat!, lng!, Number(br.latitude), Number(br.longitude))).concat([Infinity]))
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

  // Rank by intent (legacy — drives inclusion/order during the M3a hybrid phase).
  const { ordered: rankedTiles, counts: tierCounts } = rankMerchants(augmentedFiltered as any, {
    intentType, userLat: lat ?? null, userLng: lng ?? null, profileCity,
  })

  // Plan 4 M3a hybrid — run V2 alongside legacy. Populates the additive
  // contract fields (supplyRung / proximityBand / rungCounts / effectiveLocality)
  // for merchants V2's classifyRung admits. Merchants V2 rejects (POSTCODE_CENTROID
  // etc.) keep their legacy supplyTier from above with no new fields attached.
  // See deferred-followups §AV for the future policy decision.
  const v2 = await tryRankMerchantsV2(prisma, augmentedFiltered as any, {
    userId, lat: lat ?? null, lng: lng ?? null,
    categoryId, subcategoryId,
  })
  const v2TileById = v2TilesByMerchantId(v2.result)

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
  const merchants = enriched.map((tile: any, i: number) =>
    // M3a hybrid additive — V2 fields null for merchants V2 rejected
    // (POSTCODE_CENTROID etc.).
    mergeV2FieldsOntoTile({ ...tile, supplyTier: page[i].supplyTier }, v2TileById),
  )

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
      // M3a additive: rungCounts reflects only V2-admitted merchants (hybrid
      // phase). effectiveLocality from the EffectiveLocation resolver.
      rungCounts:        v2.result?.rungCounts ?? EMPTY_RUNG_COUNTS,
      effectiveLocality: v2.effLoc ? { id: v2.effLoc.locality.id, name: v2.effLoc.locality.name } : null,
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

  // 5. Rank by intent (legacy — drives inclusion/order during the M3a hybrid phase).
  const { ordered, counts } = rankMerchants(augmented as any, {
    intentType, userLat, userLng, profileCity,
  })

  // 5b. M3a hybrid — V2 alongside. See §AV for the policy decision.
  const v2 = await tryRankMerchantsV2(prisma, augmented as any, {
    userId: options.userId ?? null, lat: userLat, lng: userLng,
    // getCategoryMerchants is invoked with a single id that may be either
    // top-level (categoryId) or a subcategory. The helper Category lookup
    // determines which.
    categoryId: cat?.parent ? null : categoryId, // top-level
    subcategoryId: cat?.parent ? categoryId : null, // subcategory
  })
  const v2TileById = v2TilesByMerchantId(v2.result)

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

  // 9. Forward supplyTier from the rank step onto each enriched tile + attach V2 fields where present.
  const merchants = enriched.map((tile: any, i: number) =>
    mergeV2FieldsOntoTile({ ...tile, supplyTier: page[i].supplyTier }, v2TileById),
  )

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
      rungCounts:        v2.result?.rungCounts ?? EMPTY_RUNG_COUNTS,
      effectiveLocality: v2.effLoc ? { id: v2.effLoc.locality.id, name: v2.effLoc.locality.name } : null,
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
  merchant: { branches: Array<{ latitude: unknown; longitude: unknown; locationConfidence?: string | null }> },
  bbox: Bbox,
): boolean {
  for (const b of merchant.branches) {
    // PR #81 Codex re-review — application-level bbox inclusion gates on
    // MANUALLY_CONFIRMED. Companion to the SQL where-filter in
    // getInAreaMerchants (which already requires
    // locationConfidence: 'MANUALLY_CONFIRMED'); this helper covers the
    // post-rank in-memory bbox checks used elsewhere in the discovery
    // pipeline. A merchant with only POSTCODE_CENTROID branches inside
    // the bbox must NOT surface on map / in-area surfaces.
    if (!hasExactPosition(b)) continue
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

  // 5. Rank by intent (legacy — drives inclusion/order during the M3a hybrid phase).
  //    Counts reflect the UK-wide input set (Plan 1.5 invariant).
  const { ordered, counts } = rankMerchants(augmented as any, {
    intentType, userLat, userLng, profileCity,
  })

  // 5b. M3a hybrid V2 — Map-specific: EffectiveLocation derived from the
  //     viewport centre per spec §5.7, NOT the user's lat/lng. A user
  //     panning the map to a different area sees that area's rungs/bands
  //     attached to the V2-classified subset. Outgoing catchment loaded
  //     from the viewport-centre Locality.
  const viewportCenterLat = (options.bbox.minLat + options.bbox.maxLat) / 2
  const viewportCenterLng = (options.bbox.minLng + options.bbox.maxLng) / 2
  const viewportEffLoc = await resolveEffectiveLocation(prisma, {
    lat: viewportCenterLat, lng: viewportCenterLng,
  }, null)
  let v2Result: RankMerchantsV2Result | null = null
  if (viewportEffLoc) {
    const [ladderProfile, outgoingCatchmentTargetIds] = await Promise.all([
      resolveLadderProfileForCategory(prisma, options.categoryId, null),
      getOutgoingCatchmentTargetIds(prisma, viewportEffLoc.locality.id),
    ])
    v2Result = rankMerchantsV2(augmented as any, {
      effLoc: viewportEffLoc, ladderProfile,
      outgoingCatchmentTargetIds, categoryIntent: 'MIXED',
      targetCount: 500, hardCap: 1000,
    })
  }
  const v2TileById = v2TilesByMerchantId(v2Result)

  // 6. Filter by bbox (application level — see docstring)
  const filtered = ordered.filter(m => merchantHasBranchInBbox(m as any, options.bbox))
  const total = filtered.length

  // 7. Cap at limit (no offset; Map shows all pins in viewport up to cap)
  const page = filtered.slice(0, options.limit)

  // 8. Enrich the page slice.
  //    §AX bbox-centre fallback: when the caller has no GPS (user
  //    skipped location permission, or no §AU override), substitute
  //    the viewport centre as the location context for tile
  //    nearest-branch / latitude / longitude / distance selection.
  //    Without this, every in-area tile would emit null coords and
  //    MapPins would render zero pins for GPS-less sessions.
  //
  //    Scoped to this route only — Home / Search / Category retain
  //    their original "no GPS → no nearest-branch" semantics because
  //    their distance/order has different meaning. PR #81 redaction is
  //    unaffected: the fallback still flows through hasExactPosition,
  //    so POSTCODE_CENTROID / NEEDS_REVIEW / ADDRESS_GEOCODED branches
  //    still emit null coordinates.
  //
  //    Ranking at step 5 still uses the caller's GPS (or null) — this
  //    fallback only affects per-tile derivations, not order.
  const tileLat = userLat ?? viewportCenterLat
  const tileLng = userLng ?? viewportCenterLng
  const enriched = await enrichMerchantTiles(prisma, page as any, {
    lat: tileLat, lng: tileLng, userId: options.userId ?? null,
  })

  // 9. Forward supplyTier from the rank step + attach V2 fields where present.
  const merchants = enriched.map((tile: any, i: number) =>
    mergeV2FieldsOntoTile({ ...tile, supplyTier: page[i].supplyTier }, v2TileById),
  )

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
      // M3a additive — viewport-centre-derived. effectiveLocality describes
      // the locality the user's MAP IS CURRENTLY CENTRED ON (spec §5.7),
      // NOT the user's saved area.
      rungCounts:        v2Result?.rungCounts ?? EMPTY_RUNG_COUNTS,
      effectiveLocality: viewportEffLoc ? { id: viewportEffLoc.locality.id, name: viewportEffLoc.locality.name } : null,
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
