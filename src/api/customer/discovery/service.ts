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
  rankBranchesV3,
  resolveCategoryIntent,
  computeRatingsByMerchant,
  type CategoryIntent,
  type CategoryIntentType,
  type SupplyTier,
  type RankableMerchant,
  type RankableBranchInputV3,
  type RankMerchantsV2Result,
  type RankedBranchTile,
} from '../../lib/ranking'
import { resolveEffectiveLocation, type EffectiveLocation } from '../../lib/effectiveLocation'
import { getOutgoingCatchmentTargetIds } from '../../lib/catchmentLookup'
import type { LadderProfile, ProximityBand, SupplyRung } from '../../lib/ladderProfiles'
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

// ─── Discovery Rebaseline Task 2.1.0 — branch-first scope cascade ────────────
//
// Plan Rev 1.2 PR-2 entry gate. Branch-first sibling of
// `resolveScopeForRanking` (line ~429). The customer-app eventually flips
// Search from `merchants` to `branches`; until then the merchant variant
// honours `scope`. After this lands, both variants honour it identically so
// the UI flip is safe.
//
// Same cascade semantics as the legacy SupplyTier path, but operates on
// SupplyRung directly via the canonical tier ↔ rung mapping (mirrors
// `mapRungToLegacyTier` at ladderProfiles.ts:110):
//
//   NEARBY tier  → { NEARBY }
//   CITY tier    → { CATCHMENT, POST_TOWN }
//   DISTANT tier → { LAD, COUNTY, REGION, COUNTRY, NATIONAL }
//
// The cascade axis is NEARBY-tier-only / CITY-tier-included /
// DISTANT-tier-included — NOT individual rungs. This keeps `resolvedScope`
// legible (`'nearby' | 'city' | 'platform'`) and matches what the
// customer-app's SearchScope cascade already renders.

type BranchScopeResolution = {
  retainedRungs: ReadonlySet<SupplyRung>
  scopeExpanded: boolean
  resolvedScope: 'nearby' | 'city' | 'region' | 'platform'
}

const NEARBY_TIER_RUNGS:  readonly SupplyRung[] = ['NEARBY']
const CITY_TIER_RUNGS:    readonly SupplyRung[] = ['CATCHMENT', 'POST_TOWN']
const DISTANT_TIER_RUNGS: readonly SupplyRung[] = ['LAD', 'COUNTY', 'REGION', 'COUNTRY', 'NATIONAL']

function tiersToRungs(tiers: readonly ('NEARBY' | 'CITY' | 'DISTANT')[]): SupplyRung[] {
  const out: SupplyRung[] = []
  if (tiers.includes('NEARBY'))  out.push(...NEARBY_TIER_RUNGS)
  if (tiers.includes('CITY'))    out.push(...CITY_TIER_RUNGS)
  if (tiers.includes('DISTANT')) out.push(...DISTANT_TIER_RUNGS)
  return out
}

function rungSupplyForTiers(
  tiers: readonly ('NEARBY' | 'CITY' | 'DISTANT')[],
  rungCounts: Record<SupplyRung, number>,
): number {
  return tiersToRungs(tiers).reduce((sum, r) => sum + (rungCounts[r] ?? 0), 0)
}

function resolveScopeForBranches(
  requested: RequestedScope,
  intent: CategoryIntentType,
  rungCounts: Record<SupplyRung, number>,
): BranchScopeResolution {
  // Initial tier list — exact mirror of `resolveScopeForRanking`'s logic.
  const initialTiers: ('NEARBY' | 'CITY' | 'DISTANT')[] = (() => {
    if (requested === 'platform') return ['NEARBY', 'CITY', 'DISTANT']
    if (requested === 'nearby')   return ['NEARBY']
    if (requested === 'city' || requested === 'region') return ['NEARBY', 'CITY']
    if (intent === 'DESTINATION') return ['NEARBY', 'CITY', 'DISTANT']
    return ['NEARBY', 'CITY']
  })()

  let tiers: ('NEARBY' | 'CITY' | 'DISTANT')[] = initialTiers
  let expanded = false
  while (tiers.length < 3 && rungSupplyForTiers(tiers, rungCounts) === 0) {
    if (!tiers.includes('CITY'))    { tiers = [...tiers, 'CITY'];    expanded = true; continue }
    if (!tiers.includes('DISTANT')) { tiers = [...tiers, 'DISTANT']; expanded = true; continue }
    break
  }

  const resolvedScope: BranchScopeResolution['resolvedScope'] =
    tiers.includes('DISTANT') ? 'platform' :
    tiers.includes('CITY')    ? 'city' :
    'nearby'

  return {
    retainedRungs: new Set<SupplyRung>(tiersToRungs(tiers)),
    scopeExpanded: expanded,
    resolvedScope,
  }
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
      // §CD v1 (2026-05-22) — description selected so the matchContext
      // driving-signal check can mirror the where-predicate
      // includeDescriptionMatch gate.  Without this, a description-only
      // match would falsely surface a voucher matchContext line.
      description:         true,
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
      // §CD v1 (2026-05-22) — MerchantTag.tag.label selected so the
      // matchContext driving-signal check can detect when a curated
      // Tag.label (e.g. "Pizza" / "Indian") explained the match
      // independently of vouchers.  Mirrors the per-token Tag.label
      // contains in multi-token fuzzy fallthrough.
      tags: {
        select: { tag: { select: { id: true, label: true } } },
      },
      highlights: {
        include: { tag: { select: { id: true, label: true } } },
        orderBy: { sortOrder: 'asc' },
        take: 3,
      },
      vouchers: {
        where:  { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
        select: {
          id:              true,
          estimatedSaving: true,
          // §CD v1 — voucher title + description selected so the
          // per-tile matchContext computation has the data it needs
          // without an extra DB round-trip.  voucher.terms remains
          // unselected per §0.1.
          title:           true,
          description:     true,
          createdAt:       true,
        },
        // §CD v1 §0.7 — deterministic ordering for matchContext
        // (title-match wins; within-tier oldest voucher first).
        orderBy: { createdAt: 'asc' },
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

/**
 * PR #112 fixup-6 (2026-05-20) — owner-locked search-query normalisation.
 *
 * Owner-flagged regression: `restaurant` returned Fino's Pizzeria + The Coffee
 * House, while `restaurant ` (trailing space) returned Covelum Restaurant + My
 * Kerala Restaurant.  Trailing/internal whitespace must NEVER materially
 * change matches.
 *
 * Rules:
 *   1. Trim leading/trailing whitespace.
 *   2. Collapse repeated internal whitespace runs to a single space.
 *      `\s+` covers spaces, tabs, non-breaking spaces, line breaks.
 *   3. Return null when the result is empty (caller short-circuits).
 *
 * Apply in BOTH `searchMerchants` and `searchBranches` consistently.  Display
 * surfaces may still echo the user-typed query verbatim; backend matching
 * routes through the normalised value.
 *
 * Examples:
 *   normalizeSearchQuery('restaurant')        → 'restaurant'
 *   normalizeSearchQuery('restaurant ')       → 'restaurant'
 *   normalizeSearchQuery('  restaurant  ')    → 'restaurant'
 *   normalizeSearchQuery('coffee   shop')     → 'coffee shop'
 *   normalizeSearchQuery('\tcoffee\nshop ')   → 'coffee shop'
 *   normalizeSearchQuery('')                  → null
 *   normalizeSearchQuery('   ')               → null
 *   normalizeSearchQuery(null)                → null
 *   normalizeSearchQuery(undefined)           → null
 */
export function normalizeSearchQuery(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  return collapsed.length > 0 ? collapsed : null
}
/**
 * Strips merchant-name prefixes from a stored branch name.
 *
 * Seeded branch names use the merchant's TRADING NAME (short form) in the
 * "Brand — Locality" pattern (e.g. `"Covelum — Brightlingsea"` where
 * `businessName = "Covelum Restaurant"` and `tradingName = "Covelum"`).
 * The helper tries the trading name first (if non-null) because that's the
 * canonical prefix on stored branch rows; falls back to the full business
 * name for callers that don't supply a trading name.
 *
 * Owner device-QA bug (PR #112, 2026-05-19): the previous version of this
 * helper only tested against `businessName` ("Covelum Restaurant"), which
 * never matches `"Covelum — Brightlingsea"` as a prefix.  Result: branch
 * name shipped through to the UI unchanged ("Covelum — Brightlingsea"),
 * combined with the locality field on the client to produce the
 * "Covelum — Brightlingsea, Brightlingsea" duplicate the owner screenshotted.
 *
 * Handles em-dash (—), en-dash (–), and hyphen (-).
 */
function branchShortNameServer(
  rawBranchName: string,
  businessName: string,
  tradingName: string | null,
): string {
  if (!rawBranchName) return rawBranchName

  // Try trading name first — that's the canonical prefix on stored branches.
  // Fall back to businessName if trading name is null/empty.
  const candidates: string[] = []
  if (tradingName && tradingName.trim().length > 0) candidates.push(tradingName.trim())
  if (businessName && businessName.trim().length > 0) candidates.push(businessName.trim())

  let result = rawBranchName
  for (const candidate of candidates) {
    const escaped = escapeRegex(candidate)
    const dashed  = new RegExp(`^${escaped}\\s*[\\-–—]\\s*`, 'i')
    const spaced  = new RegExp(`^${escaped}\\s+`, 'i')
    const stripped = result.replace(dashed, '').replace(spaced, '').trim()
    if (stripped !== result && stripped.length > 0) {
      result = stripped
      break  // first matching candidate wins
    }
  }
  return result.length > 0 ? result : rawBranchName
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
  // §CD v1 (2026-05-22) — voucher matchContext is computed per-tile
  // when these are present.  Set by `searchBranches` only; Home /
  // Category / Map / Campaign consumers omit them and tiles emit
  // `matchContext: null`.
  matchContextQuery?:              string | null
  matchContextIncludeDescription?: boolean
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
    // §CD v1 (2026-05-22) — when the caller (searchBranches) had a
    // non-empty query AND voucher-keyword-matching is in scope, pass
    // the query + length-gate flag so enrichBranchTile can compute the
    // matchContext line.  Null/undefined for non-search callers (Home /
    // Category / Map) — those surfaces never compute matchContext and
    // emit `matchContext: null` on every tile.
    matchContextQuery?: string | null
    matchContextIncludeDescription?: boolean
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
  // PR #112 device-QA fixup-3 (2026-05-19) — total value across all
  // active+approved vouchers.  Drives the Search card "N offers · £X.XX
  // total value" pill on multi-offer merchants.  ADDITIVE — does NOT
  // overload maxEstimatedSaving.  Other surfaces continue to read max.
  // Round to whole pence to avoid float-arith drift over many vouchers.
  const totalEstimatedSavingRaw = savings.length > 0
    ? savings.reduce((a, b) => a + b, 0)
    : null
  const totalEstimatedSaving = totalEstimatedSavingRaw === null
    ? null
    : Math.round(totalEstimatedSavingRaw * 100) / 100

  // Descriptor — branchTileSchema declares `descriptor: z.string()` (not
  // nullable), so fall back to an empty string when the merchant has no
  // primaryCategory.
  const descriptor = descriptorForMerchant(merchant) ?? ''

  // Highlights — visibleHighlightsFor filters out redundant-by-subcategory
  // tags + caps at 3. `tag` (NOT `highlightTag`) per service.ts:225-228 +
  // schema relation `MerchantHighlight.tag`.
  const visibleHighlights = visibleHighlightsFor(merchant.highlights ?? [], opts.redundantSet)
    .map(h => ({ highlightTagId: h.highlightTagId, label: h.tag.label }))

  // §CD v1 (2026-05-22) — per-tile matchContext computation.
  //
  // Locked rules:
  //   §0.6 — fire ONLY when voucher was the DRIVING signal.  If the
  //          query also matches any merchant/branch content, return null.
  //   §0.7 — priority: title-match > description-match.  Within tier,
  //          deterministic by Voucher.createdAt ASC (already sorted by
  //          MERCHANT_TILE_SELECT.orderBy).
  //   §0.2 — locked copy: `Found in "<voucherTitle>" voucher`.
  //
  // Callers that don't pass `matchContextQuery` (Home / Category / Map)
  // get `matchContext: null` automatically — voucher-keyword search is
  // a /search-only feature in v1.
  const matchContext = computeVoucherMatchContext(
    opts.matchContextQuery ?? null,
    opts.matchContextIncludeDescription ?? false,
    branch,
    merchant,
  )

  return {
    id:                       branch.id,
    branchName:               branchShortNameServer(branch.name, merchant.businessName, merchant.tradingName),
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
      totalEstimatedSaving,
    },
    // §CD v1 — locked copy per §0.2.
    matchContext,
  }
}

/**
 * §CD v1 — per-tile matchContext helper.  Returns `Found in "<title>"
 * voucher` when the query matched voucher.title or voucher.description
 * (gated) AND no merchant/branch content explains the match.  Returns
 * null otherwise.
 *
 * "Driving signal" check: walk every token through every merchant/branch
 * content field.  If EVERY token hits some non-voucher field, voucher
 * was NOT the driver — return null (the user understands the match via
 * business name / category / tag / branch).  Mirrors the single/multi-
 * token AND-OR semantics from the where predicate.
 */
function computeVoucherMatchContext(
  rawQuery: string | null,
  includeDescriptionMatch: boolean,
  branch: BranchSelectResult,
  merchant: BranchSelectResult['merchant'],
): string | null {
  if (!rawQuery) return null
  const q = rawQuery.trim().toLowerCase()
  if (q.length < 2) return null
  const tokens = q.split(/\s+/).filter(t => t.length > 0)
  if (tokens.length === 0) return null

  // Step 1 — "driving signal" check: every token must match a merchant/
  // branch content field for the voucher path to be considered
  // non-driving (i.e. another field already explained the match).
  const merchantContentExplainsAllTokens = tokens.every(t =>
    merchant.businessName.toLowerCase().includes(t) ||
    (merchant.tradingName?.toLowerCase().includes(t) ?? false) ||
    (merchant.primaryCategory?.name.toLowerCase().includes(t) ?? false) ||
    merchant.categories.some(c => c.category.name.toLowerCase().includes(t)) ||
    (merchant.tags?.some(mt => mt.tag.label.toLowerCase().includes(t)) ?? false) ||
    (merchant.highlights?.some(h => h.tag.label.toLowerCase().includes(t)) ?? false) ||
    branch.name.toLowerCase().includes(t) ||
    (branch.localityName?.toLowerCase().includes(t) ?? false) ||
    (branch.postTown?.toLowerCase().includes(t) ?? false) ||
    (includeDescriptionMatch && (merchant.description?.toLowerCase().includes(t) ?? false))
  )
  if (merchantContentExplainsAllTokens) return null

  // Step 2 — voucher-title match wins over voucher-description.
  // Voucher rows already sorted by createdAt ASC via the
  // MERCHANT_TILE_SELECT.vouchers.orderBy clause, so the first match
  // wins deterministically.
  //
  // Single-token: `q` (full normalisedQ) must appear in title.
  // Multi-token: every token must appear in the SAME voucher title
  //              (mirrors the user-intent for "free coffee" → one
  //              voucher containing both words).
  for (const v of merchant.vouchers) {
    const titleLower = v.title.toLowerCase()
    if (tokens.every(t => titleLower.includes(t))) {
      return `Found in "${v.title}" voucher`
    }
  }
  if (includeDescriptionMatch) {
    for (const v of merchant.vouchers) {
      const descLower = v.description?.toLowerCase() ?? ''
      if (descLower && tokens.every(t => descLower.includes(t))) {
        return `Found in "${v.title}" voucher`
      }
    }
  }
  return null
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
      // §CD v1 — voucher matchContext context (only set by searchBranches).
      ...(ctx.matchContextQuery !== undefined ? { matchContextQuery: ctx.matchContextQuery } : {}),
      ...(ctx.matchContextIncludeDescription !== undefined ? { matchContextIncludeDescription: ctx.matchContextIncludeDescription } : {}),
    }))
  }
  return tiles
}

