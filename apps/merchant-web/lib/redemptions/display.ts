// M3 F1: pure display helpers for the merchant Redemptions surface. House style:
// no em dashes; brand tokens drive colour at the component layer. These helpers
// never touch customer contact data; identity comes pre-formatted (first name +
// last initial) from the API.
import type { VoucherType } from '@/components/ui/chip'

// 8-char codes display grouped 4+4 (e.g. "A7K2 P9X4") to match how staff read
// them off a bill. Non-8 inputs are just uppercased.
export function formatRedemptionCode(raw: string): string {
  const code = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`
  return code
}

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatRedeemedAt(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return dateTimeFmt.format(d)
}

const gbpFmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })

export function formatSaving(value: number): string {
  return gbpFmt.format(value)
}

// Maps the backend VoucherType enum to the design-system Chip type. Unknown types
// fall back to the neutral discount accent (forward-compat for new types).
const CHIP_BY_TYPE: Record<string, VoucherType> = {
  BOGO: 'bogo',
  SPEND_AND_SAVE: 'spendsave',
  DISCOUNT_FIXED: 'discount',
  DISCOUNT_PERCENT: 'discount',
  FREEBIE: 'freebie',
  PACKAGE_DEAL: 'package',
  TIME_LIMITED: 'timelimited',
  REUSABLE: 'reusable',
}

export function voucherTypeChip(type: string): VoucherType {
  return CHIP_BY_TYPE[type] ?? 'discount'
}

// Human-readable voucher-type label. BOGO stays as the acronym; everything else
// is sentence-cased from the SCREAMING_SNAKE enum.
const LABEL_OVERRIDE: Record<string, string> = { BOGO: 'BOGO' }

export function voucherTypeLabel(type: string): string {
  if (LABEL_OVERRIDE[type]) return LABEL_OVERRIDE[type]
  const words = type.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function statusLabel(status: 'AWAITING_VALIDATION' | 'VALIDATED'): string {
  return status === 'VALIDATED' ? 'Validated' : 'Awaiting validation'
}
