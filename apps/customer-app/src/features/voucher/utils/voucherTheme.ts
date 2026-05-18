import type { VoucherType } from '@/lib/api/voucher'

/**
 * Per-voucher-type colour theme + label copy. Source values are duplicated
 * from `apps/customer-app/src/features/merchant/components/VoucherCard.tsx`
 * (the locked merchant-profile rebaseline baseline). Duplicated rather
 * than imported because VoucherCard's constants are file-private; a
 * shared module is a sensible follow-up but not strictly necessary for
 * this rebaseline. Keep the values 1:1 with VoucherCard so the type
 * theming stays consistent across surfaces.
 */

export type VoucherGradient = readonly [string, string]

const TYPE_GRADIENTS: Record<VoucherType, VoucherGradient> = {
  BOGO:             ['#B7A4F2', '#6E3DD3'],   // soft lavender → vivid violet
  DISCOUNT_FIXED:   ['#FB8896', '#D8302A'],   // soft coral → bright red
  DISCOUNT_PERCENT: ['#FB8896', '#D8302A'],
  FREEBIE:          ['#A0E5BA', '#208E50'],   // soft mint → vivid emerald
  SPEND_AND_SAVE:   ['#FAB78E', '#D6531B'],   // soft peach → bright orange
  PACKAGE_DEAL:     ['#9CC0F5', '#2D5BCC'],   // soft sky → vivid blue
  TIME_LIMITED:     ['#F4D072', '#BC6D1C'],   // honey → vivid amber
  REUSABLE:         ['#84DCC2', '#198375'],   // mint-teal → rich teal
} as const

const TYPE_LABELS: Record<VoucherType, string> = {
  BOGO:             'Buy one, get one free',
  DISCOUNT_FIXED:   'Discount',
  DISCOUNT_PERCENT: 'Discount',
  FREEBIE:          'Freebie',
  SPEND_AND_SAVE:   'Spend & save',
  PACKAGE_DEAL:     'Package deal',
  TIME_LIMITED:     'Time limited',
  REUSABLE:         'Reusable',
}

// §BO Revision (2026-05-18) — short-form labels for dense row
// contexts (Savings RedemptionRow + future analytics surfaces) where
// the canonical long-form labels above truncate the row's branch
// suffix on narrow phones.  Only BOGO + PACKAGE_DEAL + TIME_LIMITED
// shorten meaningfully; the rest match the long form 1:1 so callers
// can use this helper uniformly without per-type branching.
//
// Visual-only contract: callers MUST still surface the long form in
// accessibility labels (`accessibilityLabel`) so screen readers say
// the full type name.  See `RedemptionRow.tsx` for the canonical
// long-vs-short split.
const TYPE_LABELS_SHORT: Record<VoucherType, string> = {
  BOGO:             'BOGO',
  DISCOUNT_FIXED:   'Discount',
  DISCOUNT_PERCENT: 'Discount',
  FREEBIE:          'Freebie',
  SPEND_AND_SAVE:   'Spend & save',
  PACKAGE_DEAL:     'Package',
  TIME_LIMITED:     'Time-limited',
  REUSABLE:         'Reusable',
}

export function voucherGradient(type: VoucherType): VoucherGradient {
  return TYPE_GRADIENTS[type] ?? TYPE_GRADIENTS.DISCOUNT_FIXED
}

export function voucherTypeLabel(type: VoucherType): string {
  return TYPE_LABELS[type] ?? 'Voucher'
}

/**
 * Short-form voucher-type label for dense row contexts.
 *
 * The canonical `voucherTypeLabel()` returns full marketing-tone
 * labels ("Buy one, get one free", "Package deal", "Time limited").
 * On dense rows like the Savings RedemptionRow meta line — where
 * the rendered text is `${label} voucher` followed by a separate
 * branch · time row — the long form can truncate the branch suffix
 * on narrow phones (iPhone 13 mini etc.).
 *
 * Use this helper for VISIBLE TEXT on dense rows only.  Continue
 * using `voucherTypeLabel()` for:
 *   - Voucher Detail surfaces (hero type chip, type explainer card)
 *   - Redemption Receipt header chip
 *   - SuccessPopup voucher strip
 *   - Merchant Profile voucher cards
 *   - Accessibility labels (screen readers benefit from the full
 *     wording even when the visible text is short)
 *
 * Most types are unchanged between long and short forms; only BOGO
 * (50+ chars → 4 chars), PACKAGE_DEAL ("Package deal" → "Package"),
 * and TIME_LIMITED ("Time limited" → "Time-limited") materially
 * shorten.  The rest pass through unchanged so callers don't need
 * per-type branching.
 */
export function voucherTypeLabelShort(type: VoucherType): string {
  return TYPE_LABELS_SHORT[type] ?? 'Voucher'
}

/**
 * Smart £ formatting:
 *   Whole pounds → "£5"     (no decimals)
 *   Pennies      → "£5.50"  (always 2 decimals)
 * Mirrors VoucherCard's behaviour exactly.
 */
export function formatPounds(value: number): string {
  if (Number.isInteger(value)) return `£${value}`
  return `£${value.toFixed(2)}`
}