export { enrichBranchTile, enrichBranchTiles }

// ─── Home Feed ───────────────────────────────────────────────────────────────

// ─── Phase B — Home Relevance envelope types (additive, plan v1.1) ──────────
//
// Hard Invariant from the Home Relevance plan v1.1: the backend continues to
// emit the legacy response fields UNCHANGED:
//   - featuredBranches, trendingBranches, nearbyByCategoryBranches  (Phase 1
//     branch-themed variants)
//   - featured, trending, nearbyByCategory                          (legacy
//     merchant-themed fields)
//   - locationContext.city, locationContext.source
//   - campaigns
//
// The new Home Relevance envelope adds NON-COLLIDING field names so legacy
// consumers keep working while the new rails roll out:
//   - featuredRail, trendingRail, popularRail                       (HomeRail)
//   - nearbyByCategoryRails                                         (HomeNearbyCategoryRail[])
//
// Each rail carries its own meta envelope (scope + scopeExpanded + rungCounts
// + the locality reference under which the rail was resolved), mirroring the
// search/map meta pattern. Builders for these rails arrive in Phase C–E; this
// file only declares the types in Phase B.1 (no behavioural change).
//
// Naming choice rationale: `*Rail` (not `*Branches`) so callers can grep for
// the new envelope shape without colliding with the existing branch-themed
// fan-out fields. `popularRail` is brand-new (no legacy `popular*` equivalent
// exists today) — Phase E introduces the popular rail builder.

export type LocalityRef = { id: string; name: string }

export type HomeRailMeta = {
  locality:       LocalityRef | null
  scope:          'nearby' | 'city' | 'platform'
  scopeExpanded:  boolean
  rungCounts:     Record<SupplyRung, number>
}

export type HomeRail = {
  branches: BranchTile[]
  meta:     HomeRailMeta | null
}

