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

export function voucherGradient(type: VoucherType): VoucherGradient {
  return TYPE_GRADIENTS[type] ?? TYPE_GRADIENTS.DISCOUNT_FIXED
}

export function voucherTypeLabel(type: VoucherType): string {
  return TYPE_LABELS[type] ?? 'Voucher'
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
