# Phase 2.4 Category — Branch-First Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the customer-app Category surface (`CategoryResultsScreen`) from consuming legacy `MerchantTile[]` to the new branch-first `BranchTile[]` contract emitted by Phase 1 backend (PR #110). Locked tile UI/UX (PR-B M4 design + filters surface) preserved exactly — NO redesign, NO restyle, NO §BY pill migration, NO §CA UI badge polish, NO §CC copy polish, NO pagination, NO FilterSheet redesign, NO Home/Map/Search/AllCategories drift.

**Architecture:** `CategoryResultsScreen` flips from `merchants[]` to `branches[]`. Two hooks (`useCategoryMerchants` for unfiltered, `useSearch` for filtered) both extended to project the new branch arms. `MerchantTile` continues to render via the existing surface-local pattern: a scoped `branchToMerchantTileProps` adapter (sibling of Phase 2.2 Map's `MapBranchTile` local adapter + Phase 2.3 Home's `home/utils/branchToMerchantTile.ts` adapter — Phase 2.5 deletes all three). Tile tap routes with `?branch=<id>&from=category&categoryId=<id>` to Merchant Profile. `resolveBackNavigation` helper migrates from the 2-positional-string signature to a typed options object — single call site updated.

**Tech Stack:** Expo SDK 54 + expo-router v4, React Query, Zod, Prisma 7 + driver-adapter, vitest (backend) + jest-expo (customer-app).

---

## 0. Owner-locked direction (2026-05-21)

| # | Decision | Locked value |
|---|---|---|
| **0.1** | Overall path | **Tier 2 plan-first.** Strict branch-first scope only. NO redesign, NO restyle, NO polish. |
| **0.2** | Branch + base | Base `main` (`fd12d16`); branch `feature/discovery-rebaseline-phase-2-4-category-customer-app`. |
| **0.3** | Scope exclusions (locked) | NO visual polish, NO §BY pill migration, NO §CA UI badge polish, NO §CC copy polish, NO pagination, NO FilterSheet redesign, NO Home/Map/Search/AllCategories drift. `AllCategoriesScreen.tsx` is **unchanged** (navigate-only — does NOT render tiles). |
| **0.4** | Fold #1 — back-nav | **IN scope.** Add `from=category` support to `resolveBackNavigation` per the owner-approved options-object signature (see §0.5). |
| **0.5** | Helper signature | **Typed options object.** `resolveBackNavigation(from, { q?, categoryId? })`. Keeps Search query and Category id semantically separate; gives a clean path for future surfaces. Single call site (`MerchantProfileScreen.tsx:993`) updated. |
| **0.6** | Missing-categoryId fallback | **Fall back to `/(app)/categories`** (top-level AllCategoriesScreen browser). Symmetric with `from=search` fallback-without-q → `/(app)/search`; avoids `null` → unpredictable `router.back()`. |
| **0.7** | Fold #2 — `totalEstimatedSaving` | **Verify-only IN scope.** Confirm via grep + probe that `branches[].merchant.totalEstimatedSaving` flows through Category endpoint. Amendment-A precedent from Phase 2.3: live probe confirms the field is already on the wire — no backend changes expected. UI-side closure for `Save £X across N vouchers` copy stays deferred under §CA (waits for §BY pill PR). |
| **0.8** | Execution mode | Same as Phase 2.3 — plan-lock → implementer subagent → spec reviewer → code-quality reviewer → Step K3 owner gate before merge. Pre-implementation Zod parse probe now standing practice. |
| **0.9** | Standing rules carry forward | Single-component carry-forward (Phase 2.5 deletes the adapter + renames `<MerchantTile>` → `<BranchTile>`); `?branch=&from=category` URL contract; POSTCODE_CENTROID redaction passes through unchanged; no schema changes; no Map / Search / Home / AllCategories surface drift; ScopePillRow + LocalityCaption + EmptyStateMessage + FilterSheet UNCHANGED. |

---

## 1. Pre-implementation live schema probe (2026-05-21)

