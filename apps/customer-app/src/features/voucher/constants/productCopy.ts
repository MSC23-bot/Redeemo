/**
 * Product copy constants — Voucher Detail screen
 *
 * Strings here are deterministic product copy applied to every voucher
 * (no per-voucher backend field today). Centralising them so the
 * component code is free of hardcoded prose, and so reviewers / legal
 * have one place to audit the customer-facing language.
 *
 * **Provenance**: lifted verbatim from the locked v4 brainstorm
 * (`.superpowers/brainstorm/88554-1776435672/content/voucher-detail-v4.html`).
 *
 * **Future direction**: when we add a per-voucher `fairUse` field on
 * Voucher (or a `voucherFairUse` table keyed by voucher type), this
 * file should switch to "fallback when backend value is missing".
 */

/** Section heading for the Fair Use Policy card. */
export const FAIR_USE_TITLE = 'Fair Use Policy'

/**
 * Universal Fair Use lines applied to every voucher type. Mirrors the
 * v4 brainstorm. Line 1 is BOGO-shaped; for non-BOGO vouchers it still
 * communicates the spirit (1 voucher per 2 guests / scaled groups), so
 * we keep it for now. When per-type fair-use copy is needed, derive
 * a list at call-site by `voucher.type` instead of using this constant.
 */
export const FAIR_USE_LINES: ReadonlyArray<string> = [
  'BOGO/2-for-1: 1 voucher per 2 guests. Groups of 4 may use 2, groups of 6 may use 3.',
  'Present voucher before ordering — must be shown before the bill is generated.',
  'For personal use only — voucher is non-transferable.',
  'Merchant reserves the right to refuse if fair use is not followed.',
]

/**
 * "How It Works" — 4-step universal flow. Same for every voucher.
 */
export const HOW_IT_WORKS_STEPS: ReadonlyArray<{ label: string; desc: string }> = [
  { label: 'Tap Redeem',          desc: 'Hit the button below to start the redemption process.' },
  { label: 'Enter Branch PIN',    desc: 'Ask a staff member for the 4-digit PIN and enter it.' },
  { label: 'Show Your Code',      desc: 'Present the redemption code or QR to staff for validation.' },
  { label: 'Enjoy Your Deal!',    desc: 'The voucher will be applied to your bill. Enjoy!' },
]

/** CTA labels (Title Case to match v4 mockup). */
export const CTA_LABELS = {
  redeemActive:    'Redeem This Voucher',
  redeemSubscribe: 'Subscribe to Redeem — £6.99/mo',
  redeemed:        'Already Redeemed This Cycle',
  expired:         'Expired',
  unavailable:     'Currently Unavailable',
  branchLoading:   'Resolving Branch…',
} as const

/**
 * Helper — splits a paragraph-format `terms` string into bullet items
 * for display. Backend currently stores Voucher.terms as a single
 * string with sentences separated by period+space. When merchants
 * later format with line-breaks, those win. Falls back to a single-
 * item list (the entire string) if no boundaries are found.
 */
export function splitTermsIntoBullets(terms: string | null): string[] {
  if (!terms) return []
  const trimmed = terms.trim()
  if (!trimmed) return []
  // Prefer line-break splits when the merchant has formatted with
  // newlines. Otherwise split on sentence boundaries (period followed
  // by whitespace + capital letter), which handles paragraph-format
  // seed data like "In-house only. Cannot be combined with other
  // offers. Once per cycle." cleanly.
  const items = trimmed.includes('\n')
    ? trimmed.split(/\r?\n+/)
    : trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/)
  return items
    .map(s => s.replace(/^\s+|\s+$/g, '').replace(/\.$/, ''))
    .filter(Boolean)
}
