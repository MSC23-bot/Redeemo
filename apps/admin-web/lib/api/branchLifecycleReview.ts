/**
 * Admin branch-lifecycle review API (Branches PR-5, D5).
 *
 * Typed wrappers for the branch-lifecycle applier endpoints:
 *
 *   GET  /api/v1/admin/approvals/:id/branch-lifecycle-review  -> the review context
 *   POST /api/v1/admin/approvals/:id/approve-branch-lifecycle -> approve (create -> LIVE / close -> deactivate)
 *   POST /api/v1/admin/approvals/:id/reject-branch-lifecycle  -> reject (body { reason })
 *
 * Every response is validated with Zod so contract drift surfaces as a clear
 * error rather than an undefined-field crash. The read NEVER returns a branch
 * `redemptionPin` (the backend curates the select); there is no field for it here.
 *
 * `kind` discriminates a CREATE review (the branch is awaiting go-live; approve
 * requires a confirmed location) from a CLOSE review (the branch is live; approve
 * deactivates it). Mirrors lib/api/editReview.ts + lib/api/voucherReview.ts.
 */
import { z } from 'zod'
import { apiFetch } from './client'

const branchLifecycleBranchSchema = z.object({
  id: z.string(),
  name: z.string(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  city: z.string(),
  postcode: z.string(),
  localityName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  isMainBranch: z.boolean(),
  isActive: z.boolean(),
  lifecycleStatus: z.string(),
  locationConfidence: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
})

export const branchLifecycleReviewContextSchema = z.object({
  kind: z.enum(['create', 'close']),
  merchant: z.object({ id: z.string(), businessName: z.string() }),
  branch: branchLifecycleBranchSchema,
  closeReason: z.string().nullable(),
})

export type BranchLifecycleReviewContext = z.infer<typeof branchLifecycleReviewContextSchema>
export type BranchLifecycleReviewBranch = z.infer<typeof branchLifecycleBranchSchema>

// The applier returns { approved: true, alreadyDone: boolean }. `alreadyDone` is
// the idempotent no-op signal (a duplicate/concurrent approve); the UI relies on
// query invalidation, so a minimal resilient parse is enough.
const approveBranchLifecycleResponseSchema = z.object({
  approved: z.boolean(),
  alreadyDone: z.boolean().optional(),
})
const rejectBranchLifecycleResponseSchema = z.object({ rejected: z.boolean() })

export type ApproveBranchLifecycleResponse = z.infer<typeof approveBranchLifecycleResponseSchema>
export type RejectBranchLifecycleResponse = z.infer<typeof rejectBranchLifecycleResponseSchema>

export const branchLifecycleReviewApi = {
  /** Fetch the review context for one branch-lifecycle approval (create or close). */
  get: async (approvalId: string): Promise<BranchLifecycleReviewContext> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/approvals/${approvalId}/branch-lifecycle-review`,
      { auth: true },
    )
    return branchLifecycleReviewContextSchema.parse(raw)
  },

  /**
   * Approve the branch-lifecycle request. CREATE flips the branch to LIVE
   * (requires a confirmed location server-side; throws
   * MAIN_BRANCH_LOCATION_UNCONFIRMED otherwise). CLOSE runs the soft-deactivation.
   * Throws ApiError on invalid state (APPROVAL_NOT_ACTIONABLE / APPROVAL_NOT_FOUND
   * / BRANCH_NOT_FOUND / BRANCH_IS_MAIN / BRANCH_LAST_ACTIVE).
   */
  approve: async (approvalId: string): Promise<ApproveBranchLifecycleResponse> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/approvals/${approvalId}/approve-branch-lifecycle`,
      { method: 'POST', auth: true },
    )
    return approveBranchLifecycleResponseSchema.parse(raw)
  },

  /**
   * Reject the branch-lifecycle request. CREATE leaves the branch
   * PENDING_CREATE / CHANGES_REQUESTED; CLOSE reverts the branch to LIVE. Throws
   * ApiError on invalid state.
   */
  reject: async (approvalId: string, reason: string): Promise<RejectBranchLifecycleResponse> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/approvals/${approvalId}/reject-branch-lifecycle`,
      { method: 'POST', auth: true, body: JSON.stringify({ reason }) },
    )
    return rejectBranchLifecycleResponseSchema.parse(raw)
  },
}
