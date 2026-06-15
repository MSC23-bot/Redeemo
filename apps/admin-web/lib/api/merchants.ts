/**
 * Admin merchant lifecycle API.
 *
 * Typed wrappers for the three merchant lifecycle endpoints (M6):
 *
 *   POST /api/v1/admin/merchants
 *     -> create an admin-owned draft merchant; an account-setup email is
 *        triggered for the owner. Returns ids only (never a token).
 *
 *   POST /api/v1/admin/merchants/:id/suspend
 *     -> take a merchant non-operational immediately (mandatory reason).
 *
 *   POST /api/v1/admin/merchants/:id/reactivate
 *     -> restore a suspended merchant's access and offers.
 *
 * Every response is validated with Zod so contract drift surfaces as a clear
 * error rather than an undefined-field crash. Errors throw `ApiError` from
 * `apiFetch` (e.g. EMAIL_ALREADY_EXISTS, MERCHANT_NOT_FOUND, MERCHANT_NOT_SUSPENDED).
 */
import { z } from 'zod'
import { apiFetch } from './client'

// ── Request shapes ────────────────────────────────────────────────────────────

export interface CreateDraftFields {
  businessName: string
  tradingName?: string
  ownerEmail: string
  ownerFirstName: string
  ownerLastName: string
  jobTitle?: string
}

// ── Response schemas ──────────────────────────────────────────────────────────

const createDraftResponseSchema = z.object({
  merchantId: z.string(),
  ownerAdminId: z.string(),
  ownerEmail: z.string(),
  passwordSetupRequired: z.boolean(),
})

const suspendResponseSchema = z.object({
  suspended: z.boolean(),
  alreadySuspended: z.boolean(),
})

const reactivateResponseSchema = z.object({
  reactivated: z.boolean(),
  alreadyActive: z.boolean(),
})

export type CreateDraftResponse = z.infer<typeof createDraftResponseSchema>
export type SuspendResponse = z.infer<typeof suspendResponseSchema>
export type ReactivateResponse = z.infer<typeof reactivateResponseSchema>

// ── WP2 — merchants directory (read-only list + search) ───────────────────────

export const MERCHANT_STATUSES = [
  'REGISTERED',
  'PENDING_APPROVAL',
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'DELETED',
] as const
export type MerchantStatusFilter = (typeof MERCHANT_STATUSES)[number]

/**
 * Redacted merchant summary returned by GET /admin/merchants. Mirrors the
 * backend `listMerchants` select — no secrets. `.or(z.string())` on the enum
 * fields keeps the client resilient if the backend adds a status/verification
 * value before this mirror is updated (contract drift surfaces as a known value
 * rather than a parse crash).
 */
export const merchantSummarySchema = z.object({
  id: z.string(),
  businessName: z.string(),
  tradingName: z.string().nullable(),
  status: z.enum(MERCHANT_STATUSES).or(z.string()),
  verificationStatus: z.enum(['NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED']).or(z.string()),
  onboardingStep: z.string(),
  logoUrl: z.string().nullable(),
  createdAt: z.string(),
  category: z.string().nullable(),
  branchCount: z.number(),
})
export type MerchantSummary = z.infer<typeof merchantSummarySchema>

export const listMerchantsResponseSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  merchants: z.array(merchantSummarySchema),
})
export type ListMerchantsResponse = z.infer<typeof listMerchantsResponseSchema>

// ── API calls ─────────────────────────────────────────────────────────────────

export const merchantsApi = {
  /**
   * Fetch a page of the merchants directory (WP2, `merchant:read`-gated). All
   * params are optional; the response is Zod-validated (redacted summary shape).
   */
  list: async (params?: {
    q?: string
    status?: MerchantStatusFilter
    page?: number
    pageSize?: number
  }): Promise<ListMerchantsResponse> => {
    const qs = new URLSearchParams()
    if (params?.q !== undefined && params.q !== '') qs.set('q', params.q)
    if (params?.status !== undefined) qs.set('status', params.status)
    if (params?.page !== undefined) qs.set('page', String(params.page))
    if (params?.pageSize !== undefined) qs.set('pageSize', String(params.pageSize))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants${suffix}`, { auth: true })
    return listMerchantsResponseSchema.parse(raw)
  },

  /**
   * Create an admin-owned draft merchant. The owner claims the account via an
   * account-setup email; no token is ever returned to the client.
   * Throws ApiError (EMAIL_ALREADY_EXISTS on a duplicate owner email).
   */
  createDraft: async (fields: CreateDraftFields): Promise<CreateDraftResponse> => {
    const raw = await apiFetch<unknown>('/api/v1/admin/merchants', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(fields),
    })
    return createDraftResponseSchema.parse(raw)
  },

  /**
   * Suspend a merchant. Reason is mandatory (1..2000 chars, enforced server-side).
   * Throws ApiError (MERCHANT_NOT_FOUND).
   */
  suspend: async (id: string, reason: string): Promise<SuspendResponse> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${id}/suspend`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ reason }),
    })
    return suspendResponseSchema.parse(raw)
  },

  /**
   * Reactivate a suspended merchant.
   * Throws ApiError (MERCHANT_NOT_FOUND, MERCHANT_NOT_SUSPENDED).
   */
  reactivate: async (id: string): Promise<ReactivateResponse> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${id}/reactivate`, {
      method: 'POST',
      auth: true,
    })
    return reactivateResponseSchema.parse(raw)
  },
}
