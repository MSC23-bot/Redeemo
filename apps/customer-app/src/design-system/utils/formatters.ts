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
 * Distance formatter — owner-locked PR #112 fixup-6 rule (2026-05-20).
 *
 *   null  → null (caller hides)
 *   any m → `{miles.toFixed(1)} miles away`
 *
 * Owner direction (supersedes the fixup-2 mixed-unit rule): always
 * miles, never metres.  Sub-1-mile distances render as `0.X miles
 * away` rather than switching to metres.  The owner observation: mixing
 * "276 metres away" with "5.1 miles away" in the same card list
 * confuses readers, and the bare `m` ambiguity (miles vs metres) was
 * the original screenshot trigger.  Single-unit display is the trust
 * fix.
 *
 * Examples:
 *   formatDistance(null) → null
 *   formatDistance(0)    → '0.0 miles away'
 *   formatDistance(100)  → '0.1 miles away'
 *   formatDistance(276)  → '0.2 miles away'
 *   formatDistance(499)  → '0.3 miles away'
 *   formatDistance(500)  → '0.3 miles away'
 *   formatDistance(1000) → '0.6 miles away'
 *   formatDistance(1609) → '1.0 miles away'
 *   formatDistance(8200) → '5.1 miles away'
 */
export function formatDistance(metres: number | null | undefined): string | null {
  if (metres === null || metres === undefined) return null
  const miles = metres / 1609.34
  return `${miles.toFixed(1)} miles away`
}

/**
 * Compact distance variant — Batch 1B Tier 3 (2026-06-01, owner direction).
 *
 *   null  → null (caller hides)
 *   any m → `{miles.toFixed(1)} mi`
 *
 * Used ONLY by the dense shared `<BranchTile>` card (Home rails / Map
 * carousel / Category results), whose info hierarchy splits onto two
 * lines: `descriptor · locality` then `distance · proximity`.  The
 * compact "mi" keeps the distance·proximity line short enough that the
 * proximity clause is never tail-truncated — even for the longest band
 * label ("Nearest match on Redeemo") on the narrowest rail card.
 *
 * Deliberately distinct from `formatDistance` (long-form "X miles away"),
 * which the roomier single-line `<SearchResultItem>` keeps using.  The
 * two surfaces intentionally diverge on distance copy per owner direction;
 * do NOT collapse them without a fresh design decision.
 *
 * Examples:
 *   formatDistanceCompact(null) → null
 *   formatDistanceCompact(276)  → '0.2 mi'
 *   formatDistanceCompact(1609) → '1.0 mi'
 *   formatDistanceCompact(8200) → '5.1 mi'
 */
export function formatDistanceCompact(metres: number | null | undefined): string | null {
  if (metres === null || metres === undefined) return null
  const miles = metres / 1609.34
  return `${miles.toFixed(1)} mi`
}
