# Phase 2.5 Tile-rename + Shared-component Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the temporary surface-local `branchToMerchantTile` adapter layer introduced in Phase 2.2 → Phase 2.4 by renaming the shared `<MerchantTile>` to `<BranchTile>` and refactoring it to consume `BranchTile` natively. All four Discovery surfaces (Home / Search / Map / Category) flip to direct `<BranchTile branch={branch} />` rendering. No visual change.

**Architecture:** One shared tile component (`apps/customer-app/src/features/shared/BranchTile.tsx`) reads `BranchTile` wire data directly. Three surface-local adapter files are deleted. The Phase 2.3/2.4 surface-local adapter pattern is fully retired. Customer-app no longer pretends branch tiles are merchant tiles.

**Tech Stack:** Expo SDK 54 + expo-router v4, React Query, Zod, jest-expo, no backend changes.

---

## 0. Owner-locked direction (2026-05-21)

| # | Decision | Locked value |
|---|---|---|
| **0.1** | Overall path | **Tier 2 plan-first.** Hard rename + shared-component prop refactor + adapter deletion across 4 surfaces. Bounded scope. |
| **0.2** | Branch + base | Base `main` at `eac8acd`; branch `feature/discovery-rebaseline-phase-2-5-tile-rename`. |
| **0.3** | Hard rename, no compatibility re-export | **APPROVED.** No `MerchantTile` re-export from `BranchTile.tsx`. All 5 call sites updated atomically in one PR. |
| **0.4** | Type alias strategy at import sites | **APPROVED.** `BranchTile as BranchTileType` at every import site (mirrors existing convention in `MapBranchTile.tsx:15`). Wire type alias in `discovery.ts` stays `BranchTile`. |
| **0.5** | `MapBranchTile.tsx` carousel filename | **APPROVED — keep.** No carousel rename. The inline `branchToMerchantTile()` function inside the file goes away; component logic + filename stay. |
| **0.6** | Negative-pin test mechanism | **APPROVED.** Jest meta-test at `apps/customer-app/tests/_meta/phase-2-5-adapter-removed.test.ts` using node `fs` to prove (a) the three adapter file paths don't exist; (b) no source file imports `branchToMerchantTile` / `branchToMerchantTileProps`; (c) no source file imports `'@/features/shared/MerchantTile'`. |
| **0.7** | Wire-type `MerchantTile` + `makeMerchantTile` fixture | **APPROVED — keep both** until Phase 3 removes the legacy wire field. |
| **0.8** | `discovery.ts` schema comment update | **APPROVED.** Comment block at `discovery.ts:297-301` (the homeFeedResponseSchema docblock referencing the Phase 2.3 adapter) updated inline. |
| **0.9** | **Amendment — source comment honesty cleanup** | **APPROVED.** Limited scope: three specific source-comment locations updated inline as Task I. NOT a broader docs/memory sweep. NOT a test-comment sweep. |
| **0.10** | Standing rules carry forward | Single-component carry-forward; §M one-tile-per-branch product principle; POSTCODE_CENTROID redaction passes through unchanged; SHA-bound merge command; subagent-driven implementer + spec/code-quality reviewer per task; Step K3 owner device-QA gate before merge. |

---

## 1. Adapter + component inventory (audit-verified 2026-05-21)

### 1.1 Three surface-local adapters — deletion targets

| # | File | Symbol | LOC | Action |
|---|---|---|---|---|
| 1 | `apps/customer-app/src/features/home/utils/branchToMerchantTile.ts` | `branchToMerchantTileProps(branch): MerchantTile` | 93 | **Delete file** |
| 2 | `apps/customer-app/src/features/search/utils/branchToMerchantTile.ts` | `branchToMerchantTileProps(branch): MerchantTile` | 93 | **Delete file** |
| 3 | `apps/customer-app/src/features/map/components/MapBranchTile.tsx` lines 58-103 | local `branchToMerchantTile(branch): MerchantTile` function | 46 | **Delete the function only**; carousel component body stays |

### 1.2 Shared component refactor target

`apps/customer-app/src/features/shared/MerchantTile.tsx` (244 LOC) → `apps/customer-app/src/features/shared/BranchTile.tsx` via `git mv` + content refactor.

**Audit confirmed fields the component reads (after rename, sourced directly from `BranchTile`):**

| Field on component prop today (`MerchantTileType`) | New source on `BranchTileType` |
|---|---|
| `id` | `branch.id` |
| `businessName` | `branch.merchant.businessName` |
| `logoUrl` | `branch.merchant.logoUrl` |
| `bannerUrl` | `branch.merchant.bannerUrl` |
| `descriptor` | `branch.merchant.descriptor` |
| `primaryCategory?.name` | `branch.merchant.primaryCategory?.name` |
| `distance` | `branch.distance` |
| `avgRating` | `branch.avgRating` |
| `reviewCount` | `branch.reviewCount` |
| `voucherCount` | `branch.merchant.voucherCount` |
| `maxEstimatedSaving` | `branch.merchant.maxEstimatedSaving` |
| `proximityBand` | `branch.proximityBand` |
| `isFavourited` | `branch.isFavourited` |

Audit-confirmed **NOT** consumed by the component (currently filled by adapters with placeholders; all dropped on rename): `tradingName`, `subcategory`, `primaryDescriptorTag`, `nearestBranchId`, `latitude`, `longitude`, `supplyTier`, `supplyRung`, `distanceMetres`, `highlights`, `totalEstimatedSaving`.

### 1.3 Five consumer call sites

