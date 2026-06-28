/**
 * PR-B Task B3: pure filter-state helpers for the Insights surface.
 *
 * This module owns the filter STATE shape and the pure transforms around it. It is
 * deliberately UI-free so it can be unit-tested without React and reused by both the
 * API client call site and any URL sync. House style: no em dashes; no emojis.
 *
 * The filter shape mirrors the PR-A wire contract (period preset + custom from/to as
 * YYYY-MM + optional branchId + optional 7-type voucherType). `serialiseFilters`
 * produces the exact `InsightsFilters` object the lib/api/insights client consumes.
 */
import {
  periodPresetSchema,
  voucherType7Schema,
  type PeriodPreset,
  type VoucherType7,
  type InsightsFilters,
} from '@/lib/api/insights'

/** The full filter state held by the Insights page. from/to are YYYY-MM. */
export interface InsightsFilterState {
  period: PeriodPreset
  /** Custom-range start month (YYYY-MM). Only meaningful when period === 'custom'. */
  from?: string
  /** Custom-range end month (YYYY-MM). Only meaningful when period === 'custom'. */
  to?: string
  branchId?: string
  voucherType?: VoucherType7
}

/** The default filter on first load: the current (incomplete) month, all branches/types. */
export const DEFAULT_FILTERS: InsightsFilterState = { period: 'this_month' }

/**
 * Serialise the filter state into the query object the API client + URL consume.
 * from/to are only emitted for period === 'custom'; empty optionals are dropped so a
 * bare query stays minimal (mirrors the redemptions qs() drop-empty contract).
 */
export function serialiseFilters(state: InsightsFilterState): InsightsFilters {
  const out: InsightsFilters = { period: state.period }
  if (state.period === 'custom') {
    if (state.from) out.from = state.from
    if (state.to) out.to = state.to
  }
  if (state.branchId) out.branchId = state.branchId
  if (state.voucherType) out.voucherType = state.voucherType
  return out
}

/**
 * Parse a filter state from URLSearchParams (or any params-like with .get()).
 * Unknown period -> the default; unknown voucherType -> dropped (forward-safe). The
 * voucher type and period are validated against the shared zod enums so a crafted URL
 * cannot inject an out-of-contract value into the query.
 */
export function parseFilters(params: URLSearchParams): InsightsFilterState {
  const periodRaw = params.get('period')
  const periodParsed = periodPresetSchema.safeParse(periodRaw)
  const period: PeriodPreset = periodParsed.success ? periodParsed.data : 'this_month'

  const state: InsightsFilterState = { period }

  if (period === 'custom') {
    const from = params.get('from')
    const to = params.get('to')
    if (from) state.from = from
    if (to) state.to = to
  }

  const branchId = params.get('branchId')
  if (branchId) state.branchId = branchId

  const voucherType = params.get('voucherType')
  if (voucherType) {
    const vt = voucherType7Schema.safeParse(voucherType)
    if (vt.success) state.voucherType = vt.data
  }

  return state
}

/**
 * The current London-local month as YYYY-MM. Used to decide whether a custom range
 * ends in the still-incomplete current month (so no comparison chip is shown). We
 * derive the London wall-clock month via Intl (no external dep), mirroring the PR-A
 * London helper approach.
 */
export function currentLondonMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const year = parts.find((p) => p.type === 'year')?.value ?? ''
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  return `${year}-${month}`
}

/** The comparison-chip + in-progress decision for the active filter. */
export interface ComparisonState {
  /** Whether a "Compared with ..." comparison chip applies for this selection. */
  hasComparison: boolean
  /** Whether the selected window includes the current incomplete London month. */
  inProgress: boolean
}

/**
 * Decide whether a comparison chip applies and whether the window is in progress.
 *
 * Locked rule (mirrors PR-A periodWindow + spec section 6.2):
 *   - this_month         -> no chip, in progress (the current month is incomplete)
 *   - all                -> no chip, not in progress (unbounded; nothing to compare)
 *   - last_month/3m/6m   -> chip, not in progress (completed windows)
 *   - custom ending in the current month (or missing `to`) -> no chip, in progress
 *   - custom ending in a completed past month -> chip, not in progress
 */
export function comparisonState(
  state: InsightsFilterState,
  now: Date = new Date(),
): ComparisonState {
  switch (state.period) {
    case 'this_month':
      return { hasComparison: false, inProgress: true }
    case 'all':
      return { hasComparison: false, inProgress: false }
    case 'last_month':
    case 'last_3m':
    case 'last_6m':
      return { hasComparison: true, inProgress: false }
    case 'custom': {
      // A custom range with no end (or ending in the current incomplete month) is
      // in progress and shows no comparison chip; an end month strictly before the
      // current London month is a completed window and gets a chip.
      const cur = currentLondonMonth(now)
      const inProgress = !state.to || state.to >= cur
      return { hasComparison: !inProgress, inProgress }
    }
    default:
      return { hasComparison: false, inProgress: false }
  }
}
