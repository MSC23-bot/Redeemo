/**
 * Admin voucher-review API (Day-2 Vouchers PR-C).
 *
 * Typed wrappers for the VOUCHER approval lane endpoints (PR-A voucherApprover):
 *
 *   GET  /api/v1/admin/approvals/:id/voucher-review        -> the review context
 *   POST /api/v1/admin/approvals/:id/approve-voucher       -> approve (Model 1)
 *   POST /api/v1/admin/approvals/:id/reject-voucher        -> reject (body { reason })
 *   POST /api/v1/admin/approvals/:id/request-voucher-changes -> concierge (body { proposed?, note })
 *
 * Every response is validated with Zod so contract drift surfaces as a clear
 * error rather than an undefined-field crash. Mirrors lib/api/editReview.ts.
 *
 * Security: the GET is gated `approval:read`, the three POSTs `approval:action`
 * (server-enforced). No PII / no redemptionPin is present in the context.
 */
import { z } from 'zod'
import { apiFetch } from './client'

// ── Review-context schema ─────────────────────────────────────────────────────
// `expiryDate` is a Date | null server-side but serialises to an ISO string over
// the wire. `merchantFields` is an opaque bag (askHelp + adminProposed + adminNote
// on a CHANGES_REQUESTED voucher); kept as a record so the panel reads named keys.

const availabilityWindowSchema = z.object({
  dayOfWeek: z.number(),
  openTime: z.string(),
  closeTime: z.string(),
})

const voucherReviewVoucherSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  status: z.string(),
  approvalStatus: z.string(),
  description: z.string().nullable(),
  terms: z.string().nullable(),
  estimatedSaving: z.number(),
  expiryDate: z.string().nullable(),
  cooldownSeconds: z.number().nullable(),
  merchantFields: z.record(z.string(), z.unknown()).nullable(),
  availabilityWindows: z.array(availabilityWindowSchema),
})

const voucherReviewMerchantSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  status: z.string(),
})

export const voucherReviewContextSchema = z.object({
  voucher: voucherReviewVoucherSchema,
  merchant: voucherReviewMerchantSchema.nullable(),
  /** Pre-computed go-live hint: merchant ACTIVE AND every flagship RMV ACTIVE. */
  goLive: z.boolean(),
})

export type VoucherReviewContext = z.infer<typeof voucherReviewContextSchema>
export type VoucherReviewVoucher = z.infer<typeof voucherReviewVoucherSchema>
export type VoucherAvailabilityWindow = z.infer<typeof availabilityWindowSchema>

// ── Action response schemas ───────────────────────────────────────────────────

const approveVoucherResponseSchema = z.object({ approved: z.boolean(), goLive: z.boolean() })
const rejectVoucherResponseSchema = z.object({ rejected: z.boolean() })
const requestVoucherChangesResponseSchema = z.object({ changesRequested: z.boolean() })

export type ApproveVoucherResponse = z.infer<typeof approveVoucherResponseSchema>
export type RejectVoucherResponse = z.infer<typeof rejectVoucherResponseSchema>
export type RequestVoucherChangesResponse = z.infer<typeof requestVoucherChangesResponseSchema>

/**
 * The concierge proposal. Only the allow-listed correction fields are sent; the
 * backend allow-lists + type-guards them, so a non-allow-listed key never reaches
 * Prisma.
 *
 * These are exactly the fields this v1 dialog offers (title / description / terms
 * / estimatedSaving). The CANONICAL allow-list is `buildAdminProposed` in
 * src/api/admin/approvals/voucherApprover.ts (PROPOSAL_STRING_FIELDS = title /
 * description / terms / imageUrl, plus estimatedSaving). That backend allow-list
 * ALSO accepts `imageUrl`, which this v1 dialog does not offer; proposing it is a
 * deferred follow-up. `availabilityWindows` / `cooldownSeconds` corrections are
 * NOT in the backend allow-list (the backend silently drops them), so they are
 * deliberately omitted here too: proposing them is DEFERRED and would require
 * extending the backend allow-list first.
 */
export interface VoucherProposal {
  title?: string
  description?: string
  terms?: string
  estimatedSaving?: number
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const voucherReviewApi = {
  /** Fetch the curated voucher-review context for one VOUCHER approval. */
  get: async (approvalId: string): Promise<VoucherReviewContext> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/approvals/${approvalId}/voucher-review`,
      { auth: true },
    )
    return voucherReviewContextSchema.parse(raw)
  },

  /**
   * Approve a submitted custom voucher (Model 1). The server sets
   * approvalStatus:APPROVED and flips status:ACTIVE only when the merchant is
   * live (goLive); otherwise the voucher is approved-waiting. Throws ApiError on
   * invalid state (APPROVAL_NOT_ACTIONABLE / VOUCHER_NOT_ACTIONABLE / etc).
   */
  approve: async (approvalId: string): Promise<ApproveVoucherResponse> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/approvals/${approvalId}/approve-voucher`,
      { method: 'POST', auth: true },
    )
    return approveVoucherResponseSchema.parse(raw)
  },

  /** Reject a submitted custom voucher (reason emailed-dark + in-app). */
  reject: async (approvalId: string, reason: string): Promise<RejectVoucherResponse> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/approvals/${approvalId}/reject-voucher`,
      { method: 'POST', auth: true, body: JSON.stringify({ reason }) },
    )
    return rejectVoucherResponseSchema.parse(raw)
  },

  /**
   * Request changes (the concierge round). `proposed` (when supplied) carries
   * only allow-listed correction fields; omit it for a comment-only request.
   * The backend never blind-spreads proposed.
   */
  requestChanges: async (
    approvalId: string,
    input: { proposed?: VoucherProposal; note: string },
  ): Promise<RequestVoucherChangesResponse> => {
    const body =
      input.proposed !== undefined
        ? { proposed: input.proposed, note: input.note }
        : { note: input.note }
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/approvals/${approvalId}/request-voucher-changes`,
      { method: 'POST', auth: true, body: JSON.stringify(body) },
    )
    return requestVoucherChangesResponseSchema.parse(raw)
  },
}
