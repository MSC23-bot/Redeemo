/**
 * Admin approvals API.
 *
 * Typed wrapper for the approval queue endpoint:
 *
 *   GET /api/v1/admin/approvals
 *     -> paginated list of AdminApproval items with optional filters
 *
 * Every response is validated with Zod so contract drift surfaces as a clear
 * error rather than an undefined-field crash.
 */
import { z } from 'zod'
import { apiFetch } from './client'

// ── Response schemas ──────────────────────────────────────────────────────────

// A MERCHANT_ONBOARDING row carries the full merchant summary
// (onboardingStep / verificationStatus / contractStatus); a Day-2 Vouchers
// VOUCHER row carries only { id, businessName, status } (the backend's
// voucher-merchant select). Those three onboarding-only fields are therefore
// optional so BOTH row shapes parse against one schema.
const merchantSummarySchema = z.object({
  id: z.string(),
  businessName: z.string(),
  status: z.string(),
  onboardingStep: z.string().optional(),
  verificationStatus: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).or(z.string()).optional(),
  contractStatus: z.string().optional(),
})

// Day-2 Vouchers PR-C: VOUCHER rows are enriched with a voucher summary + a
// go-live hint so the queue shows enough context before opening. The merchant
// summary on a VOUCHER row reuses the SAME merchantSummarySchema above (no
// separate schema): the three onboarding-only fields (onboardingStep /
// verificationStatus / contractStatus) are .optional() on it, so a VOUCHER row's
// leaner { id, businessName, status } merchant still parses against that one
// schema.
const voucherSummarySchema = z.object({
  title: z.string(),
  type: z.string(),
  status: z.string(),
  approvalStatus: z.string(),
})

export const approvalSchema = z.object({
  id: z.string(),
  type: z.enum([
    'MERCHANT_ONBOARDING',
    'VOUCHER',
    'MERCHANT_PROFILE_EDIT',
    'MERCHANT_IDENTITY_EDIT',
    'BRANCH_IDENTITY_EDIT',
    // Branches PR-5 (D5): the branch-lifecycle approval lane.
    'BRANCH_CREATE',
    'BRANCH_CLOSE',
    // Voucher governed-flows PR-B (sibling backend PR #411): a merchant voucher
    // change/end request.
    'VOUCHER_EDIT',
  ]),
  referenceId: z.string(),
  referenceType: z.string(),
  // WITHDRAWN (sibling backend PR #411): the merchant withdrew the request
  // before an admin acted; leaves the actionable queue, never actionable again.
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'WITHDRAWN']),
  adminUserId: z.string().nullable(),
  comment: z.string().nullable(),
  submittedAt: z.string(),
  actionedAt: z.string().nullable(),
  claimedById: z.string().nullable(),
  claimedAt: z.string().nullable(),
  claimedBy: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
  merchant: merchantSummarySchema.nullable(),
  // VOUCHER-only enrichment (optional so MERCHANT_ONBOARDING + edit rows, which
  // do not carry these, still parse). nullable too: a VOUCHER row whose voucher
  // could not be loaded carries voucher:null + goLiveHint:null.
  voucher: voucherSummarySchema.nullable().optional(),
  goLiveHint: z.enum(['live-now', 'waiting-for-go-live']).nullable().optional(),
  // VOUCHER_EDIT-only enrichment (optional; the exact list-row shape for PR #411
  // is not fully specified — if the backend omits this field, the queue row
  // falls back to a generic "Voucher edit request" label rather than crashing).
  voucherEditKind: z.enum(['CHANGE', 'END']).nullable().optional(),
})
export type AdminApproval = z.infer<typeof approvalSchema>

export const listApprovalsResponseSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  approvals: z.array(approvalSchema),
})
export type ListApprovalsResponse = z.infer<typeof listApprovalsResponseSchema>

// ── Action response schemas ───────────────────────────────────────────────────

const claimResponseSchema = z.object({ claimed: z.boolean() })
const releaseResponseSchema = z.object({ released: z.boolean() })
const requestChangesResponseSchema = z.object({ changesRequested: z.boolean() })
const rejectResponseSchema = z.object({ rejected: z.boolean() })
const approveResponseSchema = z.object({
  approved: z.boolean(),
  alreadyLive: z.boolean().optional(),
})

