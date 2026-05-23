// src/api/customer/discovery/homeRailBuilders.ts
//
// Home rail builders — Home Relevance spec §10.4.
//
// Each builder takes (prisma, effLoc, ladderProfile, locationCtx, options)
// and returns { branches: BranchTile[], meta: HomeRailMeta | null }.
//
// Phase C.1 ships `buildFeaturedRail`. `buildTrendingRail` /
// `buildPopularRail` / `buildNearbyByCategoryRails` arrive in Phases D + E.
//
// Algorithm (Featured):
//   1. Inclusion query — active FeaturedMerchant rows joined to active
//      branches.
//   2. Partition by locationConfidence — rankable
//      (MANUALLY_CONFIRMED / ADDRESS_GEOCODED) vs non-rankable
//      (POSTCODE_CENTROID / NEEDS_REVIEW).
//   3. `rankBranchesV3` over the rankable subset — yields per-rung counts.
//   4. `resolveScopeForHomeRail('featured', rungCounts)` decides the
//      scope state per spec §6.1:
//        a. local supply > 0          → city scope, scopeExpanded=false.
//        b. local 0, distant > 0      → platform scope, scopeExpanded=true.
//        c. totalSupply === 0         → v1.2 hide rule (rail hidden).
//   5. Apply tail (spec §6.4):
//        a. local state               → strict-locality identity gate.
//        b. cascade state             → permissive append.
//   6. Enrich the head of the list via `enrichBranchTiles`.

import { type PrismaClient } from '../../../../generated/prisma/client'
import { MerchantStatus } from '../../../../generated/prisma/enums'
import { rankBranchesV3, type RankableBranchInputV3 } from '../../lib/ranking'
import type { LadderProfile, SupplyRung } from '../../lib/ladderProfiles'
import type { EffectiveLocation } from '../../lib/effectiveLocation'
import {
  resolveScopeForHomeRail,
  appendStrictLocalityTail,
  appendPermissiveTail,
} from './homeScope'
import {
  enrichBranchTiles,
  exposeBranchPosition,
  type EnrichBranchInput,
  type EnrichBranchCtx,
  type HomeRail,
  type HomeNearbyCategoryRail,
  type LocalityRef,
} from './service'

// Local rich select — `BRANCH_TILE_SELECT` does not include the ladder
// identity fields (`ladDistrict / adminCounty / region / locationCountry`)
// because the wire tile does not surface them.  `rankBranchesV3` needs all
// of them via `classifyRung`.  Mirrors the local `select` blocks in
// `searchBranches` (service.ts:~3232) and `getInAreaBranches`
// (service.ts:~4110).
const RANK_BRANCH_SELECT = {
  id:                 true,
  merchantId:         true,
  name:               true,
  latitude:           true,
  longitude:          true,
  isActive:           true,
  locationConfidence: true,
  localityId:         true,
  localityName:       true,
  postTown:           true,
  ladDistrict:        true,
  adminCounty:        true,
  region:             true,
  locationCountry:    true,
  merchant: { select: { id: true, businessName: true } },
} as const

const EMPTY_RUNG_COUNTS: Record<SupplyRung, number> = {
  NEARBY:    0,
  CATCHMENT: 0,
  POST_TOWN: 0,
  LAD:       0,
  COUNTY:    0,
  REGION:    0,
  COUNTRY:   0,
  NATIONAL:  0,
}

// Cap on the number of head tiles surfaced per rail — spec §6.1.  Beyond
// this the carousel paginates client-side; 10 is the existing legacy
// `take: 10` from FeaturedMerchant.findMany.
const FEATURED_TAKE = 10