| # | File | Today | After Phase 2.5 |
|---|---|---|---|
| 1 | `apps/customer-app/src/features/home/components/FeaturedCarousel.tsx:5,108-109` | `import { MerchantTile }` + `<MerchantTile merchant={branchToMerchantTileProps(branch)} onPress={onBranchPress} />` | `import { BranchTile }` + `<BranchTile branch={branch} onPress={onBranchPress} />` |
| 2 | `apps/customer-app/src/features/home/components/TrendingSection.tsx:6,~80` | Same pattern | Same pattern |
| 3 | `apps/customer-app/src/features/home/components/NearbyByCategory.tsx:5,73-79` | Same pattern | Same pattern |
| 4 | `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx:10,212-235` | `<MerchantTile merchant={branchToMerchantTileProps(branch)} onPress={() => router.push(url)} />` | `<BranchTile branch={branch} onPress={() => router.push(url)} />` |
| 5 | `apps/customer-app/src/features/map/components/MapBranchTile.tsx:12,16,58-103,165-166` | `import { MerchantTile }` + inline `branchToMerchantTile()` + `<MerchantTile merchant={branchToMerchantTile(branch)} />` | `import { BranchTile }` (no inline adapter) + `<BranchTile branch={branch} />` |

### 1.4 Three stale source-comment locations (amendment scope per §0.9)

| # | File | Lines | Content today |
|---|---|---|---|
| 1 | `apps/customer-app/src/features/home/screens/HomeScreen.tsx` | 33-41 | Comment block about Phase 2.3 tap routing references "the branchToMerchantTile adapter's `id: branch.id` swap" |
| 2 | `apps/customer-app/src/features/map/screens/MapScreen.tsx` | 140-145 | Comment block about Phase C state references "the merchant-keyed shared `<MerchantTile>`" + "the carousel now adapts each BranchTile internally via `branchToMerchantTile`" |
| 3 | `apps/customer-app/src/features/search/components/SearchResultItem.tsx` | 11-15 + 290-297 | Two separate comment blocks referencing the rename ("`MerchantTile` to `BranchTile`") + "alongside MerchantTile (PR-3/4)" / "MerchantTile pre-rebaseline" |

---

## 2. Out of scope (explicit — locked from §0)

- ❌ NO visual redesign of any tile
- ❌ NO `§CO` Home scale polish
- ❌ NO `§CQ` Category FilterSheet redesign
- ❌ NO `§CP` proximity-chip semantic redesign
- ❌ NO `§BY` pill/copy migration. **Escalation gate**: PAUSE + escalate if `<SavePill>` or `<VoucherCountPill>` shape needs changing.
- ❌ NO Phase 3 backend cleanup. Legacy `merchants[]` wire field + legacy `meta` stay on every Discovery endpoint.
- ❌ NO `MerchantTile` wire type removal (in `apps/customer-app/src/lib/api/discovery.ts:149`).
- ❌ NO `makeMerchantTile` fixture removal (in `apps/customer-app/tests/fixtures/merchantTile.ts`).
- ❌ NO `SearchResultItem.tsx` logic changes — only the two stale comment blocks update per §0.9.
- ❌ NO route or hook signature changes (back-nav contract from Phase 2.4 stays).
- ❌ NO Plan 4 M4 / M5 work.
- ❌ NO new shared components.
- ❌ NO `MapBranchTile.tsx` filename rename (carousel name kept per §0.5).
- ❌ NO docs/memory text chasing (per §0.9 amendment limit).
- ❌ NO test-comment sweep (per §0.9 amendment limit) unless a test file is already being touched for another reason.

---

## 3. File-by-file scope

### 3.1 Files created

| File | LOC | Reason |
|---|---|---|
| `apps/customer-app/src/features/shared/BranchTile.tsx` | ~245 | Renamed + prop-refactored shared tile. Body mirrors the current `MerchantTile.tsx` structurally; only field-access paths change (`merchant.X` → `branch.X` or `branch.merchant.X`). |
| `apps/customer-app/tests/_meta/phase-2-5-adapter-removed.test.ts` | ~50 | Negative-pin jest test enforcing the three filesystem + import-grep invariants per §0.6. |

### 3.2 Files deleted

| File | Reason |
|---|---|
| `apps/customer-app/src/features/shared/MerchantTile.tsx` | Renamed via `git mv` to `BranchTile.tsx`. |
| `apps/customer-app/src/features/home/utils/branchToMerchantTile.ts` | Adapter no longer needed; component consumes `BranchTile` natively. |
| `apps/customer-app/src/features/search/utils/branchToMerchantTile.ts` | Same. |
| `apps/customer-app/tests/features/shared/MerchantTile.distance-format.test.tsx` | Renamed via `git mv` to `BranchTile.distance-format.test.tsx`. |
| `apps/customer-app/tests/features/shared/MerchantTile.proximity-chip.test.tsx` | Renamed via `git mv` to `BranchTile.proximity-chip.test.tsx`. |
| `apps/customer-app/tests/features/search/utils/branchToMerchantTile.test.ts` | Adapter test moot. |

### 3.3 Files modified (no rename)

| File | What changes |
|---|---|
| `apps/customer-app/src/features/home/components/FeaturedCarousel.tsx` | Import path + prop name + remove adapter call. |
| `apps/customer-app/src/features/home/components/TrendingSection.tsx` | Same. |
| `apps/customer-app/src/features/home/components/NearbyByCategory.tsx` | Same. |
| `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx` | Same + drop the adapter import. |
| `apps/customer-app/src/features/map/components/MapBranchTile.tsx` | Drop inline `branchToMerchantTile` function (lines 58-103) + drop `MerchantTile` import + flip carousel content to `<BranchTile branch={branch} />`. |
| `apps/customer-app/src/lib/api/discovery.ts` | Comment block at lines 297-301 updated to reflect post-Phase-2.5 reality. |
| `apps/customer-app/src/features/home/screens/HomeScreen.tsx` | Comment block at lines 33-41 cleanup per §0.9. |
| `apps/customer-app/src/features/map/screens/MapScreen.tsx` | Comment block at lines 140-145 cleanup per §0.9. |
| `apps/customer-app/src/features/search/components/SearchResultItem.tsx` | Two comment blocks at lines 11-15 and 290-297 cleanup per §0.9 (NO logic changes). |

### 3.4 Test files renamed (path + content)

| Old path | New path |
|---|---|
| `tests/features/shared/MerchantTile.distance-format.test.tsx` | `tests/features/shared/BranchTile.distance-format.test.tsx` |
| `tests/features/shared/MerchantTile.proximity-chip.test.tsx` | `tests/features/shared/BranchTile.proximity-chip.test.tsx` |

