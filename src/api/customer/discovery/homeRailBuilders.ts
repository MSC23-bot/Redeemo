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
import type { LadderProfile, SupplyRung, ProximityBand } from '../../lib/ladderProfiles'
import type { EffectiveLocation } from '../../lib/effectiveLocation'
import { haversineMetres } from '../../shared/haversine'
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

// v1.8 (PR #126 device-QA-5 owner direction 2026-05-23) — distance thresholds
// for deriving a meaningful `proximityBand` on filler tiles.  v1.5 cascade +
// v1.7 top-up fillers skip the V3 ranker (the maxRung gate would drop them),
// so they previously emitted `proximityBand: null` → the customer-app
// <ProximityBandChip> rendered nothing for those tiles.  But fillers are the
// EXACT tiles where the chip helps users understand WHY a farther merchant
// is appearing.  v1.8 derives the band from haversine distance using the
// mapping below (mirrors the semantic intent of the V3 rung-based
// classification at `ladderProfiles.ts::getProximityBand`):
//
//   < 8 mi  (12 875 m)  → IN_YOUR_AREA       — reassuring (green chip)
//   < 25 mi (40 234 m)  → A_LITTLE_FURTHER   — warm    (amber chip)
//   >= 25 mi            → NEAREST_ON_REDEEMO — neutral (rose chip)
//
// Locked behaviour: NEARBY band is NEVER derived for fillers — by construction
// the local-first loop exhausted the genuinely NEARBY supply BEFORE fillers
// were considered, so claiming NEARBY on a filler would be dishonest.
const PROXIMITY_BAND_IN_AREA_M    = 12_875   // 8 mi  × 1609.344 m/mi rounded
const PROXIMITY_BAND_SHORT_TRIP_M = 40_234   // 25 mi × 1609.344 m/mi rounded

export function deriveFillerProximityBand(distanceMetres: number | null): ProximityBand | null {
  if (distanceMetres === null) return null
  if (distanceMetres < PROXIMITY_BAND_IN_AREA_M)    return 'IN_YOUR_AREA'
  if (distanceMetres < PROXIMITY_BAND_SHORT_TRIP_M) return 'A_LITTLE_FURTHER'
  return 'NEAREST_ON_REDEEMO'
}

// Merchant row shape used by the inclusion query — we need enough to fan
// out to branches with RANK_BRANCH_SELECT, plus primaryCategoryId +
// primaryCategory (with parent) for the per-category group + header copy.
// Locally declared so the builder doesn't depend on Prisma's generated
// type for MERCHANT_TILE_SELECT (which carries far more fields than we
// need here).
//
// v1.6 (PR #126 device-QA-4 2026-05-23): grouping is now parent-category
// based.  `primaryCategory.parent` is the rail header category when the
// merchant's primaryCategory is a subcategory; falls back to
// primaryCategory itself when the merchant's primaryCategory is already
// a top-level category.  The `parent?.id ?? id` collapse happens in
// the grouping step.
type NearbyCategoryMerchantRow = {
  id:                string
  businessName:      string
  primaryCategoryId: string | null
  primaryCategory:   {
    id:       string
    name:     string
    parentId: string | null
    parent:   { id: string; name: string } | null
  } | null
}

