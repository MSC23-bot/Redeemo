/**
 * Admin edit-review API (Option B B1).
 *
 * Typed wrappers for the pending-edit applier endpoints:
 *
 *   GET  /api/v1/admin/approvals/:id/edit-review   -> the field diff
 *   POST /api/v1/admin/approvals/:id/approve-edit  -> apply the edit
 *   POST /api/v1/admin/approvals/:id/reject-edit   -> reject (body { reason })
 *
 * Every response is validated with Zod so contract drift surfaces as a clear
 * error rather than an undefined-field crash. `current` / `proposed` are
 * unknown by design (they carry whatever identity-field value the diff holds:
 * string, number for lat/lng, or null).
 */
import { z } from 'zod'
import { apiFetch } from './client'

const editReviewFieldSchema = z.object({
  field: z.string(),
  current: z.unknown(),
  proposed: z.unknown(),
  isCustomerVisible: z.boolean(),
})

const photoChangesSchema = z.object({
  add: z.array(z.string()),
  remove: z.array(z.string()),
})

export const editReviewContextSchema = z.object({
  kind: z.enum(['merchant', 'branch']),
  merchantId: z.string(),
  branchId: z.string().optional(),
  pendingEditId: z.string(),
  status: z.string(),
  includesPhotos: z.boolean(),
  fields: z.array(editReviewFieldSchema),
  photoChanges: photoChangesSchema.optional(),
})

export type EditReviewContext = z.infer<typeof editReviewContextSchema>
export type EditReviewField = z.infer<typeof editReviewFieldSchema>

const approveEditResponseSchema = z.object({ approved: z.boolean() })
const rejectEditResponseSchema = z.object({ rejected: z.boolean() })

export type ApproveEditResponse = z.infer<typeof approveEditResponseSchema>
export type RejectEditResponse = z.infer<typeof rejectEditResponseSchema>

export const editReviewApi = {
  /** Fetch the field diff for one edit approval. */
  get: async (approvalId: string): Promise<EditReviewContext> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/approvals/${approvalId}/edit-review`,
      { auth: true },
    )
    return editReviewContextSchema.parse(raw)
  },

  /**
   * Apply the merchant-requested edit. The server applies ONLY the allow-listed
   * identity fields, OR (Branches PR-3) the photo delta for a photo edit, and
   * throws ApiError on invalid state (APPROVAL_NOT_ACTIONABLE,
   * PENDING_EDIT_NOT_ACTIONABLE, APPROVAL_NOT_FOUND). The legacy
   * EDIT_PHOTO_APPLY_NOT_SUPPORTED is no longer thrown for photo edits.
   */
  approve: async (approvalId: string): Promise<ApproveEditResponse> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/approvals/${approvalId}/approve-edit`,
      { method: 'POST', auth: true },
    )
    return approveEditResponseSchema.parse(raw)
  },

  /** Reject the edit (live entity untouched). Throws ApiError on invalid state. */
  reject: async (approvalId: string, reason: string): Promise<RejectEditResponse> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/approvals/${approvalId}/reject-edit`,
      { method: 'POST', auth: true, body: JSON.stringify({ reason }) },
    )
    return rejectEditResponseSchema.parse(raw)
  },
}