// Branch row shape returned by the local `RANK_BRANCH_SELECT` query.
// Re-declared structurally so the builder is independent of Prisma's
// generated `Prisma.BranchGetPayload` accessor (which would re-wire to
// `BRANCH_TILE_SELECT` if we used the exported one).
type RankBranchRow = {
  id:                 string
  merchantId:         string
  name:               string
  latitude:           unknown
  longitude:          unknown
  isActive:           boolean
  locationConfidence: 'MANUALLY_CONFIRMED' | 'ADDRESS_GEOCODED' | 'POSTCODE_CENTROID' | 'NEEDS_REVIEW'
  localityId:         string | null
  localityName:       string | null
  postTown:           string | null
  ladDistrict:        string | null
  adminCounty:        string | null
  region:             string | null
  locationCountry:    string | null
  merchant:           { id: string; businessName: string }
}

function toRankInput(b: RankBranchRow): RankableBranchInputV3 {
  return {
    id:                 b.id,
    merchantId:         b.merchantId,
    merchant: {
      id:           b.merchant.id,
      businessName: b.merchant.businessName,
      // Phase 1 quality-tiebreak conservative — per-branch ratings flow
      // through `enrichBranchTiles` downstream.  Mirrors the pattern in
      // `searchBranches` (service.ts:3306-3307).
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
  }
}

/**
 * Build the Featured rail (spec §6.1).
 *
 * Returns `{ branches: [], meta: null }` whenever the rail has no business
 * appearing on the page:
 *   - `effLoc` is null              (caller has no resolvable location).
 *   - No active FeaturedMerchant rows.
 *   - No active branches under any featured merchant.
 *   - Total ranked supply is zero  (v1.2 hide rule — tail tiles alone
 *     cannot keep the rail alive).
 */
export async function buildFeaturedRail(
  prisma:        PrismaClient,
  effLoc:        EffectiveLocation | null,
  ladderProfile: LadderProfile,
  locationCtx:   { locality: LocalityRef | null },
  options: { outgoingCatchmentTargetIds?: readonly string[] } = {},
): Promise<HomeRail> {
  // No effective location → no proximity ranking possible → rail hidden.
  // Mirrors the §8.3 no-location row of the fallback matrix.
  if (!effLoc) return { branches: [], meta: null }

  const now = new Date()

  // ── 1. Inclusion: active FeaturedMerchant rows in window, joined to
  //    active merchants.  Pull merchantIds only — the branch fetch
  //    happens in the next query against `RANK_BRANCH_SELECT`.
  const featuredRows = await prisma.featuredMerchant.findMany({
    where: {
      isActive:  true,
      startDate: { lte: now },
      endDate:   { gte: now },
      merchant:  { status: MerchantStatus.ACTIVE },
    },
    orderBy: { startDate: 'asc' },
    take:    50,
    select:  { merchantId: true },
  })
  const merchantIds = Array.from(new Set(featuredRows.map((r: { merchantId: string }) => r.merchantId)))
  if (merchantIds.length === 0) return { branches: [], meta: null }

  // ── 2. Fetch active branches under the featured merchants with the
  //    extended select rankBranchesV3 needs.
  const allBranches = await prisma.branch.findMany({
    where:  { merchantId: { in: merchantIds }, isActive: true },
    select: RANK_BRANCH_SELECT,
  }) as RankBranchRow[]

  if (allBranches.length === 0) return { branches: [], meta: null }

  // ── 3. Partition by locationConfidence (spec §4.1.1 list-view admission).
  const rankable = allBranches.filter(b =>
    b.locationConfidence === 'MANUALLY_CONFIRMED'
    || b.locationConfidence === 'ADDRESS_GEOCODED'
  )
  const nonRankable = allBranches.filter(b =>
    b.locationConfidence === 'POSTCODE_CENTROID'
    || b.locationConfidence === 'NEEDS_REVIEW'
  )

  // ── 4. Rank the rankable subset.  Empty rankable → emit empty result
  //    with zero rungCounts so the scope resolver hits the hide-rule branch.
  const v3 = rankable.length > 0
    ? rankBranchesV3(rankable.map(toRankInput), {
        effLoc,
        ladderProfile,
        outgoingCatchmentTargetIds: options.outgoingCatchmentTargetIds ?? [],
        categoryIntent: 'MIXED',
        targetCount:    20,
        hardCap:        500,
      })
    : { tiles: [], rungCounts: { ...EMPTY_RUNG_COUNTS } }

  const resolution  = resolveScopeForHomeRail('featured', v3.rungCounts)
  const totalSupply = Object.values(v3.rungCounts).reduce((sum, n) => sum + n, 0)

  // ── 5. v1.2 hide rule (spec §6.1) — tail-only Featured (no ranked
  //    supply anywhere) → rail hidden.  Tail tiles alone cannot keep
  //    the rail alive.
  if (totalSupply === 0) return { branches: [], meta: null }

  // ── 6. Apply scope filter to ranked tiles + attach tail.
  const filteredTiles = v3.tiles.filter(t =>
    resolution.retainedRungs.has(t.supplyRung)
  )

  // Convert ranked tiles into `EnrichBranchInput[]` (the contract
  // `enrichBranchTiles` consumes).  Non-rankable tail candidates feed
  // through `exposeBranchPosition` so the strict-locality / permissive
  // helper sees the redacted lat/lng + the identity fields.
  const headInputs: EnrichBranchInput[] = filteredTiles.map(t => ({
    branchId:      t.id,
    merchantId:    t.merchantId,
    supplyRung:    t.supplyRung,
    proximityBand: t.proximityBand,
    distance:      t.distanceMetres,
  }))

  // Tail candidates carry `localityId / localityName / postTown` so the
  // strict-locality identity gate (§6.4.1) can pass.  No `supplyRung` —
  // tail tiles render with rung=null, band=null, distance=null.
  const tailCandidates = nonRankable.map(b => {
    const exposed = exposeBranchPosition(b)
    const tailInput: EnrichBranchInput & {
      localityId:   string | null
      localityName: string | null
      postTown:     string | null
    } = {
      branchId:      b.id,
      merchantId:    b.merchantId,
      supplyRung:    null,
      proximityBand: null,
      distance:      null,
      localityId:    b.localityId,
      localityName:  b.localityName,
      postTown:      b.postTown,
    }
    // `exposed` is currently unused at the tail boundary — `enrichBranchTiles`
    // re-fetches the branch row and runs `exposeBranchPosition` again at
    // serialization.  Reference the call to make the redaction intent
    // explicit at the boundary (no-op behaviourally).
    void exposed
    return tailInput
  })

  const tailed = resolution.scopeExpanded
    ? appendPermissiveTail(headInputs, tailCandidates)
    : appendStrictLocalityTail(headInputs, tailCandidates, effLoc)

  // Cap the head of the list before enrichment — keeps the carousel slice
  // small (legacy take=10) and avoids paying enrichment cost on tail
  // overflow.
  const sliced = tailed.slice(0, FEATURED_TAKE)

  // ── 7. Enrich into BranchTile[].
  const ctx: EnrichBranchCtx = {
    userId: null,
    lat:    effLoc.lat,
    lng:    effLoc.lng,
  }
  // `sliced` items carry the `EnrichBranchInput` core shape plus optional
  // tail-only identity fields; the extra fields are ignored by
  // `enrichBranchTiles` which only reads `branchId / merchantId /
  // supplyRung / proximityBand / distance`.
  const enriched = await enrichBranchTiles(prisma, sliced as EnrichBranchInput[], ctx)

  return {
    branches: enriched,
    meta: {
      locality:      locationCtx.locality,
      scope:         resolution.scope,
      scopeExpanded: resolution.scopeExpanded,
      rungCounts:    v3.rungCounts,
    },
  }
}

// ─── Trending + Popular rail builders (Phase D, spec §6.2 + §10.4) ──────────
//
// Both rails fan out from the calendar-month redemptions table.  They share
// the same inclusion query but apply different scope rules:
//
//   Trending: strict NEARBY+CITY only — never cascades.  When local supply
//             is empty the rail hides (returns `meta: null`).
//   Popular:  platform-wide UK inclusion.  Two branches:
//             (a) with effLoc → rank via V3, permissive tail.
//             (b) without effLoc → emit tiles carrying null rung/band/
//                 distance per the §6.2 no-location tile contract.
//
// Mutual-exclusion contract: the caller (`getHomeFeed`) only fires Popular
// when Trending is silent OR effLoc is null.  Asserted server-side at the
// orchestrator (the invariant throw covers a defensive case where Popular
// somehow runs alongside a populated Trending).

const TRENDING_TAKE = 10
const POPULAR_TAKE  = 10
const TOP_MERCHANT_CAP = 30  // Top-N merchants by redemption count (spec §10.4)

function startOfMonthUTC(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), 1)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Build the Trending rail (spec §6.2).
 *
 * Strict NEARBY+CITY scope.  Returns `{ branches: [], meta: null }` when:
 *   - `effLoc` is null (no location to compute proximity against).
 *   - No current-month redemptions at all (top-merchant list is empty).
 *   - No active branches under the top merchants.
 *   - No rankable branches (every active branch is POSTCODE_CENTROID /
 *     NEEDS_REVIEW with no exact lat/lng).
 *   - Ranked supply has zero tiles in the retained NEARBY+CITY rung set
 *     (local supply is empty — Trending never cascades).
 */
