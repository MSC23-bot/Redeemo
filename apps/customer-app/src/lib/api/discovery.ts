import { z } from 'zod'
import { api } from '../api'
// §DF-v2-j Task 3 hoist (2026-05-26) — `locationContextSchema` moved to
// the shared file so all Discovery surface schemas can share one definition.
// `LocationContext` type re-exported below so existing consumers
// (e.g. `SavedAreaHonestyHint`) keep working without import-path churn.
import { locationContextSchema } from './shared/location'
export type { LocationContext } from './shared/location'

// ─── Plan 1.5 contract types ──────────────────────────────────────────────────
//
// Customer-facing Discovery API client. Consumes the post-Plan-1.5 backend
// contract (supplyTier on every tile, meta envelope with tier counts +
// emptyStateReason, parameter-less /categories, dedicated /discovery/in-area
// route, /categories/:id/amenities for FilterSheet eligibility).
//
// What this client deliberately does NOT support (per PR B scope):
//   - location-model fields beyond branch.city (Plan 4 territory)
//   - Tag.label search expansion (deferred to Search v2)
//   - Distance / Min Savings filters (deferred to Plan 2)
//   - Map filter button wiring (PR C)
// See docs/superpowers/plans/2026-04-30-customer-app-pr4-remediation.md.

// ─── Plan 4 M3 additive types (customer-app side of M3.5) ────────────────────
//
// New tile + meta fields the backend started returning in M3.3 (hybrid:
// legacy `rankMerchants` for inclusion/order + V2 alongside for these new
// fields). Every M3 field is `.optional()` AND `.nullable()` so:
//   - older mock responses + test fixtures that don't include them still parse
//   - hybrid responses where V2 rejected the merchant (POSTCODE_CENTROID etc.)
//     parse with the value as null
//   - no UI consumer is required yet (M3b ships rendering)
//
// See backend src/api/lib/ladderProfiles.ts for the canonical enum lists.
// If the backend ever adds a new rung or band, this file is the customer-app
// side that must update before any new value reaches the UI.

const supplyRungSchema = z.enum([
  'NEARBY', 'CATCHMENT', 'POST_TOWN', 'LAD',
  'COUNTY', 'REGION', 'COUNTRY', 'NATIONAL',
])
export type SupplyRung = z.infer<typeof supplyRungSchema>

const proximityBandSchema = z.enum([
  'NEARBY', 'IN_YOUR_AREA', 'A_LITTLE_FURTHER', 'NEAREST_ON_REDEEMO',
])
export type ProximityBand = z.infer<typeof proximityBandSchema>

// 8-rung counter object on search/category/in-area `meta`. Backend always
// emits all 8 keys (zeros included), but the field itself is `.optional()`
// on the meta envelope so older mock responses don't break.
const rungCountsSchema = z.object({
  NEARBY:    z.number(),
  CATCHMENT: z.number(),
  POST_TOWN: z.number(),
  LAD:       z.number(),
  COUNTY:    z.number(),
  REGION:    z.number(),
  COUNTRY:   z.number(),
  NATIONAL:  z.number(),
})
export type RungCounts = z.infer<typeof rungCountsSchema>

const effectiveLocalitySchema = z.object({
  id:   z.string(),
  name: z.string(),
})
export type EffectiveLocality = z.infer<typeof effectiveLocalitySchema>

// ─── Discovery Rebaseline PR-2 — BranchTile wire shape ────────────────────────
//
// Source of truth: docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md §1.1.
// Mirrors the backend `branchTileSchema` at
// `src/api/customer/discovery/branchTileSchema.ts` — same field set, same
// `.strict()` discipline (locality-only contract; `branchAddressLine1/2` /
// `branchPostcode` MUST NOT appear).
//
// NOTE on naming: this `BranchTile` is the DISCOVERY wire-tile shape
// (Phase 1 Spec §1.1) — strict, no street address.  There is a
// separate `BranchTile` in `apps/customer-app/src/lib/api/merchant.ts:118`
// that's the Merchant Profile branch-picker shape (richer; has phone,
// email, isMainBranch, etc.).  They coexist by per-file import
// discipline — Discovery code imports from `@/lib/api/discovery`,
// Merchant Profile code imports from `@/lib/api/merchant`.

