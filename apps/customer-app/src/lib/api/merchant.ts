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

const openingHourEntrySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openTime:  z.string(),    // "HH:MM"
  closeTime: z.string(),    // "HH:MM"
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
})
export type MerchantProfile = z.infer<typeof merchantProfileSchema>

export const merchantApi = {
  /**
   * GET /api/v1/customer/merchants/:id — full merchant detail.
   * Optional `lat`/`lng` enable distance + nearest-branch resolution.
   * Open to guests (token decoded but not verified for `isFavourited`).
   */
  async getProfile(
    id: string,
    opts: { lat?: number; lng?: number } = {},
  ): Promise<MerchantProfile> {
    const qs = (opts.lat !== undefined && opts.lng !== undefined)
      ? `?lat=${encodeURIComponent(opts.lat)}&lng=${encodeURIComponent(opts.lng)}`
      : ''
    const res = await api.get<unknown>(`/api/v1/customer/merchants/${encodeURIComponent(id)}${qs}`)
    return merchantProfileSchema.parse(res)
  },
}