export async function buildTrendingRail(
  prisma:        PrismaClient,
  effLoc:        EffectiveLocation | null,
  ladderProfile: LadderProfile,
  locationCtx:   { locality: LocalityRef | null },
): Promise<HomeRail> {
  // Trending requires an effective location for proximity ranking.
  if (!effLoc) return { branches: [], meta: null }

  // ── 1. Inclusion: top merchants by current-month redemption count.
  const monthStart = startOfMonthUTC(new Date())
  const recent = await prisma.voucherRedemption.findMany({
    where:  { redeemedAt: { gte: monthStart } },
    select: { branch: { select: { merchantId: true } } },
  })
  const counts: Record<string, number> = {}
  for (const r of recent) {
    const id = r.branch.merchantId
    counts[id] = (counts[id] ?? 0) + 1
  }
  const topMerchantIds = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, TOP_MERCHANT_CAP)
    .map(([id]) => id)
  if (topMerchantIds.length === 0) return { branches: [], meta: null }

  // ── 2. Fetch active branches under the top merchants.
  const allBranches = await prisma.branch.findMany({
    where:  { merchantId: { in: topMerchantIds }, isActive: true, merchant: { status: MerchantStatus.ACTIVE } },
    select: RANK_BRANCH_SELECT,
  }) as RankBranchRow[]
  if (allBranches.length === 0) return { branches: [], meta: null }

  // ── 3. Partition by locationConfidence (mirrors buildFeaturedRail).
  const rankable = allBranches.filter(b =>
    b.locationConfidence === 'MANUALLY_CONFIRMED'
    || b.locationConfidence === 'ADDRESS_GEOCODED'
  )
  const nonRankable = allBranches.filter(b =>
    b.locationConfidence === 'POSTCODE_CENTROID'
    || b.locationConfidence === 'NEEDS_REVIEW'
  )

  if (rankable.length === 0) return { branches: [], meta: null }

  // ── 4. Rank the rankable subset.
  const v3 = rankBranchesV3(rankable.map(toRankInput), {
    effLoc,
    ladderProfile,
    outgoingCatchmentTargetIds: [],
    categoryIntent: 'MIXED',
    targetCount:    20,
    hardCap:        500,
  })

  // ── 5. Strict NEARBY+CITY scope — never cascades.
  const resolution = resolveScopeForHomeRail('trending', v3.rungCounts)
  const filteredTiles = v3.tiles.filter(t => resolution.retainedRungs.has(t.supplyRung))

  // No local supply → rail hidden (Trending does NOT fall back to platform).
  if (filteredTiles.length === 0) return { branches: [], meta: null }

  // ── 6. Strict-locality identity tail (spec §6.4.1).
  const headInputs: EnrichBranchInput[] = filteredTiles.map(t => ({
    branchId:      t.id,
    merchantId:    t.merchantId,
    supplyRung:    t.supplyRung,
    proximityBand: t.proximityBand,
    distance:      t.distanceMetres,
  }))

  const tailCandidates = nonRankable.map(b => {
    const exposed = exposeBranchPosition(b)
    const tailInput: EnrichBranchInput & {
      localityId:   string | null
      localityName: string | null
      postTown:     string | null
    } = {
      branchId:      b.id,
      merchantId:    b.merchantId,
      supplyRung:    null,
      proximityBand: null,
      distance:      null,
      localityId:    b.localityId,
      localityName:  b.localityName,
      postTown:      b.postTown,
    }
    void exposed
    return tailInput
  })

  const tailed = appendStrictLocalityTail(headInputs, tailCandidates, effLoc)
  const sliced = tailed.slice(0, TRENDING_TAKE)

  // ── 7. Enrich into BranchTile[].
  const ctx: EnrichBranchCtx = {
    userId: null,
    lat:    effLoc.lat,
    lng:    effLoc.lng,
  }
  const enriched = await enrichBranchTiles(prisma, sliced as EnrichBranchInput[], ctx)

  return {
    branches: enriched,
    meta: {
      locality:      locationCtx.locality,
      scope:         resolution.scope,
      scopeExpanded: resolution.scopeExpanded,
      rungCounts:    v3.rungCounts,
    },
  }
}

