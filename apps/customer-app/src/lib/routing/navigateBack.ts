/**
 * Phase 3C.1g Device-QA R1 Wave 6.3 (2026-05-30) — back-navigation
 * helper that activates the target tab cleanly under expo-router 6's
 * Tabs navigator.
 *
 * Owner-reported symptom history:
 *   - Wave 6 (router.push) → "lands on Favourites for ~5s then auto-
 *     redirects to Home".  Root cause: push added a new entry on top
 *     of the active tab, expo-router reconciled the bogus "Tab.Screen
 *     pushed onto a Tabs root" entry and popped back to the default
 *     active tab.
 *   - Wave 6.2 (router.dismissAll + router.replace) → LogBox console
 *     error "The action 'POP_TO_TOP' was not handled by any
 *     navigator. Is there any screen to go back to?".  Root cause:
 *     dismissAll dispatches POP_TO_TOP, which is a Stack-only action.
 *     Our (app) layout is `<Tabs>` with all routes as direct
 *     `Tabs.Screen` siblings (merchant/[id], voucher/[id], etc. are
 *     hidden tabs via `href: null`).  There is NO inner Stack to pop
 *     — POP_TO_TOP has no handler and React Navigation logs the
 *     warning.  The subsequent `router.replace` ran but the tab
 *     activation still drifted to Home in some cases.
 *
 * Wave 6.3 fix — `router.navigate(href)`:
 *
 *   - For a registered Tabs.Screen target (any /(app)/<segment>),
 *     navigate dispatches a Tab.Navigate action.  This is the
 *     expo-router 6 recommended programmatic cross-tab API.
 *   - Smart algorithm: if the target is already in the navigation
 *     history (e.g. user came from Favourites tab earlier), pop
 *     back to it cleanly.  Otherwise push a fresh entry.
 *   - Does NOT dispatch POP_TO_TOP — no LogBox warning.
 *   - Preserves the target URL's query params (`?from=…`, `?q=…`,
 *     `?tab=vouchers`, etc.) — same as replace's behaviour.
 *
 * Used by:
 *   - `MerchantProfileScreen` HeroSection onBack (Favourites /
 *     Search / Map / Home / Category back chains).
 *   - `VoucherDetailScreen` handleBack (Favourites direct chain +
 *     merchant chain).
 */

type MinRouter = {
  navigate: (href: never) => void
}

export function navigateBackTo(router: MinRouter, target: string): void {
  router.navigate(target as never)
}