export type ClaimResponse = z.infer<typeof claimResponseSchema>
export type ReleaseResponse = z.infer<typeof releaseResponseSchema>
export type RequestChangesResponse = z.infer<typeof requestChangesResponseSchema>
export type RejectResponse = z.infer<typeof rejectResponseSchema>
export type ApproveResponse = z.infer<typeof approveResponseSchema>

// ── API calls ─────────────────────────────────────────────────────────────────

export const approvalsApi = {
  /** Fetch a page of approvals. All params are optional. */
  list: async (params?: {
    type?: string
    status?: string
    claimedById?: string
    referenceId?: string
    olderThanMinutes?: number
    page?: number
    pageSize?: number
  }): Promise<ListApprovalsResponse> => {
    const qs = new URLSearchParams()
    if (params?.type !== undefined) qs.set('type', params.type)
    if (params?.status !== undefined) qs.set('status', params.status)
    if (params?.claimedById !== undefined) qs.set('claimedById', params.claimedById)
    if (params?.referenceId !== undefined) qs.set('referenceId', params.referenceId)
    if (params?.olderThanMinutes !== undefined) {
      qs.set('olderThanMinutes', String(params.olderThanMinutes))
    }
    if (params?.page !== undefined) qs.set('page', String(params.page))
    if (params?.pageSize !== undefined) qs.set('pageSize', String(params.pageSize))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    const raw = await apiFetch<unknown>(`/api/v1/admin/approvals${suffix}`, {
      auth: true,
    })
    return listApprovalsResponseSchema.parse(raw)
  },

  /**
   * Resolve a merchant's open onboarding approval id (the bell click-through
   * hinge, PR4). Filters the queue by referenceId + MERCHANT_ONBOARDING and
   * returns the first approval id, or null when the merchant has no such
   * approval row. Used by NotificationBell to route a merchant notification to
   * its review screen.
   */
  resolveByMerchant: async (merchantId: string): Promise<string | null> => {
    const res = await approvalsApi.list({
      referenceId: merchantId,
      type: 'MERCHANT_ONBOARDING',
      pageSize: 1,
    })
    return res.approvals[0]?.id ?? null
  },

  /** Claim an approval for review. Throws ApiError (APPROVAL_ALREADY_CLAIMED on race). */
  claim: async (id: string): Promise<ClaimResponse> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/approvals/${id}/claim`, {
      method: 'POST',
      auth: true,
    })
    return claimResponseSchema.parse(raw)
  },

  /** Release a previously claimed approval. Throws ApiError (APPROVAL_NOT_CLAIMER, APPROVAL_NOT_ACTIONABLE). */
  release: async (id: string): Promise<ReleaseResponse> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/approvals/${id}/release`, {
      method: 'POST',
      auth: true,
    })
    return releaseResponseSchema.parse(raw)
  },

  /** Request changes from the merchant. Throws ApiError on invalid state. */
  requestChanges: async (id: string, reason: string): Promise<RequestChangesResponse> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/approvals/${id}/request-changes`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ reason }),
    })
    return requestChangesResponseSchema.parse(raw)
  },

  /** Reject the merchant application. Throws ApiError on invalid state. */
  reject: async (id: string, reason: string): Promise<RejectResponse> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/approvals/${id}/reject`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ reason }),
    })
    return rejectResponseSchema.parse(raw)
  },

  /**
   * Approve the merchant application and take them live.
   * The server re-checks all go-live gates; throws ApiError on gate failures
   * (ONBOARDING_GATES_INCOMPLETE, MAIN_BRANCH_LOCATION_UNCONFIRMED,
   * APPROVAL_NOT_ACTIONABLE, APPROVAL_NOT_FOUND).
   */
  approve: async (id: string): Promise<ApproveResponse> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/approvals/${id}/approve`, {
      method: 'POST',
      auth: true,
    })
    return approveResponseSchema.parse(raw)
  },
}
