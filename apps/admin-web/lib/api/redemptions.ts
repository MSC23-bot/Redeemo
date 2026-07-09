/**
 * Admin redemptions API.
 *
 * D67 (docs/superpowers/plans/2026-07-09-d67-admin-redemption-visibility.md):
 * read-only, cross-merchant visibility of voucher redemptions for the
 * staging-acceptance walk. Typed wrapper for:
 *
 *   GET /api/v1/admin/redemptions
 *     -> paginated list of redemption rows with optional filters
 *
 * Every response is validated with Zod so contract drift surfaces as a clear
 * error rather than an undefined-field crash. List-only: no CSV export, no
 * detail route (D67-b).
 */
import { z } from 'zod'
import { apiFetch } from './client'

// ── Response schemas ──────────────────────────────────────────────────────────

export const REDEMPTION_STATUSES = ['AWAITING_VALIDATION', 'VALIDATED'] as const
export type RedemptionStatusFilter = 'awaiting' | 'validated'

export const redemptionRowSchema = z.object({
  id: z.string(),
  redemptionCode: z.string(),
  voucher: z.object({
    id: z.string(),
    title: z.string(),
    type: z.string(),
  }),
  branch: z.object({
    id: z.string(),
    name: z.string(),
  }),
  merchant: z.object({
    id: z.string(),
    businessName: z.string(),
  }),
  customerName: z.string(),
  redeemedAt: z.string(),
  status: z.enum(REDEMPTION_STATUSES).or(z.string()),
  validatedAt: z.string().nullable(),
  validationMethod: z.string().nullable(),
  validatedByLabel: z.string().nullable(),
  estimatedSaving: z.number(),
  isTestData: z.boolean(),
})
export type AdminRedemptionRow = z.infer<typeof redemptionRowSchema>

export const listRedemptionsResponseSchema = z.object({
  items: z.array(redemptionRowSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
})
export type ListRedemptionsResponse = z.infer<typeof listRedemptionsResponseSchema>

// ── API calls ─────────────────────────────────────────────────────────────────

export const redemptionsApi = {
  /** Fetch a page of cross-merchant redemptions. All params are optional. */
  list: async (params?: {
    merchantId?: string
    branchId?: string
    status?: RedemptionStatusFilter
    from?: string
    to?: string
    voucherType?: string
    code?: string
    sort?: 'recent' | 'saving'
    /** Include isTestData rows. Defaults true server-side (D67-c). */
    includeTest?: boolean
    limit?: number
    offset?: number
  }): Promise<ListRedemptionsResponse> => {
    const qs = new URLSearchParams()
    if (params?.merchantId !== undefined) qs.set('merchantId', params.merchantId)
    if (params?.branchId !== undefined) qs.set('branchId', params.branchId)
    if (params?.status !== undefined) qs.set('status', params.status)
    if (params?.from !== undefined) qs.set('from', params.from)
    if (params?.to !== undefined) qs.set('to', params.to)
    if (params?.voucherType !== undefined) qs.set('voucherType', params.voucherType)
    if (params?.code !== undefined) qs.set('code', params.code)
    if (params?.sort !== undefined) qs.set('sort', params.sort)
    if (params?.includeTest !== undefined) qs.set('includeTest', String(params.includeTest))
    if (params?.limit !== undefined) qs.set('limit', String(params.limit))
    if (params?.offset !== undefined) qs.set('offset', String(params.offset))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    const raw = await apiFetch<unknown>(`/api/v1/admin/redemptions${suffix}`, {
      auth: true,
    })
    return listRedemptionsResponseSchema.parse(raw)
  },
}
