/**
 * Phase 3C.1g Device-QA R1 Wave 6.2 (2026-05-30) — back-navigation
 * helper that survives expo-router's tab reconciliation.
 *
 * Owner-reported symptom: after deep nested navigation
 * (Favourites > Merchant Profile > Voucher Detail > Merchant
 * Profile), tapping Back on the inner Merchant Profile sometimes
 * landed on the correct surface (Favourites) for ~5 seconds, then
 * auto-redirected to Home with no user input.  On the SECOND
 * attempt the auto-redirect was instant.
 *
 * Root cause: `router.push(target)` for a TAB destination (e.g.
 * `/(app)/favourites`) on a deep stack pushed the tab URL ONTO the
 * existing stack instead of activating the underlying tab.  Expo-
 * router then reconciled this bogus "tab inside stack" entry and
 * popped back to the default active tab (Home) after a delay.  The
 * shallow case (Favourites > MP > Back) avoided the symptom only
 * because the stack was small enough to reconcile cleanly.
 *
 * Fix pattern:
 *   1. `router.dismissAll()` — pops every screen pushed on top of
 *      the tab base.  Safe no-op when no pushed entries exist.
 *   2. `router.replace(target)` — swaps the now-base tab entry's
 *      URL with the destination, preserving any query params
 *      (`?from=…`, `?q=…`, `?tab=vouchers`, etc.).
 *
 * Both APIs are expo-router 6 standard.  Used by:
 *   - `MerchantProfileScreen` HeroSection onBack (Favourites /
 *     Search / Map / Home / Category back chains).
 *   - `VoucherDetailScreen` handleBack (Favourites direct chain +
 *     merchant chain — same dismissAll+replace pair).
 */

type MinRouter = {
  dismissAll: () => void
  replace:    (href: never) => void
}

export function navigateBackTo(router: MinRouter, target: string): void {
  router.dismissAll()
  router.replace(target as never)
}
