/**
 * PR-B Task B3: pure filter-state helpers for the Insights surface.
 *
 * The filter STATE shape (period + from/to YYYY-MM + branchId + voucherType) and
 * the pure helpers around it: defaults, serialise-to-query, parse-from-URL, the
 * current-London-month helper, and the comparison-chip decision.
 *
 * The comparison-chip rule (locked, mirrors PR-A periodWindow + spec section 6.2):
 *   - a completed-period preset (last_month / last_3m / last_6m) -> comparison chip
 *   - this_month + all -> NO comparison chip (incomplete / unbounded)
 *   - custom whose `to` is the CURRENT incomplete London month -> NO chip + marked
 *     "in progress"
 *   - custom whose `to` is a completed (past) month -> comparison chip applies
 */
import {
  DEFAULT_FILTERS,
  serialiseFilters,
  parseFilters,
  currentLondonMonth,
  comparisonState,
  type InsightsFilterState,
} from '../filters'

const at = (iso: string) => new Date(iso)

describe('DEFAULT_FILTERS', () => {
  it('defaults to this_month with no other filter set', () => {
    expect(DEFAULT_FILTERS).toEqual({ period: 'this_month' })
  })
})

describe('currentLondonMonth', () => {
  it('returns the London YYYY-MM for a mid-month instant', () => {
    expect(currentLondonMonth(at('2026-06-15T12:00:00Z'))).toBe('2026-06')
  })
  it('uses the London calendar day across the UTC->BST offset (00:30 BST = still June)', () => {
    // 2026-06-30T23:30:00Z = 2026-07-01T00:30 London (BST +1) -> July.
    expect(currentLondonMonth(at('2026-06-30T23:30:00Z'))).toBe('2026-07')
  })
})

describe('serialiseFilters (query object for the API client + URL)', () => {
  it('this_month serialises to just the period (no stray from/to)', () => {
    expect(serialiseFilters({ period: 'this_month' })).toEqual({ period: 'this_month' })
  })
  it('drops from/to for a non-custom period even if present in state', () => {
    expect(
      serialiseFilters({ period: 'last_month', from: '2026-01', to: '2026-03' }),
    ).toEqual({ period: 'last_month' })
  })
  it('keeps from/to for a custom period', () => {
    expect(
      serialiseFilters({ period: 'custom', from: '2025-11', to: '2026-06' }),
    ).toEqual({ period: 'custom', from: '2025-11', to: '2026-06' })
  })
  it('includes branchId and voucherType when set', () => {
    expect(
      serialiseFilters({
        period: 'last_3m',
        branchId: 'b1',
        voucherType: 'DISCOUNT',
      }),
    ).toEqual({ period: 'last_3m', branchId: 'b1', voucherType: 'DISCOUNT' })
  })
})

describe('parseFilters (from URLSearchParams)', () => {
  it('returns DEFAULT_FILTERS for empty params', () => {
    expect(parseFilters(new URLSearchParams())).toEqual({ period: 'this_month' })
  })
  it('parses a full custom-range query', () => {
    const sp = new URLSearchParams(
      'period=custom&from=2025-11&to=2026-06&branchId=b9&voucherType=BOGO',
    )
    expect(parseFilters(sp)).toEqual({
      period: 'custom',
      from: '2025-11',
      to: '2026-06',
      branchId: 'b9',
      voucherType: 'BOGO',
    })
  })
  it('falls back to this_month for an unknown period value', () => {
    expect(parseFilters(new URLSearchParams('period=nonsense'))).toEqual({
      period: 'this_month',
    })
  })
  it('ignores an unknown voucherType value (forward-safe)', () => {
    expect(parseFilters(new URLSearchParams('period=all&voucherType=GIBBERISH'))).toEqual({
      period: 'all',
    })
  })
  it('round-trips: serialise then parse yields the same state', () => {
    const state: InsightsFilterState = {
      period: 'custom',
      from: '2025-11',
      to: '2026-02',
      branchId: 'b3',
      voucherType: 'REUSABLE',
    }
    const sp = new URLSearchParams(
      serialiseFilters(state) as unknown as Record<string, string>,
    )
    expect(parseFilters(sp)).toEqual(state)
  })
})

describe('comparisonState (comparison-chip + in-progress decision)', () => {
  const now = at('2026-06-15T12:00:00Z') // current London month = 2026-06

  it('this_month: no comparison chip, marked in progress', () => {
    expect(comparisonState({ period: 'this_month' }, now)).toEqual({
      hasComparison: false,
      inProgress: true,
    })
  })
  it('all: no comparison chip, not in progress', () => {
    expect(comparisonState({ period: 'all' }, now)).toEqual({
      hasComparison: false,
      inProgress: false,
    })
  })
  it('last_month: comparison chip, not in progress', () => {
    expect(comparisonState({ period: 'last_month' }, now)).toEqual({
      hasComparison: true,
      inProgress: false,
    })
  })
  it('last_3m: comparison chip', () => {
    expect(comparisonState({ period: 'last_3m' }, now).hasComparison).toBe(true)
  })
  it('last_6m: comparison chip', () => {
    expect(comparisonState({ period: 'last_6m' }, now).hasComparison).toBe(true)
  })
  it('custom range ending in the current incomplete month: NO chip + in progress', () => {
    expect(
      comparisonState({ period: 'custom', from: '2025-11', to: '2026-06' }, now),
    ).toEqual({ hasComparison: false, inProgress: true })
  })
  it('custom range ending in a completed past month: comparison chip, not in progress', () => {
    expect(
      comparisonState({ period: 'custom', from: '2025-11', to: '2026-05' }, now),
    ).toEqual({ hasComparison: true, inProgress: false })
  })
  it('custom with a missing `to` is treated as in progress with no chip (incomplete)', () => {
    expect(
      comparisonState({ period: 'custom', from: '2025-11' }, now),
    ).toEqual({ hasComparison: false, inProgress: true })
  })
})
