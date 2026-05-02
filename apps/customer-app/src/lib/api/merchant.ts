import { z } from 'zod'
import { api } from '../api'

// Shape served by `GET /api/v1/customer/merchants/:id`. Generated server-side
// in `src/api/customer/discovery/service.ts:getCustomerMerchant`. Field
// presence + nullability mirrored exactly. `estimatedSaving` is coerced
// from Prisma Decimal to number server-side; we read it as number here.
//
// Voucher detail / branch redemption / favourite toggle live on separate
// endpoints (covered in their own clients / future PRs). This module is
// scoped to the merchant detail read path that Merchant Profile consumes.

// Prisma `BranchOpeningHours` declares both `openTime` and `closeTime` as
// nullable (`String?`). The backend select returns whatever's in the DB —
// so closed days legally come back as `{ isClosed: true, openTime: null,
// closeTime: null }`. PR #28's earlier `z.string()` schema rejected those
// payloads at the API edge before the consumer (useOpenStatus) could even
// see them. Field-level nullability fixes the contract; consumers are
// already defensive about isClosed.
const openingHourEntrySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openTime:  z.string().nullable(),    // "HH:MM" or null on closed days
  closeTime: z.string().nullable(),    // "HH:MM" or null on closed days
  isClosed:  z.boolean(),
})
export type OpeningHourEntry = z.infer<typeof openingHourEntrySchema>

const amenitySchema = z.object({
  id:      z.string(),
  name:    z.string(),
  iconUrl: z.string().nullable().optional(),
})
export type Amenity = z.infer<typeof amenitySchema>

// Highlight items come from the server's Prisma include
// `highlights: { include: { tag: { select: { id, label } } } }` —
// each row is the full MerchantHighlight model with the tag relation
// nested. Label lives at `.tag.label`, NOT at the top level. UI consumers
// (when M2 lands) read via `highlight.tag.label`.
const merchantHighlightSchema = z.object({
  id:             z.string(),
  merchantId:     z.string(),
  highlightTagId: z.string(),
  sortOrder:      z.number().int(),
  tag: z.object({
    id:    z.string(),
    label: z.string(),
  }),
})
export type MerchantHighlight = z.infer<typeof merchantHighlightSchema>

const subcategoryRefSchema = z.object({ id: z.string(), name: z.string() })

const primaryCategorySchema = z.object({
  id:               z.string(),
  name:             z.string(),
  pinColour:        z.string().nullable().optional(),
  pinIcon:          z.string().nullable().optional(),
  descriptorSuffix: z.string().nullable().optional(),
  parentId:         z.string().nullable(),
})
export type PrimaryCategory = z.infer<typeof primaryCategorySchema>

const merchantVoucherSchema = z.object({
  id:              z.string(),
  title:           z.string(),
  type:            z.string(),                        // VoucherType enum string
  description:     z.string().nullable(),
  terms:           z.string().nullable(),
  imageUrl:        z.string().nullable(),
  estimatedSaving: z.coerce.number(),                 // Prisma Decimal → number
  expiryDate:      z.string().nullable(),             // ISO
})
export type MerchantVoucher = z.infer<typeof merchantVoucherSchema>

