/**
 * Admin review API.
 *
 * Typed wrapper for the approval review context endpoint:
 *
 *   GET /api/v1/admin/approvals/:id/review
 *     -> full ReviewContext for a MERCHANT_ONBOARDING approval
 *
 * Every response is validated with Zod so contract drift surfaces as a clear
 * error rather than an undefined-field crash. Non-onboarding approvals return
 * a minimal context (merchant/owner/checklist/thinAreas null, arrays empty).
 */
import { z } from 'zod'
import { apiFetch } from './client'

// ── Response schemas ──────────────────────────────────────────────────────────

const adminActorSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
})

export const reviewApprovalSchema = z.object({
  id: z.string(),
  type: z.enum([
    'MERCHANT_ONBOARDING',
    'VOUCHER',
    'MERCHANT_PROFILE_EDIT',
    'MERCHANT_IDENTITY_EDIT',
    'BRANCH_IDENTITY_EDIT',
    // Branches PR-5 (D5): the branch-lifecycle approval lane. The /review
    // endpoint returns these types so the page can dispatch them to the
    // BranchLifecyclePanel; the panel reads its detail from /branch-lifecycle-review.
    'BRANCH_CREATE',
    'BRANCH_CLOSE',
    // Voucher governed-flows PR-B (sibling backend PR #411): a merchant voucher
    // change/end request. The page dispatches it to EditReviewPanel, which reads
    // its detail from the existing /edit-review endpoint (kind:'voucher').
    'VOUCHER_EDIT',
  ]),
  // WITHDRAWN (sibling backend PR #411): the merchant withdrew the request before
  // an admin acted. It leaves the actionable queue and is never actionable again.
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'WITHDRAWN']),
  submittedAt: z.string(),
  actionedAt: z.string().nullable(),
  claimedAt: z.string().nullable(),
  comment: z.string().nullable(),
  claimedBy: adminActorSchema.nullable(),
  actionedBy: adminActorSchema.nullable(),
})

export const reviewMerchantSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  tradingName: z.string().nullable(),
  description: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  logoUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  companyNumber: z.string().nullable(),
  vatNumber: z.string().nullable(),
  status: z.string(),
  verificationStatus: z.string(),
  contractStatus: z.string(),
  contractStartDate: z.string().nullable(),
  contractEndDate: z.string().nullable(),
  onboardingStep: z.string(),
  createdAt: z.string(),
  category: z.string().nullable(),
})

export const reviewOwnerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable().optional(),
})

// Branch Location Trust Slice 2 (spec 2026-07-09 §2.4): the staged Google
// suggestion the merchant picked at create/edit, surfaced for NEEDS_REVIEW
// exception context (suggested pin vs the current centroid). Admin-scope only.
// `source` discriminates WHICH staged blob was surfaced (lead-adjudicated read
// widening): an OPEN pending-edit suggestion wins over the branch-created audit.
export const reviewLocationSuggestionSchema = z.object({
  placeId: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  postcode: z.string().nullable(),
  source: z.enum(['pending_edit', 'branch_created_audit', 'branch_updated_audit']),
})

export const reviewBranchSchema = z.object({
  id: z.string(),
  name: z.string(),
  isMainBranch: z.boolean(),
  isActive: z.boolean(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  city: z.string(),
  postcode: z.string(),
  localityName: z.string().nullable(),
  locationConfidence: z.string(),
  // Slice 2 additive admin-scope provenance fields (nullable → back-compat).
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  googlePlaceId: z.string().nullable(),
  locationSuggestion: reviewLocationSuggestionSchema.nullable(),
})

export const reviewVoucherSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  isRmv: z.boolean(),
  rmvTemplateId: z.string().nullable(),
  status: z.string(),
  approvalStatus: z.string(),
  approvalComment: z.string().nullable(),
  estimatedSaving: z.number(),
  terms: z.string().nullable(),
  description: z.string().nullable(),
  expiryDate: z.string().nullable(),
})

export const reviewDocumentSchema = z.object({
  id: z.string(),
  documentType: z.string(),
  uploadedAt: z.string(),
  url: z.string().nullable(),
  available: z.boolean(),
})

export const reviewChecklistSchema = z.object({
  branch_created: z.boolean(),
  contract_signed: z.boolean(),
  rmv_configured: z.boolean(),
  all_complete: z.boolean(),
})

export const reviewThinAreasSchema = z.object({
  documentsUploaded: z.boolean(),
  companyTypeCaptured: z.boolean(),
  registeredOfficeCaptured: z.boolean(),
  sectorEvidenceCaptured: z.boolean(),
  companyNumberProvided: z.boolean(),
  vatNumberProvided: z.boolean(),
  documentsGated: z.boolean(),
})

export const reviewContextSchema = z.object({
  approval: reviewApprovalSchema,
  merchant: reviewMerchantSchema.nullable(),
  owner: reviewOwnerSchema.nullable(),
  branches: z.array(reviewBranchSchema),
  vouchers: z.array(reviewVoucherSchema),
  documents: z.array(reviewDocumentSchema),
  checklist: reviewChecklistSchema.nullable(),
  thinAreas: reviewThinAreasSchema.nullable(),
})

export type ReviewContext = z.infer<typeof reviewContextSchema>
export type ReviewApproval = z.infer<typeof reviewApprovalSchema>
export type ReviewMerchant = z.infer<typeof reviewMerchantSchema>
export type ReviewOwner = z.infer<typeof reviewOwnerSchema>
export type ReviewBranch = z.infer<typeof reviewBranchSchema>
export type ReviewLocationSuggestion = z.infer<typeof reviewLocationSuggestionSchema>
export type ReviewVoucher = z.infer<typeof reviewVoucherSchema>
export type ReviewDocument = z.infer<typeof reviewDocumentSchema>
export type ReviewChecklist = z.infer<typeof reviewChecklistSchema>
export type ReviewThinAreas = z.infer<typeof reviewThinAreasSchema>

// ── API calls ─────────────────────────────────────────────────────────────────

export const reviewApi = {
  /** Fetch the full review context for one approval. */
  get: async (approvalId: string): Promise<ReviewContext> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/approvals/${approvalId}/review`,
      { auth: true }
    )
    return reviewContextSchema.parse(raw)
  },
}
