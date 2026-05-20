/**
 * Resolves the explicit back-navigation target for `MerchantProfileScreen`
 * based on the `?from=…` URL param.  Default `router.back()` falls back
 * to the previously-active tab under expo-router Tabs, which is the
 * owner-flagged bug class for Search→Merchant→back (PR #112 fixup-6)
 * and Map→Merchant→back (PR-3 Phase D).
 *
 * Surfaces that stamp `from=<surface>` on the merchant URL:
 *   - `from=search` + `q=<query>`  — Phase 2.1 Search (PR #112)
 *   - `from=map`                    — Phase 2.2 Map (PR-3 Phase D)
 *   - `from=home`                   — Phase 2.3 Home (this PR)
 *
 * Returns the canonical `/(app)/…` URL to push, or `null` to defer to
 * the default `router.back()` behaviour (no explicit `from` param,
 * or an unrecognised value).
 */
export function resolveBackNavigation(
  from: string | undefined,
  q:    string | undefined,
): string | null {
  if (from === 'search') {
    return q
      ? `/(app)/search?q=${encodeURIComponent(q)}`
      : '/(app)/search'
  }
  if (from === 'map') {
    // Map-side viewport / camera state is preserved by expo-router Tabs
    // by default — no need to round-trip viewport through URL params.
    return '/(app)/map'
  }
  if (from === 'home') {
    // Canonical Home route — matches the pattern used by
    // SavingsScreen.tsx:239, SubscribePromptScreen.tsx:270,
    // VoucherDetailScreen.tsx:1001.  `q` is ignored.
    return '/(app)/'
  }
  return null
}
