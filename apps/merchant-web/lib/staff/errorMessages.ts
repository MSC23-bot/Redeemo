import { ApiError, REQUEST_TIMEOUT_CODE, REQUEST_TIMEOUT_MESSAGE } from '@/lib/api/client'

// Staff & Access (v1) PR-C: map a thrown error from the staff endpoints to friendly
// member-management copy. Falls back to the ApiError message, then a generic line.
// House style: no em-dashes.
const FRIENDLY: Record<string, string> = {
  EMAIL_ALREADY_EXISTS: 'That email already belongs to a portal account. Use a different email.',
  MEMBER_NOT_FOUND: 'We could not find that team member. Refresh and try again.',
  MEMBER_ALREADY_CLAIMED: 'This member has already set up their account, so there is nothing to resend.',
  LAST_OWNER_PROTECTED: 'You cannot remove or deactivate the only active owner. Make someone else an owner first.',
  INSUFFICIENT_PERMISSIONS: 'You do not have permission to manage the team.',
  MERCHANT_SUSPENDED: 'Your account is suspended. Contact Redeemo.',
  BRANCH_NOT_OWNED: 'One of the selected branches is not part of your business.',
  MULTIPLE_BRANCH_USERS:
    'This branch has more than one app user, so we cannot safely change just one yet. Contact Redeemo.',
  BRANCH_USER_NOT_FOUND: 'There is no app user on this branch to update.',
  VALIDATION_ERROR: 'Please check the form and try again.',
  // Client-side request timeout (the ApiError already carries this message; mapped
  // explicitly so the friendly map stays the single visible inventory of codes).
  [REQUEST_TIMEOUT_CODE]: REQUEST_TIMEOUT_MESSAGE,
}

export function staffErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Too many attempts. Please wait a moment and try again.'
    if (err.code && FRIENDLY[err.code]) return FRIENDLY[err.code]
    return err.message || 'Something went wrong. Please try again.'
  }
  return 'Something went wrong. Please try again.'
}