// Forward-compat hardening: parse as an OPEN `z.string()` (not a closed `z.enum`)
// so a future backend confidence value does NOT make already-installed app builds
// reject the whole discovery payload. Backend enum values today are
// MANUALLY_CONFIRMED / POSTCODE_CENTROID / NEEDS_REVIEW / ADDRESS_GEOCODED, with the
// planned MERCHANT_CONFIRMED joining the customer-visible confirmed set. App builds
// ship through the store on a slow cadence; the backend ships in hours, so a closed
// enum here is a release-ordering hazard: a MERCHANT_CONFIRMED branch reaching an
// older build would degrade the feed. This tolerance MUST be in the field ahead of
// the backend enum addition. Matches the `z.string()` idiom already used for the same
// field in `favourites.ts`. See the Slice 3 addendum §3.3 (option A, recommended):
// docs/superpowers/specs/2026-07-09-loc-slice-3-pin-drop-addendum.md
// No customer-app consumer branches on this value (redaction of position happens
// upstream on the backend), so widening the parse type has no UI risk.
const branchLocationConfidenceSchema = z.string()
// Known-value union preserved for editor hints / documentation while the parser
// tolerates any string. `(string & {})` keeps autocomplete for the known values
// without rejecting unknown future ones.
export type BranchLocationConfidence =
  | 'MANUALLY_CONFIRMED'
  | 'POSTCODE_CENTROID'
  | 'NEEDS_REVIEW'
  | 'ADDRESS_GEOCODED'
  | 'MERCHANT_CONFIRMED'
  | (string & {})

const branchTileCategorySummarySchema = z.object({
  id:               z.string(),
  name:             z.string(),
  pinColour:        z.string().nullable().optional(),
  pinIcon:          z.string().nullable().optional(),
  descriptorSuffix: z.string().nullable().optional(),
  parentId:         z.string().nullable(),
  intentType:       z.enum(['LOCAL', 'DESTINATION', 'MIXED']).nullable().optional(),
}).strict().nullable()

const branchTileDescriptorTagSummarySchema = z.object({
  id:    z.string(),
  label: z.string(),
}).strict().nullable()

const branchTileHighlightSchema = z.object({
  highlightTagId: z.string(),
  label:          z.string(),
}).strict()

const branchTileMerchantGroupingSchema = z.object({
  id:                   z.string(),
  businessName:         z.string(),
  tradingName:          z.string().nullable(),
  logoUrl:              z.string().nullable(),
  bannerUrl:            z.string().nullable(),
  primaryCategory:      branchTileCategorySummarySchema,
  primaryDescriptorTag: branchTileDescriptorTagSummarySchema,
  subcategory:          branchTileCategorySummarySchema,
  descriptor:           z.string(),
  highlights:           z.array(branchTileHighlightSchema),
  voucherCount:         z.number().int().nonnegative(),
  maxEstimatedSaving:   z.coerce.number().nullable(),
  // PR #112 device-QA fixup-3 (2026-05-19) — sum of estimatedSaving
  // across active+approved vouchers for this merchant.  Drives the
  // Search card "N offers · £X.XX total value" pill on multi-offer
  // merchants.  ADDITIVE — maxEstimatedSaving is NOT overloaded.
  totalEstimatedSaving: z.coerce.number().nullable(),
}).strict()