Inside each: component import path updated (`@/features/shared/BranchTile`), `<MerchantTile>` → `<BranchTile>`, prop name `merchant` → `branch`, fixture switched from `makeMerchantTile` → `makeBranchTile`.

### 3.5 Test files updated in place (no path rename)

| File | What changes |
|---|---|
| `tests/features/map/MapBranchTile.test.tsx` | Replace any `branchToMerchantTile(branch)` assertions with direct `<BranchTile branch={branch} />` assertions. |
| `tests/features/home/components/FeaturedCarousel.test.tsx` | Update `<MerchantTile>` selectors / mocks → `<BranchTile>`. |
| `tests/features/search/CategoryResultsScreen.test.tsx` | Update `<MerchantTile>` selectors + remove `branchToMerchantTileProps` import / mock. |
| `tests/features/search/CategoryResultsScreen.locality.test.tsx` | Same. |

### 3.6 Test files unaffected (regression pins must survive unchanged)

- All §M one-tile-per-branch pins (Phase 2.4) — pin data-shape behaviour, not component name.
- `tests/features/merchant/utils/resolveBackNavigation.test.ts` — independent.
- `tests/lib/api/discovery.test.ts` — independent.
- `tests/features/home/utils/` directory — empty today (no Home adapter test exists; not a Phase 2.5 gap).

### 3.7 Fixtures

- `tests/fixtures/branchTile.ts` — unchanged.
- `tests/fixtures/merchantTile.ts` — **kept** (still used by legacy-wire-shape tests; Phase 3 removes when the wire field goes).

---

## 4. Tasks

### Task A: Pre-implementation verification

- [ ] **A1** Grep verification: confirm exactly **5 consumer call sites** for `<MerchantTile>` import from `'@/features/shared/MerchantTile'`. If more or fewer found, PAUSE and escalate.

```bash
grep -rln "from '@/features/shared/MerchantTile'" apps/customer-app/src apps/customer-app/app
```

Expected output:
```
apps/customer-app/src/features/home/components/FeaturedCarousel.tsx
apps/customer-app/src/features/home/components/TrendingSection.tsx
apps/customer-app/src/features/home/components/NearbyByCategory.tsx
apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx
apps/customer-app/src/features/map/components/MapBranchTile.tsx
```

- [ ] **A2** Grep verification: confirm exactly **3 adapter file paths**:

```bash
ls -la \
  apps/customer-app/src/features/home/utils/branchToMerchantTile.ts \
  apps/customer-app/src/features/search/utils/branchToMerchantTile.ts \
  apps/customer-app/src/features/map/components/MapBranchTile.tsx
```

All three must exist. The fourth path (`SearchResultItem.tsx`) must NOT contain a `branchToMerchantTile` adapter (Phase 2.1 used native `BranchTile`).

- [ ] **A3** Baseline test count from main:

```bash
cd apps/customer-app && npx jest --forceExit --silent 2>&1 | tail -5
```

Capture suite + test counts (expected post-Phase-2.4 baseline: ~207 suites / 2118 tests). PAUSE if baseline doesn't match expectation.

- [ ] **A4** Baseline tsc check (customer-app):

```bash
cd apps/customer-app && npx tsc --noEmit > /tmp/tsc-baseline.log 2>&1; echo "EXIT=$?"; wc -l /tmp/tsc-baseline.log
```

Capture exit code + line count (expected: clean, exit 0). PAUSE if any new errors above the pre-existing §BV baseline.

### Task B: Create `<BranchTile>` component (rename + prop refactor)

- [ ] **B1** `git mv apps/customer-app/src/features/shared/MerchantTile.tsx apps/customer-app/src/features/shared/BranchTile.tsx`.

- [ ] **B2** Rewrite the component body. Apply the following systematic transforms to the file content:

  1. Component name: `export function MerchantTile(...)` → `export function BranchTile(...)`.
  2. Type alias import line: `import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'` → `import { BranchTile as BranchTileType } from '@/lib/api/discovery'`.
  3. Props type: `{ merchant: MerchantTileType, ... }` → `{ branch: BranchTileType, ... }`.
  4. Destructure: `function BranchTile({ branch, onPress, onFavourite, showFeaturedBadge, showClose, onClose, width }: Props)`.
  5. Field access transforms (per the §1.2 mapping table):
     - `merchant.id` → `branch.id`
     - `merchant.businessName` → `branch.merchant.businessName`
     - `merchant.logoUrl` → `branch.merchant.logoUrl`
     - `merchant.bannerUrl` → `branch.merchant.bannerUrl`
     - `merchant.descriptor` → `branch.merchant.descriptor`
     - `merchant.primaryCategory?.name` → `branch.merchant.primaryCategory?.name`
     - `merchant.distance` → `branch.distance`
     - `merchant.avgRating` → `branch.avgRating`
     - `merchant.reviewCount` → `branch.reviewCount`
     - `merchant.voucherCount` → `branch.merchant.voucherCount`
     - `merchant.maxEstimatedSaving` → `branch.merchant.maxEstimatedSaving`
     - `merchant.proximityBand` → `branch.proximityBand`
     - `merchant.isFavourited` → `branch.isFavourited`
  6. JSDoc / inline comments updated to reference `BranchTile` consumption (no more "adapter" framing).
  7. Defensive: do NOT change layout, styling, motion props, or JSX structure. Only the field-access paths.

- [ ] **B3** Run customer-app tsc:

```bash
cd apps/customer-app && npx tsc --noEmit 2>&1 | tail -20
```

5 import sites in `src/features/{home,search,map}/...` will now fail to import the old `MerchantTile`. THIS IS EXPECTED — Tasks C/D/E fix them. Capture the error list. PAUSE if errors appear OUTSIDE those 5 expected sites.

- [ ] **B4** Commit (must NOT be runnable yet — broken until Tasks C/D/E land):

