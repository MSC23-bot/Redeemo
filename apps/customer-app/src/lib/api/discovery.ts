import { z } from 'zod'
import { api } from '../api'

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

const branchLocationConfidenceSchema = z.enum([
  'MANUALLY_CONFIRMED', 'POSTCODE_CENTROID', 'NEEDS_REVIEW', 'ADDRESS_GEOCODED',
])
export type BranchLocationConfidence = z.infer<typeof branchLocationConfidenceSchema>

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

const branchTileSchema = z.object({
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

const locationContextSchema = z.object({
  city:   z.string().nullable(),
  source: z.enum(['coordinates', 'profile', 'none']),
})
export type LocationContext = z.infer<typeof locationContextSchema>

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
const homeFeedResponseSchema = z.object({
  locationContext: locationContextSchema,
  campaigns:       z.array(campaignSchema),
  // ─── Branch-first arms (canonical post Phase 2.3) ────────────────────
  featuredBranches:        z.array(branchTileSchema),
  trendingBranches:        z.array(branchTileSchema),
  nearbyByCategoryBranches: z.array(z.object({
    category: z.object({ id: z.string(), name: z.string() }),
    branches: z.array(branchTileSchema),
  })),
})
export type HomeFeedResponse = z.infer<typeof homeFeedResponseSchema>

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
})
export type DiscoveryMeta = z.infer<typeof discoveryMetaSchema>

// In-area meta envelope — narrower shape (no scope/scopeExpanded; in-area has
// no cascade). emptyStateReason narrows to 'none'|'no_uk_supply' in practice
// but the type stays compatible with the broader enum across discovery routes
// for client uniformity.
//
// In-area's effectiveLocality describes the locality at the VIEWPORT CENTRE
// (spec §5.7), NOT the user's saved area — pans-the-map contract.
const inAreaMetaSchema = z.object({
  resolvedArea:     z.string(),
  nearbyCount:      z.number(),
  cityCount:        z.number(),
  distantCount:     z.number(),
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
   */
  async getInAreaBranches(opts: {
    minLat:      number
    maxLat:      number
    minLng:      number
    maxLng:      number
    categoryId?: string
    lat?:        number
    lng?:        number
    limit?:      number
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
