/**
 * NamedGateBanner — maps backend error codes from approval actions to calm,
 * human-readable danger banners.
 *
 * Covers the full set of codes the actioner endpoints can surface:
 *   ONBOARDING_GATES_INCOMPLETE  — checklist rows are highlighted separately
 *   MAIN_BRANCH_LOCATION_UNCONFIRMED
 *   APPROVAL_NOT_ACTIONABLE      — stale state; page has already refreshed
 *   APPROVAL_ALREADY_CLAIMED     — race condition on claim
 *   APPROVAL_NOT_CLAIMER         — non-claimer attempted release
 *   APPROVAL_NOT_FOUND           — approval has been removed
 *   VOUCHER_NOT_ACTIONABLE       : VOUCHER lane: voucher state changed; refreshed
 *   VOUCHER_NOT_FOUND            : VOUCHER lane: voucher could not be found
 *   (default) — ApiError.message or a generic fallback
 *
 * Also exports `failedChecklistGates` to extract the checklist payload from
 * an ONBOARDING_GATES_INCOMPLETE error so the page can highlight affected rows.
 */
import { ApiError } from '@/lib/api/client'

// Friendly labels for each gate that can fail under ONBOARDING_GATES_INCOMPLETE.
// Exported (B3) so the SubmitForReviewCard checklist and this banner share ONE
// label source.
export const GATE_LABELS: Record<string, string> = {
  branch_created: 'At least one branch',
  contract_signed: 'A signed contract',
  rmv_configured: '2 mandatory RMV vouchers',
}

