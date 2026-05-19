/**
 * Shared display formatters for Discovery / Search / Map / Home / Category
 * surfaces.  Locked PR-2 (2026-05-19) to standardise consumer-facing
 * formatting across all Phase 2.x customer-app migrations.
 *
 * All formatters return `null` when their input is null/undefined so
 * call sites can compose with React null-rendering naturally.
 */

/**
 * GBP currency formatter — always two decimals, leading £ symbol.
 *
 * Owner-locked PR #112 device-QA fix (2026-05-19): the customer-app
 * previously interpolated `tile.merchant.maxEstimatedSaving` directly
 * into `"Save £${n}"` which produced `"Save £8.5"` for half-pound
 * values.  All consumer-facing GBP values MUST go through this helper.
 *
 * Examples:
 *   formatGbp(8.5)   → '£8.50'
 *   formatGbp(8)     → '£8.00'
 *   formatGbp(8.55)  → '£8.55'  (rounds nothing; toFixed handles up to 2dp)
 *   formatGbp(8.555) → '£8.56'  (banker's rounding via toFixed)
 *   formatGbp(0)     → '£0.00'
 *   formatGbp(null)  → null
 */
export function formatGbp(amount: number | null | undefined): string | null {
  if (amount === null || amount === undefined) return null
  return `£${amount.toFixed(2)}`
}

/**
 * Voucher-count formatter — singular vs plural copy.
 *
 * Owner-locked PR #112 device-QA fix (2026-05-19): the Search card's
 * savings pill now shows a voucher count so users understand how
 * many offers a merchant has, not just the max saving.
 *
 * Examples:
 *   formatVoucherCount(0)  → null  (caller hides the pill at 0)
 *   formatVoucherCount(1)  → '1 offer'
 *   formatVoucherCount(2)  → '2 offers'
 *   formatVoucherCount(10) → '10 offers'
 */
export function formatVoucherCount(count: number | null | undefined): string | null {
  if (count === null || count === undefined) return null
  if (count <= 0) return null
  return count === 1 ? '1 offer' : `${count} offers`
}

/**
 * Distance formatter — owner-locked PR #112 device-QA rule
 * (2026-05-19).
 *
 *   null              → null (caller hides)
 *   < 500 metres      → `{n} metres away`
 *   ≥ 500 metres      → `{miles.toFixed(1)} miles away`
 *
 * The 500-metre threshold is a clear walkable / not-walkable cutoff
 * the user can interpret without unit-conversion mental math.  Below
 * 500m the metres value is small enough to feel intuitive ("276 metres
 * away" reads as "about a 3-4 minute walk").  At or above 500m the
 * miles framing matches how UK customers think about driving / longer
 * journeys.
 *
 * "metres" (full word) avoids the bare `m` ambiguity (miles vs metres)
 * the owner flagged on the original screenshot.
 *
 * Examples:
 *   formatDistance(null) → null
 *   formatDistance(0)    → '0 metres away'
 *   formatDistance(276)  → '276 metres away'
 *   formatDistance(499)  → '499 metres away'
 *   formatDistance(500)  → '0.3 miles away'
 *   formatDistance(1000) → '0.6 miles away'
 *   formatDistance(8200) → '5.1 miles away'
 */
export function formatDistance(metres: number | null | undefined): string | null {
  if (metres === null || metres === undefined) return null
  if (metres < 500) {
    return `${Math.round(metres)} metres away`
  }
  const miles = metres / 1609.34
  return `${miles.toFixed(1)} miles away`
}
