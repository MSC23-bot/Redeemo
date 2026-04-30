# Discovery Surface Rebaseline Plan

> **Date:** 2026-04-30 (rewritten same day from "PR #4 remediation" framing)
> **Status:** Awaiting owner decisions before implementation. Do not start coding.
> **Related:** PR #4 (DRAFT, to be closed as superseded), Plan 1.5 / PR #16 (open, must merge first)
> **Origin:** Code review of PR #4 head `cefaf45` against the Plan 1.5 contract surface
> **Precedent:** matches the surface-by-surface rebaseline approach used for Phase 3C.1a

---

## What this plan is

Rebuild the customer-app **Discovery surfaces** (Search, Category, Map) correctly on a **fresh branch off updated `main`**, against the Plan 1.5 contract.

PR #4 (`feature/customer-app`, head `cefaf45`) is **reference material only** — its visual structure, component shells, animations, and design-system usage are sound and can be copied surface by surface. Its data layer is broken against Plan 1.5 (no `supplyTier`, no tier counts, no `meta` envelope, hard-coded amenity IDs, broken Map endpoint usage) and must be rewritten.

**This is not a remediation of PR #4.** PR #4 will be closed as superseded once the rebaseline lands.

---

## Owner decisions required before implementation

Six decisions. Default recommendation listed for each — implementation will follow the recommendation unless you override.

| # | Decision | Options | Current recommendation |
|---|---|---|---|
| 1 | **Backend route for Map's bbox queries** | (A) Relax `searchMerchants` validation to accept bbox-only requests · (B) **Add a dedicated `GET /api/v1/customer/discovery/in-area` route** · (C) Hybrid (`q` AND `categoryId` both optional when bbox is present) | **B — dedicated in-area route.** Map is conceptually different from search ("what's around this viewport" vs "find what I asked for"). Future Map features (clustering, density overlays) are cleaner with a dedicated endpoint. Reuses Plan 1.5's `rankMerchants` + `computeRatingsByMerchant` so the new route stays thin. |
| 2 | **Eligible-amenities exposure** | (A) New `GET /api/v1/customer/categories/:id/amenities` route · (B) Bundle `eligibleAmenities[]` into the `getCategoryMerchants` response payload | **A — dedicated `/categories/:id/amenities` endpoint.** Cleaner separation of concerns; FilterSheet can load eligible amenities independently of the merchant list (and the response is small + cacheable per-category). Bundling into the merchant response couples the FilterSheet's data dependency to scrolling-driven re-fetches. |
| 3 | **Amenity filter when no category is selected** | (A) Hide the amenity section · (B) Show a "common across categories" union (Wi-Fi, Wheelchair Access, Online Booking, Free Parking) · (C) Show all 17 amenities with a "may not apply to all results" hint | **A — hide amenity filter until a category or subcategory is selected.** Eligibility varies by category; showing it for free-text search risks the user picking an amenity that filters out otherwise-relevant results. Better UX is to reveal it once the category context is established. |
| 4 | **DESTINATION-category sort UX** | (A) Hide "Nearest" for DESTINATION categories · (B) Annotate the default ordering ("Default order: best-rated · Top-rated nearby first") and keep all sort options visible · (C) Rename "Nearest" → "Sort by Distance" | **B — annotate default ordering, don't hide sort options yet.** Hiding options assumes the product team knows users won't want them; better to be informative than restrictive at this stage. Revisit once we have on-device feedback. |
| 5 | **AllCategories per-row count display** | (A) Remove the broken `{merchantCount}` line entirely · (B) Read `merchantCountByCity[me.city]` when known, else show roll-up · (C) Show "X categories" rolled up at the top instead of per-row | **A — remove the broken count line for now.** It's currently rendering "undefined merchants nearby". Cheapest correct fix. The more ambitious per-city / roll-up display can land in a follow-up once we know whether users actually want it. |
| 6 | **PR cadence** | (A) One large rework PR · (B) Five phase-based sequential PRs · (C) **Three surface-aligned PRs (Backend → Search/Category → Map)** | **C — three surface-aligned PRs.** Each PR ships a complete observable user-facing change. No "typed-only" PRs that introduce dead types. PR A is backend-only (small, isolated). PR B is the Search + Category surface end-to-end. PR C is the Map surface end-to-end. Reviewable, parallelisable across people if needed, and matches the surface-by-surface precedent set by Phase 3C.1a. |