export const branchTileSchema = z.object({
  id:                       z.string(),                          // branch.id — load-bearing for tile key + navigation
  branchName:               z.string(),
  branchLocalityId:         z.string().nullable(),
  branchLocalityName:       z.string().nullable(),
  branchPostTown:           z.string().nullable(),
  branchCity:               z.string().nullable(),
  branchLatitude:           z.number().nullable(),
  branchLongitude:          z.number().nullable(),
  branchLocationConfidence: branchLocationConfidenceSchema,
  isOpenNow:                z.boolean(),
  closesAtLocal:            z.string().nullable(),
  distance:                 z.number().nullable(),               // metres
  isFavourited:             z.boolean(),
  avgRating:                z.number().nullable(),               // BRANCH-level
  reviewCount:              z.number().int().nonnegative(),      // BRANCH-level
  supplyRung:               supplyRungSchema.nullable(),
  proximityBand:            proximityBandSchema.nullable(),
  distanceMetres:           z.number().nullable(),
  merchant:                 branchTileMerchantGroupingSchema,
  // §CD v1 (2026-05-22) — voucher keyword search.  Non-null when the
  // merchant surfaced because the user's query matched a curated
  // voucher's title or description AND no other strong merchant-content
  // path explained the match.  Customer-app SearchResultItem renders
  // the locked copy `Found in "<voucherTitle>" voucher`.  `.nullable()`
  // on the wire; `.optional()` so older mock fixtures still parse.
  matchContext:             z.string().nullable().optional(),
}).strict()
export type BranchTile = z.infer<typeof branchTileSchema>

const categorySchema = z.object({
  id:                  z.string(),
  name:                z.string(),
  iconUrl:             z.string().nullable().optional(),
  illustrationUrl:     z.string().nullable().optional(),
  parentId:            z.string().nullable(),
  pinColour:           z.string().nullable().optional(),
  pinIcon:             z.string().nullable().optional(),
  sortOrder:           z.number().optional(),
  intentType:          z.enum(['LOCAL', 'DESTINATION', 'MIXED']).nullable().optional(),
  // Backend currently emits 'RECOMMENDED' / 'OPTIONAL' / 'HIDDEN' / null
  // (verified live 2026-05-21 — 4 of 20 top-level categories returned
  // 'HIDDEN', e.g. "Barber"). The 'HIDDEN' member was missing from the
  // enum, causing every customer-app categories parse to fail. Schema
  // tolerates the value here; FILTERING categories by HIDDEN is a
  // product-semantics decision deliberately out-of-scope for this
  // hotfix (locked 2026-05-21).
  descriptorState:     z.enum(['RECOMMENDED', 'OPTIONAL', 'HIDDEN']).nullable().optional(),
  descriptorSuffix:    z.string().nullable().optional(),
  // merchantCountByCity is a JSON map keyed by city name. PR B does not
  // surface this in the AllCategoriesScreen UI (decision #5 — broken count
  // line removed); kept on the type for completeness + future Plan 4 use.
  merchantCountByCity: z.record(z.string(), z.number()).nullable().optional(),
})
export type Category = z.infer<typeof categorySchema>

const eligibleAmenitySchema = z.object({
  id:       z.string(),
  name:     z.string(),
  iconUrl:  z.string().nullable().optional(),
  isActive: z.boolean(),
})
export type EligibleAmenity = z.infer<typeof eligibleAmenitySchema>

// `locationContextSchema` + `LocationContext` hoisted to ./shared/location
// per §DF-v2-j Task 3.  See imports at the top of this file.

// Campaign tile shape on the home feed. `bannerImageUrl` matches the Prisma
// Campaign field (NOT the older `bannerUrl` PR #4 invented). gradientStart/
// gradientEnd/ctaText are NOT in the current backend select — kept as
// optional for forward compatibility; CampaignCarousel falls back to default
// gradients when absent.
const campaignSchema = z.object({
  id:             z.string(),
  name:           z.string(),
  description:    z.string().nullable(),
  bannerImageUrl: z.string().nullable(),
  gradientStart:  z.string().nullable().optional(),
  gradientEnd:    z.string().nullable().optional(),
  ctaText:        z.string().nullable().optional(),
})
export type CampaignTile = z.infer<typeof campaignSchema>

// Phase 3a (per plan §0.12) — customer-app schema no longer declares the
// legacy merchant arm (`featured`, `trending`, `nearbyByCategory`); wire
// still emits both shapes for customer-web back-compat; Zod strips legacy
// keys at parse here. `inAreaResponseSchema.meta` is the only legacy-shape
// field still declared, and only because it's load-bearing for Map default
// mode.
//
// Backend emits `featuredBranches`, `trendingBranches`, and
// `nearbyByCategoryBranches` on every home-feed response
// (`src/api/customer/discovery/service.ts:1447-1449`). Phase 2.3
// carousels (FeaturedCarousel / TrendingSection / NearbyByCategory)
// consume the `*Branches` arms. Phase 2.5 shipped the shared
// `<BranchTile>` rename; carousels now render <BranchTile branch={branch}/>
// directly.

