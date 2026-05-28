# Favourites Branch-Level Rework — Design Spec

| | |
|---|---|
| **Phase** | 3C.1g (customer-app surface rebaseline + backend additive) |
| **Tier** | 3 (schema change + backend contract + multi-file customer-app rework + data migration) |
| **Status** | Locked design — awaiting plan-doc + implementation |
| **Owner approval** | 2026-05-28 Q1-Q10 + expanded v1 scope |
| **Brainstorm prep** | Conversation transcript 2026-05-28 (audit + expanded brainstorm) |
| **Supersedes** | Reference-branch Favourites implementation (`feature/customer-app` — NEVER merged; presentational chrome salvageable, data layer rejected) |
| **Closes deferred** | §CI (search-card heart branch-level), §O4 (Voucher Detail heart wiring), §AS partial (customer-app side; customer-web remains separate workstream) |

## 1. Goal

Ship the locked branch-level Favourites model end-to-end. Every "heart" tap in the customer-app maps to the correct entity (branch or voucher). A Favourites tab surfaces two lists — **Places** (branches) and **Vouchers** — with the full voucher state machine and the existing voucher urgency lock.

## 2. Locked product principles

All taken from prior locks. Restated here for spec authority.

### 2.1 Branch-level place favourites (locked 2026-05-03)

- A heart on a merchant profile while a specific branch is selected favourites **that branch**, not the merchant.
- Multi-branch merchants: each branch is independently favouriteable.
- "Follow a merchant chain" is explicitly NOT a feature in v1 or v2 scope.
- Favourites are about *places I want to visit* (branches), not *organisations* (merchants).

### 2.2 Voucher-level voucher favourites (unchanged)

- Vouchers are merchant-wide entitlements; a voucher heart toggles the voucher, regardless of which branch the user opened it from.
- Voucher favourites carry no branch attribution. Branch selection happens at redemption time.

### 2.3 Removal semantics (locked here)

- **Redeemed vouchers stay in favourites.** Manual removal only. For non-REUSABLE: card shows "Returns DD MMM" until the cycle rolls over. For REUSABLE: card shows cooldown state until cooldown clears.
- **Expired vouchers stay in favourites.** Manual removal only. Card shows "Expired" pill. No auto-cleanup in v1 (deferred to v2 backend job if needed).
- **Suspended vouchers / merchants stay in favourites.** Manual removal only. Card shows "Unavailable" pill.
- **Suspended branches stay in Places favourites.** Manual removal only. Card shows "Unavailable" pill.

### 2.4 Eventual consistency on discovery (locked here)

- The Favourites tab is the source of truth.
- Server-computed `isFavourited` on discovery wire shapes (Search / Home / Map / Category / Merchant Profile) is "as of last fetch."
- Heart toggle on any surface invalidates only the favourites list queries; it does NOT broad-invalidate discovery queries.
- Discovery refreshes on next focus / pull-to-refresh / next session.
- Surgical `setQueryData` cross-surface propagation is deferred to a future polish bucket.

### 2.5 TIME_LIMITED urgency threshold (locked Gate H 2026-05-11)

- 60 minutes product-wide. The Favourites Vouchers tab MUST consume the same `URGENT_THRESHOLD_MS = 60 * 60_000` constant used by `useTimeLimited.ts` and `voucherCardSort.ts`. Do NOT duplicate.

### 2.6 60min urgency + state machine consistency invariant

The voucher state pill on the Favourites Vouchers card MUST match the pill rendering used on the Merchant Profile `<VoucherCard>` for the same voucher / same `now`. If they diverge, that is a regression.

## 3. Heart entry points (locked contract)

12 surfaces. Every consumer goes through `useFavourite()` directly with the correct discriminator. Parent-wired callback patterns that skip invalidation are removed (closes the Home rail inconsistency identified in audit §Anything-surprising).

| # | Surface | Entity | ID source | Hook call | Invalidates immediately | Eventually consistent |
|---|---|---|---|---|---|---|
| 1 | Search results (`<SearchResultItem>` over `<BranchTile>`) | branch | `branch.id` | `useFavourite({ type: 'branch', id: branch.id, initialIsFavourited })` | `['favouriteBranches']` | search query |
| 2 | Home Featured rail (`<FeaturedCarousel>` → `<BranchTile>`) | branch | `branch.id` | same | `['favouriteBranches']` | home feed query |
| 3 | Home Trending rail (`<TrendingSection>` → `<BranchTile>`) | branch | `branch.id` | same | `['favouriteBranches']` | home feed query |
| 4 | Home Popular rail (`<PopularSection>` → `<BranchTile>`) | branch | `branch.id` | same | `['favouriteBranches']` | home feed query |
| 5 | Home NearbyByCategory rail (`<NearbyByCategory>` → `<BranchTile>`) | branch | `branch.id` | same | `['favouriteBranches']` | home feed query |
| 6 | Map carousel + list (`<MapBranchTile>`) | branch | `branch.id` | same | `['favouriteBranches']` | map in-area query |
| 7 | Category results (`CategoryMerchantsScreen` → `<BranchTile>`) | branch | `branch.id` | same | `['favouriteBranches']` | category query |
| 8 | Merchant Profile hero (`<HeroSection>`) | branch | **`selectedBranch.id`** (resolved from `?branch=` URL param via `useBranchSelection()`) | `useFavourite({ type: 'branch', id: selectedBranch.id, initialIsFavourited: selectedBranch.isFavourited })` | `['favouriteBranches']`, `['merchantProfile', merchantId, branchId]` | none |
| 9 | Merchant Profile voucher cards (`<VoucherCard>`) | voucher | `voucher.id` | `useFavourite({ type: 'voucher', id: voucher.id, initialIsFavourited })` | `['favouriteVouchers']`, `['merchantProfile', merchantId, branchId]` | none |
| 10 | Voucher Detail (`<CouponHeader>` nav row) | voucher | `voucher.id` | `useFavourite({ type: 'voucher', id: voucher.id, initialIsFavourited: voucher.isFavourited })` | `['favouriteVouchers']`, `['voucher', voucherId]` | none |
| 11 | Favourites tab → Places card (`<BranchFavCard>`) | branch | `branch.id` | swipe-to-remove → `useFavouriteBranches` mutation | `['favouriteBranches']` | discovery surfaces |
| 12 | Favourites tab → Vouchers card (`<VoucherFavCard>`) | voucher | `voucher.id` | swipe-to-remove → `useFavouriteVouchers` mutation | `['favouriteVouchers']` | discovery surfaces |