/**
 * Build the Popular rail (spec §6.2).
 *
 * Two branches:
 *
 *   (a) `effLoc` non-null — UK-wide inclusion query, rank via V3,
 *       permissive tail.  Locality on `meta` is null (rail does not
 *       claim a locality), scope is `platform`.
 *
 *   (b) `effLoc` null — V3 ranker NOT invoked.  Every tile constructed
 *       with `supplyRung: null, proximityBand: null, distance: null`
 *       per the §6.2 no-location tile contract.  The customer-app
 *       `<PopularSection>` tolerates these nulls and renders the tiles
 *       without distance / proximity chips.
 *
 * Returns `{ branches: [], meta: null }` only when no current-month
 * redemptions exist anywhere (top-merchant list empty) or no active
 * branches under any top merchant.
 */
export async function buildPopularRail(
  prisma:        PrismaClient,
  effLoc:        EffectiveLocation | null,
  ladderProfile: LadderProfile,
): Promise<HomeRail> {
  // ── 1. Inclusion: top merchants by current-month redemption count
  //    (same shape as Trending — but no locality filter; UK-wide).
  const monthStart = startOfMonthUTC(new Date())
  const recent = await prisma.voucherRedemption.findMany({
    where:  { redeemedAt: { gte: monthStart } },
    select: { branch: { select: { merchantId: true } } },
  })
  const counts: Record<string, number> = {}
  for (const r of recent) {
    const id = r.branch.merchantId
    counts[id] = (counts[id] ?? 0) + 1
  }
  const topMerchantIds = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, TOP_MERCHANT_CAP)
    .map(([id]) => id)
  if (topMerchantIds.length === 0) return { branches: [], meta: null }

  // ── 2. Fetch active branches under the top merchants.
  const allBranches = await prisma.branch.findMany({
    where:  { merchantId: { in: topMerchantIds }, isActive: true, merchant: { status: MerchantStatus.ACTIVE } },
    select: RANK_BRANCH_SELECT,
  }) as RankBranchRow[]
  if (allBranches.length === 0) return { branches: [], meta: null }

  // ── 3. No-location branch (b): emit null-classification tiles.
  //    V3 ranker is NOT invoked because there's no effLoc to rank against.
  //    Tile order = merchant rank order (most-redeemed first), preserved
  //    by walking `topMerchantIds` and pulling the first active branch per
  //    merchant.  This is intentionally a curatorial order — without GPS
  //    the platform cannot honestly claim "nearby" anything.
  if (!effLoc) {
    const branchesByMerchant = new Map<string, RankBranchRow[]>()
    for (const b of allBranches) {
      const list = branchesByMerchant.get(b.merchantId)
      if (list) list.push(b)
      else branchesByMerchant.set(b.merchantId, [b])
    }
    const orderedInputs: EnrichBranchInput[] = []
    for (const mid of topMerchantIds) {
      const list = branchesByMerchant.get(mid)
      if (!list || list.length === 0) continue
      // One branch per merchant to keep the rail visually diverse on the
      // no-location path.  Pick deterministically by branch id.
      const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id))
      const first = sorted[0]
      orderedInputs.push({
        branchId:      first.id,
        merchantId:    first.merchantId,
        supplyRung:    null,
        proximityBand: null,
        distance:      null,
      })
      if (orderedInputs.length >= POPULAR_TAKE) break
    }

    const ctx: EnrichBranchCtx = { userId: null, lat: null, lng: null }
    const enriched = await enrichBranchTiles(prisma, orderedInputs, ctx)
    return {
      branches: enriched,
      meta: {
        locality:      null,
        scope:         'platform',
        scopeExpanded: false,
        rungCounts:    { ...EMPTY_RUNG_COUNTS },
      },
    }
  }

  // ── 4. With-effLoc branch (a): rank via V3, permissive tail.
  const rankable = allBranches.filter(b =>
    b.locationConfidence === 'MANUALLY_CONFIRMED'
    || b.locationConfidence === 'ADDRESS_GEOCODED'
  )
  const nonRankable = allBranches.filter(b =>
    b.locationConfidence === 'POSTCODE_CENTROID'
    || b.locationConfidence === 'NEEDS_REVIEW'
  )

  const v3 = rankable.length > 0
    ? rankBranchesV3(rankable.map(toRankInput), {
        effLoc,
        ladderProfile,
        outgoingCatchmentTargetIds: [],
        categoryIntent: 'MIXED',
        targetCount:    20,
        hardCap:        500,
      })
    : { tiles: [], rungCounts: { ...EMPTY_RUNG_COUNTS } }

  // Popular retains every rung (platform-wide).
  const resolution = resolveScopeForHomeRail('popular', v3.rungCounts)
  const filteredTiles = v3.tiles.filter(t => resolution.retainedRungs.has(t.supplyRung))

  const headInputs: EnrichBranchInput[] = filteredTiles.map(t => ({
    branchId:      t.id,
    merchantId:    t.merchantId,
    supplyRung:    t.supplyRung,
    proximityBand: t.proximityBand,
    distance:      t.distanceMetres,
  }))

  const tailCandidates: EnrichBranchInput[] = nonRankable.map(b => {
    const exposed = exposeBranchPosition(b)
    void exposed
    return {
      branchId:      b.id,
      merchantId:    b.merchantId,
      supplyRung:    null,
      proximityBand: null,
      distance:      null,
    }
  })

  const tailed = appendPermissiveTail(headInputs, tailCandidates)
  const sliced = tailed.slice(0, POPULAR_TAKE)

  const ctx: EnrichBranchCtx = {
    userId: null,
    lat:    effLoc.lat,
    lng:    effLoc.lng,
  }
  const enriched = await enrichBranchTiles(prisma, sliced as EnrichBranchInput[], ctx)

  return {
    branches: enriched,
    meta: {
      locality:      null,
      scope:         'platform',
      scopeExpanded: false,
      rungCounts:    v3.rungCounts,
    },
  }
}

