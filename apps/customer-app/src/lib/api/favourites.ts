/**
 * Phase 3C.1g Favourites — customer-app API client + Zod schemas.
 *
 * Wraps three backend route families:
 *   • /api/v1/customer/favourites/branches     — NEW (M1.3)
 *   • /api/v1/customer/favourites/vouchers     — UNCHANGED contract
 *   • /api/v1/customer/favourites/merchants    — TRANSITION ONLY (retires
 *                                                in the cleanup PR)
 *
 * Schemas mirror the backend service shapes in
 * `src/api/customer/favourites/service.ts`:
 *   - `listFavouriteBranches` → branch-tile enrichment + global sort
 *     (open-first within available, unavailable last).
 *   - `listFavouriteVouchers` → v1.1 Smart 7-bucket global sort
 *     (priorityBucket emitted per-row; the customer-app does NOT
 *     re-sort — spec §9.3 client-rendering invariant).
 *
 * Pagination query string built via `URLSearchParams` to match the
 * existing client pattern (e.g. `savings.ts::getRedemptions`).
 *
 * Reference: docs/superpowers/specs/2026-05-28-favourites-branch-level-design.md §6.4 + §7.1.
 */

import { z } from 'zod'
import { api } from '../api'

// ─────────────────────────────────────────────────────────────────────────
// Branches list
// ─────────────────────────────────────────────────────────────────────────

const favouriteBranchPrimaryCategorySchema = z.object({
  id:   z.string(),
  name: z.string(),
})

const favouriteBranchMerchantSchema = z.object({
  id:               z.string(),
  businessName:     z.string(),
  tradingName:      z.string().nullable(),
  logoUrl:          z.string().nullable(),
  bannerUrl:        z.string().nullable(),
  status:           z.string(),
  primaryCategory:  favouriteBranchPrimaryCategorySchema.nullable(),
})

const favouriteBranchItemSchema = z.object({
  id:                  z.string(),
  name:                z.string(),
  isMainBranch:        z.boolean(),
  addressLine1:        z.string().nullable(),
  addressLine2:        z.string().nullable(),
  city:                z.string().nullable(),
  postcode:            z.string().nullable(),
  // Position is redacted upstream when locationConfidence is
  // POSTCODE_CENTROID / NEEDS_REVIEW (Plan 4 M1 PR #81 lock; mirrors the
  // contract on `exposeBranchPosition`). Branch Location Trust Slice 1 (spec
  // 2026-07-09 §2.3) widened exposure by one tier, so ADDRESS_GEOCODED now
  // arrives with real coords alongside MANUALLY_CONFIRMED.
  latitude:            z.number().nullable(),
  longitude:           z.number().nullable(),
  locationConfidence:  z.string(),
  merchant:            favouriteBranchMerchantSchema,
  voucherCount:        z.number(),
  maxEstimatedSaving:  z.number(),
  // Wave 4 #3 (added 2026-05-30) — additive total across all active
  // vouchers.  Matches Search / BranchTile semantics so the
  // Favourites > Merchants card can render "Save £X across N vouchers"
  // instead of just the single-voucher max.
  // `.optional().default(0)` for backward compat with cached responses
  // from before this field landed.
  totalEstimatedSaving: z.number().optional().default(0),
  avgRating:           z.number().nullable(),
  reviewCount:         z.number(),
  isOpen:              z.boolean(),
  isUnavailable:       z.boolean(),
  favouritedAt:        z.string(),
})

const favouriteBranchesResponseSchema = z.object({
  items: z.array(favouriteBranchItemSchema),
  total: z.number(),
  page:  z.number(),
  limit: z.number(),
})

export type FavouriteBranchItem      = z.infer<typeof favouriteBranchItemSchema>
export type FavouriteBranchesResponse = z.infer<typeof favouriteBranchesResponseSchema>

// ─────────────────────────────────────────────────────────────────────────
// Vouchers list — Smart 7-bucket global sort (v1.1, backend-owned)
// ─────────────────────────────────────────────────────────────────────────

