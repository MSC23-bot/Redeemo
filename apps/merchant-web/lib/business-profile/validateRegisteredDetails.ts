// Business Profile M3: pure validation for the Registered details direct-edit card
// (website / company number / VAT number). All three fields are optional at the
// backend (the onboarding `BusinessProfileForm` also treats them as plain optional
// strings with no server-side format enforcement - `z.record(z.string(), z.unknown())`
// on the PATCH route). An EMPTY value is always valid (it clears the field); a
// FILLED value is checked against the same shape the field's own hint text already
// promises the merchant, so a save can be rejected with a specific, honest message
// rather than silently accepting a value the backend will never validate either.
//
// Kept as pure functions (no framework import) so they are trivially unit-testable
// and reusable from any future edit surface for these same three fields.

/** Website: optionally schemed, must look like a real domain when filled. */
const WEBSITE_RE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i

/** Company number: Companies House format - 8 digits, or 2 letters then 6 digits. */
const COMPANY_NUMBER_RE = /^(\d{8}|[a-z]{2}\d{6})$/i

/** VAT number: "GB" followed by 9 or 12 digits (the group-VAT suffix form), spaces/case-insensitive. */
const VAT_NUMBER_RE = /^gb ?\d{9}(\d{3})?$/i

export function validateWebsiteUrl(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (!WEBSITE_RE.test(trimmed)) return 'Enter a valid website, e.g. yourbusiness.co.uk.'
  return null
}

export function validateCompanyNumber(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (!COMPANY_NUMBER_RE.test(trimmed.replace(/\s+/g, ''))) {
    return 'Enter 8 digits, or 2 letters then 6 digits.'
  }
  return null
}

export function validateVatNumber(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (!VAT_NUMBER_RE.test(trimmed.replace(/\s+/g, ''))) {
    return 'Enter GB followed by 9 digits, e.g. GB 213987422.'
  }
  return null
}

export interface RegisteredDetailsDraft {
  websiteUrl: string
  companyNumber: string
  vatNumber: string
}

export interface RegisteredDetailsErrors {
  websiteUrl: string | null
  companyNumber: string | null
  vatNumber: string | null
}

/** Validate all three fields at once; returns an error object (each key null when valid). */
export function validateRegisteredDetails(draft: RegisteredDetailsDraft): RegisteredDetailsErrors {
  return {
    websiteUrl: validateWebsiteUrl(draft.websiteUrl),
    companyNumber: validateCompanyNumber(draft.companyNumber),
    vatNumber: validateVatNumber(draft.vatNumber),
  }
}

export function hasRegisteredDetailsErrors(errors: RegisteredDetailsErrors): boolean {
  return errors.websiteUrl !== null || errors.companyNumber !== null || errors.vatNumber !== null
}
