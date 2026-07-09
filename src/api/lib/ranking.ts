import { haversineMetres } from '../shared/haversine'
import { isBranchLocationConfirmed } from '../shared/location'
import type { PrismaClient } from '../../../generated/prisma/client'

// ─── Constants ───────────────────────────────────────────────────────────────

export const NEARBY_RADIUS_MILES = 2
const NEARBY_RADIUS_METRES = NEARBY_RADIUS_MILES * 1609.34

export const MIN_REVIEW_COUNT_FOR_RATING_SORT = 3

// ─── Types ───────────────────────────────────────────────────────────────────

export type SupplyTier = 'NEARBY' | 'CITY' | 'DISTANT'

export type ClassifyTierContext = {
  userLat: number | null
  userLng: number | null
  profileCity: string | null
}

export type MerchantForTier = {
  branches: Array<{
    isActive: boolean
    city: string
    latitude: number | null
    longitude: number | null
  }>
}

export type CategoryIntentType = 'LOCAL' | 'DESTINATION' | 'MIXED'

export type RankMerchantsContext = ClassifyTierContext & {
  intentType: CategoryIntentType
}

export type MerchantForRanking = MerchantForTier & {
  id: string
  businessName: string
  avgRating: number | null
  reviewCount: number
}

type RankedMerchant<T> = T & {
  supplyTier: SupplyTier
  distanceMetres: number | null
}

export type RankMerchantsResult<T> = {
  ordered: Array<RankedMerchant<T>>
  counts: { nearbyCount: number; cityCount: number; distantCount: number }
}

// ─── Primitives + helpers ────────────────────────────────────────────────────

/**
 * Classifies a merchant into a supply tier relative to user location context.
 * NEARBY: any active branch within NEARBY_RADIUS_MILES of user coords
 * CITY:   any active branch's city matches profileCity (case-insensitive)
 * DISTANT: otherwise
 *
 * When no location data at all (no coords, no profileCity), every merchant → DISTANT.
 * "Equally distant from a system that has no location signal."
 *
 * @deprecated Plan 4 M3a hybrid uses `classifyRung` + `rankMerchantsV2` for
 * the new contract fields. `classifyTier` is still the inclusion/order source
 * during the hybrid phase (preserves POSTCODE_CENTROID merchant visibility —
 * see deferred-followups §AV). Plan 4 M5 audit-then-removes once policy is locked.
 */
export function classifyTier(merchant: MerchantForTier, ctx: ClassifyTierContext): SupplyTier {
  const activeBranches = merchant.branches.filter(b => b.isActive)

  // NEARBY check: requires user coords + branch coords
  if (ctx.userLat !== null && ctx.userLng !== null) {
    for (const b of activeBranches) {
      if (b.latitude === null || b.longitude === null) continue
      const d = haversineMetres(ctx.userLat, ctx.userLng, Number(b.latitude), Number(b.longitude))
      if (d <= NEARBY_RADIUS_METRES) return 'NEARBY'
    }
  }

  // CITY check: case-insensitive match on profileCity
  if (ctx.profileCity) {
    const target = ctx.profileCity.toLowerCase()
    for (const b of activeBranches) {
      if (b.city.toLowerCase() === target) return 'CITY'
    }
  }

  return 'DISTANT'
}

function nearestDistanceMetres(merchant: MerchantForTier, ctx: ClassifyTierContext): number | null {
  if (ctx.userLat === null || ctx.userLng === null) return null
  let min: number | null = null
  for (const b of merchant.branches.filter(b => b.isActive)) {
    if (b.latitude === null || b.longitude === null) continue
    const d = haversineMetres(ctx.userLat, ctx.userLng, Number(b.latitude), Number(b.longitude))
    if (min === null || d < min) min = d
  }
  return min
}