```bash
git add apps/customer-app/src/features/shared/BranchTile.tsx
git rm apps/customer-app/src/features/shared/MerchantTile.tsx  # auto-staged by git mv but explicit for clarity
git commit -m "$(cat <<'EOF'
feat(shared): rename <MerchantTile> → <BranchTile>; consume BranchTile natively

Phase 2.5 Task B. Renames shared tile component + refactors prop shape
to read BranchTile fields directly (top-level branch fields + nested
branch.merchant.* grouping). 13 audit-confirmed field paths updated;
no visual / layout / motion changes.

This commit alone leaves 5 consumer call sites broken — Tasks C
(Home carousels), D (Category screen), and E (Map carousel) migrate
them in the next 3 commits. Do not pivot off this SHA without the
follow-on commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task C: Migrate Home carousels

- [ ] **C1** Update `apps/customer-app/src/features/home/components/FeaturedCarousel.tsx`:

  - Line ~5: `import { MerchantTile } from '@/features/shared/MerchantTile'` → `import { BranchTile } from '@/features/shared/BranchTile'`.
  - Line ~8: REMOVE `import { branchToMerchantTileProps } from '../utils/branchToMerchantTile'`.
  - Line ~106-109 (the `<MerchantTile>` block):

  Before:
  ```tsx
  <MerchantTile
    key={branch.id}
    merchant={branchToMerchantTileProps(branch)}
    onPress={onBranchPress}
    ...
  />
  ```

  After:
  ```tsx
  <BranchTile
    key={branch.id}
    branch={branch}
    onPress={onBranchPress}
    ...
  />
  ```

- [ ] **C2** Apply the same transform to `apps/customer-app/src/features/home/components/TrendingSection.tsx`.

- [ ] **C3** Apply the same transform to `apps/customer-app/src/features/home/components/NearbyByCategory.tsx`.

- [ ] **C4** Update `apps/customer-app/tests/features/home/components/FeaturedCarousel.test.tsx`:

  - Component import → `BranchTile` from `@/features/shared/BranchTile`.
  - Any `<MerchantTile>` selectors / mocks → `<BranchTile>`.
  - Any `branchToMerchantTileProps` import — REMOVE.

- [ ] **C5** Run the Home test file:

```bash
cd apps/customer-app && npx jest tests/features/home/components/FeaturedCarousel.test.tsx --forceExit --silent 2>&1 | tail -10
```

All pins pass. If any pin breaks because it pinned the component NAME rather than behaviour, update the pin to assert behaviour instead. PAUSE if a behaviour pin breaks.

- [ ] **C6** Run customer-app tsc — Home carousels should now type-check.

- [ ] **C7** Commit:

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git add apps/customer-app/src/features/home/components/FeaturedCarousel.tsx \
        apps/customer-app/src/features/home/components/TrendingSection.tsx \
        apps/customer-app/src/features/home/components/NearbyByCategory.tsx \
        apps/customer-app/tests/features/home/components/FeaturedCarousel.test.tsx
git commit -m "$(cat <<'EOF'
feat(home): migrate carousels to <BranchTile> native render

Phase 2.5 Task C. FeaturedCarousel / TrendingSection / NearbyByCategory
flip from <MerchantTile merchant={branchToMerchantTileProps(branch)} />
to <BranchTile branch={branch} />. No visual change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task D: Migrate Category screen

- [ ] **D1** Update `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx`:

  - Line 10: `import { MerchantTile } from '@/features/shared/MerchantTile'` → `import { BranchTile } from '@/features/shared/BranchTile'`.
  - Line ~14: REMOVE `import { branchToMerchantTileProps } from '../utils/branchToMerchantTile'`.
  - Lines ~212-235 (the FlatList renderItem block):

  Before:
  ```tsx
  <MerchantTile
    merchant={branchToMerchantTileProps(branch)}
    onPress={() => {
      const merchantId = branch.merchant.id
      const branchId   = branch.id
      const url = id
        ? `/merchant/${merchantId}?branch=${branchId}&from=category&categoryId=${id}`
        : `/merchant/${merchantId}?branch=${branchId}&from=category`
      router.push(url as any)
    }}
  />
  ```

  After:
  ```tsx
  <BranchTile
    branch={branch}
    onPress={() => {
      const merchantId = branch.merchant.id
      const branchId   = branch.id
      const url = id
        ? `/merchant/${merchantId}?branch=${branchId}&from=category&categoryId=${id}`
        : `/merchant/${merchantId}?branch=${branchId}&from=category`
      router.push(url as any)
    }}
  />
  ```

- [ ] **D2** Update both Category test files:

  - `apps/customer-app/tests/features/search/CategoryResultsScreen.test.tsx` — `<MerchantTile>` selectors → `<BranchTile>`; remove `branchToMerchantTileProps` import; remove the `mockTile` legacy fixture if no longer needed (replace with `makeBranchTile` everywhere).
  - `apps/customer-app/tests/features/search/CategoryResultsScreen.locality.test.tsx` — same.

  **Defensive**: do NOT change assertion VALUES. Only the component name + prop shape in the renders/mocks.

- [ ] **D3** Run the Category tests:

```bash
cd apps/customer-app && npx jest tests/features/search/CategoryResultsScreen --forceExit --silent 2>&1 | tail -10
```

All pins pass (especially the Phase 2.4 wave-2 + wave-3 regression pins: §M one-tile-per-branch, URL contract, route-id reset, cumulative pill counts, branchMeta read-through). PAUSE if any behaviour pin breaks.

- [ ] **D4** Run customer-app tsc — Category screen should now type-check.

- [ ] **D5** Commit:

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git add apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx \
        apps/customer-app/tests/features/search/CategoryResultsScreen.test.tsx \
        apps/customer-app/tests/features/search/CategoryResultsScreen.locality.test.tsx
git commit -m "$(cat <<'EOF'
feat(category): migrate CategoryResultsScreen to <BranchTile> native render

Phase 2.5 Task D. Flips from <MerchantTile merchant={branchToMerchantTileProps(branch)} />
to <BranchTile branch={branch} />. URL contract from Phase 2.4
(?branch=&from=category&categoryId=) preserved. All Phase 2.4 regression
pins (§M, URL, route-id reset, cumulative counts, branchMeta) still pass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task E: Migrate Map carousel + drop inline adapter

- [ ] **E1** Update `apps/customer-app/src/features/map/components/MapBranchTile.tsx`:

  - Line 12: `import { MerchantTile } from '@/features/shared/MerchantTile'` → `import { BranchTile } from '@/features/shared/BranchTile'`.
  - Line ~15: KEEP `import { BranchTile as BranchTileType } from '@/lib/api/discovery'` (already exists; the type alias).
  - Line ~16: REMOVE the `MerchantTile as MerchantTileType` import line entirely.
  - Lines 38-103: DELETE the entire `branchToMerchantTile()` function + its docblock + the `MerchantTileType` return type reference. The carousel component starts at line 105 today; after deletion, it starts where the function was.
  - Lines ~165-166 (the `<MerchantTile>` block inside the ScrollView map):

  Before:
  ```tsx
  <MerchantTile
    merchant={branchToMerchantTile(branch)}
    onPress={onBranchPress}
    ...
    width={TILE_WIDTH}
  />
  ```

  After:
  ```tsx
  <BranchTile
    branch={branch}
    onPress={onBranchPress}
    ...
    width={TILE_WIDTH}
  />
  ```

- [ ] **E2** Update `apps/customer-app/tests/features/map/MapBranchTile.test.tsx`:

  - Any `branchToMerchantTile(branch)` adapter assertions → direct `<BranchTile branch={branch} />` assertions.
  - Component selectors `<MerchantTile>` → `<BranchTile>`.

- [ ] **E3** Run the Map test:

```bash
cd apps/customer-app && npx jest tests/features/map/MapBranchTile.test.tsx --forceExit --silent 2>&1 | tail -10
```

PAUSE if any pin breaks.

- [ ] **E4** Run customer-app tsc — Map carousel should now type-check; entire app should be clean of broken imports.

- [ ] **E5** Commit:

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git add apps/customer-app/src/features/map/components/MapBranchTile.tsx \
        apps/customer-app/tests/features/map/MapBranchTile.test.tsx
git commit -m "$(cat <<'EOF'
feat(map): migrate MapBranchTile carousel to <BranchTile> native render

Phase 2.5 Task E. Removes inline branchToMerchantTile() function
(was lines 58-103); carousel now renders <BranchTile branch={branch} />
directly. MapBranchTile.tsx file kept (carousel name retained per
plan §0.5). No visual change; carousel logic untouched.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task F: Delete the two external adapter files

- [ ] **F1** Confirm no remaining importers of `branchToMerchantTile` or `branchToMerchantTileProps`:

```bash
grep -rn "branchToMerchantTile\|branchToMerchantTileProps" apps/customer-app/src apps/customer-app/app 2>/dev/null
```

Should be EMPTY. PAUSE if any source file still imports either symbol (Map's inline function was already deleted in Task E).

- [ ] **F2** Delete the two external adapter files + the Phase 2.4 adapter test:

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git rm apps/customer-app/src/features/home/utils/branchToMerchantTile.ts
git rm apps/customer-app/src/features/search/utils/branchToMerchantTile.ts
git rm apps/customer-app/tests/features/search/utils/branchToMerchantTile.test.ts
```

