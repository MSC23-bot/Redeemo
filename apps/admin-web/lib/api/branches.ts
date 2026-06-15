/**
 * Admin branch API.
 *
 * Typed wrapper for the manual branch-location confirmation endpoint (M6):
 *
 *   POST /api/v1/admin/branches/:id/confirm-location
 *     -> set the branch coordinates to manually confirmed.
 *
 * The response is validated with Zod so contract drift surfaces as a clear
 * error rather than an undefined-field crash. Errors throw `ApiError` from
 * `apiFetch` (e.g. BRANCH_NOT_FOUND).
 */
import { z } from 'zod'
import { apiFetch } from './client'

// ── Request shape ─────────────────────────────────────────────────────────────

export interface ConfirmLocationInput {
  latitude: number
  longitude: number
}

/**
 * Option B B2.1: edit a branch's simple-DIRECT fields on the merchant's behalf:
 *
 *   PATCH /api/v1/admin/branches/:branchId  (gated `merchant:edit`)
 *
 * The reason is mandatory and recorded in the audit log.
 */
export interface EditBranchInput {
  phone?: string | null
  email?: string | null
  websiteUrl?: string | null
  isActive?: boolean
  reason: string
}

// B2.4: admin create a branch on the merchant's behalf. latitude/longitude are
// NOT accepted (location resolves from the postcode). reason is mandatory.
export interface CreateBranchInput {
  name: string
  addressLine1: string
  addressLine2?: string
  city: string
  postcode: string
  country?: string
  phone?: string
  email?: string
  websiteUrl?: string
  reason: string
}

// ── Response schema ───────────────────────────────────────────────────────────

const confirmLocationResponseSchema = z.object({
  branchId: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  locationConfidence: z.literal('MANUALLY_CONFIRMED'),
})

export type ConfirmLocationResponse = z.infer<typeof confirmLocationResponseSchema>

// The edit endpoint returns the updated branch; the UI relies on query
// invalidation (not the return value), so a minimal resilient parse is enough.
const editAckSchema = z.object({ id: z.string() }).passthrough()

// ── API calls ─────────────────────────────────────────────────────────────────

export const branchesApi = {
  /**
   * Manually confirm a branch's coordinates. The server validates the ranges
   * (latitude -90..90, longitude -180..180) and stamps locationConfidence as
   * MANUALLY_CONFIRMED. Throws ApiError (BRANCH_NOT_FOUND).
   */
  confirmLocation: async (
    id: string,
    input: ConfirmLocationInput
  ): Promise<ConfirmLocationResponse> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/branches/${id}/confirm-location`,
      {
        method: 'POST',
        auth: true,
        body: JSON.stringify(input),
      }
    )
    return confirmLocationResponseSchema.parse(raw)
  },

  /**
   * Edit a branch's contact fields + active state on the merchant's behalf
   * (B2.1, `merchant:edit`-gated). The reason is mandatory and recorded in the
   * audit log. The return value is parsed only minimally - the UI re-reads via
   * query invalidation. Throws ApiError (BRANCH_NOT_FOUND).
   */
  edit: async (branchId: string, input: EditBranchInput): Promise<{ id: string }> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/branches/${branchId}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(input),
    })
    return editAckSchema.parse(raw)
  },

  /**
   * Create a branch on the merchant's behalf (B2.4, `merchant:manage-branches`-
   * gated; SUPER_ADMIN only). The reason is mandatory; location resolves from the
   * postcode (the route rejects latitude/longitude). The return is the redacted
   * branch shape, parsed minimally (the UI re-reads via query invalidation).
   * Throws ApiError (MERCHANT_NOT_FOUND / POSTCODE_REQUIRED / POSTCODE_NOT_FOUND /
   * GAZETTEER_UNAVAILABLE).
   */
  create: async (merchantId: string, input: CreateBranchInput): Promise<{ id: string }> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${merchantId}/branches`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    })
    return editAckSchema.parse(raw)
  },

  /**
   * Soft-delete a branch on the merchant's behalf (B2.4, `merchant:manage-
   * branches`-gated; SUPER_ADMIN only). POST, not DELETE-with-body. The reason is
   * mandatory. Permanently removes the branch and deactivates its staff logins.
   * Throws ApiError (BRANCH_NOT_FOUND / BRANCH_IS_MAIN / BRANCH_LAST_ACTIVE).
   */
  softDelete: async (branchId: string, reason: string): Promise<{ ok: boolean }> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/branches/${branchId}/delete`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ reason }),
    })
    return z.object({ ok: z.boolean() }).passthrough().parse(raw)
  },
}