Invariants:
- Entry points 1-7 all consume the shared `<BranchTile>` primitive. The heart-state interface is uniform.
- Entry point 8 is **load-bearing for the branch-level lock**. The branch picker must re-evaluate the heart icon state when the user switches branches.
- Entry point 10 closes §O4 (replaces the `Alert.alert('Coming next milestone')` stub at `VoucherDetailScreen.tsx:1005`).
- Entry points 11 + 12 are the source-of-truth lists; always fresh by construction.

## 4. Branch-level place favourite invariants

### 4.1 ID resolution per surface

| Surface | Resolution rule |
|---|---|
| Search / Home rails / Map / Category | Each tile IS a branch (one tile per branch since the discovery rebaseline). Heart toggles that tile's `branch.id`. Direct. |
| Merchant Profile hero | `selectedBranch.id` resolved via `?branch=` URL param. Cold-open fallback: nearest-by-GPS or `isMainBranch=true`. Heart icon's fill state re-evaluates on branch picker change. |
| Merchant Profile branch picker rows | Picker is a selector, not a favourites surface. Per-branch favourite indicators in the picker are **out of scope for v1**. |

### 4.2 Multi-branch merchant edge cases

- A user may favourite Branch A and not Branch B of the same merchant. Each is independent.
- Branch suspended after favouriting: card remains in Places tab with "Unavailable" treatment until manually removed.
- All branches of a favourited merchant suspended: each branch card individually shows unavailable.
- Branch deleted from system (hard delete via merchant action): the `FavouriteBranch` row cascades on delete (FK `onDelete: Cascade`).

### 4.3 Branch picker switch and heart state re-evaluation

When the branch picker is closed via "Confirm" with a new branch:
1. URL `?branch=` updates via `router.replace`.
2. `useBranchSelection()` re-evaluates → `selectedBranch.id` changes.
3. `useFavourite` is called with the new `id`. React Query's hook re-keys.
4. The hook reads the new branch's `isFavourited` from `selectedBranch.isFavourited` (server-computed in the merchant profile query).
5. Heart icon re-renders with the new state.

The merchant profile query MUST emit `selectedBranch.isFavourited` keyed on `selectedBranch.id`. See §6.4.

## 5. Voucher-level voucher favourite invariants

### 5.1 Entity + ID

- Voucher favourites key on `voucher.id`. Voucher is merchant-wide.
- No branch attribution carried on the favourite row.

### 5.2 Voucher state machine on a favourited voucher

The Vouchers tab card MUST surface the full state machine. Sources of truth (do NOT duplicate logic):

| State | Truth signal | Card treatment | Pill component | Sort priority |
|---|---|---|---|---|
| **Urgent (TL inside window, <60min remaining)** | `voucher.type === 'TIME_LIMITED' && availableUntil > now && (availableUntil - now) < URGENT_THRESHOLD_MS` | Urgent pill: amber/coral with countdown. Card NOT dimmed. | `<VoucherCardStatePill state="tl-urgent" />` (existing) | 1 |
| **Active + available (default)** | ACTIVE + APPROVED + not `isRedeemedThisCycle` + (no TL window OR inside TL window with ≥60min) + (no REUSABLE cooldown OR cooldown expired) | Default styling. Voucher-type pill. | `<VoucherCardStatePill state="active" />` | 2 |
| **REUSABLE available** | `voucher.type === 'REUSABLE'` + (`reusableState.availableAgainAt` null OR ≤ now) | "AVAILABLE NOW" green pill (existing M5 design). REUSABLE never sets `isRedeemedThisCycle=true`. | `<VoucherCardStatePill state="reusable-available" />` | 2 |
| **REUSABLE cooldown** | `voucher.type === 'REUSABLE'` + `reusableState.availableAgainAt > now` | Card at 75% opacity (existing M5 Gate). Cooldown pill: "Available again · 23m left" or "Available again · From 4pm today" (existing copy). | `<VoucherCardStatePill state="reusable-cooldown" />` | 3 |
| **Redeemed this cycle (non-REUSABLE)** | `voucher.isRedeemedThisCycle === true` + `voucher.type !== 'REUSABLE'` | Diagonal "Voucher Redeemed" cancellation overprint (-10°, brand-rose α 0.32, existing T8k design). "Returns DD MMM" pill. | `<VoucherCardStatePill state="redeemed-this-cycle" />` + existing overprint | 4 |
| **TIME_LIMITED outside window** | `voucher.type === 'TIME_LIMITED'` + (`now < availableFrom` OR `now > availableUntil`) | Card at 75% opacity (existing M4c Gate J). Next-opening pill: "Available Mon-Fri 12-2pm" or computed next-opening time. | `<VoucherCardStatePill state="tl-outside" />` | 5 |
| **Unavailable (suspended)** | `voucher.status === 'INACTIVE'` OR `voucher.merchant.status !== 'ACTIVE'` | Greyed card. "Unavailable" pill. CTA disabled. | `<VoucherCardStatePill state="unavailable" />` | 6 |
| **Expired** | `voucher.status === 'EXPIRED'` OR `voucher.expiryDate < now` | Greyed card. "Expired" pill. CTA disabled. | `<VoucherCardStatePill state="expired" />` | 7 |
| **Free-user locked** | user has no active subscription | Standard styling overlaid with the subscribe-affordance pattern (existing). Tap → `SubscriptionPromptModal` flow. | inherits per-state pill above | sort uses underlying state |

### 5.3 Threshold + sort constants (single source of truth)

```ts
// EXISTING — do NOT duplicate. Re-import on the Favourites side.
// apps/customer-app/src/features/voucher/hooks/useTimeLimited.ts
export const URGENT_THRESHOLD_MS = 60 * 60_000  // OWNER LOCKED Gate H 2026-05-11

// apps/customer-app/src/features/merchant/utils/voucherCardSort.ts
export const URGENT_THRESHOLD_MS = 60 * 60_000  // OWNER LOCKED Gate H 2026-05-11
// + the existing 7-bucket voucherCardPriority(voucher, now) helper
```