- [ ] **F3** Confirm customer-app tsc still clean.

- [ ] **F4** Commit:

```bash
git commit -m "$(cat <<'EOF'
chore(discovery): delete surface-local branchToMerchantTile adapters

Phase 2.5 Task F. Removes the three interim adapter shapes shipped in
Phase 2.2 (Map inline function — done in Task E), Phase 2.3 (Home
util — this commit), Phase 2.4 (Search/Category util — this commit).
Companion Phase 2.4 adapter test also removed.

All four Discovery surfaces now render <BranchTile branch={branch} />
directly. No adapter layer remains.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task G: Rename the two shared-component test files

- [ ] **G1** Move the two test files via `git mv`:

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git mv apps/customer-app/tests/features/shared/MerchantTile.distance-format.test.tsx apps/customer-app/tests/features/shared/BranchTile.distance-format.test.tsx
git mv apps/customer-app/tests/features/shared/MerchantTile.proximity-chip.test.tsx  apps/customer-app/tests/features/shared/BranchTile.proximity-chip.test.tsx
```

- [ ] **G2** Edit each renamed file:

  - Component import: `import { MerchantTile } from '@/features/shared/MerchantTile'` → `import { BranchTile } from '@/features/shared/BranchTile'`.
  - JSX: `<MerchantTile merchant={tile} ... />` → `<BranchTile branch={tile} ... />`. (The local fixture variable can keep its name `tile` since `BranchTile` is structurally compatible — see G3.)
  - Fixture builder: `makeMerchantTile({...})` → `makeBranchTile({...})`. Update fixture field paths if they're per-merchant (e.g. `voucherCount` becomes `merchant: { voucherCount }`).
  - `describe()` blocks: rename strings from `MerchantTile` → `BranchTile`.

- [ ] **G3** Defensive: do NOT change ASSERTIONS or test logic. If a test computed expected distance formatting or proximity-chip rendering, those expected values stay identical. Only the input fixture shape + component name flip.

- [ ] **G4** Run the two renamed tests:

```bash
cd apps/customer-app && npx jest tests/features/shared/BranchTile --forceExit --silent 2>&1 | tail -10
```

All pins pass.

- [ ] **G5** Commit:

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git add apps/customer-app/tests/features/shared/BranchTile.distance-format.test.tsx \
        apps/customer-app/tests/features/shared/BranchTile.proximity-chip.test.tsx
git commit -m "$(cat <<'EOF'
test(shared): rename MerchantTile.{distance,proximity}.test.tsx → BranchTile.*

Phase 2.5 Task G. File path + describe-block + component selectors
+ fixture builder switch from MerchantTile/makeMerchantTile to
BranchTile/makeBranchTile. Assertion values untouched.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task H: Add negative-pin meta-test

- [ ] **H1** Create `apps/customer-app/tests/_meta/phase-2-5-adapter-removed.test.ts` with the following content:

```ts
import fs from 'node:fs'
import path from 'node:path'

/**
 * Phase 2.5 negative-pin meta-test.
 *
 * Locks the post-Phase-2.5 invariant that NO surface-local
 * branchToMerchantTile adapter remains in the customer-app source tree.
 * Prevents future PRs from reintroducing the adapter pattern by:
 *
 *   1. Asserting the 3 adapter file paths do NOT exist.
 *   2. Asserting NO source file under apps/customer-app/src/** imports
 *      `branchToMerchantTile` or `branchToMerchantTileProps`.
 *   3. Asserting NO source file under apps/customer-app/src/features/**
 *      imports the old shared component path `'@/features/shared/MerchantTile'`.
 *
 * If any of these fail, Phase 2.5's structural goal is broken. Do NOT
 * relax these pins; instead, fix the offending import path.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../..')
const SRC_ROOT  = path.join(REPO_ROOT, 'apps/customer-app/src')

const FORBIDDEN_ADAPTER_PATHS = [
  'apps/customer-app/src/features/home/utils/branchToMerchantTile.ts',
  'apps/customer-app/src/features/search/utils/branchToMerchantTile.ts',
]

const FORBIDDEN_IMPORT_PATTERNS = [
  /\bbranchToMerchantTile(?:Props)?\b/,
  /from\s+['"]@\/features\/shared\/MerchantTile['"]/,
]

function walkSync(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkSync(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('Phase 2.5 — surface-local branchToMerchantTile adapter is fully removed', () => {
  it('no forbidden adapter file path exists on disk', () => {
    for (const rel of FORBIDDEN_ADAPTER_PATHS) {
      const abs = path.join(REPO_ROOT, rel)
      expect(fs.existsSync(abs)).toBe(false)
    }
  })

  it('no source file imports branchToMerchantTile / branchToMerchantTileProps', () => {
    const files = walkSync(SRC_ROOT)
    const offenders: { file: string; line: number; pattern: string }[] = []
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8').split('\n')
      content.forEach((line, idx) => {
        for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
          if (pattern.test(line)) {
            offenders.push({ file: path.relative(REPO_ROOT, file), line: idx + 1, pattern: pattern.source })
          }
        }
      })
    }
    expect(offenders).toEqual([])
  })

  it('no source file under features/** imports the old shared MerchantTile component path', () => {
    const featuresDir = path.join(SRC_ROOT, 'features')
    const files = walkSync(featuresDir)
    const offenders: string[] = []
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      if (/from\s+['"]@\/features\/shared\/MerchantTile['"]/.test(content)) {
        offenders.push(path.relative(REPO_ROOT, file))
      }
    }
    expect(offenders).toEqual([])
  })
})
```

- [ ] **H2** Run the meta-test:

```bash
cd apps/customer-app && npx jest tests/_meta/phase-2-5-adapter-removed.test.ts --forceExit --silent 2>&1 | tail -10
```

All 3 pins pass.

- [ ] **H3** Commit:

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git add apps/customer-app/tests/_meta/phase-2-5-adapter-removed.test.ts
git commit -m "$(cat <<'EOF'
test(meta): lock no-adapter-remains invariant for Phase 2.5

Phase 2.5 Task H. Jest meta-test under tests/_meta/ asserts the
post-Phase-2.5 structural invariants:

  1. The 3 surface-local adapter file paths do NOT exist
     (home/utils + search/utils + map inline function — Map inline
     was deleted in Task E; the test only checks the 2 external files).
  2. No source file imports branchToMerchantTile / Props.
  3. No source file under features/** imports the old shared
     MerchantTile component path.

Prevents future PRs from reintroducing the adapter pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task I: Source-comment honesty cleanup (per §0.9 amendment)

- [ ] **I1** Update `apps/customer-app/src/features/home/screens/HomeScreen.tsx` lines 33-41 (the comment block above `routeToBranch`):

Before:
```tsx
  // Phase 2.3 — Home tile tap routes carry both the merchant id (route
  // path) AND the branch id (`?branch=` for Merchant Profile attribution)
  // PLUS `from=home` so resolveBackNavigation can return the user to
  // the Home tab on back-press.  Multi-branch merchants fan out to one
  // tile per branch per the locked §M one-pin-per-branch principle.
  //
  // The carousels pass branch.id into onBranchPress via the
  // branchToMerchantTile adapter's `id: branch.id` swap; the per-rail
  // lookup below finds the parent merchant.id for the route path.
```

After:
```tsx
  // Phase 2.3 — Home tile tap routes carry both the merchant id (route
  // path) AND the branch id (`?branch=` for Merchant Profile attribution)
  // PLUS `from=home` so resolveBackNavigation can return the user to
  // the Home tab on back-press.  Multi-branch merchants fan out to one
  // tile per branch per the locked §M one-pin-per-branch principle.
  //
  // The carousels pass branch.id into onBranchPress directly (Phase 2.5
  // dropped the interim branchToMerchantTile adapter); the per-rail
  // lookup below finds the parent merchant.id for the route path.
```

- [ ] **I2** Update `apps/customer-app/src/features/map/screens/MapScreen.tsx` lines 140-145 (the comment block above `selectedBranchId`):

Before:
```tsx
  // PR-3 Phase C — carousel + list are now branch-keyed end-to-end.
  // `selectedBranchId` gates the carousel mount AND drives `<MapPins>`
  // visual selection state.  Phase B's interim `selectedMerchant`
  // (which existed to feed the merchant-keyed shared `<MerchantTile>`
  // through the carousel) has been dropped — the carousel now adapts
  // each BranchTile internally via `branchToMerchantTile`.
```

After:
```tsx
  // PR-3 Phase C — carousel + list are now branch-keyed end-to-end.
  // `selectedBranchId` gates the carousel mount AND drives `<MapPins>`
  // visual selection state.  Phase B's interim `selectedMerchant`
  // (which existed to feed the merchant-keyed shared `<MerchantTile>`
  // through the carousel) has been dropped — Phase 2.5 then dropped
  // the interim adapter too, and the carousel now renders <BranchTile>
  // natively.
```

- [ ] **I3** Update `apps/customer-app/src/features/search/components/SearchResultItem.tsx` lines 11-15 (the prop-shape switch comment):

Before:
```tsx
// Discovery Rebaseline PR-2 (Phase 2.1) — prop shape switches from
// `MerchantTile` to `BranchTile`.  One tile per BRANCH (Covelum bug fix):
// multi-branch merchants now render as separate Search rows sharing one
// merchant identity.  Render hierarchy per Spec §3.3 — merchant.businessName
// primary, branch locality secondary, descriptor tertiary.
```

After:
```tsx
// Discovery Rebaseline PR-2 (Phase 2.1) — prop shape is `BranchTile`.
// One tile per BRANCH (Covelum bug fix): multi-branch merchants render
// as separate Search rows sharing one merchant identity.  Render
// hierarchy per Spec §3.3 — merchant.businessName primary, branch
// locality secondary, descriptor tertiary.
```

- [ ] **I4** Update `apps/customer-app/src/features/search/components/SearchResultItem.tsx` lines 290-297 (the open-status comment block):

Before:
```tsx
        {/*
          Open/closed badge intentionally omitted at this layout layer —
          `isOpenNow` is now available on BranchTile (was missing from
          MerchantTile pre-rebaseline). Discovery Rebaseline keeps the
          render parity baseline; surfacing the badge belongs to a
          follow-on visual pass alongside MerchantTile (PR-3/4) so both
          tile types pick up the badge consistently.
        */}