export type HomeNearbyCategoryRail = {
  category: { id: string; name: string }
  branches: BranchTile[]
  meta:     HomeRailMeta | null
}

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

  // ─── Phase 1 additive — branch-themed home-feed variants (Spec §1.5) ───────
  //
  // Adds `featuredBranches`, `trendingBranches`, `nearbyByCategoryBranches`
  // alongside the existing merchant-themed fields. Existing fields are
  // UNCHANGED — this is strictly additive. `campaigns` (banner-level) is NOT
  // fanned out: it's a CampaignBannerTile[], not a merchant/branch tile list.
  //
  // Featured + Trending merchants fan out to all their active branches as
  // separate branch tiles per Spec §5.2 interim behaviour (pre-
  // FeaturedMerchant.branchId? schema migration). Same for nearbyByCategory.
  //
  // POSTCODE_CENTROID + NEEDS_REVIEW branches: surface as tiles per Spec
  // §4.1.1 list-view admission (Home is a list view). enrichBranchTiles +
  // exposeBranchPosition handle lat/lng redaction at the serialization
  // boundary, so non-MANUALLY_CONFIRMED tiles surface with null
  // branchLatitude / branchLongitude.
  //
  // Option A — no ranking pass for Home: Home's inclusion + order is
  // curatorial (FeaturedMerchant table priority, trending = redemption count,
  // nearbyByCategory = city-filtered grouping). Rank-then-paginate doesn't
  // apply the same way as Map/Search. Each fan-out tile passes
  // `supplyRung: null, proximityBand: null` into enrichBranchTiles; the V3
  // ranker can be wired in a later Phase if a Home redesign requires it.
  //
  // Distance per tile is computed via haversineMetres ONLY when:
  //   (a) the user has GPS (lat/lng both non-null), AND
  //   (b) the branch is MANUALLY_CONFIRMED with both lat/lng set.
  // Otherwise distance is null. This mirrors the redaction contract:
  // exposeBranchPosition would null the position for non-MANUALLY_CONFIRMED
  // branches inside enrichBranchTile, so computing a distance against
  // approximate POSTCODE_CENTROID coords would mislead.
  function fanOutMerchantToBranchInputs(merchant: { id: string; branches: any[] }): EnrichBranchInput[] {
    return merchant.branches
      .filter((b: any) => b.isActive)
      .map((b: any) => {
        const hasUserGps = lat !== null && lng !== null
        const hasExact = hasExactPosition(b)
        const d = hasUserGps && hasExact
          ? haversineMetres(lat!, lng!, Number(b.latitude), Number(b.longitude))
          : null
        return {
          branchId:      b.id,
          merchantId:    merchant.id,
          supplyRung:    null,
          proximityBand: null,
          distance:      d,
        }
      })
  }

  const featuredBranchInputs  = featured.flatMap((m: any)        => fanOutMerchantToBranchInputs(m))
  const trendingBranchInputs  = (trending as any[]).flatMap((m: any) => fanOutMerchantToBranchInputs(m))
  const nearbyBranchInputsBy  = nearbyByCategory.map(section => ({
    category: section.category,
    inputs:   section.merchants.flatMap((m: any) => fanOutMerchantToBranchInputs(m)),
  }))

  // Run the three enrichBranchTiles batches in parallel (mirrors the
  // enrichMerchantTiles parallel pattern above at lines 1150-1153).
  const [featuredBranches, trendingBranches, nearbyByCategoryBranchesFlat] = await Promise.all([
    enrichBranchTiles(prisma, featuredBranchInputs,  { userId, lat, lng }),
    enrichBranchTiles(prisma, trendingBranchInputs,  { userId, lat, lng }),
    Promise.all(nearbyBranchInputsBy.map(async section => ({
      category: section.category,
      branches: await enrichBranchTiles(prisma, section.inputs, { userId, lat, lng }),
    }))),
  ])

  return {
    locationContext: { city: locationCtx.city, source: locationCtx.source },
    featured: enrichedFeatured.map(t => mergeV2FieldsOntoTile(t, homeV2TileById)),
    trending: enrichedTrending.map(t => mergeV2FieldsOntoTile(t, homeV2TileById)),
    campaigns,
    nearbyByCategory: enrichedNearby.map(item => ({
      category: item.category,
      merchants: item.merchants.map((t: any) => mergeV2FieldsOntoTile(t, homeV2TileById)),
    })),
    // Phase 1 additive — branch-themed variants. NOT a campaignBranches field;
    // campaigns are banner-level and stay unchanged.
    featuredBranches,
    trendingBranches,
    nearbyByCategoryBranches: nearbyByCategoryBranchesFlat,
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

  // PR #112 fixup-6 (2026-05-20) — normalise the user query before matching.
  // Owner-locked: trim + collapse internal whitespace.  Trailing/internal
  // whitespace MUST NOT change results (`restaurant` vs `restaurant ` etc.).
  const normalizedQ = normalizeSearchQuery(q)

  if (!normalizedQ && !categoryId && !subcategoryId && minLat === undefined) {
    throw new AppError('SEARCH_QUERY_REQUIRED')
  }

  const where: Prisma.MerchantWhereInput = { status: MerchantStatus.ACTIVE }

  if (normalizedQ) {
    const tags = await prisma.merchantSuggestedTag.findMany({
      where: { tag: { contains: normalizedQ, mode: 'insensitive' }, status: MerchantSuggestedTagStatus.APPROVED },
      select: { merchantId: true },
    })
    const tagMerchantIds = [...new Set(tags.map((t: any) => t.merchantId))]
    where.OR = [
      { businessName:    { contains: normalizedQ, mode: 'insensitive' } },
      { tradingName:     { contains: normalizedQ, mode: 'insensitive' } },
      { description:     { contains: normalizedQ, mode: 'insensitive' } },
      { primaryCategory: { name: { contains: normalizedQ, mode: 'insensitive' } } },
      { categories:      { some: { category: { name: { contains: normalizedQ, mode: 'insensitive' } } } } },
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

// ─── Search (branch-first variant) ───────────────────────────────────────────
//
// Discovery Rebaseline Phase 1 Task 1.5.
// Spec docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md §3.
//
// Branch-first analogue of `searchMerchants` above. Same param surface, but the
// output is a flat list of `BranchTile`s (one per branch) rather than one row
// per merchant. Coexists with the merchant variant during Phase 1 + Phase 2;
// Phase 3 drops the merchant version per the §AT cleanup note.
//
// Pipeline (mirrors the 7-step shape of searchMerchants):
//   1. Validate at least one bounded predicate (q / categoryId / subcategoryId / bbox).
//   2. Build a branch-level Prisma where (merchant filters via `merchant: { ... }`).
//      Free-text OR clause extends to branch-identity fields per Spec §3.1
//      (branch.name / localityName / postTown) — the Covelum / Brightlingsea bug
//      class closes here at the service layer.
//   3. Fetch candidate branches (no take / skip).
//   4. Partition by `locationConfidence`:
//        MANUALLY_CONFIRMED + ADDRESS_GEOCODED → pass through rankBranchesV3.
//        POSTCODE_CENTROID + NEEDS_REVIEW      → null-rung "tail" tiles. List
//        views (Search / Home / Category) MUST surface these per Spec §4.1.1;
//        only Map pin layers exclude them.
//   5. Resolve effLoc + ladder profile + outgoing catchment.
//   6. Rank the rankable subset via `rankBranchesV3`. Sort the non-rankable
//      tail alphabetically by `merchant.businessName` then branch id for
//      determinism.
//   7. Concatenate (ranked ++ non-rankable tail), compute total, paginate, enrich.
//
// Scope resolution: Task 2.1.0 (Plan Rev 1.2 PR-2 entry gate) added a per-rung
// `resolveScopeForBranches` helper sibling of `resolveScopeForRanking`. The
// user-facing `scope` cascade now cuts branch results identically to the
// merchant variant. See line ~470 for the helper + the canonical tier ↔ rung
// mapping that mirrors `mapRungToLegacyTier` at ladderProfiles.ts:110.
//
// Phase 1 params accepted but NOT honoured (the function signature mirrors
// searchMerchants for surface parity; honouring is delegated to Phase 2/3
// cleanup or follow-up work; rankBranchesV3 + the branch-first contract
// intentionally simplify the Phase 1 surface). After Task 2.1.0 closed
// `scope`, the remaining seven ignored params (tracked under
// deferred-followups §BX.1-§BX.7) are:
//   - maxDistanceMiles — would require a post-rank distance filter; deferred (§BX.1).
//   - amenityIds       — branch-level amenity filter; deferred (§BX.2).
//   - tagIds           — Tag.label filter; deferred Plan 4 M4 work (§BX.3).
//   - openNow          — Europe/London current-time gate; deferred (§BX.4).
//   - featured         — FeaturedMerchant overlay; deferred (§BX.5).
//   - topRated         — quality-aware sort; deferred (§BX.6).
//   - sortBy           — relevance / nearest / top_rated / highest_saving
//                        override; deferred (§BX.7) — current sort is
//                        rankBranchesV3's default per ladder profile.
//
// Route handlers that wire searchBranches alongside searchMerchants (Task 1.10)
// should be aware of this parity gap. Two options for callers:
//   (a) strip these params at the route layer when delegating to searchBranches.
//   (b) accept them at the route and document the no-op for callers.
// Recommended: (b) — accept-and-no-op keeps callers' tests portable across
// Phase 1 / 2 / 3 as more params get honoured incrementally.

// Plan 4 M4.2 — Place detection.  Kill-switch per spec §11.3.  When true,
// `searchBranches` looks up `q` against `Locality.name` (ILIKE-prefix) then
// `Locality.postTown`; the highest-population-tier match becomes the
// EffectiveLocation, overriding the caller's GPS.  When false, `tryPlaceMatch`
// returns null and the existing GPS-driven path runs unchanged.
const PLACE_SEARCH_DETECTION_ENABLED = true

// Plan 4 M4.2 — populationTier sort order for place-match disambiguation.
// When `q` matches multiple Localities (e.g. "Newport" — multiple UK
// localities share the name), the densest one wins.  Mirrors the ladder
// rung ordering used elsewhere in the discovery service.
const POPULATION_TIER_ORDER: Record<string, number> = {
  METRO_CORE: 7, CITY: 6, LARGE_TOWN: 5, TOWN: 4,
  SMALL_TOWN:  3, VILLAGE: 2, HAMLET: 1, UNKNOWN: 0,
}

// Plan 4 M4.2 — `q` length threshold for prefix vs exact match.
//
// PR #124 fixup-1 (2026-05-22) — tightened after owner device QA flagged
// that prefix matching was stealing common-word queries like `Indian`
// (matched "Indian Queens" — a Cornish village/hamlet) and `nails`
// (matched "Nailsea" — a TOWN-tier locality near Bristol).  The fix:
//
//   1. EXACT case-insensitive match on `Locality.name` OR `postTown` —
//      acceptable at ANY populationTier.  E.g. q="Brightlingsea" hits
//      the Brightlingsea Locality regardless of its tier.
//   2. PREFIX match (`startsWith`) — only when:
//        a. query length >= PLACE_MATCH_PREFIX_THRESHOLD (raised from 5
//           to 6 to exclude short common-word prefixes), AND
//        b. matched Locality.populationTier ∈ PLACE_PREFIX_ALLOWED_TIERS
//           (METRO_CORE / CITY / LARGE_TOWN only — excludes TOWN /
//           SMALL_TOWN / VILLAGE / HAMLET, which are where "Indian
//           Queens" / "Nailsea" sit).
//
// Effect: places like "London" / "Manchester" / "Brighton" / "Bath"
// keep working via exact match at any tier; users typing "Brigh" still
// prefix-match Brighton (LARGE_TOWN+); but "nails" and "Indian" no
// longer steal results from genuine merchant/tag queries.
const PLACE_MATCH_PREFIX_THRESHOLD = 6
const PLACE_PREFIX_ALLOWED_TIERS = new Set<string>(['METRO_CORE', 'CITY', 'LARGE_TOWN'])

// PR #124 fixup-4 (2026-05-22) — simple singular-form stem.
//
// Owner device QA flagged that `nails` returned no merchants while
// `nail` correctly returned Polish Nail Studio.  Solution: when a query
// (or token) ends in 's' and is long enough to be unambiguously
// plural, emit a singular variant.  Both forms are tried in tryTagMatch
// and added to per-token fuzzy fallthrough.
//
// Conservative stem rules (avoid false positives on short common words):
//   - token.length >= 5  → minimum length to consider as plural
//   - exclude 'ss' (kiss), 'us' (radius), 'is' (oasis), 'os' (rhinos
//     pattern — keep)
//   - ends in 's' → strip the trailing 's'
//
// This is NOT a full linguistic stemmer — owner-direction-locked as
// "simple plural/singular normalization" only.  More complex forms
// (irregular plurals, -ies → -y, etc.) are out of scope.  Out-of-scope
// expansions tracked separately if device QA surfaces them.
function singularize(token: string): string | null {
  if (token.length < 5) return null
  const lower = token.toLowerCase()
  if (lower.endsWith('ss')) return null
  if (lower.endsWith('us')) return null
  if (lower.endsWith('is')) return null
  if (lower.endsWith('s'))  return token.slice(0, -1)
  return null
}

/**
 * Variants of a token used by fuzzy-fallthrough fields and `tryTagMatch`.
 * Always includes the original; conditionally adds the singular form
 * when `singularize` returns one.
 *
 * Place-match deliberately does NOT use variants — owner direction said
 * `nails` should NOT be promoted to a place search via `nail` (singular).
 * tryPlaceMatch keeps its existing exact-or-prefix-with-tier logic.
 */
function tokenVariants(token: string): string[] {
  const out = [token]
  const s = singularize(token)
  if (s) out.push(s)
  return out
}

// Plan 4 M4.3 — curated Tag match.  Exact case-insensitive lookup on
// `Tag.label` (per §M4-AMENDMENT-2026-05-22 A7 — no fuzzy in this PR).
// Runs AFTER tryPlaceMatch returns null (place wins over tag).  Returns
// the matched Tag row or null.
//
// PR #124 fixup-4 (2026-05-22) — extended to try singular variants too,
// so q="nails" can find a curated "Nail" tag if one exists.  Variants
// are tried in order (original first); first hit wins.
async function tryTagMatch(prisma: PrismaClient, q: string | undefined) {
  if (!q) return null
  const trimmed = q.trim()
  if (trimmed.length < 2) return null

  const variants = tokenVariants(trimmed)
  for (const variant of variants) {
    const tag = await prisma.tag.findFirst({
      where:  { label: { equals: variant, mode: 'insensitive' } },
      select: { id: true, label: true, type: true },
    })
    if (tag) return tag
  }
  return null
}

async function tryPlaceMatch(prisma: PrismaClient, q: string | undefined) {
  if (!PLACE_SEARCH_DETECTION_ENABLED) return null
  if (!q) return null
  const trimmed = q.trim()
  if (trimmed.length < 2) return null
  const trimmedLower = trimmed.toLowerCase()

  // Step 1 — EXACT case-insensitive match on Locality.name OR postTown.
  // Acceptable at ANY populationTier (a small town named exactly the
  // user's query IS the place they mean).
  const exactMatches = await prisma.locality.findMany({
    where: {
      OR: [
        { name:     { equals: trimmed, mode: 'insensitive' as const } },
        { postTown: { equals: trimmed, mode: 'insensitive' as const } },
      ],
    },
    take:  10,
  })
  if (exactMatches.length > 0) {
    // Densest tier wins; name-match wins over postTown-match at same tier.
    const scored = exactMatches.map(m => {
      const nameHit = m.name.toLowerCase() === trimmedLower
      const tierScore = (POPULATION_TIER_ORDER[m.populationTier] ?? 0) * 10
      return { row: m, score: tierScore + (nameHit ? 1 : 0) }
    }).sort((a, b) => b.score - a.score)
    return scored[0]?.row ?? null
  }

  // Step 2 — PREFIX match — only fires when:
  //   (a) query length >= PLACE_MATCH_PREFIX_THRESHOLD (6 chars), AND
  //   (b) matched Locality.populationTier ∈ PLACE_PREFIX_ALLOWED_TIERS
  //       (METRO_CORE / CITY / LARGE_TOWN only).
  // Closes the "Indian" -> "Indian Queens" (HAMLET) and "nails" ->
  // "Nailsea" (TOWN) false-positive classes — both fail at least one
  // of (a) length or (b) tier.
  if (trimmed.length < PLACE_MATCH_PREFIX_THRESHOLD) return null

  const prefixMatches = await prisma.locality.findMany({
    where: {
      OR: [
        { name:     { startsWith: trimmed, mode: 'insensitive' as const } },
        { postTown: { startsWith: trimmed, mode: 'insensitive' as const } },
      ],
      populationTier: {
        in: Array.from(PLACE_PREFIX_ALLOWED_TIERS) as any,
      },
    },
    take:  10,
  })
  if (prefixMatches.length === 0) return null

  const scored = prefixMatches.map(m => {
    const nameHit = m.name.toLowerCase().startsWith(trimmedLower)
    const tierScore = (POPULATION_TIER_ORDER[m.populationTier] ?? 0) * 10
    return { row: m, score: tierScore + (nameHit ? 1 : 0) }
  }).sort((a, b) => b.score - a.score)
  return scored[0]?.row ?? null
}

export async function searchBranches(
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
    limit: number
    offset: number
    userId: string | null
  },
): Promise<{
  branches: BranchTile[]
  totalBranches: number
  meta: {
    rungCounts: Record<keyof typeof EMPTY_RUNG_COUNTS, number>
    effectiveLocality: { id: string; name: string } | null
    scope: 'nearby' | 'city' | 'region' | 'platform'
    scopeExpanded: boolean
    // PR-2 device-QA fix (2026-05-19) — parity with `searchMerchants`
    // meta so the customer-app SearchScreen can read this envelope
    // exclusively (no mixing of merchant-tier counts into branch list).
    nearbyCount: number
    cityCount: number
    distantCount: number
    emptyStateReason: 'none' | 'expanded_to_wider' | 'no_uk_supply'
    resolvedArea: string
    // Plan 4 M4.2 — additive search-mode indicator.  Non-null when `q`
    // matched a known Locality (PLACE) OR a curated Tag (TAG, M4.3).
    // Customer-app reads this to render the place/tag-aware header copy
    // per §M4-AMENDMENT-2026-05-22 A1 Path 5b.  Minimal shape per A6 —
    // no Locality id / populationTier yet.
    searchChip: { mode: 'PLACE' | 'TAG'; label: string } | null
  }
}> {
  const { q, categoryId, subcategoryId, lat, lng, minLat, maxLat, minLng, maxLng,
          minSaving, voucherTypes, scope, limit, offset, userId } = params

  // PR #112 fixup-6 (2026-05-20) — normalise the user query before matching.
  // Owner-locked: trim + collapse internal whitespace.  Trailing/internal
  // whitespace MUST NOT change results (`restaurant` vs `restaurant ` etc.).
  // Routes through the same `normalizeSearchQuery` helper as `searchMerchants`
  // so both services see identical match input for any given user query.
  const normalizedQ = normalizeSearchQuery(q)

  // ── 1. Validate bounded predicate (mirrors searchMerchants line 1978).
  if (!normalizedQ && !categoryId && !subcategoryId && minLat === undefined) {
    throw new AppError('SEARCH_QUERY_REQUIRED')
  }

  // Plan 4 M4.2 + M4.3 — Place + Tag detection.
  //
  // PR #124 fixup-1 (2026-05-22) — owner-direction precedence reorder
  // after device QA flagged `Indian` and `nails` being stolen by
  // PLACE detection.  Locked precedence:
  //
  //   1. TAG (exact curated `Tag.label` match) — wins over PLACE.
  //      Surface predicate adds `{ tags: { some } }` + `{ highlights:
  //      { some } }` branches; the text-OR fuzzy still runs alongside.
  //   2. PLACE — fires ONLY when TAG returned null AND the new stricter
  //      `tryPlaceMatch` (exact any-tier, OR prefix-with-LARGE_TOWN+)
  //      returns a Locality.  When fired: drives effLoc + skips
  //      text-OR (the place IS the area).
  //   3. neither → existing multi-token fuzzy OR runs.
  //
  // Performance — all 3 lookups (place, tag, tag-merchant-suggested)
  // run IN PARALLEL via Promise.all so the wall-clock cost stays close
  // to a single round-trip.  Place lookup may be discarded when tag
  // wins (small waste, but the parallel scheduling beats a sequential
  // check on cold-Neon round-trip cost).
  // §CD v1 (2026-05-22) — voucher title + description lookup pre-fetched
  // in parallel with the existing place/tag/suggested-tag lookups.
  // Returning merchant ids (instead of putting an EXISTS subquery in the
  // where.OR) collapses per-token / per-field traversal cost into a
  // single indexed `merchant.id IN [...]` predicate.  Avoids the cold-
  // Neon 5s timeout regression that occurred when `merchant.vouchers.some`
  // was embedded directly in `fieldOrForToken`.
  //
  // §0.1 v1 scope: title (un-gated) + description (gated on
  // MIN_DESCRIPTION_MATCH_LENGTH=5 via the includeDescriptionMatch flag
  // resolved below).  voucher.terms EXCLUDED from v1.
  //
  // Status + approval gate mirrors MERCHANT_TILE_SELECT.vouchers.where
  // exactly — only ACTIVE + APPROVED vouchers drive the match.
  const includeDescriptionMatchForVoucher = normalizedQ
    ? normalizedQ.length >= 5
    : false
  const [placeMatchRaw, tagMatch, tagMerchantsLookup, voucherMerchantsLookup] = normalizedQ
    ? await Promise.all([
        tryPlaceMatch(prisma, normalizedQ),
        tryTagMatch(prisma, normalizedQ),
        prisma.merchantSuggestedTag.findMany({
          where:  { tag: { contains: normalizedQ, mode: 'insensitive' }, status: MerchantSuggestedTagStatus.APPROVED },
          select: { merchantId: true },
        }),
        prisma.voucher.findMany({
          where: {
            status:         VoucherStatus.ACTIVE,
            approvalStatus: ApprovalStatus.APPROVED,
            OR: [
              { title: { contains: normalizedQ, mode: 'insensitive' as const } },
              ...(includeDescriptionMatchForVoucher
                ? [{ description: { contains: normalizedQ, mode: 'insensitive' as const } }]
                : []),
            ],
          },
          select: { merchantId: true },
          distinct: ['merchantId'],
        }),
      ])
    : [null, null, [] as Array<{ merchantId: string }>, [] as Array<{ merchantId: string }>]
  // Tag wins over place per the precedence above.  If a tag matched,
  // ignore any speculative place result.
  const placeMatch = tagMatch ? null : placeMatchRaw
  const voucherMerchantIds = Array.from(new Set(voucherMerchantsLookup.map(v => v.merchantId)))

  // ── 2. Build branch-level predicate.
  const where: Prisma.BranchWhereInput = {
    isActive: true,
    merchant: { status: MerchantStatus.ACTIVE },
  }

  // Only run the text fuzzy when NO place matched.  When a place matched,
  // every branch in/around that Locality is a candidate regardless of
  // whether its name/category/etc. contains the query string.
  if (normalizedQ && !placeMatch) {
    // Tag-matched merchant ids fetched in parallel with the place lookup above.
    const tagMerchantIds = Array.from(new Set(tagMerchantsLookup.map(t => t.merchantId)))

    // PR #112 fixup-4 (2026-05-19) — relevance fix: gate description
    // substring matching to queries ≥ MIN_DESCRIPTION_MATCH_LENGTH.
    // Threshold = 5 chars: empirically suppresses the `cove`-class
    // false-positive while letting `covel` / `cover` through (where
    // description match adds genuine signal).
    const MIN_DESCRIPTION_MATCH_LENGTH = 5
    const includeDescriptionMatch =
      normalizedQ.length >= MIN_DESCRIPTION_MATCH_LENGTH

    // PR #124 fixup-1 (2026-05-22) — multi-token AND-OR support.
    //
    // Owner device QA flagged `Indian cafe` returning zero — single-bag
    // OR required the FULL phrase to appear in one field.  Multi-token
    // queries now split on whitespace; each token must match at least
    // one of the merchant/branch fields, AND-combined across tokens.
    //
    // Single-token queries keep the existing OR behaviour exactly.
    const tokens = normalizedQ.trim().split(/\s+/).filter(t => t.length > 0)
    const isMultiToken = tokens.length > 1

    function fieldOrForToken(token: string): Prisma.BranchWhereInput[] {
      // PR #124 fixup-4 (2026-05-22) — emit contains-checks for the
      // token AND its singular variant.  Closes the "nails" → no match
      // gap: "nails" doesn't contain in "Polish Nail Studio" or "Nail
      // Salon", but "nail" does.  Per-field OR within each variant +
      // OR across variants.
      const variants = tokenVariants(token)
      return variants.flatMap(v => [
        // Merchant-level STRONG matches (always on).
        { merchant: { businessName:    { contains: v, mode: 'insensitive' as const } } },
        { merchant: { tradingName:     { contains: v, mode: 'insensitive' as const } } },
        { merchant: { primaryCategory: { name: { contains: v, mode: 'insensitive' as const } } } },
        { merchant: { categories:      { some: { category: { name: { contains: v, mode: 'insensitive' as const } } } } } },
        // Multi-token only: curated Tag.label `contains` per token (Tag +
        // MerchantHighlight branches).  Single-token uses `tryTagMatch`
        // exact-only per §M4-AMENDMENT-2026-05-22 A7; the contains
        // expansion is added only on the multi-token fuzzy fallthrough
        // (owner direction in PR #124 fixup: "should match descriptor/
        // category/tag combinations").
        ...(isMultiToken
          ? [
              { merchant: { tags:       { some: { tag: { label: { contains: v, mode: 'insensitive' as const } } } } } },
              { merchant: { highlights: { some: { tag: { label: { contains: v, mode: 'insensitive' as const } } } } } },
            ]
          : []),
        // §CD v1 — voucher matching is handled via the pre-fetched
        // `voucherMerchantIds` injected as a single `merchant.id IN [...]`
        // predicate below (cheaper than per-token EXISTS subqueries).
        // The voucher match uses the FULL normalizedQ (CONTAINS on
        // voucher.title + voucher.description gated) — multi-token AND
        // semantics for vouchers are intentionally "match the whole
        // phrase against one voucher field" rather than per-token across
        // multiple vouchers.  voucher.terms EXCLUDED from v1.
        // Description match — gated on the FULL query length (existing rule).
        ...(includeDescriptionMatch
          ? [{ merchant: { description: { contains: v, mode: 'insensitive' as const } } }]
          : []),
        // Branch-level matches — Spec §3.1 (Covelum / Brightlingsea class).
        { name:         { contains: v, mode: 'insensitive' as const } },
        { localityName: { contains: v, mode: 'insensitive' as const } },
        { postTown:     { contains: v, mode: 'insensitive' as const } },
      ])
    }

    if (isMultiToken) {
      // AND of per-token OR-bags.  Each token must match at least one
      // field across the merchant + branch surfaces.  Karaara surfaces
      // for q="Indian cafe" because:
      //   token "Indian" → description match + curated Tag (CUISINE Indian)
      //   token "cafe"   → primaryCategory.name "Cafe & Coffee"
      //
      // §CD v1 — voucher matching joins the AND clause as a top-level
      // OR alternative: surface if (every token matches some field) OR
      // (full normalizedQ matches a voucher.title / voucher.description).
      // Implemented via a nested OR at the where level — see below.
      const tokenAndClauses = tokens.map(t => ({ OR: fieldOrForToken(t) }))
      if (voucherMerchantIds.length > 0) {
        // Two alternatives: all tokens hit OR voucher full-phrase hit.
        where.OR = [
          { AND: tokenAndClauses },
          { merchant: { id: { in: voucherMerchantIds } } },
        ]
      } else {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : []),
          ...tokenAndClauses,
        ]
      }
    } else {
      where.OR = [
        ...fieldOrForToken(normalizedQ),
        // Single-token MerchantSuggestedTag (free-text) match — fetched
        // in parallel with placeMatch + tagMatch above.  Multi-token
        // skips this (each token would need its own DB lookup; the
        // curated Tag.label contains in fieldOrForToken covers the
        // structured-tag case).
        ...(tagMerchantIds.length > 0 ? [{ merchant: { id: { in: tagMerchantIds } } }] : []),
        // §CD v1 — voucher title/description match via pre-fetched
        // merchant ids.  Surfaces merchants whose ACTIVE+APPROVED
        // vouchers carry the query phrase even when no merchant /
        // branch / tag field matches.  Drives the matchContext line
        // on the customer-app card.
        ...(voucherMerchantIds.length > 0
          ? [{ merchant: { id: { in: voucherMerchantIds } } }]
          : []),
        // Plan 4 M4.3 — curated Tag match (exact, case-insensitive) when
        // `tryTagMatch` found a Tag for the whole query.  Joins through
        // both MerchantTag and MerchantHighlight (highlight tags
        // reference the same Tag row via highlightTagId).
        ...(tagMatch
          ? [
              { merchant: { tags:       { some: { tagId: tagMatch.id } } } },
              { merchant: { highlights: { some: { highlightTagId: tagMatch.id } } } },
            ]
          : []),
      ]
    }
  }

  if (categoryId) {
    const children = await prisma.category.findMany({
      where:  { parentId: categoryId },
      select: { id: true },
    })
    const catIds = [categoryId, ...children.map(c => c.id)]
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { merchant: { OR: [
        { primaryCategoryId: { in: catIds } },
        { categories: { some: { categoryId: { in: catIds } } } },
      ]}},
    ]
  }

  if (subcategoryId) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { merchant: { OR: [
        { primaryCategoryId: subcategoryId },
        { categories: { some: { categoryId: subcategoryId } } },
      ]}},
    ]
  }

  if (minSaving) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { merchant: { vouchers: { some: {
        status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED,
        estimatedSaving: { gte: minSaving },
      }}}},
    ]
  }

  if (voucherTypes && voucherTypes.length > 0) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { merchant: { vouchers: { some: {
        status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED,
        type: { in: voucherTypes as any },
      }}}},
    ]
  }

  // Bounding box — branch-direct (not via merchant.branches). Per the redaction
  // contract (PR #81) only MANUALLY_CONFIRMED branches can be filtered by exact
  // coords; approximate branches surface in the non-rankable tail instead and
  // are filtered out of the bbox match by definition.
  if (minLat !== undefined && maxLat !== undefined && minLng !== undefined && maxLng !== undefined) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      {
        locationConfidence: 'MANUALLY_CONFIRMED',
        latitude:  { gte: minLat, lte: maxLat },
        longitude: { gte: minLng, lte: maxLng },
      },
    ]
  }

  // ── 3. Fetch candidate branches (no take / skip — rank-then-paginate).
  //    Lite select for the ranking step; full BRANCH_TILE_SELECT runs in
  //    enrichBranchTiles for the page slice only.
  const candidateBranches = await prisma.branch.findMany({
    where,
    select: {
      id:                 true,
      merchantId:         true,
      name:               true,
      latitude:           true,
      longitude:          true,
      isActive:           true,
      locationConfidence: true,
      localityId:         true,
      postTown:           true,
      ladDistrict:        true,
      adminCounty:        true,
      region:             true,
      locationCountry:    true,
      merchant: {
        select: { id: true, businessName: true },
      },
    },
  })

  // ── 4. Partition by locationConfidence (Spec §4.1.1).
  const rankable    = candidateBranches.filter(b =>
    b.locationConfidence === 'MANUALLY_CONFIRMED'
    || b.locationConfidence === 'ADDRESS_GEOCODED'
  )
  const nonRankable = candidateBranches.filter(b =>
    b.locationConfidence === 'POSTCODE_CENTROID'
    || b.locationConfidence === 'NEEDS_REVIEW'
  )

  // ── 5. Resolve effLoc + ladder profile + outgoing catchment.
  // Plan 4 M4.2 — when `placeMatch` was found above, pass it as
  // `placeLocality`; `resolveEffectiveLocation` will use it as a
  // PLACE_QUERY source (highest priority, overrides GPS).
  const effLoc = await resolveEffectiveLocation(
    prisma,
    placeMatch
      ? { placeLocality: placeMatch }
      : { lat: lat ?? undefined, lng: lng ?? undefined },
    userId,
  )
  const ladderProfile = await resolveLadderProfileForCategory(prisma, categoryId, subcategoryId)
  const outgoingCatchmentTargetIds = effLoc
    ? await getOutgoingCatchmentTargetIds(prisma, effLoc.locality.id)
    : []

  // Intent derivation — when a categoryId is provided, derive via
  // resolveCategoryIntent; otherwise default to MIXED (the safe default per
  // ranking.ts:425 — works for free-text where category cannot be inferred).
  let categoryIntent: CategoryIntent = 'MIXED'
  if (categoryId) {
    const catRow = await prisma.category.findUnique({
      where:  { id: categoryId },
      select: { intentType: true, parent: { select: { intentType: true } } },
    })
    if (catRow) categoryIntent = resolveCategoryIntent(catRow)
  }

  // ── 6. Rank the rankable subset.
  let rankedTiles: RankedBranchTile[] = []
  let rungCounts: Record<keyof typeof EMPTY_RUNG_COUNTS, number> = { ...EMPTY_RUNG_COUNTS }
  if (effLoc && rankable.length > 0) {
    const inputs: RankableBranchInputV3[] = rankable.map(b => ({
      id:                 b.id,
      merchantId:         b.merchantId,
      merchant: {
        id:           b.merchant.id,
        businessName: b.merchant.businessName,
        // Per-merchant rating aggregates aren't used by rankBranchesV3 when
        // categoryIntent is MIXED for the NEARBY rung (distance compare) —
        // and for the rare DESTINATION subcategory path the per-branch
        // rating compute would need a separate groupBy. Phase 1 ships with
        // null/0 here; enrichBranchTiles below populates the per-branch
        // rating that the wire tile carries. The ranking quality-tiebreak
        // is therefore conservative for Phase 1; Phase 2 can revisit.
        avgRating:    null,
        reviewCount:  0,
      },
      latitude:           b.latitude  !== null ? Number(b.latitude)  : null,
      longitude:          b.longitude !== null ? Number(b.longitude) : null,
      isActive:           b.isActive,
      locationConfidence: b.locationConfidence,
      localityId:         b.localityId,
      postTown:           b.postTown,
      ladDistrict:        b.ladDistrict,
      adminCounty:        b.adminCounty,
      region:             b.region,
      locationCountry:    b.locationCountry,
    }))

    const v3 = rankBranchesV3(inputs, {
      effLoc,
      ladderProfile,
      outgoingCatchmentTargetIds,
      categoryIntent,
      targetCount: Math.max(limit, 50),
      // Generous cap — rank-then-paginate guarantees we never need more than
      // (offset + limit) tiles; 500 leaves room for downstream scope cascades
      // without paying SQL pressure (already in-memory at this point).
      hardCap:     500,
    })
    rankedTiles = v3.tiles
    rungCounts  = v3.rungCounts
  }
  // If effLoc is null OR no rankable candidates exist, the ranked half stays
  // empty; the non-rankable tail still surfaces below (Spec §4.1.1).

  // PR #112 fixup-6.3 (2026-05-20) — capture the PRE-scope-filter ranked set
  // so the text-match fallback can distinguish "maxRung-dropped" branches
  // (rank gate excluded them — bucket B) from "scope-dropped" branches
  // (classified into a rung but excluded by user-selected scope — bucket A).
  // Only bucket B surfaces unconditionally; bucket A respects scope.
  // Owner direction: "Direct merchant-name match should not disappear
  // simply because another branch/rung/scope gate ranks differently" —
  // applies to rank gate (bucket B), NOT user-selected scope (bucket A).
  const preScopeRankedIds = new Set(rankedTiles.map(t => t.id))

  // ── 6.5. Discovery Rebaseline Task 2.1.0 — scope cascade parity.
  //
  // Branch-first sibling of `resolveScopeForRanking` (line ~429). User-facing
  // `scope` ('nearby' | 'city' | 'region' | 'platform') drives which rungs
  // survive into the final list. Default (no `scope` param) follows category
  // intent: DESTINATION admits all rungs, LOCAL/MIXED defaults to
  // NEARBY+CITY tiers. Cascade expands to a wider tier when the current
  // retained set has zero supply (mirrors merchant-variant behaviour).
  //
  // Filter applies ONLY to rankedTiles. The POSTCODE_CENTROID / NEEDS_REVIEW
  // tail (built below) carries `supplyRung: null` and is unranked — scope
  // semantics don't apply, so tail tiles always surface regardless of scope.
  // Matches Spec §4.1.1 list-view admission (POSTCODE_CENTROID branches
  // surface in lists regardless of rank).
  const scopeResolution = resolveScopeForBranches(
    scope as RequestedScope,
    categoryIntent,
    rungCounts,
  )
  rankedTiles = rankedTiles.filter(
    t => t.supplyRung !== null && scopeResolution.retainedRungs.has(t.supplyRung),
  )

  // Build a set of ranked branch ids — when effLoc is null, any branch that
  // wasn't ranked (which is all of them) should still surface in the tail.
  // When effLoc IS resolved but the rankBranchesV3 walk hit the hardCap, the
  // unranked rankable branches naturally drop (acceptable for Phase 1; spec
  // doesn't promise a UK-wide cap-busting list).
  const rankedIds = new Set(rankedTiles.map(t => t.id))

  // ── 7. Build the non-rankable tail (POSTCODE_CENTROID + NEEDS_REVIEW).
  //    When effLoc is null, ALL candidates flow through the tail (the ranked
  //    half is empty by construction) — deterministic ordering matters more
  //    than perfect distance ordering here.
  const tailCandidates = effLoc
    ? nonRankable
    : candidateBranches.filter(b => !rankedIds.has(b.id))

  const tailSorted = [...tailCandidates].sort((a, b) => {
    const ma = a.merchant.businessName.localeCompare(b.merchant.businessName)
    if (ma !== 0) return ma
    const nb = (a.name ?? '').localeCompare(b.name ?? '')
    if (nb !== 0) return nb
    return a.id.localeCompare(b.id)
  })

  // ── 7.5. PR-2 device-QA blocker fix (2026-05-19) — direct text-match fallback.
  //
  // When `q` is a non-empty text query AND `effLoc` is resolved, surface
  // rankable branches matching the predicate that `rankBranchesV3`
  // dropped (rung null OR rung > maxRung) as a deterministic fallback
  // tail AFTER the ranked output.  Without this, e.g. searching
  // `restaurant` from a Huddersfield effLoc drops `Covelum Restaurant`
  // entirely — Covelum's branches classify as COUNTRY (East-of-England
  // region) and `rankBranchesV3` discards anything above the ladder
  // maxRung (REGION for MIXED_NORMAL @ URBAN).  The scope cascade
  // can't help: `rungCounts` reflects only rank-admitted branches.
  //
  // PR #112 fixup-6.3 (2026-05-20) — bucket-aware gate.
  // Owner direction: "Direct merchant-name matches must be strong
  // matches.  A direct merchant-name match should not disappear simply
  // because another branch/rung/scope gate ranks differently."
  //
  // The fallback population is split into two buckets:
  //   bucket A — branches classified into a rung by rankBranchesV3 but
  //              filtered out by the user-selected scope cascade.
  //              These RESPECT scope and do NOT surface in the
  //              fallback (preserves Task 2.1.0 scope contract).
  //   bucket B — branches the rank gate dropped entirely (rung null OR
  //              rung > maxRung).  These ALWAYS surface when q is
  //              non-empty + effLoc is resolved (owner direction).
  //
  // `preScopeRankedIds` captures the set of branches that rankBranchesV3
  // admitted (before scope filter).  Bucket B = rankable - preScopeRankedIds.
  //
  // The owner-flagged Covelum disappearance was a bucket-B miss: Covelum's
  // East-of-England branches classified as COUNTRY > maxRung REGION
  // (MIXED_NORMAL @ URBAN default for free-text q), so they got dropped
  // by the rank gate.  Pre-fixup-6.3 the fallback only fired when
  // `rankedTiles.length === 0`; when Pino's NEARBY ranked,
  // rankedTiles=1 and the fallback skipped, hiding Covelum.  Now
  // bucket B always surfaces independently of scope semantics.
  //
  // Order semantics (Spec §4.1.1 preserved):
  //   1. Ranked tiles (rung-aware, scope-filtered) — primary output.
  //   2. Text-match fallback (bucket B — rank-dropped rankable matches;
  //      null rung, computed distance, NEAREST_ON_REDEEMO band per
  //      §7.5 wiring).
  //   3. POSTCODE_CENTROID / NEEDS_REVIEW tail.
  //
  // Browse queries (no q) and non-effLoc paths are UNAFFECTED.
  // Map (`getInAreaBranches`) is a different function and UNAFFECTED.
  // PR #112 fixup-6.6 (2026-05-20) — distance-first sort for the fallback.
  // Owner-flagged: two Covelum branches sorted alphabetically by
  // branch.name → Brightlingsea (173mi) appeared before Colchester
  // (165mi).  Within the fallback bucket, nearer branches must come
  // first.  Branches with null distance (POSTCODE_CENTROID — already
  // routed to the tail, not the fallback, so this shouldn't fire in
  // practice; defensive ordering anyway) sort last.
  // Tiebreakers: merchant.businessName → branch.name → branch.id
  // (deterministic across pagination calls).
  // PR #120 device-QA fix wave 3 (2026-05-21) — extend bucket B rescue to
  // category-only browse. Pre-fix, the fallback only fired for free-text
  // queries (normalizedQ !== null). Owner-reported symptom: Food & Drink →
  // More places returned 5 branches (Karaara/Pinos/Coffee House/Bean &
  // Brew/Market Quarter) but DB has 7 active Food merchants — Covelum
  // (Brightlingsea + Colchester, 2 branches) and My Kerala (Ipswich) were
  // permanently rank-dropped (COUNTRY rung > MIXED_NORMAL @ URBAN maxRung
  // REGION). Without the rescue, category-only browse on platform scope
  // misses far category supply that DOES belong on the More places list.
  //
  // The `showWiderSupply` gate (below at ~line 3011) controls whether
  // bucket B appears in the LIST — only when resolvedScope === 'platform'
  // OR rankedTiles is empty (cascade rescue). So extending this gate to
  // category-only browse only affects platform-scope output + counts;
  // nearby/city scope output is unchanged.
  const textMatchFallback = (
    effLoc
    && (normalizedQ !== null || categoryId !== undefined)
  )
    ? [...rankable]
        .filter(b => !preScopeRankedIds.has(b.id))   // bucket B only — rank-dropped
        .sort((a, b) => {
          const da = fallbackDistanceFor(a) ?? Number.POSITIVE_INFINITY
          const db = fallbackDistanceFor(b) ?? Number.POSITIVE_INFINITY
          if (da !== db) return da - db
          const ma = a.merchant.businessName.localeCompare(b.merchant.businessName)
          if (ma !== 0) return ma
          const nb = (a.name ?? '').localeCompare(b.name ?? '')
          if (nb !== 0) return nb
          return a.id.localeCompare(b.id)
        })
    : []

  // Per-branch distance for the fallback tail.  Computed when the branch
  // has exact coordinates (MANUALLY_CONFIRMED gate per PR #81 redaction).
  // Mirrors the haversine the existing rank path applies; the result is
  // metres from the caller's effLoc.
  //
  // Owner device-QA bug (PR #112, 2026-05-19): the original §7.5 path set
  // `distance: null` on every fallback tile, leaving the customer-app
  // unable to render distance or a meaningful proximity chip for direct
  // text-match results.  Computing distance per-branch (when coords +
  // effLoc are available) plus emitting `proximityBand:
  // 'NEAREST_ON_REDEEMO'` on the wire gives the customer-app a clean
  // chip + distance line.
  function fallbackDistanceFor(b: typeof rankable[number]): number | null {
    if (!effLoc) return null
    if (b.locationConfidence !== 'MANUALLY_CONFIRMED') return null
    if (b.latitude === null || b.longitude === null) return null
    return haversineMetres(effLoc.lat, effLoc.lng, Number(b.latitude), Number(b.longitude))
  }

  // ── 8. Concatenate ranked ++ text-match fallback ++ non-rankable tail.
  //    Pagination unit is the branch tile.
  //
  //    PR #112 fixup-6.5 (2026-05-20) — scope-aware list assembly.
  //    Owner-flagged blocker: scope=`Nearby · 1` was active but the
  //    visible list contained 4 items (Pino's NEARBY + 3 Covelum/Kerala
  //    rank-dropped fallback rows).  Narrow scope must show ONLY the
  //    scope-filtered tiles; the cumulative count (`More places · 5`)
  //    tells the user there's more wider supply.
  //
  //    `showWiderSupply` controls whether the text-match fallback +
  //    POSTCODE_CENTROID tail surface in the LIST.  Both still count
  //    toward `distantCount` (cumulative meta) so the pill row stays
  //    accurate; they're hidden until the user broadens scope OR the
  //    scope-filtered ranked set is empty (cascade rescue path).
  //
  //    Order rationale (when wider supply IS shown):
  //      1. Ranked tiles first (best user-visible ordering — rung+distance+quality).
  //      2. Text-match fallback (rank-dropped rankable matches; null rung/distance
  //         per Spec §4.1.1 list-view admission semantics).
  //      3. POSTCODE_CENTROID / NEEDS_REVIEW tail (also null rung/distance per §4.1.1).
  //
  //    These three sets are disjoint (textMatchFallback ⊆ rankable; tail = nonRankable;
  //    `rankable ∩ nonRankable = ∅` by the locationConfidence partition above).
  const showWiderSupply =
    scopeResolution.resolvedScope === 'platform'
    || rankedTiles.length === 0
  const allInputs: EnrichBranchInput[] = [
    ...rankedTiles.map(t => ({
      branchId:      t.id,
      merchantId:    t.merchantId,
      supplyRung:    t.supplyRung,
      proximityBand: t.proximityBand,
      distance:      t.distanceMetres,
    } satisfies EnrichBranchInput)),
    ...(showWiderSupply
      ? textMatchFallback.map(b => ({
          branchId:      b.id,
          merchantId:    b.merchantId,
          // supplyRung stays null because classifyRung either returned null
          // OR returned a rung above maxRung — the rung is genuinely unknown
          // for ranking purposes.  proximityBand is set explicitly to
          // NEAREST_ON_REDEEMO so the customer-app renders the correct chip
          // for direct text-match hits.
          supplyRung:    null,
          proximityBand: 'NEAREST_ON_REDEEMO' as ProximityBand,
          distance:      fallbackDistanceFor(b),
        } satisfies EnrichBranchInput))
      : []),
    ...(showWiderSupply
      ? tailSorted.map(b => ({
          branchId:      b.id,
          merchantId:    b.merchantId,
          supplyRung:    null,
          proximityBand: null,
          distance:      null,
        } satisfies EnrichBranchInput))
      : []),
  ]

  const totalBranches = allInputs.length
  const pageInputs    = allInputs.slice(offset, offset + limit)

  // ── 9. Enrich the page slice.
  //
  // §CD v1 — voucher matchContext context is passed ONLY by
  // `searchBranches` (this call site).  When `normalizedQ` is non-empty
  // AND the search didn't short-circuit via place-match (which skips
  // the text fuzzy entirely), enrichBranchTile computes the per-tile
  // "Found in '<voucher>' voucher" line.  Place-matched search skips
  // matchContext because the place IS the area framing, not voucher-
  // keyword framing.
  const branches = await enrichBranchTiles(prisma, pageInputs, {
    userId: userId ?? null,
    lat:    lat   ?? null,
    lng:    lng   ?? null,
    matchContextQuery: !placeMatch && normalizedQ ? normalizedQ : null,
    matchContextIncludeDescription: includeDescriptionMatchForVoucher,
  })

  // ── 10. Meta envelope — Phase 1 + Task 2.1.0 + PR-2 device-QA fix.
  //
  // Derives legacy-shape NEARBY/CITY/DISTANT tier counts from
  // `rungCounts` via the tier↔rung mapping locked by Task 2.1.0
  // (matches `mapRungToLegacyTier` at ladderProfiles.ts:110):
  //   NEARBY tier  = NEARBY rung
  //   CITY tier    = CATCHMENT + POST_TOWN rungs
  //   DISTANT tier = LAD + COUNTY + REGION + COUNTRY + NATIONAL rungs
  //                  + textMatch-fallback count (null rung; the
  //                    rank-dropped direct matches that surface
  //                    because of the §7.5 text-match safety net)
  //                  + non-rankable tail count (POSTCODE_CENTROID /
  //                    NEEDS_REVIEW per Spec §4.1.1 list admission)
  //
  // Both null-rung sources count toward DISTANT because they're
  // structurally "UK-wide" — no locality match to the caller's
  // effLoc, just a direct text/admission surface.  Mirrors legacy
  // `searchMerchants` semantics where every active merchant lands
  // in NEARBY / CITY / DISTANT with no maxRung gate.
  const nearbyCount  = rungCounts.NEARBY
  const cityCount    = rungCounts.CATCHMENT + rungCounts.POST_TOWN
  const distantCount =
    rungCounts.LAD + rungCounts.COUNTY + rungCounts.REGION
    + rungCounts.COUNTRY + rungCounts.NATIONAL
    + textMatchFallback.length
    + tailSorted.length

  // emptyStateReason — mirrors `buildEmptyStateReason` (service.ts:477).
  //   'no_uk_supply'      : no candidates at all in UK
  //   'expanded_to_wider' : scope cascade widened to find supply
  //   'none'              : results found at requested scope
  const totalSupply = nearbyCount + cityCount + distantCount
  const emptyStateReason: 'none' | 'expanded_to_wider' | 'no_uk_supply' =
    totalSupply === 0       ? 'no_uk_supply'      :
    totalBranches === 0     ? 'no_uk_supply'      :
    scopeResolution.scopeExpanded ? 'expanded_to_wider' :
    'none'

  // resolvedArea — mirrors `buildResolvedArea` (service.ts:488).
  const profileCity = (await prisma.user.findUnique({
    where: { id: userId ?? '' },
    select: { city: true },
  }))?.city ?? null
  const resolvedArea =
    scopeResolution.resolvedScope === 'nearby' ? 'Nearby' :
    scopeResolution.resolvedScope === 'city'   ? (profileCity ?? 'Your city') :
    'United Kingdom'

  return {
    branches,
    totalBranches,
    meta: {
      rungCounts,
      effectiveLocality: effLoc
        ? { id: effLoc.locality.id, name: effLoc.locality.name }
        : null,
      scope:            scopeResolution.resolvedScope,
      scopeExpanded:    scopeResolution.scopeExpanded,
      nearbyCount,
      cityCount,
      distantCount,
      emptyStateReason,
      resolvedArea,
      // Plan 4 M4.2 + M4.3 — additive search-mode indicator.
      //
      // Priority: PLACE wins over TAG (place-matched queries skip the
      // text-OR build entirely; tag-matched queries add a branch to the
      // text-OR).  Minimal wire shape per §M4-AMENDMENT-2026-05-22 A6
      // (no Locality id / populationTier / Tag type).
      searchChip:
        placeMatch ? { mode: 'PLACE' as const, label: placeMatch.name } :
        tagMatch   ? { mode: 'TAG'   as const, label: tagMatch.label } :
        null,
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

// ─── Category Branches ───────────────────────────────────────────────────────
//
// Discovery Rebaseline Phase 1 Task 1.8.
// Spec docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md §1.5.
//
// Branch-first analogue of `getCategoryMerchants`. Returns one `BranchTile` per
// matching branch — multi-branch merchants in the category surface as multiple
// tiles (closes the same merchant-collapse bug class as searchBranches in a
// category-id-driven request).
//
// Implementation note: this is intentionally a thin delegate over
// `searchBranches`. The category predicate (parent + subcategory union via
// MerchantCategory.OR primaryCategoryId) is already implemented inside
// searchBranches under the `if (categoryId)` branch (service.ts ≈2460). Empty
// query + a categoryId satisfies the SEARCH_QUERY_REQUIRED bounded-predicate
// guard, so no special-casing is required. Phase 3 drops `getCategoryMerchants`
// per the §AT cleanup note.
export async function getCategoryBranches(
  prisma: PrismaClient,
  params: {
    categoryId: string
    limit: number
    offset: number
    userId: string | null
    lat?: number | null
    lng?: number | null
    // PR #120 device-QA fix (2026-05-21) — accept scope and thread to
    // searchBranches. Without this the branch list ignores the user's
    // scope-pill selection while the route's merchant-side meta reports
    // scope-aware counts: the two surfaces drift in unit (merchants vs
    // branches) AND in scope. Owner-reported symptoms: `Nearby · 0` pill
    // still rendering nearby branches; pill counts not matching the list.
    scope?: 'nearby' | 'city' | 'region' | 'platform'
  },
): ReturnType<typeof searchBranches> {
  return searchBranches(prisma, {
    q:          undefined,
    categoryId: params.categoryId,
    lat:        params.lat ?? undefined,
    lng:        params.lng ?? undefined,
    limit:      params.limit,
    offset:     params.offset,
    userId:     params.userId,
    ...(params.scope ? { scope: params.scope } : {}),
  })
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

// ─── In-area (Map, branch-first variant) ─────────────────────────────────────
//
// Discovery Rebaseline Phase 1 Task 1.6.
// Spec docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md §4.1.1.
//
// Branch-first analogue of `getInAreaMerchants` above. Emits one `BranchTile`
// per branch inside the bbox rather than one tile per merchant. Coexists with
// the merchant variant during Phase 1 + Phase 2; Phase 3 drops the merchant
// version per the §AT cleanup note.
//
// **Critical list-vs-map asymmetry (Spec §4.1.1):**
//   Map endpoint accepts MANUALLY_CONFIRMED branches ONLY. Unlike
//   `searchBranches` (which unions MANUALLY_CONFIRMED + ADDRESS_GEOCODED in
//   the rankable half and surfaces POSTCODE_CENTROID + NEEDS_REVIEW as a
//   non-rankable tail), Map pins require exact coordinates by definition.
//   Pinning at a non-exact coord would silently relax PR #81's redaction
//   contract (`exposeBranchPosition` nulls lat/lng for non-exact branches,
//   so non-exact tiles would emit null coords and render as zero pins
//   anyway — but excluding them server-side keeps the contract explicit
//   and `totalBranches` honest).
//
// Pipeline:
//   1. Predicate: isActive=true + merchant ACTIVE + MANUALLY_CONFIRMED only +
//      bbox bounds on the branch row itself.
//   2. Fetch candidates (lite select for ranking).
//   3. Derive viewport-centred effLoc from the bbox centre (mirrors
//      getInAreaMerchants:2856-2860). A user panning the map sees the
//      panned area's rungs/bands, NOT their saved area's.
//   4. Rank via rankBranchesV3 with ladderProfile='MIXED_NORMAL' and
//      categoryIntent='MIXED' (safe defaults for Map; spec §5.7).
//   5. Enrich the ranked tiles. The caller's lat/lng (NOT viewport centre)
//      drives the per-tile distance display, so a user looking at a panned
//      map still sees "X km from you" — not "X km from viewport centre".
//
// No pagination — Map shows all pins in the viewport up to `limit` (mirrors
// the merchant variant's contract).
export async function getInAreaBranches(
  prisma: PrismaClient,
  params: {
    bbox: Bbox
    categoryId?: string
    lat?: number | null
    lng?: number | null
    userId: string | null
    limit: number
  },
): Promise<{
  branches: BranchTile[]
  meta: {
    effectiveLocality: { id: string; name: string } | null
    rungCounts: Record<keyof typeof EMPTY_RUNG_COUNTS, number>
  }
}> {
  const { bbox, categoryId, lat, lng, userId, limit } = params

  // ── 1. Branch-level predicate — MANUALLY_CONFIRMED ONLY (PR #81 redaction
  //    contract + Spec §4.1.1 list-vs-map asymmetry).
  const where: Prisma.BranchWhereInput = {
    isActive: true,
    merchant: {
      status: MerchantStatus.ACTIVE,
      ...(categoryId
        ? { OR: [
            { primaryCategoryId: categoryId },
            { categories: { some: { categoryId } } },
          ] }
        : {}),
    },
    locationConfidence: 'MANUALLY_CONFIRMED',
    latitude:  { gte: bbox.minLat, lte: bbox.maxLat, not: null },
    longitude: { gte: bbox.minLng, lte: bbox.maxLng, not: null },
  }

  // ── 2. Fetch candidate branches (lite select for ranking; full enrichment
  //    runs on the page slice via enrichBranchTiles).
  const candidateBranches = await prisma.branch.findMany({
    where,
    select: {
      id:                 true,
      merchantId:         true,
      name:               true,
      latitude:           true,
      longitude:          true,
      isActive:           true,
      locationConfidence: true,
      localityId:         true,
      postTown:           true,
      ladDistrict:        true,
      adminCounty:        true,
      region:             true,
      locationCountry:    true,
      merchant: {
        select: { id: true, businessName: true },
      },
    },
    take: limit,
  })

  // ── 3. Resolve viewport-centred effLoc (mirrors getInAreaMerchants:2856-2860).
  //    A user panning the map to a different area sees that area's
  //    rungs/bands, NOT their saved area's.
  const viewportCenterLat = (bbox.minLat + bbox.maxLat) / 2
  const viewportCenterLng = (bbox.minLng + bbox.maxLng) / 2
  const viewportEffLoc = await resolveEffectiveLocation(
    prisma,
    { lat: viewportCenterLat, lng: viewportCenterLng },
    null,
  )

  // ── 4. Rank the candidates via rankBranchesV3.
  //    All candidates are MANUALLY_CONFIRMED by predicate, so there is no
  //    non-rankable tail (unlike searchBranches). categoryIntent defaults to
  //    MIXED (safe per ranking.ts when no category is provided);
  //    ladderProfile is 'MIXED_NORMAL' for Map per spec §5.7.
  let rankedTiles: RankedBranchTile[] = []
  let rungCounts: Record<keyof typeof EMPTY_RUNG_COUNTS, number> = { ...EMPTY_RUNG_COUNTS }
  if (viewportEffLoc && candidateBranches.length > 0) {
    let categoryIntent: CategoryIntent = 'MIXED'
    if (categoryId) {
      const catRow = await prisma.category.findUnique({
        where:  { id: categoryId },
        select: { intentType: true, parent: { select: { intentType: true } } },
      })
      if (catRow) categoryIntent = resolveCategoryIntent(catRow)
    }

    const outgoingCatchmentTargetIds = await getOutgoingCatchmentTargetIds(
      prisma, viewportEffLoc.locality.id,
    )

    const inputs: RankableBranchInputV3[] = candidateBranches.map(b => ({
      id:                 b.id,
      merchantId:         b.merchantId,
      merchant: {
        id:           b.merchant.id,
        businessName: b.merchant.businessName,
        // Per-branch ratings populated downstream in enrichBranchTiles.
        // ranking step uses null/0 conservatively (Phase 1 parity with
        // searchBranches; Phase 2 can revisit).
        avgRating:    null,
        reviewCount:  0,
      },
      latitude:           b.latitude  !== null ? Number(b.latitude)  : null,
      longitude:          b.longitude !== null ? Number(b.longitude) : null,
      isActive:           b.isActive,
      locationConfidence: b.locationConfidence,
      localityId:         b.localityId,
      postTown:           b.postTown,
      ladDistrict:        b.ladDistrict,
      adminCounty:        b.adminCounty,
      region:             b.region,
      locationCountry:    b.locationCountry,
    }))

    const v3 = rankBranchesV3(inputs, {
      effLoc: viewportEffLoc,
      ladderProfile: 'MIXED_NORMAL',
      outgoingCatchmentTargetIds,
      categoryIntent,
      targetCount: limit,
      hardCap:     limit,
    })
    rankedTiles = v3.tiles
    rungCounts  = v3.rungCounts
  }

  // ── 5. Enrich the ranked tiles. The caller's lat/lng (NOT viewport centre)
  //    drives the per-tile distance display — a user looking at a panned map
  //    still sees "X km from you", not "X km from viewport centre".
  const branches = await enrichBranchTiles(
    prisma,
    rankedTiles.map(t => ({
      branchId:      t.id,
      merchantId:    t.merchantId,
      supplyRung:    t.supplyRung,
      proximityBand: t.proximityBand,
      distance:      t.distanceMetres,
    } satisfies EnrichBranchInput)),
    {
      userId: userId ?? null,
      lat:    lat   ?? null,
      lng:    lng   ?? null,
    },
  )

  return {
    branches,
    meta: {
      effectiveLocality: viewportEffLoc
        ? { id: viewportEffLoc.locality.id, name: viewportEffLoc.locality.name }
        : null,
      rungCounts,
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
): Promise<{ merchants: any[]; total: number }> {
  // Discovery Rebaseline Phase 1 review-fix (PR #110): the return shape is
  // now `{ merchants, total }` where `total` is the TRUE matching count
  // BEFORE pagination — separate from `merchants.length` which is the
  // page-slice count.  Earlier on this PR the route derived `total` from
  // `merchants.length`, which lied to consumers about pagination math.
  // Fix surfaces the real count via a paired `count()` query under the
  // same predicate as the `findMany`.
  const now = new Date()
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, status: true, startDate: true, endDate: true },
  })

  if (!campaign || campaign.status !== CampaignStatus.ACTIVE || campaign.startDate > now || campaign.endDate < now) {
    throw new AppError('CAMPAIGN_NOT_FOUND')
  }

  // Shared predicate — total + page slice use the SAME where clause so
  // `total` reflects pre-pagination matching rows, not page size.
  const where: Prisma.CampaignMerchantWhereInput = {
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
  }

  const [total, rows] = await Promise.all([
    prisma.campaignMerchant.count({ where }),
    prisma.campaignMerchant.findMany({
      where,
      select: { merchant: { select: MERCHANT_TILE_SELECT as any } },
      orderBy: { merchant: { businessName: 'asc' } },
      take:   params.limit,
      skip:   params.offset,
    }),
  ])

  const rawMerchants = rows.map((r: any) => r.merchant)
  const merchants = await enrichMerchantTiles(prisma, rawMerchants, {
    lat: params.lat ?? null,
    lng: params.lng ?? null,
    userId: params.userId ?? null,
  })
  return { merchants, total }
}

/**
 * Discovery Rebaseline Phase 1 Task 1.9 — branch-first variant of
 * `getCampaignMerchants`.
 *
 * Spec §8.1: Campaigns (`Campaign → CampaignMerchant → Merchant`) follow the
 * same branch-scoped principle as Featured/Trending in §5.2. For each
 * `CampaignMerchant`, we fan out to all of the merchant's ACTIVE branches and
 * emit one `BranchTile` per branch.
 *
 * Interim behaviour pre-`CampaignMerchant.branchId?` schema migration: every
 * campaign merchant fans out to ALL its active branches (identical to the
 * Featured fan-out pattern in `getHomeFeed`, Task 1.7). A future Phase will
 * let admins target specific branches per campaign.
 *
 * Status / date-window semantics: returns `{ branches: [], total: 0 }` when the
 * campaign is missing, not ACTIVE, or outside its date window. This diverges
 * intentionally from `getCampaignMerchants` (which throws `CAMPAIGN_NOT_FOUND`)
 * — branch-first endpoints in Phase 1 prefer empty-list returns so the
 * consumer surface can degrade gracefully (mirrors `searchBranches` /
 * `getCategoryBranches` for empty result sets).
 *
 * No ranking pass — campaigns are curatorial. Each input row passes
 * `supplyRung: null, proximityBand: null`. Distance is computed via
 * `haversineMetres` ONLY when the user has GPS AND the branch is
 * MANUALLY_CONFIRMED (matches the Home fan-out distance gate at
 * service.ts:1239-1243 + the `hasExactPosition` redaction contract).
 *
 * Coexists with `getCampaignMerchants` through Phase 1+2; Phase 3 drops the
 * merchant-themed variant.
 */
export async function getCampaignBranches(
  prisma: PrismaClient,
  campaignId: string,
  params: {
    categoryId?: string
    lat?: number | null
    lng?: number | null
    userId: string | null
    limit?: number
    offset?: number
  },
): Promise<{ branches: BranchTile[]; total: number }> {
  const now = new Date()
  const campaign = await prisma.campaign.findUnique({
    where:  { id: campaignId },
    select: { id: true, status: true, startDate: true, endDate: true },
  })
  if (!campaign) return { branches: [], total: 0 }
  if (
    campaign.status !== CampaignStatus.ACTIVE ||
    campaign.startDate > now ||
    campaign.endDate < now
  ) {
    return { branches: [], total: 0 }
  }

  // Walk CampaignMerchant rows scoped to active campaign-merchant links
  // (`isActive: true` + own date window) plus an active-merchant guard.
  // Mirrors getCampaignMerchants' merchant scoping at service.ts:3340-3354,
  // including the categoryId OR-expansion across primary + linked categories.
  const cmRows = await prisma.campaignMerchant.findMany({
    where: {
      campaignId,
      isActive:  true,
      startDate: { lte: now },
      endDate:   { gte: now },
      merchant:  {
        status: MerchantStatus.ACTIVE,
        ...(params.categoryId ? {
          OR: [
            { primaryCategoryId: params.categoryId },
            { categories: { some: { categoryId: params.categoryId } } },
          ],
        } : {}),
      },
    },
    select: {
      merchant: {
        select: {
          id:       true,
          branches: {
            where: { isActive: true },
            select: {
              id:                 true,
              latitude:           true,
              longitude:          true,
              locationConfidence: true,
            },
          },
        },
      },
    },
    orderBy: { merchant: { businessName: 'asc' } },
  })

  // Fan out to EnrichBranchInput rows — one per active branch, per merchant
  // in the campaign. supplyRung/proximityBand null because campaigns skip the
  // V3 ranker (curatorial inclusion).
  const lat = params.lat ?? null
  const lng = params.lng ?? null
  const inputs: EnrichBranchInput[] = []
  for (const row of cmRows) {
    const merchant = row.merchant
    if (!merchant) continue
    for (const b of merchant.branches) {
      const hasUserGps = lat !== null && lng !== null
      const hasExact   = hasExactPosition(b)
      const distance   = hasUserGps && hasExact
        ? haversineMetres(lat, lng, Number(b.latitude), Number(b.longitude))
        : null
      inputs.push({
        branchId:      b.id,
        merchantId:    merchant.id,
        supplyRung:    null,
        proximityBand: null,
        distance,
      })
    }
  }

  const total = inputs.length

  // Pagination — apply only when limit is supplied. Mirrors getHomeFeed's
  // post-rank slicing pattern; the same fan-out tile cannot be sliced
  // mid-merchant because each row is already 1-tile-per-branch.
  const page = params.limit !== undefined
    ? inputs.slice(params.offset ?? 0, (params.offset ?? 0) + params.limit)
    : inputs

  const branches = await enrichBranchTiles(prisma, page, {
    userId: params.userId,
    lat,
    lng,
  })

  return { branches, total }
}
