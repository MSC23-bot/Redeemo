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

const merchantSummarySchema = z.object({
  id: z.string(),
  businessName: z.string(),
  status: z.string(),
  onboardingStep: z.string(),
  verificationStatus: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).or(z.string()),
  contractStatus: z.string(),
})

export const approvalSchema = z.object({
  id: z.string(),
  type: z.enum([
    'MERCHANT_ONBOARDING',
    'VOUCHER',
    'MERCHANT_PROFILE_EDIT',
    'MERCHANT_IDENTITY_EDIT',
    'BRANCH_IDENTITY_EDIT',
  ]),
  referenceId: z.string(),
  referenceType: z.string(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
  adminUserId: z.string().nullable(),
  comment: z.string().nullable(),
  submittedAt: z.string(),
  actionedAt: z.string().nullable(),
  claimedById: z.string().nullable(),
  claimedAt: z.string().nullable(),
  merchant: merchantSummarySchema.nullable(),
})
export type AdminApproval = z.infer<typeof approvalSchema>

export const listApprovalsResponseSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  approvals: z.array(approvalSchema),
})
export type ListApprovalsResponse = z.infer<typeof listApprovalsResponseSchema>

// ── API calls ─────────────────────────────────────────────────────────────────

export const approvalsApi = {
  /** Fetch a page of approvals. All params are optional. */
  list: async (params?: {
    type?: string
    status?: string
    claimedById?: string
    olderThanMinutes?: number
    page?: number
    pageSize?: number
  }): Promise<ListApprovalsResponse> => {
    const qs = new URLSearchParams()
    if (params?.type !== undefined) qs.set('type', params.type)
    if (params?.status !== undefined) qs.set('status', params.status)
    if (params?.claimedById !== undefined) qs.set('claimedById', params.claimedById)
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
}