const favouriteVoucherMerchantSchema = z.object({
  id:           z.string(),
  businessName: z.string(),
  logoUrl:      z.string().nullable(),
  status:       z.string(),
})

const favouriteVoucherItemSchema = z.object({
  id:                       z.string(),
  title:                    z.string(),
  type:                     z.string(),
  // Backend serialises Prisma Decimal as string; coerce defensively.
  estimatedSaving:          z.coerce.number(),
  description:              z.string().nullable(),
  expiresAt:                z.string().nullable(),  // ISO
  status:                   z.string(),
  approvalStatus:           z.string(),
  isRedeemedInCurrentCycle: z.boolean(),
  merchant:                 favouriteVoucherMerchantSchema,
  favouritedAt:             z.string(),
  isUnavailable:            z.boolean(),
  // M1.4 priority bucket — 1=Urgent ... 7=Expired (spec §9.3).
  // Locked client-rendering invariant: customer-app renders pages in
  // server-returned order; this field is exposed for surfaces that
  // want the same classification (e.g. state pill) but is NOT a
  // sort key on the client.
  priorityBucket:           z.number().int().min(1).max(7),
})

const favouriteVouchersResponseSchema = z.object({
  items: z.array(favouriteVoucherItemSchema),
  total: z.number(),
  page:  z.number(),
  limit: z.number(),
})

export type FavouriteVoucherItem      = z.infer<typeof favouriteVoucherItemSchema>
export type FavouriteVouchersResponse = z.infer<typeof favouriteVouchersResponseSchema>

// Test-only re-exports so individual Zod shapes can be exercised in
// isolation by `tests/lib/api/favourites.test.ts`.
export const _favouriteBranchesResponseSchemaForTests = favouriteBranchesResponseSchema
export const _favouriteVouchersResponseSchemaForTests = favouriteVouchersResponseSchema

// ─────────────────────────────────────────────────────────────────────────
// API surface
// ─────────────────────────────────────────────────────────────────────────

function buildPaginationQuery(page: number, limit: number): string {
  const qs = new URLSearchParams()
  qs.set('page',  String(page))
  qs.set('limit', String(limit))
  return qs.toString()
}

export const favouritesApi = {
  // Places (branches) — NEW (M1.3 backend).
  async getBranches(page = 1, limit = 20): Promise<FavouriteBranchesResponse> {
    const raw = await api.get<unknown>(
      `/api/v1/customer/favourites/branches?${buildPaginationQuery(page, limit)}`,
    )
    return favouriteBranchesResponseSchema.parse(raw)
  },
  addBranch(branchId: string): Promise<unknown> {
    return api.post(`/api/v1/customer/favourites/branches/${branchId}`, undefined)
  },
  removeBranch(branchId: string): Promise<unknown> {
    return api.del(`/api/v1/customer/favourites/branches/${branchId}`)
  },

  // Vouchers — UNCHANGED contract (M1.4 priorityBucket added additively).
  async getVouchers(page = 1, limit = 20): Promise<FavouriteVouchersResponse> {
    const raw = await api.get<unknown>(
      `/api/v1/customer/favourites/vouchers?${buildPaginationQuery(page, limit)}`,
    )
    return favouriteVouchersResponseSchema.parse(raw)
  },
  addVoucher(voucherId: string): Promise<unknown> {
    return api.post(`/api/v1/customer/favourites/vouchers/${voucherId}`, undefined)
  },
  removeVoucher(voucherId: string): Promise<unknown> {
    return api.del(`/api/v1/customer/favourites/vouchers/${voucherId}`)
  },

  // Merchant-level — TRANSITION ONLY.  The cleanup PR (post-stabilisation)
  // removes these alongside the corresponding backend routes + model.  Do
  // not consume from new code; use the branch-level entry points above.
  addMerchant(merchantId: string): Promise<unknown> {
    return api.post(`/api/v1/customer/favourites/merchants/${merchantId}`, undefined)
  },
  removeMerchant(merchantId: string): Promise<unknown> {
    return api.del(`/api/v1/customer/favourites/merchants/${merchantId}`)
  },
}