// ─── NearbyByCategory rail builder (Phase E, spec §6.3 + §10.4) ─────────────
//
// Replaces the legacy NearbyByCategory code path (city-string merchant fan
// out + JS group-by + per-merchant branch fan-out without scope rules).
// The new builder runs each surviving category through `rankBranchesV3` +
// strict NEARBY+CITY scope + `appendStrictLocalityTail` — identical
// pattern to `buildTrendingRail`, parameterised per category.  Categories
// with zero local supply are EXCLUDED from the response array (per
// spec §8.3 row 7 — per-category empty is absence, not null-meta entry).
//
// Inclusion order mirrors the legacy implementation (60-merchant bulk fetch
// keyed off locationCtx.city when available, falling back to a coordinate-
// only branch query when only lat/lng is known).  Cap: 5 merchants per
// category, 6 categories total.  Each category fan-out covers every active
// branch under those merchants (mirrors the Featured/Trending fan-out).

const NEARBY_CATEGORY_TAKE      = 5   // tiles per category
const NEARBY_MAX_CATEGORIES     = 6   // categories per response
const NEARBY_MERCHANT_POOL_TAKE = 60  // top-level merchant pool size

// Merchant row shape used by the inclusion query — we need enough to fan
// out to branches with RANK_BRANCH_SELECT, plus primaryCategoryId +
// primaryCategory for the per-category group + header copy.  Locally
// declared so the builder doesn't depend on Prisma's generated type for
// MERCHANT_TILE_SELECT (which carries far more fields than we need here).
type NearbyCategoryMerchantRow = {
  id:                string
  businessName:      string
  primaryCategoryId: string | null
  primaryCategory:   { id: string; name: string } | null
}

