/**
 * PR-B Task B4: pure display/format helpers for the Insights surface.
 *
 * UI-free so they can be unit-tested without React and reused across every Insights
 * tab (KPI cards, vouchers, branches, validation, customers). House style: no em
 * dashes; no emojis.
 *
 * Numbers come off the wire as already-coerced numbers (lib/api/insights coerces the
 * Prisma Decimal strings), so these helpers only do en-GB presentation.
 */
import type { Comparison } from '@/lib/api/insights'

const gbpFmt = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
})

const intFmt = new Intl.NumberFormat('en-GB')

/** Format a GBP amount via en-GB Intl (e.g. 609 -> "£609.00"). */
export function formatGbp(value: number): string {
  return gbpFmt.format(Number.isFinite(value) ? value : 0)
}

/** Format an integer count with en-GB grouping (e.g. 1234 -> "1,234"). */
export function formatCount(value: number): string {
  return intFmt.format(Math.round(Number.isFinite(value) ? value : 0))
}

/**
 * Format the repeat-customer rate for display. The wire `repeatRate.value` is ALREADY
 * a percentage to one decimal (backend: returning/total * 1000 / 10), NOT a 0..1
 * fraction, so this only appends the unit and drops a trailing ".0". This is distinct
 * from validation.completionRate, which IS a 0..1 fraction (use formatRateAsPercent).
 */
export function formatRatePercentValue(value: number): string {
  if (!Number.isFinite(value)) return ''
  // Trim a redundant ".0" so 42.0 reads "42%" but 42.5 stays "42.5%".
  const rounded = Math.round(value * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${text}%`
}

/**
 * Format a 0..1 FRACTION as a whole-number percent (e.g. 0.84 -> "84%"). Used for
 * validation.completionRate (which the contract keeps as a fraction).
 */
export function formatRateAsPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return ''
  return `${Math.round(fraction * 100)}%`
}

/** The direction of a per-KPI comparison, for an up/down/flat chip treatment. */
export type ComparisonDirection = 'up' | 'down' | 'flat'

export interface ComparisonChip {
  direction: ComparisonDirection
  /** Absolute percentage magnitude (e.g. 13 for a 13% move); null when pct is null. */
  magnitude: number | null
  /** The rendered chip text, e.g. "13% up on last month" / "No change on last month". */
  text: string
}

const PERIOD_PHRASE: Record<string, string> = {
  this_month: 'this month',
  last_month: 'last month',
  last_3m: 'the previous 3 months',
  last_6m: 'the previous 6 months',
  all: 'the previous period',
  custom: 'the previous period',
}

/**
 * Derive the comparison chip from a (non-null) comparison object. The direction is
 * driven by cur vs prev so a null `pct` (prev was 0) still reads as up/down/flat; the
 * magnitude is the absolute pct when present.
 */
export function comparisonChip(cmp: NonNullable<Comparison>): ComparisonChip {
  const phrase = PERIOD_PHRASE[cmp.label] ?? 'the previous period'
  let direction: ComparisonDirection
  if (cmp.cur > cmp.prev) direction = 'up'
  else if (cmp.cur < cmp.prev) direction = 'down'
  else direction = 'flat'

  const magnitude = cmp.pct === null ? null : Math.abs(Math.round(cmp.pct))

  let text: string
  if (direction === 'flat') {
    text = `No change on ${phrase}`
  } else if (magnitude === null) {
    // prev was 0 so the percentage is undefined; describe the direction without a
    // misleading "Infinity%".
    text = direction === 'up' ? `Up on ${phrase}` : `Down on ${phrase}`
  } else {
    text = `${magnitude}% ${direction} on ${phrase}`
  }

  return { direction, magnitude, text }
}