// ─── Phase B.2 — Home Relevance new envelope shape ───────────────────────────
//
// Spec §5 + plan v1.1 Hard Invariant. Adds NON-COLLIDING rail envelopes
// (`featuredRail` / `trendingRail` / `popularRail` /
// `nearbyByCategoryRails`) alongside the existing branch-themed legacy
// arms. Each rail carries an optional `meta` describing per-rail scope,
// cascade state, supply-rung histogram, and effective locality.
//
// `meta` is `.nullable()` because rails without a meaningful scope
// envelope (e.g. cohort-based Popular fallbacks or future variants) may
// emit `null` rather than synthesising fake counts.
//
// `rungCounts` uses `z.record(z.string(), z.number())` rather than the
// canonical 8-rung `rungCountsSchema` so the wire can emit a sparse map
// (only rungs that contributed) — the builder side decides whether to
// fill zeros.  The render side is tolerant either way.
const homeRailMetaSchema = z.object({
  locality:      z.object({ id: z.string(), name: z.string() }).nullable(),
  scope:         z.enum(['nearby', 'city', 'platform']),
  scopeExpanded: z.boolean(),
  rungCounts:    z.record(z.string(), z.number()),
}).nullable()
export type HomeRailMeta = z.infer<typeof homeRailMetaSchema>

const homeRailSchema = z.object({
  branches: z.array(branchTileSchema),
  meta:     homeRailMetaSchema,
})
export type HomeRail = z.infer<typeof homeRailSchema>

const homeNearbyCategoryRailSchema = z.object({
  category: z.object({ id: z.string(), name: z.string() }),
  branches: z.array(branchTileSchema),
  meta:     homeRailMetaSchema,
})
export type HomeNearbyCategoryRail = z.infer<typeof homeNearbyCategoryRailSchema>

// Schema preserves the legacy branch-themed arms (`featuredBranches`,
// `trendingBranches`, `nearbyByCategoryBranches`) AS REQUIRED through the
// additive period — backend continues emitting them per Hard Invariant.
// The new rail envelopes are `.optional()` while Phase C–F roll out the
// builders; once every rail has shipped under the new shape the legacy
// arms relax to `.optional()` and customer-app stops reading them per
// Phase G.
export const homeFeedResponseSchema = z.object({
  locationContext: locationContextSchema,
  campaigns:       z.array(campaignSchema),
  // ─── NEW additive envelopes (non-colliding names per v1.1 plan) ──────
  featuredRail:          homeRailSchema.optional(),
  trendingRail:          homeRailSchema.optional(),
  popularRail:           homeRailSchema.optional(),
  nearbyByCategoryRails: z.array(homeNearbyCategoryRailSchema).optional(),
  // ─── Branch-first arms (canonical post Phase 2.3) ────────────────────
  featuredBranches:        z.array(branchTileSchema),
  trendingBranches:        z.array(branchTileSchema),
  nearbyByCategoryBranches: z.array(z.object({
    category: z.object({ id: z.string(), name: z.string() }),
    branches: z.array(branchTileSchema),
  })),
})
export type HomeFeedResponse = z.infer<typeof homeFeedResponseSchema>

// ─── Plan 4 M4.2 / M4.3 additive: searchChip ────────────────────────────────
//
// Customer-facing search-mode indicator emitted by `searchBranches` when
// the user query resolved to either a known Locality (PLACE) or a
// curated `Tag.label` (TAG).  Drives the customer-app SearchScreen
// header-copy variants per §M4-AMENDMENT-2026-05-22 A1 Path 5b (no
// new `<SearchChip>` component — the existing unified header
// extends to PLACE / TAG modes).  Minimal wire shape per A6 —
// no Locality id / populationTier / Tag type yet.
//
// `.nullable().optional()` so:
//   - older mocks / pre-M4.2 fixtures still parse (key absent → undefined)
//   - non-PLACE / non-TAG queries set the field explicitly to `null`
const searchChipSchema = z.object({
  mode:  z.enum(['PLACE', 'TAG']),
  label: z.string(),
})
export type SearchChip = z.infer<typeof searchChipSchema>