```

After:
```tsx
        {/*
          Open/closed badge intentionally omitted at this layout layer —
          `isOpenNow` is now available on BranchTile (was missing from
          the legacy wire-shape pre-rebaseline).  Discovery Rebaseline
          keeps the render parity baseline; surfacing the badge belongs
          to a follow-on visual pass alongside the shared <BranchTile>
          so both list-row and carousel-card surfaces pick up the badge
          consistently.
        */}
```

- [ ] **I5** Defensive: do NOT change any code, JSX, or assertion in these three files beyond the comment text. Each edit is comment-only.

- [ ] **I6** Run customer-app tsc to confirm no logic accidentally got touched:

```bash
cd apps/customer-app && npx tsc --noEmit 2>&1 | tail -5; echo "EXIT=$?"
```

Exit code 0 + no new errors.

- [ ] **I7** Commit:

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git add apps/customer-app/src/features/home/screens/HomeScreen.tsx \
        apps/customer-app/src/features/map/screens/MapScreen.tsx \
        apps/customer-app/src/features/search/components/SearchResultItem.tsx
git commit -m "$(cat <<'EOF'
docs: source-comment honesty cleanup after Phase 2.5 adapter deletion

Phase 2.5 Task I (amendment per plan §0.9). Three source-comment
blocks updated inline so they stay honest after the adapter layer
goes:

  - HomeScreen.tsx — drop "via the branchToMerchantTile adapter's
    `id: branch.id` swap"; replace with "directly (Phase 2.5 dropped
    the interim adapter)".
  - MapScreen.tsx — drop "the carousel now adapts each BranchTile
    internally via `branchToMerchantTile`"; replace with "Phase 2.5
    then dropped the interim adapter too, and the carousel now
    renders <BranchTile> natively".
  - SearchResultItem.tsx — two blocks updated: the prop-shape switch
    comment + the open-status badge comment ("alongside MerchantTile"
    → "alongside the shared <BranchTile>").

Scope-limited per owner direction: no docs/memory text chasing; no
test-comment sweep. Code untouched.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task J: Update `discovery.ts` schema comment (per §0.8)

- [ ] **J1** Update `apps/customer-app/src/lib/api/discovery.ts` lines 297-301 (the homeFeedResponseSchema docblock):

Before:
```ts
// Phase 2.3 carousels (FeaturedCarousel / TrendingSection /
// NearbyByCategory) consume the new `*Branches` arms via a surface-local
// `branchToMerchantTile` adapter.  Legacy `featured` / `trending` /
// `nearbyByCategory` fields stay on the schema during the additive
// period (Phase 3 cleanup removes them).
```

After:
```ts
// Phase 2.3 carousels (FeaturedCarousel / TrendingSection /
// NearbyByCategory) consume the new `*Branches` arms.  Phase 2.5
// shipped the shared `<BranchTile>` rename + dropped the interim
// adapter — the carousels now render <BranchTile branch={branch} />
// directly.  Legacy `featured` / `trending` / `nearbyByCategory`
// fields stay on the schema during the additive period (Phase 3
// cleanup removes them).
```

- [ ] **J2** Run customer-app tsc — must stay clean (comment-only change).

- [ ] **J3** Commit:

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git add apps/customer-app/src/lib/api/discovery.ts
git commit -m "$(cat <<'EOF'
docs(discovery): update homeFeedResponseSchema comment post Phase 2.5

Phase 2.5 Task J (per plan §0.8). The homeFeedResponseSchema docblock
referenced the Phase 2.3 surface-local adapter; Phase 2.5 deleted it,
so the docblock now reflects that the carousels render <BranchTile>
directly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task K: Pre-merge gate (Step K3 owner device-QA)

- [ ] **K1** Full customer-app jest sweep:

```bash
cd apps/customer-app && npx jest --forceExit --silent 2>&1 | tail -10
```

Suite count + test count: expected ~207 suites / ~2118 tests give-or-take a few (negative-pin file adds +1 suite +3 tests; renamed shared-component tests are still 2 files; deleted adapter test removes 1 suite). Net delta: roughly +0 to +2 suites, +2 to +5 tests. PAUSE if any pre-existing pin breaks.

- [ ] **K2** Backend vitest sweep (defensive — no backend changes expected):

```bash
cd /Users/shebinchaliyath/Developer/Redeemo && npx vitest run 2>&1 | tail -5
```

Unchanged from main baseline (~1010/1010 passing + the known Neon flake passes in isolation).

- [ ] **K3** tsc clean (both layers):

```bash
cd apps/customer-app && npx tsc --noEmit 2>&1 | tail -5; echo "EXIT=$?"
cd /Users/shebinchaliyath/Developer/Redeemo && npx tsc --noEmit > /tmp/tsc-final.log 2>&1; echo "EXIT=$?"; diff /tmp/tsc-baseline.log /tmp/tsc-final.log
```

Customer-app exit 0; backend root diff empty (unchanged from §BV baseline).

- [ ] **K4** Push branch + open PR titled `Phase 2.5 — tile-rename + shared-component sweep`. PR body must:

  - Explicitly say no visual change.
  - List the three adapter file deletions + the component file rename.
  - Cross-ref the §0.9 source-comment cleanup as scope-limited.
  - Affirm the four out-of-scope locks (§BY, §CP, §CO, §CQ).
  - Note the negative-pin meta-test as the future-proofing guard.

- [ ] **K5** Owner device QA across all 4 surfaces. Verify NO visual regression on:

  1. **Home** — Featured / Trending / NearbyByCategory carousels render unchanged. Multi-branch merchants (Covelum) still fan out to multiple tiles. Tile tap → Merchant Profile with `?branch=&from=home`. Back → returns to Home.
  2. **Search** — `<SearchResultItem>` already used `BranchTile` natively pre-Phase-2.5 (no change there). Confirm no regression. Stale-comment edits don't affect rendering.
  3. **Category** — `<BranchTile>` renders identically to the old `<MerchantTile>`. Pill counts cumulative. §M multi-branch fan-out works. URL contract preserved. Back from Merchant Profile → returns to `/(app)/category/<id>` (subcategory preserved).
  4. **Map** — Carousel + list both render `<BranchTile>` natively. Tap a pin → carousel shows the right branch. Swiping the carousel updates `activeIndex`. Close button works.

- [ ] **K6** SHA-bound merge once QA passes (per workflow hook contract):

```bash
SHA=$(gh pr view N --json headRefOid --jq .headRefOid)
gh api "repos/MSC23-bot/Redeemo/compare/main...$SHA" --jq '{ahead_by, total_commits, files_changed: (.files | length), commits: [.commits[].sha[0:7]]}'
# Confirm scope matches expectation, then:
REDEEMO_PR_SCOPE_VERIFIED=$SHA gh pr merge N --merge
```

- [ ] **K7** Post-merge memory close-out:
  - Create `project_discovery_rebaseline_phase2_5_complete.md` topic file.
  - Update `project_current_state.md` to new main HEAD.
  - Update `project_deferred_followups_index.md` §M: Phase 2.5 SHIPPED, Phase 3 cleanup ELIGIBLE.
  - Update `MEMORY.md` top-line.
  - Delete merged feature branch (local + origin).

---

## 5. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hidden `<MerchantTile>` consumer missed in the audit | Low | Medium | Task A1 grep + tsc + jest catch all unknown imports; negative-pin meta-test in Task H is the standing future-proof. |
| Visual regression on a surface I didn't device-QA | Medium | Medium | Task K5 covers all 4 surfaces explicitly. |
| `<BranchTile>` field-access path bug (e.g. `branch.merchant.X` accessed as `branch.X` by mistake) | Medium | High | Task B's systematic transform table (§1.2) is the spec; Task K5 device QA catches behaviour drift; existing tests pin distance + proximity. |
| Type-vs-component name clash trips an import | Low | Low | Task B2's import line + universal `BranchTile as BranchTileType` alias pattern (§0.4). |
| §BY pill shape needs changing mid-task | Low | High | **PAUSE + ESCALATE** per §0.5 / §0.10 escalation gate. Do NOT touch `<SavePill>` / `<VoucherCountPill>` shapes in this PR. |
| Phase 2.4 regression pins break because they pinned component name | Low | Medium | Task D3 + D4 explicitly check. If pins break, update to assert behaviour (not name); never change values. |
| Comment cleanup accidentally edits code | Low | Medium | Task I5 explicit defensive rule + tsc check in I6. |
| Memory file references to deleted symbols become stale | Low | Cosmetic | Out of scope per §0.9; new entries reference Phase 2.5 cleanly. Old entries remain historical record. |

---

## 6. Standing rule reaffirmations (Phase 2.5)

- **No-overclaim discipline.** PR body / commit messages / memory updates must NOT imply visual changes or §BY closure.
- **Single-component carry-forward.** After Phase 2.5, all Discovery surfaces share `<BranchTile>` from `apps/customer-app/src/features/shared/BranchTile.tsx` directly. No adapter layer.
- **Hermes-robust patterns preserved.** No new `Intl.DateTimeFormat({weekday})` / `Date.toLocaleTimeString(timeZone)` usage. (Component doesn't use either; defensive note only.)
- **POSTCODE_CENTROID redaction.** `branch.branchLatitude` / `branch.branchLongitude` may be null; the component doesn't read them. No new exposure.
- **SHA-bound merge command.** Per workflow hook contract.

---

## 7. Self-review (pre-lock)

- [x] **Spec coverage** — Discovery rebaseline spec §M / Plan Rev 1.2 PR-6 / Phase 2.5 tile-rename cell. All requirements traced to tasks B-J.
- [x] **No placeholders** — every task lists exact files, exact line ranges, exact code.
- [x] **Type consistency** — `BranchTileType` aliased at every component-side import; wire type `BranchTile` unchanged in `discovery.ts`. Component `BranchTile` distinct via import path.
- [x] **Scope discipline** — §2 out-of-scope list exhaustive; Task K4 PR-body checklist enforces no-overclaim.
- [x] **Negative-pin coverage** — Task H locks the structural invariant. Future PRs can't reintroduce the adapter pattern without that test failing.
- [x] **Reviewer-friendly diff** — sequence is rename component → migrate consumers → delete adapters → rename tests → add meta-test → comment cleanup. Each commit is self-contained; the chain is auditable.

---

## 8. Execution mode

Same Tier 2 plan-first pattern as Phase 2.4:

1. **Plan-lock commit** (this commit) — pause for owner review.
2. **Implementer subagent** per task (B through J) sequentially. Each commit reviewed by spec-compliance + code-quality reviewer subagents before next task.
3. **Step K3 owner device-QA gate** across all 4 surfaces before merge.
4. **SHA-bound merge** via the env-var override hook contract.
5. **Post-merge bookkeeping** per Task K7.

**Pause point:** plan-lock commit + owner review before Task A1 starts.