**If any recommendation is rejected**, please say so before implementation begins so PR scope is adjusted.

---

## Hard dependencies

- **PR #16 (Plan 1.5) must merge to `main` first.** All three PRs below consume Plan 1.5's new contract surface (`supplyTier`, tier counts, `emptyStateReason`, parameter-less `/categories`, `getCategoryMerchants` route, `getEligibleAmenitiesForSubcategory` helper). Don't open PR A until Plan 1.5 ships.
- **Fresh branch off updated `main`.** Do not continue on `feature/customer-app`. Do not rebase the 100 commits of PR #4 onto a moved `main` — too risky and brings v7 UI loss + recovery noise along.
- **PR #4 stays in `DRAFT` state until PR C merges**, then closes as superseded with a comment pointing to the rebaseline branches.

---

## Rebaseline strategy

The salvageable parts of PR #4 are concentrated in screen components, design-system primitives, and feature-folder shells. The pattern for moving them onto the fresh branch:

```bash
# From the new fresh branch (off updated main):
git checkout cefaf45 -- apps/customer-app/src/features/search/components/SearchBar.tsx
git checkout cefaf45 -- apps/customer-app/src/features/search/components/TrendingSearches.tsx
# ...one file at a time, per surface, only the visual/component code
```

**Rules:**

- **Pull files, not commits.** `git checkout cefaf45 -- <path>` copies a file's content from PR #4's head into the fresh branch's working tree as a new edit. The PR #4 commit history is not inherited. Use this for every salvageable file.
- **Do NOT cherry-pick commits.** Cherry-picking from PR #4 drags 100 commits of mixed-quality history including the v7 UI loss + recovery work. The diff shape is wrong; rebase risk is high; review burden is enormous.
- **Do NOT continue on `feature/customer-app`.** That branch stays exactly where it is, becomes the visual/component reference, and is closed when PR C merges.
- **Do NOT copy `lib/api/discovery.ts`, hooks (`useMapMerchants`, etc.), or `FilterSheet.tsx`'s amenity/category sections.** These are the broken-against-Plan-1.5 layer and must be rewritten from scratch on the new branch.
- **Treat PR #4 as a visual reference document.** Open it side-by-side when implementing each surface — copy what works, rewrite what's broken.

The rebaseline is per-surface, not all-at-once. PR B copies the Search/Category surface files, rewires the data layer, ships. PR C copies the Map surface files, rewires the data layer, ships. PR A precedes both and unblocks them.

**Estimated salvage rate:** ~85–90% of PR #4's screen-level LOC is salvageable file-by-file. The remaining ~10–15% is the data layer (API client, hooks, broken FilterSheet sections) — that gets rewritten directly on the fresh branch against the Plan 1.5 contract.

---

## PR A — Backend

**Branch:** `feature/discovery-in-area-route` (off updated `main`)
**Scope:** Two new backend routes. No client changes. Self-contained, independently reviewable.
**Decision dependencies:** owner decisions #1 (recommendation B) and #2 (recommendation A).

### A.1 In-area merchants endpoint

- **Route:** `GET /api/v1/customer/discovery/in-area?minLat=&maxLat=&minLng=&maxLng=&categoryId=&limit=`
- **Service function:** `getInAreaMerchants(prisma, bbox, opts)` in `src/api/customer/discovery/service.ts`
- **Pipeline:** reuses Plan 1.5's `rankMerchants` + `computeRatingsByMerchant` from `src/api/lib/ranking.ts`. Filter `where.branches.some.{latitude in [minLat, maxLat], longitude in [minLng, maxLng], isActive: true}`. Optional `categoryId` for category filter.
- **Response shape:** identical to `getCategoryMerchants` — `{ merchants, total, meta: { scope, resolvedArea, scopeExpanded, nearbyCount, cityCount, distantCount, emptyStateReason } }`. Each merchant carries `supplyTier`.
- **Limit cap:** sensible default (50) and hard max (200) to prevent unbounded fan-out. No `offset` — Map shows all pins in viewport up to the cap.

