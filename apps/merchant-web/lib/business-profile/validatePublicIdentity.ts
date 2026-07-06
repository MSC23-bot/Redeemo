// Business Profile M4: pure validation for the "Public identity" edit modal
// (businessName / tradingName / description). Mirrors the onboarding
// BusinessProfileForm's rules for the SAME fields (businessName required,
// description required + 600-char cap) so a day-2 edit can never save a shape the
// onboarding step would have rejected. tradingName has no format rule (optional,
// clears to null when emptied) - same as onboarding.
//
// Kept as pure functions (no framework import), matching validateRegisteredDetails.ts,
// so they are trivially unit-testable and reusable from any future edit surface.

export const DESCRIPTION_MAX = 600

export function validateBusinessName(value: string): string | null {
  if (value.trim().length === 0) return 'Registered business name is required.'
  return null
}

export function validateDescription(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Business description is required.'
  if (trimmed.length > DESCRIPTION_MAX) return `Keep it under ${DESCRIPTION_MAX} characters.`
  return null
}

export interface PublicIdentityDraft {
  businessName: string
  tradingName: string
  description: string
}

export interface PublicIdentityErrors {
  businessName: string | null
  description: string | null
}

export function validatePublicIdentity(draft: PublicIdentityDraft): PublicIdentityErrors {
  return {
    businessName: validateBusinessName(draft.businessName),
    description: validateDescription(draft.description),
  }
}

export function hasPublicIdentityErrors(errors: PublicIdentityErrors): boolean {
  return errors.businessName !== null || errors.description !== null
}
