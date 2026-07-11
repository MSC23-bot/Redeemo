import { REQUEST_TIMEOUT_CODE, REQUEST_TIMEOUT_MESSAGE } from '@/lib/api/client'

// Voucher governed flows (2026-07-07): a small shared map from the backend's
// ApiError.code to a calm merchant-facing message, mirroring the existing
// per-module inline maps (CloseBranchModal, PublicIdentityEditModal). Callers
// pass their own fallback for an unmapped/undefined code; PENDING_EDIT_EXISTS
// is handled separately by each modal (a dedicated "already pending" notice,
// not a generic error string).
const MESSAGES: Record<string, string> = {
  VOUCHER_EDIT_NOT_ALLOWED: 'This voucher is not eligible for this request right now.',
  VOUCHER_WITHDRAW_NOT_PENDING: 'This voucher has no submission awaiting review to withdraw.',
  VOUCHER_EDIT_INVALID_FIELD:
    'Check the fields above: the title cannot be empty and text fields must be plain text.',
  RMV_FIELD_NOT_ALLOWED: 'One or more of these fields cannot be requested for this voucher.',
  SAVING_INVALID: 'Enter a valid saving amount.',
  PENDING_EDIT_NOT_FOUND: 'That request could not be found. It may already have been reviewed.',
  RMV_NOT_FOUND: 'We could not find this flagship voucher.',
  VOUCHER_NOT_FOUND: 'We could not find this voucher.',
  // Client-side request timeout: callers here pass a code + their own fallback (not
  // err.message), so WITHOUT this entry a timeout would show the generic fallback
  // instead of the honest connection message.
  [REQUEST_TIMEOUT_CODE]: REQUEST_TIMEOUT_MESSAGE,
}

export function governedErrorMessage(code: string | undefined, fallback: string): string {
  if (code && MESSAGES[code]) return MESSAGES[code]
  return fallback
}