Per the post-Phase-2.3 standing practice: probe the actual backend response BEFORE writing any client code, parse it through the proposed customer-app Zod schema, confirm clean parse with the proposed Phase 2.4 extension.

### 1.1 Probe shape

```bash
# Two probes against LAN backend at lat=53.6458, lng=-1.785 (Huddersfield)
# Top-level Food & Drink + one subcategory (Restaurant)
GET /api/v1/customer/categories/:id/merchants?lat=53.6458&lng=-1.785&limit=20
```

### 1.2 Probe results (verbatim, schema confirmed clean)

| Category | Top-level keys observed | merchants | branches | totalBranches | scope | scopeExpanded | Sample saving |
|---|---|---|---|---|---|---|---|
| Food & Drink (top-level) | `{ merchants, total, meta, branches, totalBranches }` | 1 | 2 | 2 | `platform` | `true` | Karaara Huddersfield: `totalEstimatedSaving=5`, `maxEstimatedSaving=3`, `voucherCount=2` |
| Restaurant (subcategory) | `{ merchants, total, meta, branches, totalBranches }` | 1 | 1 | 1 | `city` | (not expanded) | Pinos Pizzeria: `totalEstimatedSaving=25.95`, `maxEstimatedSaving=11.95`, `voucherCount=3` |

**Backend does NOT emit `branchMeta` on the category-merchants endpoint** (verified by enumerating top-level keys). Proposed extension below omits it — must not be added speculatively.

### 1.3 Confirmed Phase 2.4 Zod schema extension

```ts
// apps/customer-app/src/lib/api/discovery.ts:383-388 — current
const categoryMerchantsResponseSchema = z.object({
  merchants: z.array(merchantTileSchema),
  total:     z.number(),
  meta:      discoveryMetaSchema,
})

// apps/customer-app/src/lib/api/discovery.ts:383-XXX — Phase 2.4 (additive only)
const categoryMerchantsResponseSchema = z.object({
  merchants:     z.array(merchantTileSchema),
  total:         z.number(),
  meta:          discoveryMetaSchema,
  // Phase 2.4 additive — mirrors Phase 2.1 Search response shape
  branches:      z.array(branchTileSchema),
  totalBranches: z.number(),
})
```

Both probes parsed cleanly with this extension. `totalEstimatedSaving` is non-null for all branches tested → Fold #2 verify-only outcome confirmed pre-implementation.

### 1.4 `useSearch` contract — already wired

`CategoryResultsScreen` falls back to `useSearch({ categoryId, ...filters })` when non-scope filters are applied. `useSearch` was extended in PR #112 (Phase 2.1) to emit `branches` + `totalBranches` already. Hybrid hook strategy continues to work — both hooks now return compatible `{ merchants, total, meta, branches, totalBranches }`.

---

## 2. Out of scope (explicit)

