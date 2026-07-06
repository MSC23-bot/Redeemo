---
paths:
  - "apps/customer-app/**"
---

# Customer app (Expo / React Native) rules

- Node 20.19.4 ONLY for this app's toolchain (`apps/customer-app/.nvmrc`; run `fnm use`
  inside the app dir). jest-expo hangs on Node 24; do not bump without re-verifying.
- Tests: run from the worktree copy
  (`cd .worktrees/customer-app/apps/customer-app && npx jest --forceExit`).
- Locked, test-pinned surfaces: Voucher Detail (M1-M5), Merchant Profile, Home visual
  system, Discovery/Search/Map/Categories (branch-first), Favourites (branch-level),
  Savings, Profile tab, redemption/Show-to-Staff flow, and the Saved-Area/location-context
  family. Before changing any of them, read the as-shipped addendum in the relevant plan
  under `docs/superpowers/plans/` (and the archive at
  `docs/history/claude-md-2026-06-20-archive.md` for the locked-invariant lists).
  Regressing a pinned invariant fails tests by design.
- Location-context locks (§DF v1 + §DF-v2-j D1-D11): resolver precedence is
  PLACE_QUERY > GPS > SAVED_PROFILE > none; GPS coordinates are NEVER written to
  `User.postcode` (explicit "Update postcode" is the only mutator); Home keeps BOTH
  `LocationStatusLabel` AND `SavedAreaHonestyHint` (never collapse them); `source='profile'`
  requires localityId + latitude + longitude, all three.
- Branch policy: `feature/customer-app` is REFERENCE ONLY. Never build on it; port surfaces
  off it via dedicated PRs onto current `main`.
- Device-QA reconciliation: no ad-hoc fixes. Classify each issue against spec → baseline →
  device behaviour, confirm priorities with the owner, implement in controlled batches.
- `PRODUCT.md` / `DESIGN.md` are gitignored local design-context files (same category as
  `.claude/`); do not commit them.
- Plan-4 locked interim contracts (do NOT touch until Plan 4 is specified):
  - `branch.city`-based CITY-tier classification stays as the locked interim location model.
  - Four flagged code hooks stay flagged: `AllCategoriesScreen` `merchantCount`;
    `PC2AddressScreen` civil-parish lookup via postcodes.io; the `branchShortName` dedup
    utility; `MerchantProfileScreen` branch-name dedup.
- Branch-first cardinality is locked platform-wide: one tile per branch; hearts/favourites
  are branch-level; vouchers stay voucher-keyed.
- Design system: animation loops (`withRepeat`) live only in `src/design-system/motion/`;
  lucide icons import via the `src/design-system/icons.ts` barrel; brand colours via tokens.
- `URGENT_THRESHOLD_MS` (60 min) must stay in parity with the backend constant; a
  threshold-parity test pins it.
- Anti-fraud: any surface that displays a redemption code or QR must install screen-capture
  protection (`useScreenCaptureProtection`) while the code is visible; iOS additionally gets
  the post-fact screenshot listener where the locked contract says so. See the copy lock in
  root CLAUDE.md §9 before writing any capture-related copy.
- Routing truth: `resolveRedirect` + `firstIncompleteRequiredStep` in `src/lib/routing.ts`.
  Customer-flow behaviour changes require a version bump in `docs/customer-flow-current.md`
  plus a dated entry in `docs/customer-flow-changelog.md`.
