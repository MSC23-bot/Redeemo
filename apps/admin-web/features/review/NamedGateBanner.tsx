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
  return (
    <div
      role="alert"
      data-testid="named-gate-banner"
      className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {message}
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