- **NO** `AllCategoriesScreen.tsx` changes (navigate-only — does NOT render tiles).
- **NO** `MerchantTile.tsx` shared-component edits (Phase 2.5 sweep).
- **NO** `ScopePillRow.tsx`, `LocalityCaption.tsx`, `EmptyStateMessage.tsx`, `FilterSheet.tsx` edits.
- **NO** §BY shared formatter migration on Category pills (cross-surface; Phase 2.5 + standalone PR per §BY contract).
- **NO** §CA UI-side closure (`Save £X across N vouchers` copy). Waits for §BY pill PR.
- **NO** §CC copy polish on `EmptyStateMessage`.
- **NO** pagination work (Plan-1.5 ranker scope; deferred).
- **NO** FilterSheet redesign.
- **NO** backend changes — service-side Phase 1 (PR #110) already emits `branches[]` + `totalBranches` per the probe results above. If a probe-driven test reveals a missing field, pause + escalate.
- **NO** Map / Home / Search / AllCategories surface drift — Category surface only.
- **NO** Plan 4 M4 / M5 work (still blocked on Phase 2.5 cleanup, unrelated to Phase 2.4).
- **NO** `MerchantProfileScreen.tsx` component edits — only the `resolveBackNavigation` helper + its test + the one call site (the wrapper at `MerchantProfileScreen.tsx:993-996` is a 4-line typedef-narrowing edit; not a component-logic change).

---

## 3. File-by-file scope

### 3.1 Files modified

| File | Reason | Lines |
|---|---|---|
| `apps/customer-app/src/lib/api/discovery.ts` | Extend `categoryMerchantsResponseSchema` with `branches` + `totalBranches`. | +4 lines |
| `apps/customer-app/src/hooks/useCategoryMerchants.ts` | Project `branches` + `totalBranches` through the hook return type. | +2 lines (TypeScript-only — hook returns whatever the API client returns) |
| `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx` | Switch data source from `merchants` → `branches`; render via surface-local adapter; update tile tap to stamp `?branch=&from=category&categoryId=`. Hybrid hook output projection updated for `useSearch` branch arm too. | ~30 lines |
| `apps/customer-app/src/features/merchant/utils/resolveBackNavigation.ts` | Migrate to typed options object signature; add `from=category` case with `/(app)/categories` fallback. | ~25 lines (full rewrite of the helper body) |
| `apps/customer-app/src/features/merchant/utils/resolveBackNavigation.test.ts` | Update existing call-site invocations to the new options-object shape; add `from=category` (with categoryId / without) positive pins. | ~15 lines |
| `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` | Single call-site signature update at line 993-996 (`(from, q)` → `(from, { q, categoryId })`). NO other Merchant Profile screen logic changed. | 4 lines |

### 3.2 Files created

| File | Reason |
|---|---|
| `apps/customer-app/src/features/search/utils/branchToMerchantTile.ts` | Surface-local adapter — mirrors `apps/customer-app/src/features/home/utils/branchToMerchantTile.ts` and the Phase 2.2 Map local adapter. Deleted in Phase 2.5. |
| `apps/customer-app/tests/features/search/utils/branchToMerchantTile.test.ts` | Pin adapter shape: `id` swap to `branch.id`, branch-level fields sourced from branch, merchant-grouping fields from `branch.merchant`. |

### 3.3 Tests added / updated

| Test file | What it pins |
|---|---|
| `apps/customer-app/tests/lib/api/discovery.test.ts` (or category-specific) | `categoryMerchantsResponseSchema` now accepts `branches` + `totalBranches`; rejects on legacy-only payload missing the new fields (forward-compat). |
| `apps/customer-app/tests/features/search/screens/CategoryResultsScreen.test.tsx` (or extend existing) | Branch-first render: 2 branches of same merchant produce 2 tiles, NOT 1 collapsed; tile tap stamps `?branch=&from=category&categoryId=`. |
| `apps/customer-app/tests/features/merchant/utils/resolveBackNavigation.test.ts` | New `from=category` cases (with + without categoryId), updated signature pins. |
| `apps/customer-app/tests/features/search/utils/branchToMerchantTile.test.ts` | Adapter shape pin (as 3.2 above). |

---

## 4. Tasks

### Task A: Pre-implementation verification

- [ ] **A1** Re-run grep for any other call sites of `resolveBackNavigation` to confirm exactly one production caller (`MerchantProfileScreen.tsx:993`) + the test file + comment-only references in `HomeScreen.tsx`. If a second production caller is found, PAUSE and escalate.
- [ ] **A2** Re-run grep for any other Category-surface consumers of `useCategoryMerchants` or `useSearch({ categoryId })` to confirm `CategoryResultsScreen` is the only one. If a second consumer is found, PAUSE and escalate.
- [ ] **A3** Run `npx jest apps/customer-app/tests/features/search` to confirm the Category test baseline is currently green (capture exact count).
- [ ] **A4** Run `npx jest apps/customer-app/tests/features/merchant/utils/resolveBackNavigation` to capture the baseline pin count.

### Task B: Extend customer-app Zod schema

- [ ] **B1** Open `apps/customer-app/src/lib/api/discovery.ts` and locate `categoryMerchantsResponseSchema` (currently lines 383-388).
- [ ] **B2** Apply the additive extension verified in §1.3:

```ts
const categoryMerchantsResponseSchema = z.object({
  merchants:     z.array(merchantTileSchema),
  total:         z.number(),
  meta:          discoveryMetaSchema,
  branches:      z.array(branchTileSchema),
  totalBranches: z.number(),
})
```

- [ ] **B3** Confirm `branchTileSchema` already includes `merchant.totalEstimatedSaving` (apps/customer-app/src/lib/api/discovery.ts:200) — should be unchanged from Phase 2.3.
- [ ] **B4** Add or extend a schema test pinning the parsed `CategoryMerchantsResponse` includes the new fields with `merchant.totalEstimatedSaving` populated. Use a fixture mirroring the §1.2 probe payload.
- [ ] **B5** Run customer-app tsc. Expect zero new errors.
- [ ] **B6** Commit: `feat(category): extend categoryMerchantsResponseSchema with branches + totalBranches (Phase 2.4 Task B)`.

### Task C: `resolveBackNavigation` migration to typed options object

- [ ] **C1** Open `apps/customer-app/src/features/merchant/utils/resolveBackNavigation.ts`.
- [ ] **C2** Replace the helper body with the new signature:

```ts
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
```

- [ ] **C3** Update `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` line 993-996 from:

```ts
const target = resolveBackNavigation(
  typeof screenParams.from === 'string' ? screenParams.from : undefined,
  typeof screenParams.q    === 'string' ? screenParams.q    : undefined,
)
```

to:

```ts
const target = resolveBackNavigation(
  typeof screenParams.from === 'string' ? screenParams.from : undefined,
  {
    ...(typeof screenParams.q          === 'string' ? { q:          screenParams.q          } : {}),
    ...(typeof screenParams.categoryId === 'string' ? { categoryId: screenParams.categoryId } : {}),
  },
)
```

- [ ] **C4** Update `apps/customer-app/tests/features/merchant/utils/resolveBackNavigation.test.ts`:
  - Existing `from=search` + q test → update to `resolveBackNavigation('search', { q: 'pizza' })`.
  - Existing `from=search` no-q test → update to `resolveBackNavigation('search')`.
  - Existing `from=map` test → update to `resolveBackNavigation('map')`.
  - Existing `from=home` test (positive pin from Phase 2.3) → update to `resolveBackNavigation('home')`.
  - REMOVE any `resolveBackNavigation('category', undefined).toBeNull()` line if present under "unrecognised from values".
  - ADD a new `describe('from=category (Phase 2.4 contract)', ...)` block with:
    - `expect(resolveBackNavigation('category', { categoryId: 'cat-restaurant-001' })).toBe('/(app)/category/cat-restaurant-001')`
    - `expect(resolveBackNavigation('category')).toBe('/(app)/categories')`
    - `expect(resolveBackNavigation('category', { q: 'pizza' })).toBe('/(app)/categories')` — pins that `q` is ignored when `from=category` and `categoryId` is absent.
- [ ] **C5** Run `npx jest apps/customer-app/tests/features/merchant/utils/resolveBackNavigation` — all pins pass.
- [ ] **C6** Run customer-app tsc — zero new errors.
- [ ] **C7** Commit: `feat(navigation): migrate resolveBackNavigation to typed options object + add from=category (Phase 2.4 Task C)`.

### Task D: Surface-local adapter for Category

- [ ] **D1** Create `apps/customer-app/src/features/search/utils/branchToMerchantTile.ts`. Mirror `apps/customer-app/src/features/home/utils/branchToMerchantTile.ts` (~92 LOC). Same docblock framing — surface-local, deleted in Phase 2.5. Same `id: branch.id` swap. Same merchant-grouping field mapping.
- [ ] **D2** Create `apps/customer-app/tests/features/search/utils/branchToMerchantTile.test.ts` mirroring the Home adapter test if one exists; otherwise write fresh:
  - `id` swap to `branch.id` (not `branch.merchant.id`)
  - Branch-level fields (distance, isFavourited, avgRating, reviewCount, proximityBand, supplyRung, distanceMetres, branchLatitude, branchLongitude) come from branch
  - Merchant-grouping fields (businessName, logoUrl, primaryCategory, voucherCount, maxEstimatedSaving, totalEstimatedSaving, descriptor) come from `branch.merchant`
  - POSTCODE_CENTROID branch passes through `null` lat/lng correctly
- [ ] **D3** Run `npx jest apps/customer-app/tests/features/search/utils/branchToMerchantTile` — all pins pass.
- [ ] **D4** Run customer-app tsc — zero new errors.
- [ ] **D5** Commit: `feat(category): add surface-local branchToMerchantTile adapter (Phase 2.4 Task D)`.

### Task E: `CategoryResultsScreen` branch-first migration

- [ ] **E1** Open `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx`. Add adapter import:

```ts
import { branchToMerchantTileProps } from '../utils/branchToMerchantTile'
```

- [ ] **E2** Replace the data-source selection at lines 136-140. Before:

```ts
const data      = hasNonScopeFilters ? searchQuery.data      : categoryQuery.data
const isLoading = hasNonScopeFilters ? searchQuery.isLoading : categoryQuery.isLoading
const merchants = data?.merchants ?? []
const total     = data?.total ?? 0
const meta      = data?.meta
```

After:

```ts
const data      = hasNonScopeFilters ? searchQuery.data      : categoryQuery.data
const isLoading = hasNonScopeFilters ? searchQuery.isLoading : categoryQuery.isLoading
// Branch-first: render one tile per branch. Same `?branch=&from=category`
// contract as Phase 2.1 Search + Phase 2.2 Map + Phase 2.3 Home.
const branches  = data?.branches ?? []
const total     = data?.totalBranches ?? data?.total ?? 0
const meta      = data?.meta
```

Note: `total` falls back to legacy `total` only to preserve the FilterSheet result-count display during the migration window — if `totalBranches` is missing the parse would have failed Zod first. The fallback is defensive only.

- [ ] **E3** Update the FlatList at lines 207-219:

```tsx
<FlatList
  data={branches}
  keyExtractor={(branch) => branch.id}
  showsVerticalScrollIndicator={false}
  contentContainerStyle={styles.listContent}
  renderItem={({ item: branch }) => (
    <MerchantTile
      merchant={branchToMerchantTileProps(branch)}
      onPress={(_unusedBranchId) => {
        // Branch-keyed identity: adapter swapped `id` → `branch.id`, so the
        // onPress callback receives branch identity; we still route to the
        // merchant route + stamp `?branch=` for branch-aware Merchant Profile.
        const merchantId = branch.merchant.id
        const branchId   = branch.id
        const url = id
          ? `/merchant/${merchantId}?branch=${branchId}&from=category&categoryId=${id}`
          : `/merchant/${merchantId}?branch=${branchId}&from=category`
        router.push(url as any)
      }}
    />
  )}
  ListEmptyComponent={<EmptyStateMessage reason={emptyReason} />}
/>
```

- [ ] **E4** Update the `expandedBanner` derivation at line 146 — confirm it still uses `merchants.length > 0` semantically (since the banner is "scope expanded but results exist"). Switch the predicate to `branches.length > 0`. Update the `emptyReason` predicate at line 152-154 from `merchants.length === 0` to `branches.length === 0`.
- [ ] **E5** Verify the `total` pass-through to `FilterSheet` (line 225 — `resultCount={total}`). Since `total` now sources from `totalBranches`, this renders the branch count in the filter sheet header — consistent with the branch-first principle (Search already does this since PR #112).
- [ ] **E6** Run `npx jest apps/customer-app/tests/features/search/screens/CategoryResultsScreen` (or the existing category test path) — capture all failures, then update tests for branch-first identity (2 branches of same merchant = 2 tiles, tile tap URL contract).
- [ ] **E7** Run customer-app tsc — zero new errors.
- [ ] **E8** Commit: `feat(category): branch-first migration of CategoryResultsScreen (Phase 2.4 Task E)`.

### Task F: Hook return-type widening

- [ ] **F1** Open `apps/customer-app/src/hooks/useCategoryMerchants.ts`. Currently the hook return type is inferred from the API client — no explicit changes needed since `discoveryApi.getCategoryMerchants` will now return the wider shape via the parsed Zod schema. Verify by reading the API client return-type chain.
- [ ] **F2** Confirm `useSearch` already returns `branches[]` + `totalBranches` per Phase 2.1 (PR #112). If the hook signature was tightened to omit those fields anywhere, widen it.
- [ ] **F3** Run customer-app tsc — zero new errors. If errors appear in `CategoryResultsScreen.tsx` referencing `branches` / `totalBranches` not found, fix at the hook layer (NOT by narrowing the screen).
- [ ] **F4** Commit IF type changes needed: `chore(hooks): widen useCategoryMerchants / useSearch return-type for branch-first (Phase 2.4 Task F)`. Otherwise skip — type inference may make this a no-op.

### Task G: Test sweep + audit pins

- [ ] **G1** Run full customer-app jest sweep. Capture pass/fail count vs baseline (Task A3 + A4 + any other pre-Task-A baseline). Expect: +N new pins from Tasks B/C/D/E; zero regressions elsewhere.
- [ ] **G2** Specifically pin the §M one-tile-per-branch invariant on Category: write a test fixture with 2 branches of the same merchant; assert 2 distinct `<MerchantTile>` renders, NOT 1 collapsed tile. Mirror the Phase 2.2 Map / Phase 2.3 Home equivalent pins.
- [ ] **G3** Pin the `?branch=&from=category&categoryId=` URL contract on tile tap (assert `router.push` called with the expected URL shape).
- [ ] **G4** Run backend vitest sweep — expect zero changes (no backend touched).
- [ ] **G5** Commit: `test(category): pin branch-first invariants + URL contract (Phase 2.4 Task G)`.

### Task H: Bookkeeping

- [ ] **H1** Update `MEMORY.md` top-line entry — add Phase 2.4 SHIPPED row pointing at the new memory file.
- [ ] **H2** Create memory file `project_discovery_rebaseline_phase2_4_complete.md` (only after PR is merged — see Task K3). Skip during plan-locked phase.
- [ ] **H3** Update `project_deferred_followups_index.md` §M:
  - Mark Phase 2.4 SHIPPED with merge SHA after merge.
  - Promote Phase 2.5 (tile-rename sweep) to ELIGIBLE.
  - Close §M for Category-surface coverage.
- [ ] **H4** Update `project_current_state.md` to reflect new main HEAD after merge.
- [ ] **H5** PR body — must NOT overclaim:
  - Explicitly say §BY pill migration is NOT in scope (Phase 2.5 territory).
  - Explicitly say §CA UI-side closure (`Save £X across N vouchers`) is NOT closed by this PR.
  - Explicitly say AllCategoriesScreen is unchanged.
  - Explicitly say Home/Map/Search/Merchant-Profile surfaces are unchanged (helper + one call site update only on Merchant Profile).

### Task I: Pre-merge gate (Step K3 equivalent)

- [ ] **I1** Push branch + open PR titled `Phase 2.4 Category — branch-first migration`.
- [ ] **I2** Confirm CI green.
- [ ] **I3** Spec-compliance reviewer subagent — confirms scope matches plan §0 + §2 exclusions.
- [ ] **I4** Code-quality reviewer subagent — confirms adapter mirrors Phase 2.3 Home + Phase 2.2 Map precedent.
- [ ] **I5** Owner device QA — verify:
  - Category surface renders tiles correctly (no missing data, branch-keyed identity)
  - Multi-branch merchant case: opening a category that contains a multi-branch merchant shows multiple tiles (not collapsed)
  - Tile tap routes to Merchant Profile with `?branch=&from=category&categoryId=` URL
  - Back from Merchant Profile lands on `/(app)/category/<id>` (NOT default `router.back()` previously-active tab)
  - Search→Merchant→back still lands on `/(app)/search?q=...` (regression check)
  - Map→Merchant→back still lands on `/(app)/map` (regression check)
  - Home→Merchant→back still lands on `/(app)/` (regression check)
  - Subcategory routes preserve their categoryId in back-nav (Restaurant → tile → Merchant → back returns to Restaurant page, NOT parent Food & Drink)
- [ ] **I6** SHA-bind merge: `REDEEMO_PR_SCOPE_VERIFIED=$(gh pr view N --json headRefOid --jq .headRefOid) gh pr merge N --merge`.
- [ ] **I7** Post-merge: update memory files per Task H2 + H3 + H4.

---

## 5. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| `useSearch` returns `branches` shape inconsistent with `useCategoryMerchants` | Low | Both endpoints route through the same `branchTileSchema` via `searchResponseSchema` / `categoryMerchantsResponseSchema`. Schema parse pin in Task B catches drift. |
| FilterSheet `resultCount` shows branch count where users expect merchant count | Low | Phase 2.1 Search already does this since PR #112. Branch-first product principle. Owner-locked at Phase 1 spec. |
| Back-nav fallback `/(app)/categories` lands users at AllCategoriesScreen unexpectedly when categoryId is hand-edited out | Very low | Edge case; AllCategoriesScreen is a useful destination + symmetric with `from=search` fallback. Test pins cover. |
| §AS-style merchant-identity drift on Category | Low | Audit-confirmed in 2026-05-18 sweep — customer-app surfaces already correct. Phase 2.4 doesn't touch identity copy. |
| Plan 4 M3 `supplyRung` / `proximityBand` / `descriptorState` schema relaxations from PR #119 leak into Category | Mitigated | PR #119 already shipped on main `6c621b3`. Category schema picks up the relaxed shapes automatically via `branchTileSchema` reuse. |
| Hybrid hook hand-off briefly empty `branches` array on filter change | Low | Same pattern as legacy `merchants` array; `isLoading` gate suppresses empty-state copy during hand-off (existing pattern preserved at lines 147-154). |

---

## 6. Standing rule reaffirmations (Phase 2.4)

- **No-overclaim discipline.** PR body / commit messages / memory updates must NOT imply §BY or §CA UI-side closure. Wire-verified for `totalEstimatedSaving`; UI-side stays deferred.
- **Single-component carry-forward.** `<MerchantTile>` is the single Discovery tile component. Phase 2.5 renames + de-adapts; Phase 2.4 does NOT.
- **Pre-implementation schema probe** before any client code (standing practice as of Phase 2.4).
- **POSTCODE_CENTROID redaction** passes through unchanged. Branch-level lat/lng comes from `branch.branchLatitude` / `branch.branchLongitude`; null means redacted; adapter does NOT synthesise positions.
- **SHA-bound merge command** required for merge approval. `REDEEMO_PR_SCOPE_VERIFIED=<HEAD_SHA> gh pr merge N --merge`.

---

## 7. Self-review (pre-lock)

- [x] **Spec coverage** — Discovery rebaseline spec §M / Plan Rev 1.2 PR-2 / Phase 2.4 Category cell. All requirements traced to tasks B/C/D/E.
- [x] **No placeholders** — every task lists exact files, exact line ranges, exact code.
- [x] **Type consistency** — `BackNavigationContext` exported; `resolveBackNavigation` signature matches across helper + test + caller. `categoryMerchantsResponseSchema` shape matches probe results.
- [x] **Scope discipline** — §2 out-of-scope list is exhaustive; PR body Task H5 enforces no-overclaim.
- [x] **Reviewer-friendly diff** — single call site on Merchant Profile; adapter mirrors Phase 2.3 Home precedent; tests pin branch-first identity invariant.

---

## 8. Execution mode

Same as Phase 2.3:

1. **Plan-lock commit** (this commit) — pause for owner review.
2. **Implementer subagent** — executes Tasks A → G sequentially. Each commit reviewed by spec + code-quality reviewer subagents before next task.
3. **Step K3 owner gate** — device QA on rebased branch before merge.
4. **SHA-bound merge** via the env-var override hook contract.
5. **Post-merge bookkeeping** per Task H.

**Pause point:** plan-lock commit + owner review before Task A1 starts.
