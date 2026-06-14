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
 *   (default) — ApiError.message or a generic fallback
 *
 * Also exports `failedChecklistGates` to extract the checklist payload from
 * an ONBOARDING_GATES_INCOMPLETE error so the page can highlight affected rows.
 */
import { ApiError } from '@/lib/api/client'

// Friendly labels for each gate that can fail under ONBOARDING_GATES_INCOMPLETE.
const GATE_LABELS: Record<string, string> = {
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
}

function getMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code && CODE_MESSAGES[error.code]) {
      return CODE_MESSAGES[error.code]
    }
    return error.message ?? 'Something went wrong. Please try again.'
  }
  return 'Something went wrong. Please try again.'
}

interface NamedGateBannerProps {
  error: unknown
}

export function NamedGateBanner({ error }: NamedGateBannerProps) {
  const message = getMessage(error)

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