const branchTileSchema = z.object({
  id:           z.string(),
  name:         z.string(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city:         z.string().nullable(),
  postcode:     z.string().nullable(),
  latitude:     z.number().nullable(),
  longitude:    z.number().nullable(),
  phone:        z.string().nullable(),
  email:        z.string().nullable(),
  distance:     z.number().nullable(),                // metres
  isOpenNow:    z.boolean(),
  avgRating:    z.number().nullable(),
  reviewCount:  z.number(),
})
export type BranchTile = z.infer<typeof branchTileSchema>
// Alias kept for cefaf45 component imports during M2 salvage. New code
// should use `BranchTile` directly.
export type BranchDetail = BranchTile

const nearestBranchSchema = z.object({
  id:           z.string(),
  name:         z.string(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city:         z.string().nullable(),
  postcode:     z.string().nullable(),
  latitude:     z.number().nullable(),
  longitude:    z.number().nullable(),
  phone:        z.string().nullable(),
  email:        z.string().nullable(),
  distance:     z.number().nullable(),
  isOpenNow:    z.boolean(),
})
export type NearestBranch = z.infer<typeof nearestBranchSchema>

// myReview nested inside selectedBranch — same fields as `reviewSchema` in
// lib/api/reviews.ts. Defined inline to avoid a cross-module import cycle
// (reviews.ts imports from api, which is already imported here). Shape is
// pinned to match the backend's `GET /api/v1/customer/merchants/:id` response
// which includes the calling user's own review for the selected branch, or
// null if they haven't reviewed it yet.
const myReviewSchema = z.object({
  id:                z.string(),
  branchId:          z.string(),
  branchName:        z.string(),
  displayName:       z.string(),
  rating:            z.number().int().min(1).max(5),
  comment:           z.string().nullable(),
  isVerified:        z.boolean(),
  isOwnReview:       z.boolean(),
  createdAt:         z.string().datetime(),
  updatedAt:         z.string().datetime(),
  helpfulCount:      z.number().int().min(0),
  userMarkedHelpful: z.boolean(),
})

// selectedBranch — the branch the backend resolved for this page visit.
// Null when all branches are suspended (fallbackReason = 'all-suspended').
// Richer than branchTileSchema: includes openingHours, photos, amenities,
// country, websiteUrl, logoUrl, bannerUrl, about, and myReview so that the
// branch-aware merchant profile screen has everything it needs without a
// second fetch.
const selectedBranchSchema = z.object({
  id:           z.string(),
  name:         z.string(),
  isMainBranch: z.boolean(),
  isActive:     z.boolean(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city:         z.string().nullable(),
  postcode:     z.string().nullable(),
  country:      z.string().nullable(),
  latitude:     z.number().nullable(),
  longitude:    z.number().nullable(),
  phone:        z.string().nullable(),
  email:        z.string().nullable(),
  websiteUrl:   z.string().nullable(),
  logoUrl:      z.string().nullable(),
  bannerUrl:    z.string().nullable(),
  about:        z.string().nullable(),
  openingHours: z.array(openingHourEntrySchema),
  photos:       z.array(z.string()),
  amenities:    z.array(amenitySchema),
  distance:     z.number().nullable(),
  isOpenNow:    z.boolean(),
  avgRating:    z.number().nullable(),
  reviewCount:  z.number().int().min(0),
  myReview:     myReviewSchema.nullable(),
})
export type SelectedBranch = z.infer<typeof selectedBranchSchema>

// Reason the backend used to resolve selectedBranch. 'used-candidate' means
// the caller's ?branch= query param was honoured; the others are fallback
// paths. 'all-suspended' accompanies selectedBranch: null.
const fallbackReasonSchema = z.enum([
  'used-candidate',
  'candidate-inactive',
  'candidate-not-found',
  'no-candidate',
  'all-suspended',
])
export type SelectedBranchFallbackReason = z.infer<typeof fallbackReasonSchema>

const merchantProfileSchema = z.object({
  id:                  z.string(),
  businessName:        z.string(),
  tradingName:         z.string().nullable(),
  status:              z.string(),
  logoUrl:             z.string().nullable(),
  bannerUrl:           z.string().nullable(),
  description:         z.string().nullable(),
  websiteUrl:          z.string().nullable(),

  primaryCategoryId:    z.string().nullable(),
  primaryCategory:      primaryCategorySchema.nullable(),
  primaryDescriptorTag: z.object({ id: z.string(), label: z.string() }).nullable(),
  subcategory:          subcategoryRefSchema.nullable(),
  descriptor:           z.string(),
  highlights:           z.array(merchantHighlightSchema),

  vouchers:             z.array(merchantVoucherSchema),

  about:                z.string().nullable(),
  avgRating:            z.number().nullable(),
  reviewCount:          z.number(),
  isFavourited:         z.boolean(),

  distance:             z.number().nullable(),
  nearestBranch:        nearestBranchSchema.nullable(),

  isOpenNow:            z.boolean(),
  openingHours:         z.array(openingHourEntrySchema),
  amenities:            z.array(amenitySchema),
  photos:               z.array(z.string()),

  branches:             z.array(branchTileSchema),

  // Added in P2.1 (branch-aware merchant profile). Null only when
  // fallbackReason is 'all-suspended' (every branch is suspended).
  selectedBranch:               selectedBranchSchema.nullable(),
  selectedBranchFallbackReason: fallbackReasonSchema,
})
export type MerchantProfile = z.infer<typeof merchantProfileSchema>

export const merchantApi = {
  /**
   * GET /api/v1/customer/merchants/:id — full merchant detail.
   * Optional `lat`/`lng` enable distance + nearest-branch resolution.
   * Optional `branchId` pins the selectedBranch the server returns; without
   * it the server applies its cold-open default (nearest active branch or
   * main branch). Existing callers that don't pass `branchId` are unaffected.
   * Open to guests (token decoded but not verified for `isFavourited`).
   */
  async getProfile(
    id: string,
    opts: { lat?: number; lng?: number; branchId?: string } = {},
  ): Promise<MerchantProfile> {
    const qp: string[] = []
    if (opts.lat !== undefined && opts.lng !== undefined) {
      qp.push(`lat=${encodeURIComponent(opts.lat)}`)
      qp.push(`lng=${encodeURIComponent(opts.lng)}`)
    }
    if (opts.branchId) qp.push(`branch=${encodeURIComponent(opts.branchId)}`)
    const qs = qp.length > 0 ? `?${qp.join('&')}` : ''
    const res = await api.get<unknown>(`/api/v1/customer/merchants/${encodeURIComponent(id)}${qs}`)
    return merchantProfileSchema.parse(res)
  },
}