/**
 * Build the NearbyByCategory rails (spec §6.3).
 *
 * Per-category strict NEARBY+CITY scope; never cascades.  Categories with
 * zero local supply are excluded from the response array (the customer-app
 * `<NearbyByCategory>` hides empty per-category rails; the screen-level
 * `<NearbySectionEmpty>` mounts when the whole array is empty AND effLoc
 * resolved).
 *
 * Returns `[]` whenever:
 *   - `effLoc` is null (no proximity ranking possible — caller should
 *     surface the no-location banner instead).
 *   - No merchants match the locality inclusion filter.
 *   - Every grouped category yields zero local-tier supply after ranking.
 */
export async function buildNearbyByCategoryRails(
  prisma:        PrismaClient,
  effLoc:        EffectiveLocation,
  ladderProfile: LadderProfile,
  locationCtx:   { city: string | null; lat: number | null; lng: number | null; locality: LocalityRef | null },
): Promise<HomeNearbyCategoryRail[]> {
  // ── 1. Inclusion: top merchant pool in the user's locality.  Mirrors the
  //    legacy inclusion (service.ts:1491-1505) — `locationCtx.city` is now
  //    populated for GPS callers post-§BB fix, so the city-match arm is
  //    the dominant code path; the coordinate-only fallback covers the
  //    edge case where city is still null but lat/lng exists.
  const merchantWhere = locationCtx.city
    ? {
        status: MerchantStatus.ACTIVE,
        branches: {
          some: {
            isActive: true,
            city: { equals: locationCtx.city, mode: 'insensitive' as const },
          },
        },
      }
    : (locationCtx.lat !== null
        ? {
            status: MerchantStatus.ACTIVE,
            branches: { some: { isActive: true } },
          }
        : null)
  if (!merchantWhere) return []

  const merchantPool = await prisma.merchant.findMany({
    where:  merchantWhere,
    select: {
      id:                true,
      businessName:      true,
      primaryCategoryId: true,
      primaryCategory:   { select: { id: true, name: true } },
    },
    take: NEARBY_MERCHANT_POOL_TAKE,
  }) as NearbyCategoryMerchantRow[]
  if (merchantPool.length === 0) return []

  // ── 2. Group by primaryCategoryId — cap 5 merchants per category, cap
  //    6 categories total.  Mirrors legacy ordering: first-seen merchant
  //    drives the category header (its primaryCategory provides id + name).
  const byCategory: Record<string, NearbyCategoryMerchantRow[]> = {}
  for (const m of merchantPool) {
    const cat = m.primaryCategoryId
    if (!cat) continue
    if (!byCategory[cat]) byCategory[cat] = []
    if (byCategory[cat].length < NEARBY_CATEGORY_TAKE) byCategory[cat].push(m)
  }
  const groupedCategories = Object.entries(byCategory).slice(0, NEARBY_MAX_CATEGORIES)
  if (groupedCategories.length === 0) return []

  // ── 3. Single batched fetch of every active branch under the grouped
  //    merchants.  Avoids the per-category N+1 query that the legacy code
  //    path used (one findMany per fan-out).
  const allMerchantIds = groupedCategories.flatMap(([, merchants]) => merchants.map(m => m.id))
  const allBranches = await prisma.branch.findMany({
    where: { merchantId: { in: allMerchantIds }, isActive: true },
    select: RANK_BRANCH_SELECT,
  }) as RankBranchRow[]

  const branchesByMerchant = new Map<string, RankBranchRow[]>()
  for (const b of allBranches) {
    const list = branchesByMerchant.get(b.merchantId)
    if (list) list.push(b)
    else branchesByMerchant.set(b.merchantId, [b])
  }

  // ── 4. Per-category pipeline: split rankable/non-rankable, rank, apply
  //    strict NEARBY+CITY scope, append strict-locality tail, enrich.
  const rails: HomeNearbyCategoryRail[] = []
  for (const [catId, merchants] of groupedCategories) {
    const categoryBranches = merchants.flatMap(m => branchesByMerchant.get(m.id) ?? [])
    if (categoryBranches.length === 0) continue

    const rankable = categoryBranches.filter(b =>
      b.locationConfidence === 'MANUALLY_CONFIRMED'
      || b.locationConfidence === 'ADDRESS_GEOCODED'
    )
    const nonRankable = categoryBranches.filter(b =>
      b.locationConfidence === 'POSTCODE_CENTROID'
      || b.locationConfidence === 'NEEDS_REVIEW'
    )

    // Empty rankable subset → no local-tier supply possible. Skip the
    // category.  (The strict-locality tail alone cannot keep a category
    // alive — that mirrors the v1.2 Featured hide rule, applied here per
    // category.)
    if (rankable.length === 0) continue

    const v3 = rankBranchesV3(rankable.map(toRankInput), {
      effLoc,
      ladderProfile,
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount:    20,
      hardCap:        500,
    })

    const resolution = resolveScopeForHomeRail('nearbyByCategory', v3.rungCounts)
    const filteredTiles = v3.tiles.filter(t => resolution.retainedRungs.has(t.supplyRung))

    // No local-tier supply for this category → skip (absent from array).
    if (filteredTiles.length === 0) continue

    const headInputs: EnrichBranchInput[] = filteredTiles.map(t => ({
      branchId:      t.id,
      merchantId:    t.merchantId,
      supplyRung:    t.supplyRung,
      proximityBand: t.proximityBand,
      distance:      t.distanceMetres,
    }))

    const tailCandidates = nonRankable.map(b => {
      const exposed = exposeBranchPosition(b)
      const tailInput: EnrichBranchInput & {
        localityId:   string | null
        localityName: string | null
        postTown:     string | null
      } = {
        branchId:      b.id,
        merchantId:    b.merchantId,
        supplyRung:    null,
        proximityBand: null,
        distance:      null,
        localityId:    b.localityId,
        localityName:  b.localityName,
        postTown:      b.postTown,
      }
      void exposed
      return tailInput
    })

    const tailed = appendStrictLocalityTail(headInputs, tailCandidates, effLoc)
    const sliced = tailed.slice(0, NEARBY_CATEGORY_TAKE)

    const ctx: EnrichBranchCtx = {
      userId: null,
      lat:    effLoc.lat,
      lng:    effLoc.lng,
    }
    const enriched = await enrichBranchTiles(prisma, sliced as EnrichBranchInput[], ctx)

    const headerCategory = merchants[0]?.primaryCategory ?? { id: catId, name: '' }

    rails.push({
      category: { id: headerCategory.id, name: headerCategory.name },
      branches: enriched,
      meta: {
        locality:      locationCtx.locality,
        scope:         resolution.scope,
        scopeExpanded: resolution.scopeExpanded,
        rungCounts:    v3.rungCounts,
      },
    })
  }

  return rails
}
