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

// ── Option B B2.1: merchant detail (read) + edit-on-behalf ────────────────────

/**
 * A branch row on the merchant detail payload (GET /admin/merchants/:id). The
 * enum-ish string fields use `.or(z.string())` for the same drift resilience as
 * `merchantSummarySchema`: a new locationConfidence value surfaces as a known
 * string rather than a parse crash.
 */
export const branchDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  isMainBranch: z.boolean(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  city: z.string(),
  postcode: z.string(),
  localityName: z.string().nullable(),
  locationConfidence: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  isActive: z.boolean(),
})
export type BranchDetail = z.infer<typeof branchDetailSchema>

/** The full merchant detail payload: the merchant record + its branches. */
export const merchantDetailSchema = z.object({
  merchant: z.object({
    id: z.string(),
    businessName: z.string(),
    tradingName: z.string().nullable(),
    status: z.enum(MERCHANT_STATUSES).or(z.string()),
    verificationStatus: z
      .enum(['NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED'])
      .or(z.string()),
    onboardingStep: z.string(),
    websiteUrl: z.string().nullable(),
    // B2.2: registered-identity fields, returned read-only on this detail payload.
    vatNumber: z.string().nullable(),
    companyNumber: z.string().nullable(),
    logoUrl: z.string().nullable(),
    category: z.string().nullable(),
  }),
  branches: z.array(branchDetailSchema),
})
export type MerchantDetail = z.infer<typeof merchantDetailSchema>

// The edit endpoints return the updated record; the UI relies on query
// invalidation (not the return value), so a minimal resilient parse is enough.
const editAckSchema = z.object({ id: z.string() }).passthrough()

export interface EditMerchantProfileInput {
  websiteUrl?: string | null
  reason: string
}

// B2.2: the registered-identity edit (vatNumber / companyNumber). `confirm` is a
// required literal true (backend confirmation, not just the UI checkbox).
export interface EditMerchantIdentityInput {
  vatNumber?: string | null
  companyNumber?: string | null
  reason: string
  confirm: true
}

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
   * Fetch a single merchant's detail (B2.1, `merchant:read`-gated): the merchant
   * record + its branches. The response is Zod-validated (detail shape).
   * Throws ApiError (MERCHANT_NOT_FOUND).
   */
  getById: async (id: string): Promise<MerchantDetail> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${id}`, { auth: true })
    return merchantDetailSchema.parse(raw)
  },

  /**
   * Edit a merchant's simple-DIRECT profile fields on the merchant's behalf
   * (B2.1, `merchant:edit`-gated). The reason is mandatory and recorded in the
   * audit log. The return value is parsed only minimally (the UI re-reads via
   * query invalidation). Throws ApiError (MERCHANT_NOT_FOUND).
   */
  editProfile: async (id: string, input: EditMerchantProfileInput): Promise<{ id: string }> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${id}/profile`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(input),
    })
    return editAckSchema.parse(raw)
  },

  /**
   * Edit a merchant's registered identity fields (vatNumber / companyNumber) on
   * the merchant's behalf (B2.2, `merchant:edit-identity`-gated; SUPER_ADMIN
   * only). reason + confirm are mandatory; the change is audited as
   * MERCHANT_IDENTITY_UPDATED. The return is parsed minimally (the UI re-reads
   * via query invalidation). Throws ApiError (MERCHANT_NOT_FOUND).
   */
  editIdentity: async (id: string, input: EditMerchantIdentityInput): Promise<{ id: string }> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${id}/identity`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(input),
    })
    return editAckSchema.parse(raw)
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