Favourites Vouchers tab reuses these. **It is a regression** if the Favourites sort threshold diverges from the Merchant Profile sort threshold.

### 5.4 Tap behaviour

- Voucher card tap → `/(app)/voucher/[id]?from=favourites` (no branch attribution; voucher detail's standard branch resolution applies).
- Heart tap on Voucher Detail or Merchant Profile → toggles voucher favourite.

## 6. Backend architecture

### 6.1 Schema — additive `FavouriteBranch` table

```prisma
model FavouriteBranch {
  id         String   @id @default(cuid())
  userId     String
  branchId   String
  createdAt  DateTime @default(now())

  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  branch     Branch   @relation(fields: [branchId], references: [id], onDelete: Cascade)

  @@unique([userId, branchId])
  @@index([userId])
  @@index([branchId])
}
```

- Migration name: `<YYYYMMDDHHMMSS>_favourite_branch_additive` (Prisma auto-stamps at `prisma migrate dev --create-only` time; convention matches existing migrations e.g. `20260428124838_category_taxonomy`).
- `User.favouriteBranches FavouriteBranch[]` + `Branch.favouritedBy FavouriteBranch[]` back-relations.
- `FavouriteMerchant` table stays in place during transition (removed in cleanup PR).
- `FavouriteVoucher` table unchanged.

### 6.2 New routes (customer-auth scope)

| Method | Path | Request | Response | File location |
|---|---|---|---|---|
| POST | `/api/v1/customer/favourites/branches/:branchId` | params: `branchId` | `{ id, branchId, createdAt }` | `src/api/customer/favourites/routes.ts` |
| DELETE | `/api/v1/customer/favourites/branches/:branchId` | params: `branchId` | `{ success: true }` | same |
| GET | `/api/v1/customer/favourites/branches?page&limit` | query: page 1+ / limit 1-50 default 20 | `{ items[], total, page, limit }` | same |

Error contract:
- POST: `ALREADY_FAVOURITED` on P2002, `BRANCH_NOT_FOUND` on missing/inactive branch.
- DELETE: `FAVOURITE_NOT_FOUND` on P2025.
- Both POST and DELETE are idempotent in user-experience terms — but the backend reports a clean error rather than silently succeeding, matching the existing `favourites/merchants` pattern.

### 6.3 New service layer (in `src/api/customer/favourites/service.ts`)

- `addFavouriteBranch(userId, branchId)` — mirror of `addFavouriteMerchant`. Validates branch exists + active. Throws on P2002.
- `removeFavouriteBranch(userId, branchId)` — mirror of `removeFavouriteMerchant`. Throws on P2025.
- `listFavouriteBranches(userId, page, limit)` — paginated list. Enrichment per item:
  - branch: `id`, `name`, `slug`, `addressLine1`, `city`, `postcode`, `latitude`, `longitude` (gated by `Branch.locationConfidence` redaction contract per `project_location_confidence_redaction_contract.md`)
  - parent merchant: `id`, `businessName`, `tradingName`, `logo`, `status`
  - opening hours → `isOpen` computed
  - active+approved vouchers on parent merchant → `voucherCount`, `maxEstimatedSaving`
  - ratings aggregated at this branch (NOT merchant rollup) per the `contextBranchId` rating direction
  - `isUnavailable`: branch suspended OR merchant suspended (or both)
  - Sort: `isUnavailable` last, then `isOpen` first within available, then `favouritedAt desc`
  - Pagination: offset-based (matches existing pattern). Pagination cursor migration is part of §W standing concern, not this rework.
  - Returns `{ items, total, page, limit }`.

### 6.4 Wire contract changes (additive)

| Endpoint | Field | Pre-rework | Post-rework | Removal target |
|---|---|---|---|---|
| `/discovery/search` | `BranchTile.isFavourited` | server-computed via `Set<merchantId>` lookup on `FavouriteMerchant` | server-computed via `Set<branchId>` lookup on `FavouriteBranch` | n/a — field stays, lookup table flips |
| `/discovery/in-area` | `BranchTile.isFavourited` | same | same | n/a |
| `/discovery/home` | `BranchTile.isFavourited` | same | same | n/a |
| `/discovery/category/:id` | `BranchTile.isFavourited` | same | same | n/a |
| `/merchants/:id` | `Merchant.isFavourited` | `findUnique(userId_merchantId)` on `FavouriteMerchant` | unchanged (additive transition; reads from `FavouriteMerchant`) | **cleanup PR** removes the field |
| `/merchants/:id` | `selectedBranch.isFavourited` (NEW additive) | not emitted | `findUnique(userId_branchId)` on `FavouriteBranch` keyed on the selected branch | n/a — permanent |
| `/merchants/:id` | `branches[i].isFavourited` (NEW additive, on the branches array) | not emitted | bulk `Set<branchId>` lookup keyed on the branches array | n/a — permanent |
| `/vouchers/:id` (getCustomerVoucher) | `voucher.isFavourited` (NEW additive) | not emitted | `findUnique(userId_voucherId)` on `FavouriteVoucher` | n/a — permanent (closes §O4) |
| `/merchants/:id` voucher cards | `voucher.isFavourited` on each voucher in the list | already emitted via existing voucher card payload | unchanged | n/a |

Spec §6.4 invariant: the `BranchTile.isFavourited` wire field name is intentionally unchanged. Spec Rev-2 #13 (discovery rebaseline) designed it forward-compatible for exactly this lookup-table flip.

### 6.5 Data migration / backfill script

Per Q2 (locked main-branch-only backfill):

- New file: `prisma/backfill-favourite-branches.ts`
- Behaviour: for each `FavouriteMerchant` row, insert a `FavouriteBranch(userId, branch_where_isMainBranch=true)` if and only if the merchant has an active main branch.
- Skip merchants with no `isMainBranch=true` branch (data anomaly): log + count + continue.
- Multi-branch merchants: only the main branch is auto-favourited. User adds secondary branches manually post-launch.
- Idempotent: re-running the script does not create duplicates (relies on the `(userId, branchId)` unique constraint; catch P2002 + continue).
- Dry-run mode via `--dry-run` flag: prints what WOULD be inserted without writing.
- Output summary at end: rows-inserted / rows-skipped-already-favourited / rows-skipped-no-main-branch / rows-skipped-inactive-merchant.

Backfill is invoked as a one-shot step in the implementation plan, BEFORE the customer-app cutover, AFTER the schema migration applies. Production order: migrate → backfill → release customer-app build with the new hook.

## 7. Customer-app architecture

### 7.1 API client (NEW)

New module `apps/customer-app/src/lib/api/favourites.ts`:

```ts
export const favouritesApi = {
  // Places (branches)
  getBranches: (page, limit) => api.get<FavouriteBranchesResponse>('/api/v1/customer/favourites/branches', { page, limit }),
  addBranch: (branchId) => api.post(`/api/v1/customer/favourites/branches/${branchId}`),
  removeBranch: (branchId) => api.del(`/api/v1/customer/favourites/branches/${branchId}`),

  // Vouchers (UNCHANGED contract — wraps existing routes)
  getVouchers: (page, limit) => api.get<FavouriteVouchersResponse>('/api/v1/customer/favourites/vouchers', { page, limit }),
  addVoucher: (voucherId) => api.post(`/api/v1/customer/favourites/vouchers/${voucherId}`),
  removeVoucher: (voucherId) => api.del(`/api/v1/customer/favourites/vouchers/${voucherId}`),

  // Merchant-level — kept live during transition; removed in cleanup PR
  addMerchant: (merchantId) => api.post(`/api/v1/customer/favourites/merchants/${merchantId}`),
  removeMerchant: (merchantId) => api.del(`/api/v1/customer/favourites/merchants/${merchantId}`),
}
```

Zod schemas for each response.

### 7.2 Hook contract — extended discriminator

```ts
// apps/customer-app/src/hooks/useFavourite.ts
type FavouriteEntity = 'branch' | 'voucher' | 'merchant'  // 'merchant' kept for transition, removed in cleanup

interface UseFavouriteOptions {
  type: FavouriteEntity
  id: string
  initialIsFavourited: boolean
}

interface UseFavouriteReturn {
  isFavourited: boolean
  toggle: () => void
  isLoading: boolean
}

export function useFavourite(options: UseFavouriteOptions): UseFavouriteReturn
```

**Invariants:**
- Pessimistic toggle (state advances only on successful HTTP response).
- `onSuccess`:
  - `type === 'branch'` → invalidate `['favouriteBranches']`.
  - `type === 'voucher'` → invalidate `['favouriteVouchers']`.
  - `type === 'merchant'` → invalidate `['favouriteMerchants']` (transition path).
  - Plus the per-call contextual cache key if the consumer passes it (e.g. `['merchantProfile', merchantId, branchId]` from `<HeroSection>`).
- Heart icon respects `useReduceMotion()`: scale animation skipped on reduce-motion-on, colour flip only.

### 7.3 List hooks — NEW

```ts
// apps/customer-app/src/features/favourites/hooks/useFavouriteBranches.ts
export function useFavouriteBranches(): InfiniteQuery<FavouriteBranchItem[]>
// queryKey: ['favouriteBranches']
// uses useInfiniteQuery, getNextPageParam on (page+1) until total reached

// apps/customer-app/src/features/favourites/hooks/useFavouriteVouchers.ts
export function useFavouriteVouchers(): InfiniteQuery<FavouriteVoucherItem[]>
// queryKey: ['favouriteVouchers']

// apps/customer-app/src/features/favourites/hooks/useRemoveFavourite.ts
export function useRemoveFavourite(type: 'branch' | 'voucher'): {
  remove: (id: string) => void
  undoLastRemove: () => void
  pendingRemoveId: string | null
}
// Optimistic remove via setQueryData on the list cache.
// 4s undo window held in a ref + setTimeout.
// On undo: setQueryData restores the row AND skips the backend DELETE (which is yet to fire).
// On timeout: fires backend DELETE; on DELETE error, rollback + error toast.
```

### 7.4 Heart-consumer migration map

The rework cuts over 10 existing call sites. The change in each is a discriminator swap from `'merchant'` to `'branch'` and an ID source change from `branch.merchant.id` to `branch.id`.

| File | Pre | Post |
|---|---|---|
| `apps/customer-app/src/features/search/components/SearchResultItem.tsx` | `useFavourite('merchant', tile.merchant.id, tile.isFavourited)` | `useFavourite('branch', tile.id, tile.isFavourited)` |
| `apps/customer-app/src/features/home/components/FeaturedCarousel.tsx` | parent-wired `onFavourite` callback (no invalidate) | direct `useFavourite('branch', tile.id, tile.isFavourited)` per tile |
| `apps/customer-app/src/features/home/components/TrendingSection.tsx` | same | same |
| `apps/customer-app/src/features/home/components/PopularSection.tsx` | same | same |
| `apps/customer-app/src/features/home/components/NearbyByCategory.tsx` | same | same |
| `apps/customer-app/src/features/map/components/MapBranchTile.tsx` | parent-wired | direct `useFavourite('branch', tile.id, tile.isFavourited)` |
| `apps/customer-app/src/features/merchant/components/HeroSection.tsx` | `useFavourite('merchant', merchant.id, merchant.isFavourited)` | `useFavourite('branch', selectedBranch.id, selectedBranch.isFavourited)` |
| `apps/customer-app/src/features/merchant/components/VoucherCard.tsx` (heart top-right) | parent-wired (caller pattern) | direct `useFavourite('voucher', voucher.id, voucher.isFavourited)` |
| `apps/customer-app/src/features/voucher/components/CouponHeader.tsx` + `VoucherDetailScreen.tsx:1005` | stub `Alert('Coming next milestone')` | `useFavourite('voucher', voucher.id, voucher.isFavourited)` — **§O4 closure** |
| `apps/customer-app/src/features/home/components/<rail>.tsx` (any other rail using BranchTile) | parent-wired | direct hook on the tile |

### 7.5 Favourites screen architecture (NEW)

Directory: `apps/customer-app/src/features/favourites/`

```
src/features/favourites/
├── screens/
│   └── FavouritesScreen.tsx          // orchestrator: tab state, scroll behaviour, pull-to-refresh
├── components/
│   ├── FavouritesHeader.tsx          // tab switcher (Places · 12 / Vouchers · 8)
│   ├── BranchFavCard.tsx             // single Places card
│   ├── VoucherFavCard.tsx            // single Vouchers card (wraps existing VoucherCard chrome where possible)
│   ├── SwipeToRemove.tsx             // pan-responder gesture wrapper
│   ├── UndoToast.tsx                 // 4s undo with countdown bar
│   ├── FavouritesEmptyState.tsx      // per-tab empty state
│   └── FavouritesSkeleton.tsx        // loading skeleton
├── hooks/
│   ├── useFavouriteBranches.ts
│   ├── useFavouriteVouchers.ts
│   └── useRemoveFavourite.ts
└── utils/
    └── voucherFavouriteSort.ts       // RE-EXPORTS the existing voucherCardPriority + URGENT_THRESHOLD_MS
```

Route: `app/(app)/favourites.tsx` — 3-line re-export of `<FavouritesScreen>`.

`<FavouritesScreen>`:
- Reads tab state from URL `?tab=places|vouchers` (deep-linkable from Profile nudges later).
- Default tab: Places.
- Safe-area-aware layout (per the standing ScrollView wrapper pattern from PR #135).
- Tab switcher in the header.
- `<FlatList>` for each tab (memoised, key-extracted on item id, getItemLayout if uniform row height).
- Infinite scroll: page size 20, threshold 10 items from bottom.
- Pull-to-refresh: `RefreshControl` re-runs the infinite query from page 1.
- Empty state when the list is empty after first fetch.
- Skeleton on first cold-cache fetch.

### 7.6 Tab-bar entry (per Q7)

`apps/customer-app/app/(app)/_layout.tsx`:

```tsx
<Tabs.Screen name="index"      ... />  // Home
<Tabs.Screen name="map"        ... />  // Map
<Tabs.Screen name="favourites" options={{ title: 'Favourites', tabBarIcon: ... }} />  // NEW
<Tabs.Screen name="savings"    ... />  // Savings
<Tabs.Screen name="profile"    ... />  // Profile
```

Heart icon for the tab from `@/design-system/icons` (existing `Heart` lucide import). Active dot + opacity pattern matches the other tabs.

### 7.7 §O4 closure — Voucher Detail heart wiring

At `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx:1005`, replace:

```tsx
// Before
const handleFav = () => {
  Alert.alert('Coming next milestone', 'Voucher favourite toggle ships in M2.')
}
```

with:

```tsx
// After
const { isFavourited, toggle, isLoading } = useFavourite({
  type: 'voucher',
  id: voucherId,
  initialIsFavourited: voucher?.isFavourited ?? false,
})
const handleFav = () => { toggle() }
```

The existing `<CouponHeader>` already accepts `isFavourited` + `onFav` props; just wire them through.

Read `voucher.isFavourited` from the new additive wire field on `getCustomerVoucher` (see §6.4). Customer-app Zod schema in `apps/customer-app/src/lib/api/voucher.ts` extends `voucherDetailSchema` with `isFavourited: z.boolean()`.

### 7.8 Home rail invalidation fix (consistency)

Pre-rework: `FeaturedCarousel`, `TrendingSection`, `PopularSection`, `NearbyByCategory` pass an `onFavourite` callback to their `<BranchTile>` children. The parents don't invalidate. Tapping a heart on Home toggles UI state locally but doesn't invalidate `['favouriteBranches']`. Result: navigate to Favourites tab → stale.

Post-rework: each `<BranchTile>` calls `useFavourite('branch', tile.id, tile.isFavourited)` internally OR the rail component renders the heart and calls the hook directly. **Decision**: BranchTile renders the heart and calls the hook internally. This centralises the contract in one component used across 7 surfaces. Rails no longer pass `onFavourite`.

Trade-off: this couples BranchTile to React Query. Acceptable — BranchTile is already coupled to the discovery wire shape (`isFavourited` is part of its prop schema), so the data dependency is symmetrical.

## 8. Places tab — full specification

### 8.1 Card layout (`<BranchFavCard>`)

```
┌──────────────────────────────────────────────────────────────┐
│ ┌────────┐  Branch Name                          [♥]          │
│ │ logo   │  Merchant Name                                     │
│ │  48pt  │  ─────────────                                     │
│ └────────┘  📍 Brightlingsea · 0.8mi · Open                  │
│             3 vouchers · Save up to £15                       │
└──────────────────────────────────────────────────────────────┘
```

Fields:
- 48pt merchant logo (left, rounded square, fallback to merchant initial)
- Branch name (16pt heading)
- Merchant name (12pt secondary, if different from branch name)
- Meta row: location (city or branch identifier), distance (if GPS available — suppressed otherwise per `Branch.locationConfidence` redaction), open/closed status (small pill)
- Voucher count + maxEstimatedSaving (small footer row)
- Heart icon top-right (always filled — it's a favourite by definition; tap removes)
- Tap card → `/(app)/merchant/[id]?branch=<branchId>&from=favourites`
- Swipe left → reveal Remove affordance + trigger remove

### 8.2 States

- Default — full opacity, brand-rose heart filled.
- Unavailable (branch suspended OR merchant suspended) — 75% opacity, "Unavailable" pill in meta row, no voucher count footer.

### 8.3 Sort (locked v1)

```
1. Open now + active merchant — favouritedAt desc within
2. Closed now + active merchant — favouritedAt desc within
3. Unavailable (branch or merchant suspended) — favouritedAt desc within
```

Distance sort: deferred to v2.

### 8.4 Empty state

- Heart-with-checkmark icon (lightweight, no bespoke illustration for v1)
- Headline: "No places saved yet"
- Body: "Save places you want to visit by tapping the heart on any merchant."
- CTA: "Discover places" → routes to Home

## 9. Vouchers tab — full specification

### 9.1 Card layout (`<VoucherFavCard>`)

Reuses the existing `<VoucherCard>` chrome (pastel-but-alive per-type gradients, brand-R watermark, side notches) ADAPTED for the favourites context:

- Heart icon at top-right (always filled; tap removes).
- Voucher type chip (existing per-type colour).
- Voucher state pill (urgency / cooldown / redeemed / TL outside-window / unavailable / expired) — uses the EXISTING `<VoucherCardStatePill>` from `apps/customer-app/src/features/merchant/components/`. Do not duplicate.
- Savings amount (display.md Mustica, per DESIGN.md "data is hero" rule).
- Merchant logo + name (small footer-style — not the headline; the voucher offer IS the headline).
- "Available at X branches" sub-footer when merchant is multi-branch.
- Tap card → `/(app)/voucher/[id]?from=favourites`.
- Swipe left → reveal Remove + trigger remove.

The card is NOT branch-attributed (vouchers are merchant-wide). The merchant logo/name footer-row signals the parent merchant identity.

### 9.2 States

Per the §5.2 state machine. The 9 states map to existing pill components. Card opacity:
- States 1, 2 (urgent, active): 100%
- States 3 (REUSABLE cooldown), 5 (TL outside window): 75%
- States 4 (redeemed-this-cycle), 6, 7 (unavailable, expired): 75% + overprint or greyscale

### 9.3 Sort (locked Smart 7-bucket per Q8)

```
1. Urgent (TL inside window, <60min) — by remaining time asc
2. Active + available (incl. REUSABLE available) — by favouritedAt desc
3. REUSABLE cooldown — by availableAgainAt asc
4. Redeemed this cycle (non-REUSABLE) — by cycle-reset date asc
5. TIME_LIMITED outside window — by next-opening asc
6. Unavailable — by favouritedAt desc
7. Expired — by favouritedAt desc
```

Within each priority bucket, secondary sort by `favouritedAt desc`.

Sort is computed CLIENT-side in `voucherFavouriteSort.ts` from server-emitted state fields. Server returns rows in `favouritedAt desc` order; client applies the 7-bucket priority. **This MUST reuse `voucherCardPriority` from `apps/customer-app/src/features/merchant/utils/voucherCardSort.ts`.** Single source of truth.

### 9.4 Empty state

- Voucher-icon (lightweight, no bespoke illustration v1)
- Headline: "No vouchers saved yet"
- Body: "Save vouchers you want to redeem later by tapping the heart on any voucher."
- CTA: "Browse vouchers" → routes to Search

## 10. Eventual consistency model (locked)

- Favourites tab is the source of truth.
- Heart toggle invalidates only `['favouriteBranches']` or `['favouriteVouchers']` (the list query) — plus the per-screen contextual query for the screen the toggle happened on (`['merchantProfile', id, branchId]` or `['voucher', id]`).
- Heart toggle does NOT invalidate `['homeFeed']`, `['searchBranches']`, `['discoveryInArea']`, `['categoryMerchants']`.
- Discovery surfaces refresh on:
  - Next focus event (tab switch back to Home / Map / Search / Category).
  - Pull-to-refresh.
  - React Query staleTime expiry (current setting per surface).
  - Next cold session.

User-visible behaviour after a heart toggle:
- The surface where the toggle happened: heart icon flips immediately (pessimistic state update inside `useFavourite`).
- The Favourites tab: shows fresh data the next time the user navigates to it (the `['favouriteBranches']` / `['favouriteVouchers']` query was invalidated → refetch on focus).
- Other discovery surfaces: may show stale `isFavourited` until refreshed. Documented limitation. Acceptable for v1.

## 11. Removal / undo behaviour

- Swipe-left on a Favourites tab card reveals a Remove affordance (red, "Remove" label).
- Tap Remove (or complete the swipe past threshold) → card animates off + UndoToast appears.
- UndoToast: 4s with countdown bar. Tap "Undo" → card animates back + no DELETE call fires.
- Timeout (4s no undo): backend DELETE fires. On success → silent. On error → rollback (card restored) + error toast "Couldn't remove. Please try again."
- Optimistic state via `setQueryData` on the list cache; remove from list array.
- The 4s undo window survives:
  - Tab switch (Places ↔ Vouchers) — undo toast persists on the screen.
  - Scroll — toast pinned to bottom of screen.
  - Pull-to-refresh — refresh fires DELETE first, then the refresh.
- The 4s undo window does NOT survive:
  - Screen exit (navigate to another tab or merchant profile) — DELETE fires immediately on exit.
  - App background → foreground after 4s elapsed in background — DELETE already fired.

## 12. Motion + animation

| Element | Pattern | Reduce-motion behaviour |
|---|---|---|
| Heart toggle (any surface) | Scale 1.0 → 1.15 → 1.0 over 200ms ease-out + colour transition 150ms | Skip scale, colour-only transition |
| Card enter (initial mount) | Stagger fade-in 60ms between cards over the first viewport's worth of rows | No animation; static render |
| Card swipe | Standard pan-responder; reveal Remove at 80pt slide threshold | Standard (gesture motion is user-driven, not animated by us) |
| Undo toast | Slide-up from bottom 240ms ease-out + countdown bar over 4s | Slide-up duration 0; static countdown bar |
| Empty-state icon | No animation v1 | n/a |
| Tab switch | Cross-fade 180ms | Instant swap |

Reduce-motion source: existing `useReduceMotion()` from `apps/customer-app/src/features/profile/hooks/useReduceMotion.ts`.

## 13. Backend tests — regression pin matrix

| File | Coverage |
|---|---|
| `tests/api/customer/favourites/branches.routes.test.ts` (NEW) | POST/DELETE/GET routes. ALREADY_FAVOURITED. FAVOURITE_NOT_FOUND. BRANCH_NOT_FOUND on inactive branch. Pagination. |
| `tests/api/customer/favourites/branches.service.test.ts` (NEW) | `listFavouriteBranches` enrichment — isOpen / voucherCount / maxEstimatedSaving / ratings keyed on branch / isUnavailable / sort order with mixed-state fixtures. |
| `tests/api/customer/discovery/branch-tile-isFavourited.test.ts` (NEW or extension) | Pin that `BranchTile.isFavourited` is now keyed on `branch.id` lookup against `FavouriteBranch`. Regression pin against accidental revert to merchant-keyed lookup. |
| `tests/api/customer/merchant/isFavourited-additive.test.ts` (NEW or extension) | Pin that `selectedBranch.isFavourited` AND `merchant.isFavourited` BOTH emit during transition. `branches[i].isFavourited` emits on the branches array. |
| `tests/api/customer/voucher/isFavourited-additive.test.ts` (NEW) | Pin that `getCustomerVoucher` emits `voucher.isFavourited`. (Closes §O4 contract gap.) |
| `tests/scripts/backfill-favourite-branches.test.ts` (NEW) | Idempotency. Multi-branch merchant → main-branch only. Anomaly skip (no main branch). Dry-run. Counts in summary. |

## 14. Customer-app tests — regression pin matrix

| File | Coverage |
|---|---|
| `apps/customer-app/tests/hooks/useFavourite.test.tsx` (EXTENSION) | New `'branch'` discriminator. New invalidation paths. Pessimistic toggle still correct under all 3 discriminators. |
| `apps/customer-app/tests/lib/api/favourites.test.ts` (NEW) | Zod schemas for branches list + items + voucher list parity. Add/remove/get parity. |
| `apps/customer-app/src/features/favourites/__tests__/FavouritesScreen.test.tsx` (NEW) | Tab switch. Default tab. URL `?tab=` param. Pull-to-refresh fires invalidate. Empty state per tab. Skeleton on cold cache. |
| `apps/customer-app/src/features/favourites/__tests__/BranchFavCard.test.tsx` (NEW) | Default state. Unavailable state. Heart-tap → remove flow. Card-tap → navigates to `/(app)/merchant/[id]?branch=<id>&from=favourites`. |
| `apps/customer-app/src/features/favourites/__tests__/VoucherFavCard.test.tsx` (NEW) | All 9 voucher states render correctly. State pill reuses `<VoucherCardStatePill>`. Card-tap → navigates to `/(app)/voucher/[id]?from=favourites`. |
| `apps/customer-app/src/features/favourites/__tests__/voucherFavouriteSort.test.ts` (NEW) | Sort priority matrix. Regression pin: imports `URGENT_THRESHOLD_MS` from the EXISTING constant location. Sort matches Merchant Profile sort for the same voucher / same `now`. |
| `apps/customer-app/src/features/favourites/__tests__/useRemoveFavourite.test.tsx` (NEW) | Optimistic remove. 4s undo restores. Timeout fires DELETE. DELETE error rolls back + shows error toast. |
| `apps/customer-app/tests/features/voucher/voucher-detail-favourite.test.tsx` (NEW) | Pin §O4 closure: Voucher Detail heart tap calls `useFavourite('voucher', ...)` and NOT `Alert.alert`. Regression pin against revert to stub. |
| `apps/customer-app/tests/features/home/home-rail-favourite-invalidation.test.tsx` (NEW or extension) | Pin that heart-tap on Home rails invalidates `['favouriteBranches']`. Regression pin against re-introducing the parent-callback no-invalidate pattern. |
| `apps/customer-app/tests/features/merchant/hero-favourite-branch-switch.test.tsx` (NEW or extension) | Pin that switching branches in the picker re-evaluates the heart icon state. Pin that the toggle calls `useFavourite('branch', selectedBranch.id, ...)`. |
| `apps/customer-app/tests/features/search/SearchResultItem.test.tsx` (UPDATE) | Update §CI pin: heart now calls `useFavourite('branch', tile.id, ...)` not `useFavourite('merchant', tile.merchant.id, ...)`. |

## 15. Transition + deprecation plan

### 15.1 Sequencing (within v1 PR)

1. Backend additive: new `FavouriteBranch` table + new routes + `enrichBranchTiles` flip + `selectedBranch.isFavourited` emit + `voucher.isFavourited` emit on getCustomerVoucher.
2. Backfill script run (deploy-time one-shot).
3. Customer-app cutover: new hooks + screen + 10 consumer call-site swaps + §O4 closure + Home rail invalidation fix.
4. Tab-bar entry in `(app)/_layout.tsx`.

### 15.2 Cleanup PR (NOT bundled with v1)

Filed as a follow-up after v1 stabilises. Scope:

- Drop `useFavourite` `'merchant'` discriminator (already unused after v1 cutover).
- Remove `favouritesApi.addMerchant` / `removeMerchant` from the customer-app client.
- Remove `merchant.isFavourited` field from the `/merchants/:id` wire shape + corresponding Zod schema field.
- Remove `addFavouriteMerchant` / `removeFavouriteMerchant` / `listFavouriteMerchants` service functions.
- Remove `POST/DELETE /api/v1/customer/favourites/merchants/:id` + `GET /api/v1/customer/favourites/merchants` routes.
- Drop `FavouriteMerchant` Prisma model + migration: `<YYYYMMDDHHMMSS>_drop_favourite_merchant` (Prisma auto-stamps).
- Drop associated tests.
- Drop the v1 backfill script (one-shot, no longer needed).

Cleanup PR sequencing: ship v1 → device-QA → stabilisation hotfix if needed → cleanup PR (matches the Profile rebaseline pattern).

### 15.3 Wire-shape invariants during transition

- `merchant.isFavourited` and `selectedBranch.isFavourited` and `branches[i].isFavourited` ALL emit simultaneously during v1.
- Customer-app consumes ONLY the new fields (`selectedBranch.isFavourited`, `branches[i].isFavourited`, `voucher.isFavourited`).
- `merchant.isFavourited` is kept live but unused by the customer-app — exists for forward-compat / rollback safety.
- Cleanup PR removes `merchant.isFavourited` once v1 has been stable on origin/main for a sensible review window.

## 16. Out of scope (do NOT include in v1 PR)

1. **Customer-web Favourites rebaseline** (§AS partial closure for customer-web side). Blocked on customer-web test infra (§BW). Separate workstream.
2. **Bespoke empty-state illustrations** — lightweight icon + copy in v1. Bespoke deferred to a future polish/illustration pass.
3. **NudgeBanner (free-user upsell on Favourites tab)** — deferred to v2.
4. **Distance-based sort on Places tab** — deferred to v2 (GPS dependency + backend complexity).
5. **Surgical `setQueryData` cross-surface invalidation** — eventual consistency is acceptable v1.
6. **Auto-cleanup of expired vouchers / suspended merchants** — manual user removal in v1; v2 backend nightly job if needed.
7. **Branch picker rows showing per-branch favourite state** — picker is a selector, not a favourites surface.
8. **"Follow merchant" / subscribe to all branches** — explicitly not a feature.
9. **`FavouriteMerchant` table + endpoints removal** — separate cleanup PR per §15.2.
10. **Push notifications on favourited place updates** (e.g. new voucher at a favourited place) — Phase 6 FCM territory.
11. **Sharing favourites** (share a Place / Voucher with another user) — not a feature.
12. **Favourites-driven personalisation in ranking** — out of scope; ranking improvements are a Discovery rebaseline track.
13. **Favourites tab badge on the bottom tab bar (count badge)** — deferred to v2; v1 ships unannotated tab icon.
14. **EAS build config updates** — not required by this rework.

## 17. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Schema migration breaks pre-launch data | Pre-launch low data volume. Backfill is idempotent + dry-run-able + skips anomalies. `FavouriteMerchant` stays in place during transition for rollback. |
| Backend / customer-app wire-shape drift mid-cutover | Strict additive contract: emit new fields alongside old ones. Customer-app cut over per consumer. Cleanup PR removes the old field only after v1 stabilises. |
| Cross-surface stale `isFavourited` after toggle | Documented eventual consistency model (§10). Favourites tab is source of truth. Discovery refreshes on focus / pull-to-refresh. |
| Reference-branch code reuse drift | Salvage ONLY presentational chrome (FavouritesEmptyState, FavouritesSkeleton, SwipeToRemove gesture, UndoToast, tab header). Data layer is new code. Strict ownership boundary in plan doc. |
| Home rail invalidation inconsistency reintroduced | Pin: `home-rail-favourite-invalidation.test.tsx` ensures BranchTile internally calls `useFavourite`. Regression pin against parent-callback pattern. |
| Voucher state machine on Favourites Vouchers diverges from Merchant Profile | Single source of truth: import `URGENT_THRESHOLD_MS` + `voucherCardPriority` + `<VoucherCardStatePill>` directly. Pin: `voucherFavouriteSort.test.ts` asserts identity of constants. |
| §O4 stub silently re-introduced (back to `Alert("Coming next milestone")`) | Pin: `voucher-detail-favourite.test.tsx` asserts the heart calls `useFavourite('voucher')`, not Alert. |
| Branch picker switch on Merchant Profile leaves heart state stale | Pin: `hero-favourite-branch-switch.test.tsx` asserts heart state re-evaluates on branch picker confirm. |
| Backfill runs in production without dry-run validation first | `--dry-run` flag mandatory in deploy runbook. Plan doc enforces the dry-run-first step. |
| `Branch.locationConfidence` redaction contract violated in `listFavouriteBranches` enrichment | Pin: backend test asserts POSTCODE_CENTROID branches don't expose lat/lng in favourites list payload (reuses existing redaction contract tests). |

## 18. Open follow-ups (deferred index entries to file)

When this spec moves to plan + implementation, the following deferred-followups entries should be added/updated:

| ID | Status | Description |
|---|---|---|
| §CI | **CLOSES on v1 merge** | Branch-level search-card heart |
| §O4 | **CLOSES on v1 merge** | Voucher Detail heart wiring |
| §AS (customer-app side) | **CLOSES on v1 merge** | Customer-app favourites identity vocabulary |
| §AS (customer-web side) | remains OPEN | Customer-web Favourites — separate workstream blocked on §BW |
| Cleanup PR (FavouriteMerchant removal) | NEW entry | Tier 1 / small Tier 2, fileable after v1 stabilises |

## 19. Cross-references

- `~/.claude/projects/.../memory/project_favourites_scope_branch_level.md` — locked product principle.
- `~/.claude/projects/.../memory/project_branch_first_class_platform_rules.md` — parent principle.
- `~/.claude/projects/.../memory/project_deferred_followups_index.md` §CI (search-card heart), §O4 (Voucher Detail heart), §AS (favourites identity sweep).
- `~/.claude/projects/.../memory/feedback_time_limited_urgent_threshold_locked.md` — 60min urgent lock.
- `~/.claude/projects/.../memory/project_reusable_voucher_v1_complete.md` — REUSABLE cooldown semantics consumed by the Vouchers tab.
- `~/.claude/projects/.../memory/project_location_confidence_redaction_contract.md` — branch position redaction (consumed by `listFavouriteBranches` enrichment).
- `docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md` — Spec Rev-2 decision #13 (BranchTile.isFavourited forward-compatible wire shape).
- Reference branch `feature/customer-app` — presentational chrome reference ONLY; data layer rejected.

## 20. What this spec locks vs leaves to the plan

**Locked here (spec authority):**

- Product principles (branch-level + voucher-level + removal semantics + eventual consistency).
- Heart entry points table + per-surface cache contract.
- Voucher state machine + 9-state matrix.
- Sort logic (Places + Vouchers).
- Backend schema (FavouriteBranch table shape, indexes, constraints).
- Backend route shapes + error codes.
- Wire-shape additive transition (`selectedBranch.isFavourited`, `branches[i].isFavourited`, `voucher.isFavourited` all new; `merchant.isFavourited` kept additive).
- Backfill strategy (main-branch only, idempotent, dry-run-able).
- Customer-app hook discriminator extension contract.
- Tab-bar order.
- Empty state + skeleton + undo + motion contracts.
- Test regression pin matrix (file paths + coverage scope).
- Transition + cleanup PR scoping.
- Out-of-scope list.

**Left to the plan (implementation-detail authority):**

- Task-by-task breakdown (Prisma migration step, backend route file, service function, customer-app screen file, test file, etc.).
- File ownership boundaries (which paths the implementer subagent owns).
- Milestone structure (recommend M1 backend + backfill, M2 customer-app surface, mirroring the Savings PR-A / PR-B split).
- Per-task regression pin authoring (the test names + setup).
- Order of subagent dispatches.
- Code review subagent dispatch points.
- Pre-merge sweep gates (focused + full).
- Owner-approved scope expansions (if any surface during implementation).

---

**Status:** Locked. Awaiting plan doc + implementation kick-off.