// Discovery `meta` envelope (search + getCategoryMerchants).
const discoveryMetaSchema = z.object({
  scope:            z.enum(['nearby', 'city', 'region', 'platform']),
  resolvedArea:     z.string(),
  scopeExpanded:    z.boolean(),
  nearbyCount:      z.number(),
  cityCount:        z.number(),
  distantCount:     z.number(),
  emptyStateReason: z.enum(['none', 'expanded_to_wider', 'no_uk_supply']),
  // ─── Plan 4 M3 additive meta fields ────────────────────────────────
  // rungCounts: 8-rung distribution of V2-classified merchants only.
  // Legacy nearbyCount/cityCount/distantCount remain authoritative for
  // POSTCODE_CENTROID-inclusive bucketing during the hybrid phase.
  // effectiveLocality: present when the backend's resolveEffectiveLocation
  // returned a UK locality from the request's GPS/saved-profile/place query.
  // Both `.optional()` so pre-M3 mock fixtures still parse.
  rungCounts:        rungCountsSchema.optional(),
  effectiveLocality: effectiveLocalitySchema.nullable().optional(),
  // ─── Plan 4 M4.2 / M4.3 additive ──────────────────────────────────
  searchChip:        searchChipSchema.nullable().optional(),
})
export type DiscoveryMeta = z.infer<typeof discoveryMetaSchema>

// In-area meta envelope — narrower shape (no scope/scopeExpanded; in-area has
// no cascade). emptyStateReason narrows to 'none'|'no_uk_supply' in practice
// but the type stays compatible with the broader enum across discovery routes
// for client uniformity.
//
// Map in-area reliability slice — `branchesOnly=1` mode answers from the
// branch arm alone (no `getInAreaMerchants` call), so `resolvedArea` /
// `nearbyCount` / `cityCount` / `distantCount` (merchant-arm-derived) are
// absent on that response. Loosened to `.optional()`; Map itself never
// reads them (see mapDataView.ts / MapScreen — only `emptyStateReason` and
// `effectiveLocality` drive Map UI). Legacy (branchesOnly absent/false)
// responses still emit all four; this widening is additive/back-compat.
//
// In-area's effectiveLocality describes the locality at the VIEWPORT CENTRE
// (spec §5.7), NOT the user's saved area — pans-the-map contract.
const inAreaMetaSchema = z.object({
  resolvedArea:     z.string().optional(),
  nearbyCount:      z.number().optional(),
  cityCount:        z.number().optional(),
  distantCount:     z.number().optional(),
  emptyStateReason: z.enum(['none', 'expanded_to_wider', 'no_uk_supply']),
  rungCounts:        rungCountsSchema.optional(),
  effectiveLocality: effectiveLocalitySchema.nullable().optional(),
})
export type InAreaMeta = z.infer<typeof inAreaMetaSchema>

// Phase 3a (per plan §0.12) — customer-app schema no longer declares the
// legacy merchant arm (`merchants`, `total`, `meta`); wire still emits both
// shapes for customer-web back-compat; Zod strips legacy keys at parse here.
//
// `branchMeta` carries branch-aligned counts + emptyStateReason +
// resolvedArea. SearchScreen MUST read `branchMeta` (not `meta`) for counts
// + empty-state copy; otherwise scope pills show merchant-tier counts while
// the list renders branches — the owner-observed split that caused misleading
// "UK-wide · 1" pills alongside an empty branch list.
const searchResponseSchema = z.object({
  branches:      z.array(branchTileSchema).optional(),
  totalBranches: z.number().optional(),
  branchMeta:    discoveryMetaSchema.optional(),
  // §DF-v2-j Task 7 (2026-05-26) — additive locationContext emit landed
  // backend-side in Task 4.  `.optional()` during the rollout window so
  // any cold-cache / pre-deploy responses still parse.  Task 10 consumes
  // this on SearchScreen to drive <LocationStatusLabel> + retires the
  // existing client-side savedAreaCity derivation.
  locationContext: locationContextSchema.optional(),
})
export type SearchResponse = z.infer<typeof searchResponseSchema>

