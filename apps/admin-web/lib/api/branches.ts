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

// ── Response schema ───────────────────────────────────────────────────────────

const confirmLocationResponseSchema = z.object({
  branchId: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  locationConfidence: z.literal('MANUALLY_CONFIRMED'),
})

export type ConfirmLocationResponse = z.infer<typeof confirmLocationResponseSchema>

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
}