const CODE_MESSAGES: Record<string, string> = {
  ONBOARDING_GATES_INCOMPLETE:
    'Cannot go live: not all onboarding requirements are complete.',
  MAIN_BRANCH_LOCATION_UNCONFIRMED:
    'Cannot go live: the main branch location is not confirmed. Confirm the branch pin, then approve.',
  APPROVAL_NOT_ACTIONABLE:
    'This approval can no longer be actioned: its state changed. The page has refreshed.',
  APPROVAL_ALREADY_CLAIMED:
    'This approval is already being reviewed by another admin.',
  APPROVAL_NOT_CLAIMER:
    'Only the admin who claimed this, or a super admin, can release it.',
  APPROVAL_NOT_FOUND: 'This approval no longer exists.',
  // M6: merchant lifecycle + branch confirm-location.
  EMAIL_ALREADY_EXISTS:
    'An account with this email already exists. Use a different owner email.',
  MERCHANT_NOT_FOUND: 'Merchant not found.',
  MERCHANT_NOT_SUSPENDED:
    'This merchant is not suspended, so it cannot be reactivated.',
  BRANCH_NOT_FOUND: 'Branch not found.',
  // Option B B1: pending-edit applier.
  PENDING_EDIT_NOT_ACTIONABLE:
    'This edit request is no longer pending and cannot be actioned. The page has refreshed.',
  PENDING_EDIT_NOT_FOUND: 'This edit request no longer exists.',
  EDIT_PHOTO_APPLY_NOT_SUPPORTED:
    'Photo edits cannot be applied yet. You can reject this request, or apply it in a future update.',
  // Option B B2.3: admin category edit.
  CATEGORY_CHANGE_BLOCKED:
    'Category is locked: this merchant has submitted or live vouchers. It cannot be changed.',
  NO_RMV_TEMPLATE:
    'That category has no mandatory voucher templates set up, so it cannot be assigned.',
  // Option B B2.4: admin branch create + soft-delete.
  POSTCODE_REQUIRED: 'A postcode is required to create a branch.',
  POSTCODE_NOT_FOUND: 'That postcode could not be found. Check it and try again.',
  GAZETTEER_UNAVAILABLE: 'Address lookup is temporarily unavailable. Try again shortly.',
  BRANCH_IS_MAIN: 'The main branch cannot be deleted.',
  BRANCH_LAST_ACTIVE: "This is the merchant's last active branch and cannot be deleted.",
  // Option B B2.5: admin propose-sensitive-edit.
  NO_SENSITIVE_FIELDS:
    'No changes to propose. Edit at least one field, then send for review.',
  PENDING_EDIT_EXISTS:
    'This merchant already has an identity edit awaiting review. Action that request first.',
  // Option B B3: admin submit-for-approval on behalf. Covers the not-submittable
  // states (already submitted / under review / live), incl. a SUSPENDED merchant
  // (the backend surfaces that as ALREADY_SUBMITTED).
  ALREADY_SUBMITTED:
    'This merchant is not in a submittable state (already submitted, under review, or live). The page has refreshed.',
  // Option B B4: admin document upload / delete on behalf.
  STORAGE_NOT_ENABLED:
    'Document storage is not enabled yet, so the document could not be uploaded. Please try again later or contact support.',
  FILE_REQUIRED: 'Select a file to upload.',
  FILE_TOO_LARGE: 'That file is too large. The maximum size is 10 MB.',
  UNSUPPORTED_FILE_TYPE: 'Unsupported file type. Upload a PDF, JPG, or PNG.',
  DOCUMENT_NOT_FOUND: 'This document no longer exists. The list has refreshed.',
  // Day-2 Vouchers PR-C: the VOUCHER approval lane (voucherApprover.ts).
  VOUCHER_NOT_ACTIONABLE:
    'This voucher is not in a state that can be actioned. The page has refreshed.',
  VOUCHER_NOT_FOUND: 'This voucher could not be found. The page has refreshed.',
  // Option B B5.1 (Merchant 360 A3): admin RMV co-build on behalf (edit + submit).
  RMV_NOT_FOUND: 'This mandatory voucher could not be found. The list has refreshed.',
  VOUCHER_NOT_EDITABLE:
    'This voucher is no longer a draft, so it cannot be edited. The list has refreshed.',
  VOUCHER_NOT_SUBMITTABLE:
    'This voucher is no longer a draft, so it cannot be submitted. The list has refreshed.',
  RMV_FIELD_NOT_ALLOWED:
    'One of the fields cannot be edited on this voucher. The list has refreshed; try again.',
  // D65: the in-person assisted contract-signing ceremony (agreement/sign).
  // AGREEMENT_LEGAL_REVIEW_REQUIRED is the fail-closed legal gate: signing
  // becomes available once legal review completes. This copy NEVER states or
  // implies solicitor approval (owner-locked framing, spec §6).
  AGREEMENT_LEGAL_REVIEW_REQUIRED:
    'This agreement is pending legal review, so it cannot be signed for production yet. Signing becomes available once legal review is complete.',
  CONTRACT_ALREADY_SIGNED:
    'This merchant has already signed the agreement. The page has refreshed.',
  AGREEMENT_VERSION_UNKNOWN:
    'The agreement version was not recognised. The page has refreshed; try again.',
  AGREEMENT_SIGNER_INVALID:
    'A signatory name and role are required to sign this agreement.',
  // Team & Roles S2: the SUPER_ADMIN-only account/role/grant management screen.
  CAPABILITY_NOT_GRANTABLE:
    'This capability cannot be granted from this screen.',
  ADMIN_SELF_ACTION_FORBIDDEN:
    'You cannot perform this action on your own account.',
  ADMIN_NOT_FOUND: 'This admin account no longer exists. The list has refreshed.',
  GRANT_NOT_FOUND: 'This capability grant no longer exists. The list has refreshed.',
  LAST_SUPER_ADMIN_PROTECTED:
    'The last active Super Admin cannot be demoted or deactivated. Promote another admin to Super Admin first.',
  // MerchantLead recruitment pipeline (packet 2026-07-12): the Prospect pipeline
  // board's move / mark-lost / convert actions.
  LEAD_NOT_FOUND: 'This lead no longer exists. The pipeline has refreshed.',
  LEAD_LOST_REASON_REQUIRED: 'A reason is required to mark a lead as lost.',
  LEAD_STAGE_NOT_DIRECTLY_SETTABLE:
    'A lead becomes converted only by converting it to a merchant draft, not by a stage move.',
  LEAD_ALREADY_CONVERTED:
    'This lead has already been converted to a merchant draft. The pipeline has refreshed.',
  LEAD_ANONYMISED:
    'This lead has been anonymised for data retention and can no longer be edited.',
  // MerchantNote packet (2026-07-13, PR #510, D51): the internal per-merchant
  // notes surface (add / edit-own / retract-own). Edit and retract are OWN +
  // ACTIVE only; v1 has no moderation override.
  NOTE_NOT_FOUND: 'This note no longer exists. The list has refreshed.',
  NOTE_NOT_AUTHOR:
    'Only the admin who wrote a note can edit or retract it. The list has refreshed.',
  NOTE_NOT_ACTIVE:
    'This note has already been retracted, so it cannot be edited or retracted again. The list has refreshed.',
  NOTE_RETRACT_REASON_REQUIRED: 'A reason is required to retract a note.',
  // Team & Roles S3: the FIELD pre-live scope guard (assertFieldPreLiveScope).
  // FIELD reps hold the assisted-onboarding on-behalf capabilities, but those
  // apply only while the merchant is still pre-live (REGISTERED / PENDING_APPROVAL).
  MERCHANT_NOT_PRE_LIVE_FOR_FIELD:
    'Field reps can only act on merchants that are still being onboarded. This merchant is no longer in that state, so this action is not available here.',
}