### A.2 Eligible-amenities endpoint

- **Route:** `GET /api/v1/customer/categories/:id/amenities`
- **Implementation:** thin wrapper around `getEligibleAmenitiesForSubcategory(prisma, id)` from `src/api/lib/amenity.ts` (already exists, currently internal-only)
- **Response shape:** `{ amenities: Array<{ id, name, iconUrl, isActive }> }` — sorted by name, deduped, isActive=true only (helper already does this)
- **Behaviour for top-level categories:** return amenities seeded directly at that top-level (no parent inheritance to apply). Helper handles this naturally via `categoryId IN [self, parent]` with parent null-safe.

### A.3 Tests

- 1 mocked unit test per route in `tests/api/customer/discovery.routes.test.ts` (route-shape + happy path)
- 1 real-DB integration test per route in `tests/api/customer/discovery.merchant.test.ts` or new file (verifies `supplyTier` on tiles for the in-area route; verifies Restaurant inheritance for the amenities route)
- Run against the same isolated Plan 1.5 Neon branch (`ep-muddy-breeze-abreefzn`) used for Plan 1.5 tests

### A.4 Estimated scope

~250 LOC + tests. **One backend PR, ~3 days.**

---

## PR B — Search + Category surface

**Branch:** `feature/customer-app-discovery-search` (off updated `main`, after PR A merges)
**Scope:** Complete Search and Category browsing flows, end-to-end. Client contract types arrive paired with their first use (no dead-type PRs).
**Decision dependencies:** owner decisions #3 (recommendation A), #4 (recommendation B), #5 (recommendation A).

### B.1 API client contract update

