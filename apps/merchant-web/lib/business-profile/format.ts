// Business Profile M2: small display-formatting helpers shared across the read
// shell's cards. Kept pure + framework-free so they unit-test in isolation.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// en-GB long date, e.g. "14 May 2026". Mirrors the exact month-name-array pattern
// already established by ContractAgreementForm.formatTodayLabel for this same
// merchant-agreement surface, for consistency. Returns null on a missing/malformed
// ISO string so callers can render a calm fallback rather than "Invalid Date".
export function formatDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// Human phrase for the Prisma SignatureMethod enum (CLICK_TO_AGREE | ZOHO_SIGN).
// Defaults to the click-to-agree phrasing for an unrecognised/absent value, since
// that is the only signature method the portal's onboarding contract step offers
// today.
export function signatureMethodPhrase(method: string | null | undefined): string {
  if (method === 'ZOHO_SIGN') return 'via Zoho Sign'
  return 'by click to agree'
}

// Combine the owner's stored phone + country code into one display string, e.g.
// "+44 1223 456 789". Defensive: if `phone` already carries a leading "+" it is
// returned as-is (already fully-formatted / already E.164); otherwise the country
// code (normalised to a leading "+") is prefixed. Returns null when there is no
// phone at all.
export function formatOwnerPhone(
  phone: string | null | undefined,
  countryCode: string | null | undefined,
): string | null {
  const trimmedPhone = (phone ?? '').trim()
  if (!trimmedPhone) return null
  if (trimmedPhone.startsWith('+')) return trimmedPhone

  const trimmedCode = (countryCode ?? '').trim()
  if (!trimmedCode) return trimmedPhone

  const normalisedCode = trimmedCode.startsWith('+') ? trimmedCode : `+${trimmedCode}`
  return `${normalisedCode} ${trimmedPhone}`
}

// "Mr James Whitfield" style honorifics do not exist on the MerchantAdmin record
// (no title field in the data model) - this composes the plain "First Last" name,
// trimming/collapsing so a missing part degrades gracefully rather than leaving a
// stray double space.
export function formatOwnerName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return [firstName, lastName]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ')
}