// v1.6 helper — given the merchant row, return the rail-grouping category
// (parent if subcategory; self if already top-level; null if merchant has
// no primaryCategory at all).  Used by both the local-first loop and the
// cascade fill loop so behaviour is identical.
function railGroupingCategory(
  m: NearbyCategoryMerchantRow,
): { id: string; name: string } | null {
  const pc = m.primaryCategory
  if (!pc) return null
  if (pc.parent) return { id: pc.parent.id, name: pc.parent.name }
  return { id: pc.id, name: pc.name }
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
  // ── 1. Inclusion: geographic-catchment merchant pool around effLoc.
  //
  // PR #126 device-QA Halifax fixup (2026-05-23): the legacy inclusion
  // pre-filtered by `branch.city === locationCtx.city` (case-insensitive
  // string match), but that excluded catchment/post-town merchants that
  // Featured + Trending DO surface via the V3 rank scope cascade.  A
  // Halifax user would see "Featured in Halifax" with Huddersfield
  // merchants (6-9mi catchment) AND "We're still growing in Halifax"
  // on the empty card — two rails honouring different locality concepts.
  //
  // Fix: bbox-filter merchant branches around `effLoc.lat/lng` so the
  // candidate pool matches what Featured + Trending consider as
  // "NEARBY+CITY tier reach".  Then per-category `rankBranchesV3` +
  // strict NEARBY+CITY scope (spec §6.3) decides what actually surfaces.
  //
  // BBOX_DEGREES = 0.3 mirrors the same pattern used by
  // `prisma/profile-nearest-locality-at4.ts` for nearest-locality lookup.
  // At UK latitudes this is ~21mi N/S × ~12-13mi E/W — comfortably wider
  // than the widest CATCHMENT + POST_TOWN reach in any LadderProfile.
  // The bbox is a coarse pre-filter; the V3 ranker + strict scope filter
  // handle the precise NEARBY+CITY classification.
  const BBOX_DEGREES = 0.3
  const merchantWhere = {
    status: MerchantStatus.ACTIVE,
    branches: {
      some: {
        isActive:  true,
        latitude:  { gte: effLoc.lat - BBOX_DEGREES, lte: effLoc.lat + BBOX_DEGREES },
        longitude: { gte: effLoc.lng - BBOX_DEGREES, lte: effLoc.lng + BBOX_DEGREES },
      },
    },
  }

  const merchantPool = await prisma.merchant.findMany({
    where:  merchantWhere,
    select: {
      id:                true,
      businessName:      true,
      primaryCategoryId: true,
      primaryCategory:   {
        select: {
          id:       true,
          name:     true,
          parentId: true,
          parent:   { select: { id: true, name: true } },
        },
      },
    },
    take: NEARBY_MERCHANT_POOL_TAKE,
  }) as NearbyCategoryMerchantRow[]
  // v1.5: don't early-return on empty local pool — fall through to cascade
  // fill (§6.3 step 2) so users with zero merchants in their bbox still
  // see UK-wide cascaded category rails ("local-first, not local-only").

  // ── 2. Group local pool by PARENT category id — cap 5 merchants per
  //    parent rail, cap 6 parent rails total.  v1.6 (PR #126 device-QA-4
  //    2026-05-23): leaf-category grouping in v1.5 produced one-merchant
  //    rails like "Nail Salon" / "Barber" / "Aesthetics Clinic" that made
  //    Home look thin in supply-sparse markets.  Parent grouping rolls
  //    these into a single dense "Beauty & Wellness" rail; the per-tile
  //    descriptor on `BranchTile.merchant.descriptor` still carries the
  //    leaf-level differentiator (Nail Salon, Barber, etc.).
  //
  //    Grouping key: `primaryCategory.parent?.id ?? primaryCategory.id`
  //    handles both subcategory primaries (most merchants) AND merchants
  //    whose primaryCategory is already top-level (collapsed to self).
  const byCategory: Record<string, NearbyCategoryMerchantRow[]> = {}
  for (const m of merchantPool) {
    const group = railGroupingCategory(m)
    if (!group) continue
    if (!byCategory[group.id]) byCategory[group.id] = []
    if (byCategory[group.id].length < NEARBY_CATEGORY_TAKE) byCategory[group.id].push(m)
  }
  const groupedCategories = Object.entries(byCategory).slice(0, NEARBY_MAX_CATEGORIES)
  // v1.5: again, no early-return — cascade-fill handles the empty case.

  // ── 3. Single batched fetch of every active branch under the grouped
  //    merchants.  Avoids the per-category N+1 query that the legacy code
  //    path used (one findMany per fan-out).
  const allMerchantIds = groupedCategories.flatMap(([, merchants]) => merchants.map(m => m.id))
  const allBranches = allMerchantIds.length > 0
    ? await prisma.branch.findMany({
        where: { merchantId: { in: allMerchantIds }, isActive: true },
        select: RANK_BRANCH_SELECT,
      }) as RankBranchRow[]
    : []

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

    // v1.6: header carries the PARENT category (or the merchant's
    // primaryCategory if it's already top-level).  The customer-app
    // `<RailHeader>` applies `homeCategoryRailLabel()` to produce the
    // display copy (e.g. "Food & drink picks").  Fallback to `catId`
    // when fixture data is incomplete in tests.
    const firstMerchant  = merchants[0]
    const headerCategory = firstMerchant ? railGroupingCategory(firstMerchant) : null
    const railCategory   = headerCategory ?? { id: catId, name: '' }

    rails.push({
      category: { id: railCategory.id, name: railCategory.name },
      branches: enriched,
      meta: {
        locality:      locationCtx.locality,
        scope:         resolution.scope,
        scopeExpanded: resolution.scopeExpanded,
        rungCounts:    v3.rungCounts,
      },
    })
  }

  // ── 4.5. v1.7 top-up (PR #126 device-QA-5 owner direction 2026-05-23).
  //
  // Brightlingsea finding: a parent category rail with thin local supply
  // (e.g. 1-2 Covelum branches in Food & Drink) DOES NOT need to suppress
  // the wider Redeemo Food & Drink supply — My Kerala in Ipswich is closer
  // and more useful than nothing.  Owner direction: rails with thin local
  // supply should TOP UP with closest wider merchants until full, while
  // the rail-level meta stays `scopeExpanded=false` (the local supply is
  // still genuinely local — the rail header doesn't lie).  The honesty
  // signal lives at the TILE level via the distance chip + (absent)
  // proximity band on the filler tiles.
  //
  // Rule:
  //   - Only top up rails with `0 < branches.length < NEARBY_CATEGORY_TAKE`.
  //   - Rails at the cap (5) get nothing.
  //   - Rails with zero local supply get the existing cascade-fill (Step 5
  //     below), which creates a NEW pure-cascade rail with scopeExpanded=true.
  //   - Filler ordering: distance-ASC across the entire eligible pool;
  //     appended to the END of the rail (local merchants stay first in
  //     their V3 rank order).
  //   - Filler `supplyRung` + `proximityBand`: null (the V3 ranker's
  //     maxRung gate would drop them; we skip V3 entirely for fillers
  //     and compute haversine direct — mirrors the cascade-fill loop
  //     below).
  //   - Filler dedup: exclude merchants already represented in the rail
  //     (per-merchant, by id) AND deduplicate fillers to ONE branch per
  //     merchant (variety over branch-density).
  //   - Mixed rails (some local + some cascade fillers) DO NOT contribute
  //     to <NearbyContextBanner> — banner fires only when at least one
  //     rail is PURE cascade.  This avoids "banner says we're still
  //     growing in {City}" when the user IS seeing local merchants on
  //     the rail.
  const railsNeedingTopUp = rails.filter(
    r => r.branches.length > 0 && r.branches.length < NEARBY_CATEGORY_TAKE,
  )
  if (railsNeedingTopUp.length > 0) {
    const topUpParentIds = railsNeedingTopUp.map(r => r.category.id)
    // Single batched fetch — every merchant whose primaryCategory is
    // either one of the top-up parent ids (top-level primary) OR has a
    // parent in the top-up set (subcategory primary, parent-rollup).
    const topUpPool = await prisma.merchant.findMany({
      where: {
        status:   MerchantStatus.ACTIVE,
        branches: { some: { isActive: true } },
        primaryCategory: {
          OR: [
            { id:       { in: topUpParentIds } },
            { parentId: { in: topUpParentIds } },
          ],
        },
      },
      select: {
        id:                true,
        businessName:      true,
        primaryCategoryId: true,
        primaryCategory:   {
          select: {
            id:       true,
            name:     true,
            parentId: true,
            parent:   { select: { id: true, name: true } },
          },
        },
      },
      take: 300,
    }) as NearbyCategoryMerchantRow[]

    // Group candidates by parent id (mirrors railGroupingCategory).
    const topUpByCat = new Map<string, NearbyCategoryMerchantRow[]>()
    for (const m of topUpPool) {
      const group = railGroupingCategory(m)
      if (!group) continue
      if (!topUpParentIds.includes(group.id)) continue
      if (!topUpByCat.has(group.id)) topUpByCat.set(group.id, [])
      topUpByCat.get(group.id)!.push(m)
    }

    for (const rail of railsNeedingTopUp) {
      const candidates = topUpByCat.get(rail.category.id) ?? []
      const slotsAvailable = NEARBY_CATEGORY_TAKE - rail.branches.length
      if (slotsAvailable <= 0 || candidates.length === 0) continue

      // Exclude merchants already in the rail's local-first slots
      // (BranchTile.merchant.id is the merchant id, not the branch id).
      const railMerchantIds = new Set(
        rail.branches.map(b => (b as { merchant: { id: string } }).merchant.id),
      )
      const eligibleMerchants = candidates.filter(c => !railMerchantIds.has(c.id))
      if (eligibleMerchants.length === 0) continue

      // Fetch branches for the eligible merchants.
      const eligibleMerchantIds = eligibleMerchants.map(m => m.id)
      const fillerBranches = await prisma.branch.findMany({
        where:  { merchantId: { in: eligibleMerchantIds }, isActive: true },
        select: RANK_BRANCH_SELECT,
      }) as RankBranchRow[]

      // v1.7: skip V3 ranker entirely (cross-region distances exceed the
      // maxRung gate); use haversine direct.  Only ADDRESS_GEOCODED /
      // MANUALLY_CONFIRMED branches can produce a numeric distance — the
      // POSTCODE_CENTROID + NEEDS_REVIEW non-rankable tail is OUT of scope
      // for v1.7 fillers (mixed-rail honesty: every filler tile must have
      // a real distance chip).  Non-rankable supply remains the local-tail
      // story for pure-local rails.
      const withDistance = fillerBranches
        .filter(b =>
          b.latitude !== null && b.longitude !== null
          && (b.locationConfidence === 'MANUALLY_CONFIRMED' || b.locationConfidence === 'ADDRESS_GEOCODED'),
        )
        .map(b => ({
          branch:   b,
          distance: haversineMetres(effLoc.lat, effLoc.lng, Number(b.latitude), Number(b.longitude)),
        }))

      withDistance.sort((a, b) => a.distance - b.distance)

      // One filler tile per merchant (variety > branch-density).
      const usedMerchantIds = new Set<string>()
      const fillerInputs:   EnrichBranchInput[] = []
      for (const { branch, distance } of withDistance) {
        if (fillerInputs.length >= slotsAvailable) break
        if (usedMerchantIds.has(branch.merchantId)) continue
        usedMerchantIds.add(branch.merchantId)
        fillerInputs.push({
          branchId:      branch.id,
          merchantId:    branch.merchantId,
          supplyRung:    null,
          // v1.8: derive band from distance so the customer-app chip
          // surfaces "In your area" / "A short trip away" / "Closest match
          // on Redeemo" on top-up fillers (was `null` in v1.7 → chip hidden).
          proximityBand: deriveFillerProximityBand(distance),
          distance,
        })
      }

      if (fillerInputs.length === 0) continue

      const ctx: EnrichBranchCtx = {
        userId: null,
        lat:    effLoc.lat,
        lng:    effLoc.lng,
      }
      const enrichedFillers = await enrichBranchTiles(prisma, fillerInputs, ctx)

      // Append fillers at the END of the rail.  Local-first ordering
      // preserved.  meta.scopeExpanded stays false (the local supply
      // is genuine; banner does not fire for mixed rails).
      ;(rail.branches as unknown[]).push(...enrichedFillers)
    }
  }

  // ── 5. Cascade fill (v1.5 — PR #126 device-QA-3 owner direction).
  //
  // Home is local-first, not local-only.  If the local-first loop above
  // produced < NEARBY_MAX_CATEGORIES rails, top up with UK-wide
  // cascaded category rails.  These render with `scopeExpanded: true`
  // and the customer-app `<RailHeader>` switches copy to
  // `{Category} on Redeemo` (β1).
  //
  // β7: cascade rails use the **permissive** tail (no strict-locality
  // identity gate) — the rail no longer claims locality, so the gate
  // doesn't apply.  Mirrors Featured cascade behaviour.
  //
  // Category selection: take the first `remaining` categories that
  // have UK-wide active-merchant supply NOT already in the local rails.
  // Order is Prisma findMany insertion order (matches local-loop
  // ordering; deterministic ordering is deferred to §DD).
  if (rails.length < NEARBY_MAX_CATEGORIES) {
    // v1.6: `usedCategoryIds` now contains PARENT category ids (the new
    // grouping key).  The legacy SQL `notIn` filter was leaf-keyed against
    // `Merchant.primaryCategoryId` — that no longer matches parent ids, so
    // dedup moved to the JS grouping step below.  The bbox + active-branch
    // filters stay in SQL; parent-keyed dedup runs after `railGroupingCategory`.
    const usedCategoryIds = new Set(rails.map(r => r.category.id))
    const remaining       = NEARBY_MAX_CATEGORIES - rails.length

    const cascadePool = await prisma.merchant.findMany({
      where: {
        status:   MerchantStatus.ACTIVE,
        branches: { some: { isActive: true } },
      },
      select: {
        id:                true,
        businessName:      true,
        primaryCategoryId: true,
        primaryCategory:   {
          select: {
            id:       true,
            name:     true,
            parentId: true,
            parent:   { select: { id: true, name: true } },
          },
        },
      },
      take: 200,
    }) as NearbyCategoryMerchantRow[]

    const cascadeByCat: Record<string, NearbyCategoryMerchantRow[]> = {}
    for (const m of cascadePool) {
      const group = railGroupingCategory(m)
      if (!group) continue
      // v1.6 JS-side dedup: skip merchants whose parent rail is already
      // filled by the local-first loop.
      if (usedCategoryIds.has(group.id)) continue
      if (!cascadeByCat[group.id]) cascadeByCat[group.id] = []
      if (cascadeByCat[group.id].length < NEARBY_CATEGORY_TAKE) cascadeByCat[group.id].push(m)
    }
    const cascadeCategories = Object.entries(cascadeByCat).slice(0, remaining)

    if (cascadeCategories.length > 0) {
      const cascadeMerchantIds = cascadeCategories.flatMap(([, ms]) => ms.map(m => m.id))
      const cascadeBranches = await prisma.branch.findMany({
        where:  { merchantId: { in: cascadeMerchantIds }, isActive: true },
        select: RANK_BRANCH_SELECT,
      }) as RankBranchRow[]

      const cascadeBranchesByMerchant = new Map<string, RankBranchRow[]>()
      for (const b of cascadeBranches) {
        const list = cascadeBranchesByMerchant.get(b.merchantId)
        if (list) list.push(b)
        else cascadeBranchesByMerchant.set(b.merchantId, [b])
      }

      for (const [catId, merchants] of cascadeCategories) {
        const categoryBranches = merchants.flatMap(m => cascadeBranchesByMerchant.get(m.id) ?? [])
        if (categoryBranches.length === 0) continue

        const rankable = categoryBranches.filter(b =>
          b.locationConfidence === 'MANUALLY_CONFIRMED'
          || b.locationConfidence === 'ADDRESS_GEOCODED'
        )
        const nonRankable = categoryBranches.filter(b =>
          b.locationConfidence === 'POSTCODE_CENTROID'
          || b.locationConfidence === 'NEEDS_REVIEW'
        )

        // v1.5 cascade path: SKIP rankBranchesV3 entirely.  Cross-region
        // distances (e.g. Manchester → Huddersfield = ~22mi = COUNTRY rung)
        // exceed the ladder profile's maxRung gate (REGION for URBAN
        // MIXED_NORMAL), so V3 would drop them.  Cascade is platform-claim
        // (β7 permissive); we just want haversine distance for sorting
        // + display.  supplyRung + proximityBand stay null (rail no longer
        // claims locality-tier; chips show distance only).
        const rankableWithDistance = rankable.map(b => ({
          branch:   b,
          distance: b.latitude !== null && b.longitude !== null
            ? haversineMetres(effLoc.lat, effLoc.lng, Number(b.latitude), Number(b.longitude))
            : null,
        }))

        // β5: distance ASC sort across all rankable branches.
        rankableWithDistance.sort((a, b) => {
          const da = a.distance ?? Number.POSITIVE_INFINITY
          const db = b.distance ?? Number.POSITIVE_INFINITY
          return da - db
        })

        const headInputs: EnrichBranchInput[] = rankableWithDistance.map(({ branch, distance }) => ({
          branchId:      branch.id,
          merchantId:    branch.merchantId,
          supplyRung:    null,
          // v1.8: derive band from distance for cascade-fill tiles (same
          // rationale as the v1.7 top-up call site above).  Was `null` in
          // v1.5/v1.6/v1.7 → chip hidden on the EXACT tiles where it'd
          // explain why the merchant is appearing far away.
          proximityBand: deriveFillerProximityBand(distance),
          distance,
        }))

        const tailInputs: EnrichBranchInput[] = nonRankable.map(b => {
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

        // β7: permissive tail (no strict-locality gate) — rail doesn't claim locality.
        const tailed = appendPermissiveTail(headInputs, tailInputs)
        const sliced = tailed.slice(0, NEARBY_CATEGORY_TAKE)
        if (sliced.length === 0) continue

        const ctx: EnrichBranchCtx = {
          userId: null,
          lat:    effLoc.lat,
          lng:    effLoc.lng,
        }
        const enriched = await enrichBranchTiles(prisma, sliced as EnrichBranchInput[], ctx)

        // v1.6: header carries the PARENT category (same rule as local loop).
        const firstMerchant  = merchants[0]
        const headerCategory = firstMerchant ? railGroupingCategory(firstMerchant) : null
        const railCategory   = headerCategory ?? { id: catId, name: '' }

        rails.push({
          category: { id: railCategory.id, name: railCategory.name },
          branches: enriched,
          meta: {
            locality:      locationCtx.locality,
            scope:         'platform',
            scopeExpanded: true,
            // Cascade rails don't produce rung counts (V3 skipped) — empty record.
            rungCounts:    { ...EMPTY_RUNG_COUNTS },
          },
        })

        if (rails.length >= NEARBY_MAX_CATEGORIES) break
      }
    }
  }

  return rails
}
