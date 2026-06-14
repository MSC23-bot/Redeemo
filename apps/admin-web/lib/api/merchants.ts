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

// ── API calls ─────────────────────────────────────────────────────────────────

export const merchantsApi = {
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
