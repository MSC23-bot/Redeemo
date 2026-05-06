// Format a 10-character alphanumeric redemption code as two 5-char groups
// separated by a single space. Pure function; case-preserving.
//
// Backend emits 10 chars from the alphabet [A-Za-z0-9]; spec §6 / decision
// D4 in the rebaseline plan locks the display format at "5+5" with a
// monospace font in the success popup + redemption-details card.
//
// Inputs that are not exactly 10 chars are returned unchanged so the
// utility is safe for any code shape (defensive against future backend
// changes).

export function formatRedemptionCode(code: string): string {
  if (code.length !== 10) return code
  return `${code.slice(0, 5)} ${code.slice(5)}`
}