function getMessage(error: unknown, overrides?: Record<string, string>): string {
  if (error instanceof ApiError) {
    if (error.code && overrides?.[error.code]) {
      return overrides[error.code]
    }
    if (error.code && CODE_MESSAGES[error.code]) {
      return CODE_MESSAGES[error.code]
    }
    return error.message ?? 'Something went wrong. Please try again.'
  }
  return 'Something went wrong. Please try again.'
}

interface NamedGateBannerProps {
  error: unknown
  /**
   * Per-call-site copy overrides, keyed by error code. Lets a screen give a
   * shared code (e.g. EMAIL_ALREADY_EXISTS) context-appropriate wording
   * without changing its meaning for every other caller. Falls back to
   * CODE_MESSAGES, then the raw ApiError message, when a code has no override.
   */
  overrides?: Record<string, string>
}

export function NamedGateBanner({ error, overrides }: NamedGateBannerProps) {
  const message = getMessage(error, overrides)

  // For ONBOARDING_GATES_INCOMPLETE, list the specific unmet gates inside the banner
  // so the admin sees what blocked approval without closing the dialog.
  const isGatesIncomplete =
    error instanceof ApiError && error.code === 'ONBOARDING_GATES_INCOMPLETE'
  const checklist = isGatesIncomplete ? failedChecklistGates(error) : null
  const unmetGates =
    checklist != null
      ? (Object.keys(GATE_LABELS) as (keyof typeof GATE_LABELS)[]).filter(
          (key) => checklist[key as keyof typeof checklist] === false
        )
      : []

  return (
    <div
      role="alert"
      data-testid="named-gate-banner"
      className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <p>{message}</p>
      {isGatesIncomplete && unmetGates.length > 0 && (
        <div className="mt-2">
          <p className="font-medium">Still needed:</p>
          <ul className="mt-1 list-disc pl-5" data-testid="named-gate-banner-unmet-list">
            {unmetGates.map((key) => (
              <li key={key}>{GATE_LABELS[key]}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Returns the failed checklist gate flags from an ONBOARDING_GATES_INCOMPLETE
 * error, or null for any other error/code.
 */
export function failedChecklistGates(
  error: unknown
): { branch_created?: boolean; contract_signed?: boolean; rmv_configured?: boolean } | null {
  if (!(error instanceof ApiError)) return null
  if (error.code !== 'ONBOARDING_GATES_INCOMPLETE') return null
  const body = error.body as
    | { error?: { checklist?: { branch_created?: boolean; contract_signed?: boolean; rmv_configured?: boolean } } }
    | null
  return body?.error?.checklist ?? null
}
