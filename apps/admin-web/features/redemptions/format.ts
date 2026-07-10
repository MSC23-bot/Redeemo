/**
 * Shared redemption row/format helpers, extracted from the global /redemptions
 * page so the per-merchant Merchant 360 Redemptions tab (A3) can compose the SAME
 * presentation without forking. Pure functions only; behaviour is identical to the
 * page's originals (D67).
 */
import type { BadgeTone } from '@/features/shared/Badge'

// 8-char codes display grouped 4+4 (e.g. "A7K2 P9X4"); non-8 inputs pass
// through uppercased-as-is (defensive; the backend always returns 8 chars).
export function formatCode(raw: string): string {
  const code = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code
}

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
export function formatRedeemedAt(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '-' : dateTimeFmt.format(d)
}

const gbpFmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
export function formatSaving(value: number): string {
  return gbpFmt.format(value)
}

export function statusLabel(status: string): string {
  return status === 'VALIDATED' ? 'Validated' : 'Awaiting validation'
}
export function statusTone(status: string): BadgeTone {
  return status === 'VALIDATED' ? 'success' : 'warn'
}

const VOUCHER_TYPE_LABEL_OVERRIDE: Record<string, string> = { BOGO: 'BOGO' }
export function voucherTypeLabel(type: string): string {
  if (VOUCHER_TYPE_LABEL_OVERRIDE[type]) return VOUCHER_TYPE_LABEL_OVERRIDE[type]
  const words = type.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