// Phase 3a (per plan §0.12) — customer-app schema no longer declares the
// legacy merchant arm (`merchants`, `total`, `meta`); wire still emits both
// shapes for customer-web back-compat; Zod strips legacy keys at parse here.
//
// `branchMeta` carries branch-aligned counts + emptyStateReason + scope +
// resolvedArea. `CategoryResultsScreen` MUST read `branchMeta` (not `meta`)
// for counts + empty-state copy when rendering branches; otherwise scope
// pills show merchant-tier counts while the list renders branches — the
// owner-observed split that caused misleading "Nearby · 0" pills alongside
// a non-empty branch list. Mirrors the /search precedent.
const categoryMerchantsResponseSchema = z.object({
  branches:      z.array(branchTileSchema),
  totalBranches: z.number(),
  branchMeta:    discoveryMetaSchema.optional(),
  // §DF-v2-j Task 7 (2026-05-26) — forward-compat additive field.
  // Backend does NOT yet emit `locationContext` on /categories/:id/merchants
  // (out of scope for this PR per audit §9).  `.optional()` keeps the
  // schema future-proof so a later backend emit doesn't require a
  // customer-app schema change.
  locationContext: locationContextSchema.optional(),
})
export type CategoryMerchantsResponse = z.infer<typeof categoryMerchantsResponseSchema>

const inAreaResponseSchema = z.object({
  // Phase 3a (§0.12(a)) — `.meta` STAYS load-bearing. mapDataView.ts:63
  // reads `d?.branchMeta ?? d?.meta`; InAreaResponse has NO `branchMeta`
  // on the wire, so `.meta` is the SINGLE coherent envelope for Map's
  // default in-area mode. Removing it would break <MapEmptyArea>
  // empty-state classification and <ViewportLocalityBadge>.
  // `merchants` and `total` are deleted (zero source consumers — Map
  // reads `branches` only post Phase 2.2).
  meta:      inAreaMetaSchema,
  branches:  z.array(branchTileSchema).optional(),
  // §DF-v2-j Task 7 (2026-05-26) — additive user-context envelope.
  // Backend emit landed in Task 5.  Per spec D10 + audit §4 (the in-area
  // route note): `locationContext` describes the USER's effective
  // location identity; `meta.effectiveLocality` (above) describes the
  // panned-to viewport.  The two fields are intentionally separate —
  // consumers read whichever they need.  `.optional()` during rollout.
  locationContext: locationContextSchema.optional(),
})
export type InAreaResponse = z.infer<typeof inAreaResponseSchema>