File: `apps/customer-app/src/lib/api/discovery.ts` — written fresh on this branch (do not copy from PR #4).

| Type / method | Purpose |
|---|---|
| `MerchantTile` extended with `supplyTier: 'NEARBY' \| 'CITY' \| 'DISTANT'` | Plan 1.5 surfaces this on every tile |
| `SearchResponse.meta: { scope, resolvedArea, scopeExpanded, nearbyCount, cityCount, distantCount, emptyStateReason }` | Currently silently dropped in PR #4 |
| `SearchParams.scope?: 'nearby' \| 'city' \| 'region' \| 'platform'` | Backend accepts; UI must be able to send |
| `discoveryApi.getCategoryMerchants(id, opts)` method | New endpoint route from Plan 1.5 |
| `discoveryApi.getInAreaMerchants(bbox, opts)` method | PR A endpoint (used by PR C, but exported here for the shared client) |
| `discoveryApi.getEligibleAmenities(categoryId)` method | PR A endpoint (used by FilterSheet) |
| `Category` type fix: replace `merchantCount: number` with `merchantCountByCity: Record<string, number> \| null`, add `intentType`, `descriptorState`, `descriptorSuffix` | Pre-existing bug in PR #4 + new Plan 1.5 fields |

### B.2 Salvageable component files (copied from PR #4 head `cefaf45`)

```bash
git checkout cefaf45 -- apps/customer-app/src/features/search/components/SearchBar.tsx
git checkout cefaf45 -- apps/customer-app/src/features/search/components/TrendingSearches.tsx
git checkout cefaf45 -- apps/customer-app/src/features/search/components/SearchResultItem.tsx
git checkout cefaf45 -- apps/customer-app/src/features/search/screens/SearchScreen.tsx
git checkout cefaf45 -- apps/customer-app/src/features/search/screens/AllCategoriesScreen.tsx
git checkout cefaf45 -- apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx
git checkout cefaf45 -- apps/customer-app/src/features/shared/MerchantTile.tsx
# CategoryGrid + Home shells (consumed by Search flow indirectly):
git checkout cefaf45 -- apps/customer-app/src/features/home/components/CategoryGrid.tsx
```

### B.3 Files written fresh (not copied from PR #4)

- `apps/customer-app/src/lib/api/discovery.ts` — entire client, fresh against Plan 1.5
- `apps/customer-app/src/lib/hooks/useCategories.ts`, `useSearch.ts`, `useCategoryMerchants.ts`, `useEligibleAmenities.ts` — all hooks rewritten against the new client
- `apps/customer-app/src/features/search/components/FilterSheet.tsx` — heavy rewrite. The shell (sections, pills, apply button) is salvageable, but the AMENITIES const + the categories pill row + the amenity toggle logic must be rewritten. Easier to write fresh with the validated visual structure as the design reference.

### B.4 Per-screen wiring tasks

- **AllCategoriesScreen:** filter to `parentId === null` (already correct in PR #4). Remove the broken `{item.merchantCount} merchants nearby` line per decision #5.
- **SearchScreen:** add scope-control pill row (`Nearby · Your city · UK-wide`) sending `scope` param. Wire `meta.emptyStateReason` into `ListEmptyComponent`:
  - `'none'` → "No merchants found for {query}"
  - `'expanded_to_wider'` → "No matches in your city — showing UK-wide results"
  - `'no_uk_supply'` → "No matches anywhere in the UK yet — we're growing daily"
- **CategoryResultsScreen:** migrate `useSearch({ categoryId })` → `useCategoryMerchants(categoryId, opts)`. Add scope-control pill row. Wire `meta.emptyStateReason`. Add intent-aware sort caption per decision #4:
  - LOCAL / MIXED categories: "Default: nearby first"
  - DESTINATION categories: "Default: best-rated nearby first"
  - All four sort options remain visible regardless of intent.
- **FilterSheet:** category section filtered to `parentId === null`. Amenities section hidden until `local.categoryId !== null` (decision #3). Amenity list loaded via `useEligibleAmenities(local.categoryId)`. Real `Amenity.id` UUIDs sent as `amenityIds` filter (verified by Phase 2's typing).

### B.5 Estimated scope

~700 LOC. **One UI PR, ~4 days** (3 days build, 1 day QA + visual review).

---

## PR C — Map surface

**Branch:** `feature/customer-app-discovery-map` (off updated `main`, after PR A merges; can run in parallel with PR B if separate developer is available)
**Scope:** Complete Map experience, end-to-end.

### C.1 Salvageable component files (copied from PR #4 head `cefaf45`)

```bash
git checkout cefaf45 -- apps/customer-app/src/features/map/screens/MapScreen.tsx
git checkout cefaf45 -- apps/customer-app/src/features/map/components/LocationBadge.tsx
git checkout cefaf45 -- apps/customer-app/src/features/map/components/LocationPermission.tsx
git checkout cefaf45 -- apps/customer-app/src/features/map/components/LocationSearch.tsx
git checkout cefaf45 -- apps/customer-app/src/features/map/components/MapCategoryPills.tsx
git checkout cefaf45 -- apps/customer-app/src/features/map/components/MapListView.tsx
git checkout cefaf45 -- apps/customer-app/src/features/map/components/MapMerchantTile.tsx
git checkout cefaf45 -- apps/customer-app/src/features/map/components/MapPins.tsx
```

### C.2 Files written fresh (not copied from PR #4)

- `apps/customer-app/src/features/map/hooks/useInAreaMerchants.ts` — new hook against PR A's `getInAreaMerchants` route. **Replaces** `useMapMerchants`.
- `apps/customer-app/src/features/map/components/MapEmptyArea.tsx` — rewritten to consume `meta` envelope. Currently receives only `hasFilters`; new props: `meta: { distantCount, emptyStateReason }, isOffshore: boolean`.

### C.3 MapScreen rewires

- **Initial load fix:** in `MapScreen.tsx`, call `setBbox(regionToBbox(LONDON_REGION))` (or user's city centre) eagerly on mount, not just in the `handleSkipLocation` path. Race fix.
- **Bbox source:** switch from `useMapMerchants` → `useInAreaMerchants`. Result type now includes `meta` — keep it in the hook's return.
- **Empty area card:** distinguish three cases via `meta.emptyStateReason` + offshore detection:
  - "Nothing in this area · {distantCount} elsewhere — tap to expand"
  - "No matches anywhere in the UK"
  - "You're outside the UK — re-centre"
- **Scope-expansion offer:** when `activeCategoryId` is set and `meta.distantCount > 0` but viewport is empty, MapEmptyArea offers "Expand to UK-wide for this category" → routes to `CategoryResultsScreen` with `scope=platform`.
- **Offshore detection:** UK extent check (lat 49.8 to 60.9, lng -8.2 to 1.8). If bbox is fully outside, show "drifted offshore" affordance instead of querying.
- **LONDON_REGION fallback (optional, non-blocking):** use `me?.city` resolved to coords via a small static city → coords map as the fallback before LONDON_REGION. Reduces London-centrism for non-London users.

### C.4 Estimated scope

~400 LOC. **One UI PR, ~3 days** (2 days build, 1 day QA + visual review).

---

## Recommended sequence

```
PR A  (Backend — in-area + amenities routes)        ~3 days
   ↓ merge to main
   ├──→ PR B  (Search + Category surface)           ~4 days
   └──→ PR C  (Map surface)                         ~3 days
        (B and C can run in parallel after A)
   ↓ both merge to main
Final integration + on-device QA                    ~1-2 days
   ↓
Close PR #4 as superseded with comment pointing to the rebaseline branches
```

**Three PRs total.** Total elapsed time: ~6 days if PR B and PR C are parallel, ~9 days if sequential. Each PR ships a complete, observable user-facing change — no "typed-only" or "preparation" PRs.

---

## What can be salvaged from PR #4

Most of the **visual / structural** work is sound. Salvageable file-by-file via `git checkout cefaf45 -- <path>`:

- **Design-system primitives** (already on `main` from prior phases): all `@/design-system/*` (Text, PressableScale, GradientBrand, BottomSheet, FadeIn, motion components). Already proven by passing tests.
- **Search surface:** SearchBar, TrendingSearches, SearchResultItem, SearchScreen shell, AllCategoriesScreen shell, CategoryResultsScreen shell, MerchantTile, CategoryGrid.
- **Map surface:** MapScreen shell, MapPins, MapMerchantTile, MapListView, MapCategoryPills, LocationBadge, LocationPermission, LocationSearch.
- **Animations:** PulsingDot, FadeIn stagger, MapMerchantTile spring carousel, skeleton loaders.
- **Geo helpers:** `regionToBbox`, expo-location integration, UK-city geocoding.
- **Tests for screens out of scope of this rebaseline:** auth / onboarding / profile / savings / favourites — not touched here.

## What must be rewritten

Concentrated in the **data layer** + **broken-against-Plan-1.5 sections**:

- `apps/customer-app/src/lib/api/discovery.ts` — entire client, fresh
- `apps/customer-app/src/lib/hooks/useCategories.ts`, `useSearch.ts` — fresh against new client
- New hooks: `useCategoryMerchants`, `useEligibleAmenities`, `useInAreaMerchants`
- `FilterSheet.tsx` — shell salvageable, AMENITIES const + categories pill row + amenity toggle logic rewritten
- `MapEmptyArea.tsx` — rewritten with `meta`-aware messaging
- `AllCategoriesScreen.tsx` — count line removed (or wired to `merchantCountByCity` if decision #5 changes)
- `CategoryResultsScreen.tsx` — data hook migrated to `useCategoryMerchants`
- Any test that pinned the old `searchMerchants`-via-bbox path (PR A ripple)

The amount of **truly throwaway code** is small — estimated **<15% of PR #4's screen-level LOC** is rewritten. The remaining ~85% is salvaged via per-file `git checkout`. No commit history is inherited from PR #4.

---

## Status

Awaiting owner sign-off on the six decisions in the table at the top of this document. Implementation begins only after:

1. Plan 1.5 / PR #16 has merged to `main`
2. Owner has confirmed the six decisions (or amended the recommendations)
3. Fresh branch is cut off updated `main` (do not continue on `feature/customer-app`)
4. PR #4 stays in DRAFT throughout; closes as superseded after PR C merges

No code changes are made by this plan. Implementation paused.
