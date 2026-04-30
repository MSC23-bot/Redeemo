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

const supplyTierSchema = z.enum(['NEARBY', 'CITY', 'DISTANT'])
export type SupplyTier = z.infer<typeof supplyTierSchema>

// Highlight tile-row shape — backend emits the full join-row including the
// nested tag object. Capped to 3 by the backend (`take: 3` on the Prisma
// select). Tile UI does not render these yet (deferred — see PR B M4 audit
// follow-ups), but the type round-trips correctly so future renderers can
// consume them without a schema migration.
const highlightSchema = z.object({
  id:             z.string(),
  highlightTagId: z.string(),
  sortOrder:      z.number(),
  tag: z.object({ id: z.string(), label: z.string() }),
})
export type MerchantTileHighlight = z.infer<typeof highlightSchema>

// Always-present-but-nullable fields use `.nullable()` (not `.nullable().optional()`)
// so consumers can rely on `T | null` rather than `T | null | undefined`.
// `.optional()` is reserved for fields the backend may omit entirely
// (e.g. `featuredId` is only set on home-feed featured tiles).
const merchantTileSchema = z.object({
  id:                  z.string(),
  businessName:        z.string(),
  tradingName:         z.string().nullable(),
  logoUrl:             z.string().nullable(),
  bannerUrl:           z.string().nullable(),
  primaryCategory: z.object({
    id:               z.string(),
    name:             z.string(),
    pinColour:        z.string().nullable(),
    pinIcon:          z.string().nullable(),
    descriptorSuffix: z.string().nullable().optional(),
    parentId:         z.string().nullable().optional(),
  }).nullable(),
  // primaryDescriptorTag is the curated tag (Cuisine / Specialty) the
  // descriptor is built from. Backend emits this on every tile. Used for
  // descriptor de-dup logic at the detail layer; tile UI doesn't read it
  // directly yet but it's part of the locked contract.
  primaryDescriptorTag: z.object({
    id:    z.string(),
    label: z.string(),
  }).nullable().optional(),
  subcategory: z.object({
    id:   z.string(),
    name: z.string(),
  }).nullable(),
  voucherCount:        z.number(),
  maxEstimatedSaving:  z.coerce.number().nullable(),
  distance:            z.number().nullable(),
  nearestBranchId:     z.string().nullable(),
  avgRating:           z.number().nullable(),
  reviewCount:         z.number(),
  isFavourited:        z.boolean(),
  supplyTier:          supplyTierSchema,
  descriptor:          z.string().nullable().optional(),
  highlights:          z.array(highlightSchema).optional(),
  // Set ONLY on tiles that came back from the home feed's `featured` array.
  // Search / category-merchants / in-area routes do NOT set this — featured
  // status is positional (which array the tile is in) for those routes.
  featuredId:          z.string().optional(),
})
export type MerchantTile = z.infer<typeof merchantTileSchema>

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
  descriptorState:     z.enum(['RECOMMENDED', 'OPTIONAL']).nullable().optional(),
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

const homeFeedResponseSchema = z.object({
  locationContext: locationContextSchema,
  featured:        z.array(merchantTileSchema),
  trending:        z.array(merchantTileSchema),
  campaigns:       z.array(campaignSchema),
  nearbyByCategory: z.array(z.object({
    category: z.object({ id: z.string(), name: z.string() }),
    merchants: z.array(merchantTileSchema),
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
})
export type DiscoveryMeta = z.infer<typeof discoveryMetaSchema>

// In-area meta envelope — narrower shape (no scope/scopeExpanded; in-area has
// no cascade). emptyStateReason narrows to 'none'|'no_uk_supply' in practice
// but the type stays compatible with the broader enum across discovery routes
// for client uniformity.
const inAreaMetaSchema = z.object({
  resolvedArea:     z.string(),
  nearbyCount:      z.number(),
  cityCount:        z.number(),
  distantCount:     z.number(),
  emptyStateReason: z.enum(['none', 'expanded_to_wider', 'no_uk_supply']),
})
export type InAreaMeta = z.infer<typeof inAreaMetaSchema>

const searchResponseSchema = z.object({
  merchants: z.array(merchantTileSchema),
  total:     z.number(),
  meta:      discoveryMetaSchema.optional(),
})
export type SearchResponse = z.infer<typeof searchResponseSchema>

const categoryMerchantsResponseSchema = z.object({
  merchants: z.array(merchantTileSchema),
  total:     z.number(),
  meta:      discoveryMetaSchema,
})
export type CategoryMerchantsResponse = z.infer<typeof categoryMerchantsResponseSchema>

const inAreaResponseSchema = z.object({
  merchants: z.array(merchantTileSchema),
  total:     z.number(),
  meta:      inAreaMetaSchema,
})
export type InAreaResponse = z.infer<typeof inAreaResponseSchema>

// Search query params. `scope` exposed as a user-controllable filter
// (decision: scope-control pill row in PR B). Not all backend params are
// surfaced — Distance/Min-Savings/Tag.label expansion are deferred.
export type SearchParams = {
  q?:                string
  categoryId?:       string
  subcategoryId?:    string
  lat?:              number
  lng?:              number
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
   * GET /api/v1/customer/discovery/in-area — Map bbox endpoint. Added to
   * the client contract in PR B; UI wiring lives in PR C.
   */
  async getInAreaMerchants(opts: {
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