// Search query params. `scope` exposed as a user-controllable filter
// (decision: scope-control pill row in PR B). Not all backend params are
// surfaced — Distance/Min-Savings/Tag.label expansion are deferred.
//
// Bounding-box params (minLat / maxLat / minLng / maxLng) are accepted by
// the backend search route and used by Map (PR C M2) when non-scope
// filters are active so we can keep viewport scoping while routing
// through /search to gain sortBy / voucherTypes / amenityIds / openNow.
export type SearchParams = {
  q?:                string
  categoryId?:       string
  subcategoryId?:    string
  lat?:              number
  lng?:              number
  minLat?:           number
  maxLat?:           number
  minLng?:           number
  maxLng?:           number
  scope?:            'nearby' | 'city' | 'platform'   // 'region' reserved, not surfaced
  voucherTypes?:     string[]
  amenityIds?:       string[]
  openNow?:          boolean
  sortBy?:           'relevance' | 'nearest' | 'top_rated' | 'highest_saving'
  topRated?:         boolean
  featured?:         boolean
  limit?:            number
  offset?:           number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildQuery(params: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      if (value.length > 0) parts.push(`${key}=${value.join(',')}`)
    } else if (typeof value === 'boolean') {
      parts.push(`${key}=${value}`)
    } else {
      parts.push(`${key}=${encodeURIComponent(String(value))}`)
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

// ─── Client ──────────────────────────────────────────────────────────────────

export const discoveryApi = {
  /**
   * GET /api/v1/customer/home — home feed with featured/trending/campaigns
   * /nearbyByCategory. Optional lat/lng for location context.
   */
  async getHomeFeed(opts: { lat?: number; lng?: number } = {}): Promise<HomeFeedResponse> {
    const qs = buildQuery({ lat: opts.lat, lng: opts.lng })
    const res = await api.get<unknown>(`/api/v1/customer/home${qs}`)
    return homeFeedResponseSchema.parse(res)
  },

  /**
   * GET /api/v1/customer/search — text/category/tag search with the post-
   * Plan-1.5 meta envelope. Backend requires q OR categoryId OR bbox.
   */
  async searchMerchants(params: SearchParams): Promise<SearchResponse> {
    const qs = buildQuery(params as Record<string, unknown>)
    const res = await api.get<unknown>(`/api/v1/customer/search${qs}`)
    return searchResponseSchema.parse(res)
  },

  /**
   * GET /api/v1/customer/categories — parameter-less. Top-levels always;
   * subcategories filtered to ≥1 active UK merchant.
   */
  async getCategories(): Promise<{ categories: Category[] }> {
    const res = await api.get<unknown>('/api/v1/customer/categories')
    return z.object({ categories: z.array(categorySchema) }).parse(res)
  },

  /**
   * GET /api/v1/customer/categories/:id/merchants — paginated category
   * browse with intent-aware ranking + scope cascade.
   */
  async getCategoryMerchants(
    id: string,
    opts: {
      scope?:  'nearby' | 'city' | 'platform'
      lat?:    number
      lng?:    number
      limit?:  number
      offset?: number
    } = {},
  ): Promise<CategoryMerchantsResponse> {
    const qs = buildQuery(opts as Record<string, unknown>)
    const res = await api.get<unknown>(`/api/v1/customer/categories/${id}/merchants${qs}`)
    return categoryMerchantsResponseSchema.parse(res)
  },

  /**
   * GET /api/v1/customer/discovery/in-area — Map bbox endpoint. Backend
   * emits both `merchants[]` (legacy) and `branches[]` (Discovery
   * Rebaseline Phase 1, PR #110) in the same response. Renamed from
   * `getInAreaMerchants` to `getInAreaBranches` during PR-3 (Discovery
   * Rebaseline Phase 2.2) for naming consistency with the branch-first
   * surface migration. Endpoint URL unchanged.
   *
   * Map in-area reliability slice — `branchesOnly: 1` opts the caller into
   * the branch-arm-only response (skips the backend's UK-wide merchant
   * findMany + rank + enrich). Sent literally as `1` (not `true`/`false`)
   * to sidestep the `z.coerce.boolean()` route-schema gotcha where the
   * string `"false"` would coerce to `true`; this endpoint is opt-in-only
   * so the param is either present-as-`1` or absent, never `false`.
   */
  async getInAreaBranches(opts: {
    minLat:       number
    maxLat:       number
    minLng:       number
    maxLng:       number
    categoryId?:  string
    lat?:         number
    lng?:         number
    limit?:       number
    branchesOnly?: 1
  }): Promise<InAreaResponse> {
    const qs = buildQuery(opts as Record<string, unknown>)
    const res = await api.get<unknown>(`/api/v1/customer/discovery/in-area${qs}`)
    return inAreaResponseSchema.parse(res)
  },

  /**
   * GET /api/v1/customer/categories/:id/amenities — FilterSheet eligibility
   * (subcategory rules ∪ parent rules, isActive=true, deduped, sorted).
   */
  async getEligibleAmenities(categoryId: string): Promise<{ amenities: EligibleAmenity[] }> {
    const res = await api.get<unknown>(`/api/v1/customer/categories/${categoryId}/amenities`)
    return z.object({ amenities: z.array(eligibleAmenitySchema) }).parse(res)
  },
}