// At launch, most merchants have <3 reviews. Rated merchants come first
// (sorted by avgRating DESC), unrated alphabetical after. As reviews
// accumulate, the rated tier expands; alphabetical recedes naturally.
function qualityComparator(
  a: { avgRating: number | null; reviewCount: number; businessName: string },
  b: { avgRating: number | null; reviewCount: number; businessName: string },
): number {
  const aRated = (a.reviewCount ?? 0) >= MIN_REVIEW_COUNT_FOR_RATING_SORT
  const bRated = (b.reviewCount ?? 0) >= MIN_REVIEW_COUNT_FOR_RATING_SORT
  if (aRated && bRated) return (b.avgRating ?? 0) - (a.avgRating ?? 0)
  if (aRated) return -1
  if (bRated) return 1
  return a.businessName.localeCompare(b.businessName)
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Ranks merchants by intent-aware tier ladder.
 *
 *   LOCAL:       NEARBY (distance ASC) → CITY (alphabetical) → DISTANT (alphabetical)
 *   DESTINATION: NEARBY (distance ASC) → CITY+DISTANT merged (quality-aware comparator)
 *   MIXED:       NEARBY (distance ASC) → CITY (alphabetical) → DISTANT (quality-aware comparator)
 *
 * MIXED differs from LOCAL ONLY in the DISTANT tier sort. See Task 5.
 *
 * Returns ordered merchants tagged with supplyTier and distanceMetres,
 * plus tier counts (always reflect the input set, regardless of any later filtering).
 *
 * @deprecated Plan 4 M3a hybrid: this function is still the
 * inclusion/order source for Discovery responses so POSTCODE_CENTROID
 * merchants don't disappear from search/category/map results. The new
 * `rankMerchantsV2` runs alongside and contributes the additive M3
 * fields (supplyRung / proximityBand / rungCounts / effectiveLocality)
 * for merchants whose branches pass `classifyRung`'s discoverability
 * gate. Plan 4 M5 audit-then-removes once the discoverability policy
 * is locked — see deferred-followups §AV.
 */
export function rankMerchants<T extends MerchantForRanking>(
  merchants: T[],
  ctx: RankMerchantsContext,
): RankMerchantsResult<T> {
  const tagged: RankedMerchant<T>[] = merchants.map(m => ({
    ...m,
    supplyTier:     classifyTier(m, ctx),
    distanceMetres: nearestDistanceMetres(m, ctx),
  }))

  const counts = {
    nearbyCount:  tagged.filter(t => t.supplyTier === 'NEARBY').length,
    cityCount:    tagged.filter(t => t.supplyTier === 'CITY').length,
    distantCount: tagged.filter(t => t.supplyTier === 'DISTANT').length,
  }

  const nearby  = tagged.filter(t => t.supplyTier === 'NEARBY')
                        .sort((a, b) => (a.distanceMetres ?? Infinity) - (b.distanceMetres ?? Infinity))
  const city    = tagged.filter(t => t.supplyTier === 'CITY')
  const distant = tagged.filter(t => t.supplyTier === 'DISTANT')

  let ordered: RankedMerchant<T>[]
  switch (ctx.intentType) {
    case 'LOCAL':
      ordered = [
        ...nearby,
        ...city.sort((a, b) => a.businessName.localeCompare(b.businessName)),
        ...distant.sort((a, b) => a.businessName.localeCompare(b.businessName)),
      ]
      break
    case 'DESTINATION':
      ordered = [
        ...nearby,
        ...[...city, ...distant].sort(qualityComparator),
      ]
      break
    case 'MIXED':
      // MIXED differs from LOCAL ONLY in the DISTANT tier sort.
      // NEARBY + CITY behave identically to LOCAL.
      ordered = [
        ...nearby,
        ...city.sort((a, b) => a.businessName.localeCompare(b.businessName)),
        ...distant.sort(qualityComparator),
      ]
      break
  }

  return { ordered, counts }
}

// ─── Independent utilities ───────────────────────────────────────────────────

/**
 * Resolves the effective intentType for a category, with parent inheritance.
 * Returns the category's own intentType if set; otherwise inherits parent's;
 * otherwise falls back to 'LOCAL' (proximity-first is the safe default when
 * classification is missing).
 */
export function resolveCategoryIntent(category: {
  intentType: CategoryIntentType | null
  parent: { intentType: CategoryIntentType | null } | null
}): CategoryIntentType {
  return category.intentType ?? category.parent?.intentType ?? 'LOCAL'
}

/**
 * Computes per-merchant rating aggregates from a single review.groupBy across
 * all branchIds in the input set. Pure-ish — hits the DB once.
 *
 * Used by `searchMerchants` and `getCategoryMerchants` to feed avgRating +
 * reviewCount into `rankMerchants` BEFORE enrichment. enrichMerchantTiles also
 * computes ratings (via its own groupBy on the page slice) for tile display —
 * the duplicate fetch on the smaller paginated set is acceptable in Plan 1.5.
 */
export async function computeRatingsByMerchant(
  prisma: PrismaClient,
  merchants: Array<{ id: string; branches: Array<{ id: string }> }>,
): Promise<Map<string, { avgRating: number | null; reviewCount: number }>> {
  const branchIds = merchants.flatMap(m => m.branches.map(b => b.id))
  const result = new Map<string, { avgRating: number | null; reviewCount: number }>()

  if (branchIds.length === 0) {
    for (const m of merchants) result.set(m.id, { avgRating: null, reviewCount: 0 })
    return result
  }

  const groups = await prisma.review.groupBy({
    by: ['branchId'],
    where: { branchId: { in: branchIds }, isHidden: false },
    _avg: { rating: true },
    _count: { id: true },
  })
  const byBranch = Object.fromEntries(
    groups.map((g: any) => [g.branchId, { avg: g._avg.rating ?? 0, count: g._count.id }])
  )

  for (const m of merchants) {
    let totalRating = 0
    let totalCount = 0
    for (const b of m.branches) {
      const r = byBranch[b.id]
      if (r) { totalRating += r.avg * r.count; totalCount += r.count }
    }
    result.set(m.id, {
      avgRating:   totalCount > 0 ? Math.round((totalRating / totalCount) * 10) / 10 : null,
      reviewCount: totalCount,
    })
  }

  return result
}

// ─── Plan 4 M2 — parallel new ranking primitives ─────────────────────────────
//
// Everything BELOW this line is the M2 ranking refactor. Everything ABOVE
// is the Plan 1.5 legacy path (classifyTier / rankMerchants) and stays
// intact until M3 swaps Discovery's callers over, and M5 audits-then-deletes.
//
// See:
//   docs/superpowers/specs/2026-05-13-plan-4-location-model-uk-enrichment-design.md §5
//   docs/superpowers/plans/2026-05-13-plan-4-location-model-uk-enrichment.md  Task M2.5

import type { SupplyRung } from './ladderProfiles'
import type { EffectiveLocation } from './effectiveLocation'

// M5 cleanup: align with the legacy path's `NEARBY_RADIUS_MILES * 1609.34`
// constant once the legacy `classifyTier` / `rankMerchants` block above is
// audit-deleted. The current values agree to <1m at NEARBY distances but
// the duplication is a code smell while both paths co-exist.
// See deferred-followups §AT (PR #84 review carry-overs).
const MILES_TO_METRES = 1609.344

// M5 cleanup: `BranchForClassification` (this type) and `RankableBranch`
// (defined below) differ only by `RankableBranch` adding `id: string`.
// Once the legacy ranking path is removed in M5, unify these into a
// single type — e.g. `RankableBranch = BranchForClassification & { id: string }`.
// See deferred-followups §AT (PR #84 review carry-overs).
type BranchForClassification = {
  latitude: number | null
  longitude: number | null
  isActive: boolean
  locationConfidence: 'MANUALLY_CONFIRMED' | 'ADDRESS_GEOCODED' | 'MERCHANT_CONFIRMED' | 'POSTCODE_CENTROID' | 'NEEDS_REVIEW'
  localityId: string | null
  postTown: string | null
  ladDistrict: string | null
  adminCounty: string | null
  region: string | null
  /**
   * Plan 4 nation snapshot ("England" | "Scotland" | "Wales" |
   * "Northern Ireland"). Distinct from the legacy `Branch.country`
   * (ISO-2 address-country, e.g. "GB") — see spec §3.5.
   */
  locationCountry: string | null
}

/**
 * Classify a branch into a SupplyRung relative to an EffectiveLocation.
 *
 * Returns null for non-discoverable branches:
 *   - `isActive = false`
 *   - `locationConfidence ∈ { POSTCODE_CENTROID, NEEDS_REVIEW }`
 *
 * Only `MANUALLY_CONFIRMED` and `ADDRESS_GEOCODED` branches are
 * discoverable. This is structurally how the PR #81 redaction
 * contract is enforced at the ranking layer — an approximate
 * postcode-centroid pin can never produce a NEARBY match.
 *
 * Rung evaluation order (most-specific first):
 *   NEARBY → CATCHMENT → POST_TOWN → LAD → COUNTY → REGION → COUNTRY → NATIONAL
 *
 * All admin-rung comparisons are null-safe — both sides must be
 * non-null. UK-wide: a Scottish user with null adminCounty + null
 * region falls through past those rungs cleanly without spurious
 * null-vs-null matches.
 */
export function classifyRung(
  branch: BranchForClassification,
  effLoc: EffectiveLocation,
  nearbyRadiusMiles: number,
  /**
   * Locality IDs reachable from `effLoc.locality` via outgoing
   * CATCHMENT edges. Looked up once by the caller (M2.6) and passed
   * in — keeps `classifyRung` synchronous + pure.
   */
  outgoingCatchmentTargetIds: readonly string[],
): SupplyRung | null {
  // Discoverability gate. CONFIRMED_LOCATION_SET (shared M4 helper) — only
  // MANUALLY_CONFIRMED / ADDRESS_GEOCODED branches are rankable; an approximate
  // postcode-centroid pin can never produce a NEARBY match (PR #81 contract).
  if (!branch.isActive) return null
  if (!isBranchLocationConfirmed(branch)) return null

  // NEARBY — distance check via reused shared/haversine helper.
  if (branch.latitude !== null && branch.longitude !== null) {
    const dMetres = haversineMetres(effLoc.lat, effLoc.lng, branch.latitude, branch.longitude)
    if (dMetres <= nearbyRadiusMiles * MILES_TO_METRES) return 'NEARBY'
  }

  // CATCHMENT — same locality OR effLoc has an outgoing edge into branch's locality.
  if (branch.localityId && (
    branch.localityId === effLoc.locality.id ||
    outgoingCatchmentTargetIds.includes(branch.localityId)
  )) {
    return 'CATCHMENT'
  }

  // POST_TOWN.
  if (branch.postTown && effLoc.locality.postTown && branch.postTown === effLoc.locality.postTown) {
    return 'POST_TOWN'
  }

  // LAD.
  if (branch.ladDistrict && branch.ladDistrict === effLoc.locality.ladDistrict) {
    return 'LAD'
  }

  // COUNTY (English shire counties only; null on unitary / Scotland / Wales / NI).
  if (branch.adminCounty && effLoc.locality.adminCounty && branch.adminCounty === effLoc.locality.adminCounty) {
    return 'COUNTY'
  }

  // REGION (English regions only; null on Scotland / Wales / NI).
  if (branch.region && effLoc.locality.region && branch.region === effLoc.locality.region) {
    return 'REGION'
  }

  // COUNTRY — Plan 4 nation match. Branch reads `locationCountry`
  // (Plan 4 nation snapshot); Locality reads `country` (the matching
  // Plan 4 nation field on Locality). The field-name asymmetry is
  // intentional per spec §3.5.
  if (branch.locationCountry && branch.locationCountry === effLoc.locality.country) {
    return 'COUNTRY'
  }

  // NATIONAL — anywhere else in the UK that survived the discoverability gate.
  return 'NATIONAL'
}

// ─── Plan 4 M2.6 — rankMerchantsV2 (collect-first ladder walk) ──────────────
//
// Spec §5.6. Internal-only; legacy `rankMerchants` above remains the
// caller for the Discovery service until M3 swaps over.
//
// Algorithm:
//   1. Collect every discoverable branch's matched rung, grouped by
//      merchant. classifyRung handles the redaction gate + null rungs.
//      Drop anything above maxRung outright.
//   2. Select ONE context branch per merchant: most-specific rung
//      first, then distance ASC, then id alphabetical.
//   3. Group merchant entries by their bestRung. Sort within each
//      rung per categoryIntent:
//        LOCAL       — distance ASC (alphabetical fallback)
//        DESTINATION — quality-aware (rated > unrated, rating DESC)
//        MIXED       — distance ASC for NEARBY, quality-aware after
//   4. Walk rungs in RUNG_ORDER, stitch into `tiles`. Apply hardCap
//      across the whole result; apply targetCount as an outer-loop
//      stop AFTER the NEARBY rung has been fully evaluated.

import { RUNG_ORDER, rungOrdinal, getNearbyRadiusMiles, getMaxRung, getProximityBand, mapRungToLegacyTier } from './ladderProfiles'
import type { LadderProfile, ProximityBand } from './ladderProfiles'

export type RankableBranch = {
  id: string
  latitude: number | null
  longitude: number | null
  isActive: boolean
  locationConfidence: 'MANUALLY_CONFIRMED' | 'ADDRESS_GEOCODED' | 'MERCHANT_CONFIRMED' | 'POSTCODE_CENTROID' | 'NEEDS_REVIEW'
  localityId: string | null
  postTown: string | null
  ladDistrict: string | null
  adminCounty: string | null
  region: string | null
  locationCountry: string | null
}

export type RankableMerchant<B extends RankableBranch = RankableBranch> = {
  id: string
  businessName: string
  /** Plan 1.5 aggregate. Passed through from the service layer. */
  avgRating: number | null
  reviewCount: number
  branches: B[]
}

export type CategoryIntent = 'LOCAL' | 'MIXED' | 'DESTINATION'

export type RankMerchantsV2Input = {
  effLoc: EffectiveLocation
  ladderProfile: LadderProfile
  outgoingCatchmentTargetIds: readonly string[]
  categoryIntent: CategoryIntent
  targetCount: number
  hardCap: number
}

export type RankedTile = {
  merchantId: string
  businessName: string
  supplyRung: SupplyRung
  /** Legacy compat — populated alongside `supplyRung` until M5. */
  supplyTier: 'NEARBY' | 'CITY' | 'DISTANT'
  proximityBand: ProximityBand
  distanceMetres: number | null
  contextBranchId: string
}

export type RankMerchantsV2Result = {
  tiles: RankedTile[]
  rungCounts: Record<SupplyRung, number>
}

function selectContextBranch<B extends RankableBranch>(
  branches: Array<B & { matchedRung: SupplyRung }>,
  effLoc: EffectiveLocation,
): B & { matchedRung: SupplyRung } {
  // Most-specific rung first, then distance ASC, then id alphabetical.
  return [...branches].sort((a, b) => {
    const ra = rungOrdinal(a.matchedRung)
    const rb = rungOrdinal(b.matchedRung)
    if (ra !== rb) return ra - rb
    const da = a.latitude !== null && a.longitude !== null
      ? haversineMetres(effLoc.lat, effLoc.lng, a.latitude, a.longitude) : Infinity
    const db = b.latitude !== null && b.longitude !== null
      ? haversineMetres(effLoc.lat, effLoc.lng, b.latitude, b.longitude) : Infinity
    if (da !== db) return da - db
    return a.id.localeCompare(b.id)
  })[0]
}

type MerchantEntry<B extends RankableBranch> = {
  id: string
  businessName: string
  avgRating: number | null
  reviewCount: number
  contextBranch: B & { matchedRung: SupplyRung }
  bestRung: SupplyRung
}

// Same shape as the legacy `qualityComparator` above. Renamed `…V2` to
// avoid the duplicate-identifier collision inside this single module
// while the legacy ranking path co-exists. Both will be deleted in M5
// once the legacy path is removed.
function qualityComparatorV2(
  a: { businessName: string; avgRating: number | null; reviewCount: number },
  b: { businessName: string; avgRating: number | null; reviewCount: number },
): number {
  const aRated = (a.reviewCount ?? 0) >= MIN_REVIEW_COUNT_FOR_RATING_SORT
  const bRated = (b.reviewCount ?? 0) >= MIN_REVIEW_COUNT_FOR_RATING_SORT
  if (aRated && bRated) return (b.avgRating ?? 0) - (a.avgRating ?? 0)
  if (aRated) return -1
  if (bRated) return 1
  return a.businessName.localeCompare(b.businessName)
}

function distanceComparator<B extends RankableBranch>(
  a: MerchantEntry<B>,
  b: MerchantEntry<B>,
  effLoc: EffectiveLocation,
): number {
  const da = a.contextBranch.latitude !== null && a.contextBranch.longitude !== null
    ? haversineMetres(effLoc.lat, effLoc.lng, a.contextBranch.latitude, a.contextBranch.longitude) : Infinity
  const db = b.contextBranch.latitude !== null && b.contextBranch.longitude !== null
    ? haversineMetres(effLoc.lat, effLoc.lng, b.contextBranch.latitude, b.contextBranch.longitude) : Infinity
  return da - db
}

export function rankMerchantsV2<B extends RankableBranch>(
  merchants: RankableMerchant<B>[],
  input: RankMerchantsV2Input,
): RankMerchantsV2Result {
  const { effLoc, ladderProfile, outgoingCatchmentTargetIds, categoryIntent, targetCount, hardCap } = input
  const nearbyRadius = getNearbyRadiusMiles(ladderProfile, effLoc.densityClass)
  const maxRung = getMaxRung(ladderProfile, effLoc.densityClass)
  const maxRungOrdinal = rungOrdinal(maxRung)

  // Step 1: collect.
  const candidateBranchesByMerchant = new Map<string, Array<B & { matchedRung: SupplyRung }>>()
  for (const m of merchants) {
    for (const b of m.branches) {
      const rung = classifyRung(b, effLoc, nearbyRadius, outgoingCatchmentTargetIds)
      if (rung === null) continue
      if (rungOrdinal(rung) > maxRungOrdinal) continue
      const bucket = candidateBranchesByMerchant.get(m.id) ?? []
      bucket.push({ ...b, matchedRung: rung })
      candidateBranchesByMerchant.set(m.id, bucket)
    }
  }

  // Step 2: select context branch per merchant. A precomputed Map
  // avoids `Array.find` inside the loop — was O(merchants²) on the
  // initial M2.6 draft (PR #84 review). Cheap at v1 volume; load-
  // bearing once M3 wires this into live Discovery.
  const merchantById = new Map(merchants.map(m => [m.id, m]))
  const entries: MerchantEntry<B>[] = []
  for (const [id, branches] of candidateBranchesByMerchant.entries()) {
    const merchant = merchantById.get(id)!
    const contextBranch = selectContextBranch(branches, effLoc)
    entries.push({
      id,
      businessName: merchant.businessName,
      avgRating: merchant.avgRating ?? null,
      reviewCount: merchant.reviewCount ?? 0,
      contextBranch,
      bestRung: contextBranch.matchedRung,
    })
  }

  // Step 3: group by rung.
  const byRung = new Map<SupplyRung, MerchantEntry<B>[]>()
  for (const e of entries) {
    const arr = byRung.get(e.bestRung) ?? []
    arr.push(e)
    byRung.set(e.bestRung, arr)
  }

  function sortWithinRung(rung: SupplyRung, arr: MerchantEntry<B>[]): MerchantEntry<B>[] {
    if (categoryIntent === 'LOCAL') {
      return [...arr].sort((a, b) => {
        const d = distanceComparator(a, b, effLoc)
        if (d !== 0) return d
        return a.businessName.localeCompare(b.businessName)
      })
    }
    if (categoryIntent === 'DESTINATION') {
      return [...arr].sort(qualityComparatorV2)
    }
    // MIXED: distance for NEARBY rung, quality-aware for outer rungs.
    if (rung === 'NEARBY') {
      return [...arr].sort((a, b) => {
        const d = distanceComparator(a, b, effLoc)
        if (d !== 0) return d
        return a.businessName.localeCompare(b.businessName)
      })
    }
    return [...arr].sort(qualityComparatorV2)
  }

  // Step 4: stitch.
  const tiles: RankedTile[] = []
  const rungCounts: Record<SupplyRung, number> = {
    NEARBY: 0, CATCHMENT: 0, POST_TOWN: 0, LAD: 0,
    COUNTY: 0, REGION: 0, COUNTRY: 0, NATIONAL: 0,
  }
  let nearbyRungEvaluated = false

  for (const rung of RUNG_ORDER) {
    if (rungOrdinal(rung) > maxRungOrdinal) break
    const arr = byRung.get(rung) ?? []
    const sorted = sortWithinRung(rung, arr)

    for (const e of sorted) {
      if (tiles.length >= hardCap) break
      const cb = e.contextBranch
      const distance = cb.latitude !== null && cb.longitude !== null
        ? haversineMetres(effLoc.lat, effLoc.lng, cb.latitude, cb.longitude) : null
      tiles.push({
        merchantId: e.id,
        businessName: e.businessName,
        supplyRung: e.bestRung,
        supplyTier: mapRungToLegacyTier(e.bestRung),
        proximityBand: getProximityBand(e.bestRung, effLoc.densityClass),
        distanceMetres: distance,
        contextBranchId: cb.id,
      })
      rungCounts[e.bestRung]++
    }

    if (rung === 'NEARBY') nearbyRungEvaluated = true

    // targetCount: stop adding further rungs once we've hit the target,
    // BUT only after NEARBY has been fully evaluated (per spec §5.6).
    if (tiles.length >= targetCount && nearbyRungEvaluated) break
    if (tiles.length >= hardCap) break
  }

  return { tiles, rungCounts }
}

// ─── Discovery Rebaseline Phase 1 — rankBranchesV3 (branch-first) ────────────
//
// Spec docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md §2.
//
// Branch-first variant of rankMerchantsV2. Per-branch tile emission — same-
// merchant multi-locality branches surface as independent tiles. Coexists
// with rankMerchantsV2 during Phase 1 + Phase 2; Phase 3 deletes the
// merchant-collapse variant (selectContextBranch / MerchantEntry /
// qualityComparatorV2 / distanceComparator / rankMerchantsV2) and unifies
// `BranchForClassification` + `RankableBranch` per the §AT cleanup note.
//
// Algorithm:
//   1. Per-branch classifyRung. Discoverability gate enforced upstream
//      (POSTCODE_CENTROID / NEEDS_REVIEW / !isActive → null rung → drop).
//   2. Sort within rung per categoryIntent (pure-rank D1):
//        LOCAL       — distance ASC → businessName → id.
//        DESTINATION — quality-aware (rated > unrated, rating DESC) → distance → name → id.
//        MIXED       — distance for NEARBY rung; quality-aware for outer rungs.
//      Same-merchant same-rung branches cluster naturally via secondary
//      sort keys (distance + name); explicit dedup deferred until v2.
//   3. Rung-walk with targetCount + hardCap — mirrors rankMerchantsV2 §5.6.

export type RankableBranchInputV3 = RankableBranch & {
  merchantId: string
  merchant: {
    id: string
    businessName: string
    avgRating: number | null
    reviewCount: number
  }
}

export type RankInputV3 = {
  effLoc: EffectiveLocation
  ladderProfile: LadderProfile
  outgoingCatchmentTargetIds: readonly string[]
  categoryIntent: CategoryIntent
  targetCount: number
  hardCap: number
  // §DG spec §5.2(b) — optional sort override for Popular rail. When
  // sortBy='popularity', intra-rung sort uses popularityMap.get(merchantId)
  // desc (default 0) with distance asc tiebreak. Other rails omit both
  // and inherit categoryIntent-based sort (LOCAL/DESTINATION/MIXED).
  sortBy?: 'distance' | 'quality' | 'popularity'
  popularityMap?: Map<string, number>
}

export type RankedBranchTile = {
  /** Branch id — the tile IS the branch. */
  id: string
  merchantId: string
  /** Merchant business name (for downstream display + tiebreak debug). */
  businessName: string
  supplyRung: SupplyRung
  /** Legacy compat — populated alongside `supplyRung` until Phase 3 cleanup. */
  supplyTier: 'NEARBY' | 'CITY' | 'DISTANT'
  proximityBand: ProximityBand
  distanceMetres: number | null
}

export type RankBranchesV3Result = {
  tiles: RankedBranchTile[]
  /** Branch counts per rung (NOT merchant counts — branch-first cardinality). */
  rungCounts: Record<SupplyRung, number>
}

export function rankBranchesV3<B extends RankableBranchInputV3>(
  branches: B[],
  input: RankInputV3,
): RankBranchesV3Result {
  const { effLoc, ladderProfile, outgoingCatchmentTargetIds, categoryIntent, targetCount, hardCap } = input
  const nearbyRadius = getNearbyRadiusMiles(ladderProfile, effLoc.densityClass)
  const maxRung = getMaxRung(ladderProfile, effLoc.densityClass)
  const maxRungOrdinal = rungOrdinal(maxRung)

  // Step 1: collect — per-branch rung classification.
  type Collected<X extends RankableBranchInputV3> = {
    branch: X
    rung: SupplyRung
    distance: number | null
  }
  const byRung = new Map<SupplyRung, Collected<B>[]>()
  const rungCounts: Record<SupplyRung, number> = {
    NEARBY: 0, CATCHMENT: 0, POST_TOWN: 0, LAD: 0,
    COUNTY: 0, REGION: 0, COUNTRY: 0, NATIONAL: 0,
  }

  for (const b of branches) {
    const rung = classifyRung(b, effLoc, nearbyRadius, outgoingCatchmentTargetIds)
    if (rung === null) continue
    if (rungOrdinal(rung) > maxRungOrdinal) continue
    const distance = b.latitude !== null && b.longitude !== null
      ? haversineMetres(effLoc.lat, effLoc.lng, b.latitude, b.longitude)
      : null
    const arr = byRung.get(rung) ?? []
    arr.push({ branch: b, rung, distance })
    byRung.set(rung, arr)
  }

  // Step 2: sort within rung per categoryIntent.
  function compareDistance(a: Collected<B>, b: Collected<B>): number {
    const aD = a.distance ?? Number.POSITIVE_INFINITY
    const bD = b.distance ?? Number.POSITIVE_INFINITY
    if (aD !== bD) return aD - bD
    const nameCmp = a.branch.merchant.businessName.localeCompare(b.branch.merchant.businessName)
    if (nameCmp !== 0) return nameCmp
    return a.branch.id.localeCompare(b.branch.id)
  }

  function compareQuality(a: Collected<B>, b: Collected<B>): number {
    const aRated = (a.branch.merchant.reviewCount ?? 0) >= MIN_REVIEW_COUNT_FOR_RATING_SORT
    const bRated = (b.branch.merchant.reviewCount ?? 0) >= MIN_REVIEW_COUNT_FOR_RATING_SORT
    if (aRated && bRated) {
      const d = (b.branch.merchant.avgRating ?? 0) - (a.branch.merchant.avgRating ?? 0)
      if (d !== 0) return d
    } else if (aRated) {
      return -1
    } else if (bRated) {
      return 1
    }
    // Quality tiebreak falls through to distance + name + id.
    return compareDistance(a, b)
  }

  // §DG: popularity-desc with distance-asc tiebreak. Factory because the
  // comparator closes over the popularityMap (which is per-call, not module
  // state). Falls through to compareDistance on tie so the final ordering
  // matches distance + name + id tiebreaks already established by
  // compareDistance.
  function makeComparePopularity(popularityMap: Map<string, number>) {
    return function comparePopularity(a: Collected<B>, b: Collected<B>): number {
      const aP = popularityMap.get(a.branch.merchantId) ?? 0
      const bP = popularityMap.get(b.branch.merchantId) ?? 0
      if (aP !== bP) return bP - aP  // popularity DESC
      return compareDistance(a, b)
    }
  }

  function sortWithinRung(rung: SupplyRung, arr: Collected<B>[]): Collected<B>[] {
    // §DG: sortBy override wins when provided.
    if (input.sortBy === 'popularity' && !input.popularityMap) {
      // Caller error: sortBy='popularity' requires a popularityMap.  Silently
      // falling through to categoryIntent is almost certainly wrong — the
      // caller explicitly asked for popularity ordering.  Throw loudly so
      // the bug surfaces immediately.
      throw new Error('rankBranchesV3: sortBy="popularity" requires popularityMap')
    }
    if (input.sortBy === 'popularity' && input.popularityMap) {
      return [...arr].sort(makeComparePopularity(input.popularityMap))
    }
    if (input.sortBy === 'distance') {
      return [...arr].sort(compareDistance)
    }
    if (input.sortBy === 'quality') {
      return [...arr].sort(compareQuality)
    }
    // No sortBy override → existing categoryIntent behaviour.
    if (categoryIntent === 'LOCAL') {
      return [...arr].sort(compareDistance)
    }
    if (categoryIntent === 'DESTINATION') {
      return [...arr].sort(compareQuality)
    }
    // MIXED — distance for NEARBY, quality for outer rungs (mirrors V2).
    return [...arr].sort(rung === 'NEARBY' ? compareDistance : compareQuality)
  }

  // Step 3: stitch with targetCount + hardCap.
  const tiles: RankedBranchTile[] = []
  let nearbyRungEvaluated = false

  for (const rung of RUNG_ORDER) {
    if (rungOrdinal(rung) > maxRungOrdinal) break
    const arr = byRung.get(rung) ?? []
    const sorted = sortWithinRung(rung, arr)

    for (const c of sorted) {
      if (tiles.length >= hardCap) break
      tiles.push({
        id: c.branch.id,
        merchantId: c.branch.merchantId,
        businessName: c.branch.merchant.businessName,
        supplyRung: c.rung,
        supplyTier: mapRungToLegacyTier(c.rung),
        proximityBand: getProximityBand(c.rung, effLoc.densityClass),
        distanceMetres: c.distance,
      })
      rungCounts[c.rung]++
    }

    if (rung === 'NEARBY') nearbyRungEvaluated = true

    // targetCount: stop after NEARBY fully evaluated (mirrors V2 spec §5.6).
    if (tiles.length >= targetCount && nearbyRungEvaluated) break
    if (tiles.length >= hardCap) break
  }

  return { tiles, rungCounts }
}
