/**
 * Resolves the explicit back-navigation target for `MerchantProfileScreen`
 * based on the `?from=…` URL param. Default `router.back()` falls back
 * to the previously-active tab under expo-router Tabs, which is the
 * owner-flagged bug class for Search→Merchant→back (PR #112 fixup-6),
 * Map→Merchant→back (PR-3 Phase D), Home→Merchant→back (PR #117), and
 * Category→Merchant→back (Phase 2.4 — this contract).
 *
 * Surfaces that stamp `from=<surface>` on the merchant URL:
 *   - `from=search`   + `q=<query>`        — Phase 2.1 Search (PR #112)
 *   - `from=map`                            — Phase 2.2 Map (PR-3 Phase D)
 *   - `from=home`                           — Phase 2.3 Home (PR #117)
 *   - `from=category` + `categoryId=<id>`   — Phase 2.4 Category (this PR)
 *
 * Returns the canonical `/(app)/…` URL to push, or `null` to defer to
 * the default `router.back()` behaviour (no explicit `from` param,
 * or an unrecognised value).
 */
export type BackNavigationContext = {
  q?:          string  // for from=search
  categoryId?: string  // for from=category
}

export function resolveBackNavigation(
  from: string | undefined,
  ctx:  BackNavigationContext = {},
): string | null {
  if (from === 'search') {
    return ctx.q
      ? `/(app)/search?q=${encodeURIComponent(ctx.q)}`
      : '/(app)/search'
  }
  if (from === 'map')  return '/(app)/map'
  if (from === 'home') return '/(app)/'
  if (from === 'category') {
    return ctx.categoryId
      ? `/(app)/category/${ctx.categoryId}`
      : '/(app)/categories'
  }
  return null
}
