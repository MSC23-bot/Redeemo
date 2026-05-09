// Format an 8-character uppercase alphanumeric redemption code as two
// 4-char groups separated by a single space. Pure function;
// case-preserving (the backend alphabet is uppercase only — including
// `O` and `I` excluded — so the input is already uppercase by
// contract; this helper does not transform case).
//
// Backend emits 8 chars from the alphabet
// `ABCDEFGHJKLMNPQRSTUVWXYZ0123456789` (locked 2026-05-07 from
// device QA). Locked design baseline: `4+4` grouping with a monospace
// font in the success popup + redemption-details card. Easier for
// merchants to read aloud and write on bills than the previous
// 10-char mixed-case `5+5`.
//
// Inputs that are not exactly 8 chars are returned unchanged so the
// utility is safe for any code shape (defensive against legacy or
// future backend changes).

export function formatRedemptionCode(code: string): string {
  if (code.length !== 8) return code
  return `${code.slice(0, 4)} ${code.slice(4)}`
}

/**
 * Screen-reader friendly version of the redemption code. VoiceOver /
 * TalkBack would otherwise slur 'A7K2P9X4' into a single confusing
 * word; spacing each character forces character-by-character
 * announcement, and the comma between the two groups gives the
 * reader a natural pause matching the visual 4+4 layout.
 *
 * Example: 'A7K2P9X4' → 'Redemption code A 7 K 2, P 9 X 4'.
 *
 * For non-8-char inputs (defensive against legacy / future code
 * shapes) the raw code is read out unchanged.
 *
 * Used by `<QRCodeBlock>` (M3 Task 9) for `accessibilityLabel`.
 */
export function codeAccessibilityLabel(code: string): string {
  if (code.length !== 8) return `Redemption code ${code}`
  const left  = code.slice(0, 4).split('').join(' ')
  const right = code.slice(4).split('').join(' ')
  return `Redemption code ${left}, ${right}`
}
