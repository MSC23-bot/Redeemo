# Merchant Profile Rebaseline Plan (Phase 3C.1d → main)

> **Status:** APPROVED 2026-05-01. Owner decisions §9 locked. §13.2 Option A **VERIFIED** on-device 2026-05-01 (Qatar): Location Services denied → Search returns seeded UK merchants (Covelum / Brightlingsea) without GPS → tap-into-merchant becomes navigable as soon as M1 lands. **Ready for M1 implementation start.**
> **Side-band findings during verification:** Map pins empty even at UK-wide zoom (pre-existing — likely tied to plan §8.2 "no lat/lng on tile contract"). Home feed empty by default (pre-existing — featured/trending/campaigns not seeded). Both are out of scope for this PR; queued as Tier 1 follow-ups.
> **For agentic workers:** when M1 starts, use `superpowers:subagent-driven-development` (or `superpowers:executing-plans`) — checkbox-driven task breakdown is in §6.

**Goal:** Rebaseline the Merchant Profile surface (`/(app)/merchant/[id]`) onto `main` against the unified Plan 1.5 + PR A + PR B + PR C discovery contracts. Same shape as PR C (Map rebaseline): salvage presentational components from `feature/customer-app` (= cefaf45), rebuild data layer + hooks, add tests, ship one PR.

**Why this surface next:** It is the single load-bearing gap blocking the on-device user journey today. Tap any merchant card from Home / Search / Category / Map → 404. With Merchant Profile in place, the conversion path opens up to the next surface (Voucher Detail).

**Source branch (reference only — DO NOT MERGE):** `origin/feature/customer-app` @ `cefaf45`.
**Target branch (new):** `feature/customer-app-merchant-profile`, off `main` at the merge commit of PR #20.

---

## 1. What exists on `feature/customer-app` (source for salvage)

### 1.1 Screen + components (under `apps/customer-app/src/features/merchant/`)

| File | Purpose | Salvage verdict |
|---|---|---|
| `screens/MerchantProfileScreen.tsx` | Composes hero + meta + sticky tab bar + the four tabs + sheets + free-user gate | **Heavy rewrite** — wires data hooks (3 of them), and that wiring is what changes most against current contracts |
| `components/HeroSection.tsx` | Banner image + logo + featured/trending badges + favourite toggle | **Salvage** — presentational, depends only on field shape |
| `components/MetaSection.tsx` | Name, category descriptor, rating, distance, open status, action buttons | **Salvage with audit** — must read `descriptor` (Plan 1.5) not the legacy `category.name` shape |
| `components/RatingPill.tsx` | Tiny rating number + star pill | **Salvage** — presentational |
| `components/TabBar.tsx` | Sticky horizontal tab bar (Vouchers / About / Branches / Reviews) | **Salvage** — presentational |
| `components/VouchersTab.tsx`, `VoucherCard.tsx`, `VoucherCardStub.tsx` | Voucher list with redeemed-last sort | **Salvage with audit** — depends on subscription gate decision |
| `components/AboutTab.tsx`, `AboutCard.tsx`, `PhotosCard.tsx`, `OpeningHoursCard.tsx`, `AmenitiesCard.tsx` | About-tab cards | **Salvage** — all presentational |
| `components/BranchesTab.tsx`, `BranchCard.tsx` | Branch list with nearest-first sort, pulsing status dot | **Salvage** — presentational |
| `components/ReviewsTab.tsx`, `ReviewCard.tsx`, `ReviewSummary.tsx`, `ReviewSortControl.tsx` | Reviews tab | **Salvage** — presentational |
| `components/WriteReviewSheet.tsx` | Bottom-sheet for writing a review | **Salvage** — wires the write-review mutation hook |
| `components/ContactSheet.tsx`, `DirectionsSheet.tsx` | Action-sheets for contact + directions | **Salvage** — presentational |
| `components/FreeUserGateModal.tsx` | Modal shown to free users tapping a redeem CTA | **Salvage with audit** — wires `useSubscription` |

### 1.2 Hooks (under `apps/customer-app/src/features/merchant/hooks/`)

| File | Purpose | Salvage verdict |
|---|---|---|
| `useMerchantProfile.ts` | React Query wrapper for `GET /merchants/:id` | **Rewrite** — endpoint exists on main, but client method needs adding to a NEW `lib/api/merchant.ts` |
| `useMerchantReviews.ts` | React Query wrapper for review list + summary | **Rewrite** — same reason |
| `useOpenStatus.ts` | Computes "open now" from openingHours array | **Salvage** — pure UI helper |
| `useWriteReview.ts` | React Query mutation for `POST /branches/:branchId/reviews` | **Rewrite** — client method needs adding |

### 1.3 Route file

- `apps/customer-app/app/(app)/merchant/[id].tsx` — re-exports MerchantProfileScreen. Salvage as-is.

### 1.4 Tests

`feature/customer-app` has merchant component tests under `tests/features/merchant/` — inventory pending until implementation phase. Likely reshape required for Plan-1.5 tile schema (`makeMerchantTile()` builder), same pattern PR C did for Map tests.

---

## 2. What's on `main` already (foundations to build on)

### 2.1 Backend (already shipped, do NOT change)

- ✅ `GET /api/v1/customer/merchants/:id` — full merchant profile with branches, vouchers, reviews summary, opening hours, amenities, descriptor, highlights, distance, isFavourited (`src/api/customer/discovery/service.ts:504-686`). Returns the post-Plan-1.5 shape: `descriptor`, `highlights[]` (filtered by RedundantHighlight), `subcategory`, `nearestBranch.distance`.
- ✅ `GET /api/v1/customer/merchants/:id/branches` — branch list for the redemption flow (`service.ts:690+`).
- ✅ `GET /api/v1/customer/merchants/:id/reviews` + `?summary` (`src/api/customer/reviews/routes.ts:31-47`).
- ✅ `POST /api/v1/customer/branches/:branchId/reviews` — write review (auth required).
- ✅ `POST /api/v1/customer/favourites/merchants/:merchantId` + `DELETE` — favourite toggle (auth required) (`src/api/customer/favourites/routes.ts:18-30`).
- ✅ `GET /api/v1/subscription/me` — already wired into the `useSubscription` hook on main (PR B / earlier).

### 2.2 Customer app (already shipped)

- ✅ `apps/customer-app/src/lib/api/discovery.ts` — list endpoints + categories + in-area + eligible amenities (PR B + PR C). Does NOT include single-merchant calls.
- ✅ `apps/customer-app/src/lib/api/profile.ts` — for the user profile.
- ✅ `apps/customer-app/src/lib/api/subscription.ts` + `useSubscription` hook.
- ✅ `apps/customer-app/tests/fixtures/merchantTile.ts` — `makeMerchantTile()` builder for tile-shape fixtures.
- ✅ `apps/customer-app/src/design-system/icons.ts` re-export barrel.
- ✅ `react-native-worklets@0.5.1` peer dep (PR #21, in flight).
- ✅ Map tab visible in (app) layout (PR #22, in flight).

### 2.3 Customer app — explicitly NOT on main (must be created in this PR)

- 🔴 `apps/customer-app/src/lib/api/merchant.ts` — NEW. Client methods + Zod schemas for `/customer/merchants/:id` + `/customer/merchants/:id/branches`.
- 🔴 `apps/customer-app/src/lib/api/reviews.ts` — NEW. Client methods + Zod schemas for review list / summary / write / report / helpful.
- 🔴 `apps/customer-app/src/lib/api/favourites.ts` — NEW (limited scope for this PR — only the merchant-favourite toggle methods needed by HeroSection. Voucher-favourite methods live with the Voucher rebaseline.)

---

## 3. Required API contract — what the client must consume

### 3.1 `GET /customer/merchants/:id` response (current backend shape)

```ts
// Client Zod schema must accept this shape verbatim:
{
  id: string,
  businessName: string,
  tradingName: string | null,
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
  logoUrl: string | null,
  bannerUrl: string | null,
  description: string | null,
  websiteUrl: string | null,
  primaryCategoryId: string | null,
  primaryCategory: { id, name, pinColour, pinIcon, descriptorSuffix, parentId } | null,
  primaryDescriptorTag: { id, label } | null,
  highlights: [{ id, highlightTagId, sortOrder, tag: { id, label } }],   // pre-filtered by backend; ≤ 3
  categories: [{ category: { id, name, parentId } }],
  vouchers: [{ id, title, type, description, terms, imageUrl, estimatedSaving: number, expiryDate: string | null }],
  branches: [{ id, name, isMainBranch, addressLine1, addressLine2, city, postcode, latitude: number | null, longitude: number | null, phone, email, distance: number | null, isOpenNow: boolean, avgRating: number | null, reviewCount: number, openingHours, amenities, photos }],
  about: string | null,
  subcategory: { id, name } | null,
  descriptor: string | null,
  avgRating: number | null,
  reviewCount: number,
  isFavourited: boolean,
  distance: number | null,
  nearestBranch: { id, name, addressLine1, addressLine2, city, postcode, latitude, longitude, phone, email, distance, isOpenNow } | null,
  isOpenNow: boolean,
  openingHours: [{ dayOfWeek, openTime, closeTime, isClosed }],
  amenities: [{ id, name, iconUrl }],
  photos: string[],
}
```

Two key contract differences vs the pre-Plan-1.5 client (which is what `feature/customer-app` was wired against):
- `descriptor` is a server-computed string ("Indian Restaurant", "Reformer Pilates Studio", or null). The legacy client computed this client-side from `primaryCategory.name`. **Client must read `descriptor` directly.**
- `highlights` are pre-filtered by RedundantHighlight rules (subcategory-aware). The legacy client may have done its own filtering. **Client must trust the server's filtered list.**

### 3.2 Reviews response shapes (already-existing backend)

- `GET /customer/merchants/:id/reviews?branchId=&sort=&page=&limit=` → `{ reviews: [...], total, page, limit }`
- `GET /customer/merchants/:id/reviews/summary` → `{ avgRating, reviewCount, ratingDistribution: { 1..5: number } }`
- `POST /customer/branches/:branchId/reviews` → `{ rating, title, body }` (auth required)

Schema details to be lifted from `src/api/customer/reviews/service.ts` during implementation.

### 3.3 Favourites toggle

- `POST /customer/favourites/merchants/:merchantId` (auth) → `{ id, userId, merchantId }`
- `DELETE /customer/favourites/merchants/:merchantId` (auth) → `{ ok: true }`

---

## 4. File structure (target on `main` after this PR)

```
apps/customer-app/
├── app/(app)/merchant/
│   └── [id].tsx                                     SALVAGE (re-export only)
├── src/
│   ├── features/merchant/
│   │   ├── components/
│   │   │   ├── AboutCard.tsx                        SALVAGE
│   │   │   ├── AboutTab.tsx                         SALVAGE
│   │   │   ├── AmenitiesCard.tsx                    SALVAGE
│   │   │   ├── BranchCard.tsx                       SALVAGE
│   │   │   ├── BranchesTab.tsx                      SALVAGE
│   │   │   ├── ContactSheet.tsx                     SALVAGE
│   │   │   ├── DirectionsSheet.tsx                  SALVAGE
│   │   │   ├── FreeUserGateModal.tsx                SALVAGE + audit
│   │   │   ├── HeroSection.tsx                      SALVAGE
│   │   │   ├── MetaSection.tsx                      SALVAGE + audit (read `descriptor`)
│   │   │   ├── OpeningHoursCard.tsx                 SALVAGE
│   │   │   ├── PhotosCard.tsx                       SALVAGE
│   │   │   ├── RatingPill.tsx                       SALVAGE
│   │   │   ├── ReviewCard.tsx                       SALVAGE
│   │   │   ├── ReviewSortControl.tsx                SALVAGE
│   │   │   ├── ReviewSummary.tsx                    SALVAGE
│   │   │   ├── ReviewsTab.tsx                       SALVAGE
│   │   │   ├── TabBar.tsx                           SALVAGE
│   │   │   ├── VoucherCard.tsx                      SALVAGE + audit (subscription gate)
│   │   │   ├── VoucherCardStub.tsx                  SALVAGE
│   │   │   ├── VouchersTab.tsx                      SALVAGE + audit
│   │   │   └── WriteReviewSheet.tsx                 SALVAGE
│   │   ├── hooks/
│   │   │   ├── useMerchantProfile.ts                REWRITE (uses new merchantApi)
│   │   │   ├── useMerchantReviews.ts                REWRITE (uses new reviewsApi)
│   │   │   ├── useOpenStatus.ts                     SALVAGE
│   │   │   └── useWriteReview.ts                    REWRITE (uses new reviewsApi)
│   │   └── screens/
│   │       └── MerchantProfileScreen.tsx            REWRITE (rewires data + state)
│   └── lib/api/
│       ├── merchant.ts                              NEW
│       ├── reviews.ts                               NEW
│       └── favourites.ts                            NEW (merchant-favourite scope only)
└── tests/features/merchant/                          REBUILD (Plan-1.5 fixtures)
```

---

## 5. State partitioning (mirror PR C's pattern)

`MerchantProfileScreen.tsx` should partition state into clearly-labelled buckets, same shape PR C used for Map. Recommended:

1. **Profile data state**: `useMerchantProfile(id, { lat, lng })` → drives hero/meta/about/branches/vouchers content.
2. **Reviews data state**: `useMerchantReviews(id, { branchId, sort, page })` + `useReviewsSummary(id)` → reviews tab.
3. **UI state**: active tab (Vouchers / About / Branches / Reviews), open sheets (Contact / Directions / WriteReview), gate modal visibility.
4. **Favourite toggle state**: optimistic-update pattern via React Query mutation against `useFavouriteToggle`.
5. **Subscription state**: `useSubscription()` (already on main) → drives FreeUserGateModal + voucher CTA.

---

## 6. Milestone breakdown (3 milestones, mirrors PR C)

### M1 — Data layer + screen skeleton
- [ ] Create `apps/customer-app/src/lib/api/merchant.ts` with `merchantApi.getMerchant(id, opts)` + Zod schema
- [ ] Create `apps/customer-app/src/lib/api/reviews.ts` with list / summary / write methods + schemas
- [ ] Create `apps/customer-app/src/lib/api/favourites.ts` with merchant add / remove (scope: ONLY merchant favourite, not voucher; voucher rebaseline owns the rest)
- [ ] Salvage 18 presentational components via `git checkout cefaf45 -- <path>` (the SALVAGE rows in §4)
- [ ] Rewrite `useMerchantProfile`, `useMerchantReviews`, `useWriteReview` against new clients
- [ ] Salvage `useOpenStatus`
- [ ] Rewrite `MerchantProfileScreen.tsx` skeleton: data fetching, error/loading states, hero + sticky tabs scaffold (no full UI integration yet)
- [ ] Wire route file `app/(app)/merchant/[id].tsx`
- [ ] Audit `MetaSection.tsx`, `VouchersTab.tsx`, `VoucherCard.tsx`, `FreeUserGateModal.tsx` for Plan 1.5 contract reads
- [ ] `tsc` + targeted Map / Search / Category tests still pass (regression check)

### M2 — Tab content + sheets + gating
- [ ] Wire VouchersTab + VoucherCard with subscription gate (`useSubscription` on main)
- [ ] Wire AboutTab cards (About / Photos / OpeningHours / Amenities)
- [ ] Wire BranchesTab with distance sort + isOpenNow indicators
- [ ] Wire ReviewsTab with summary header, sort control, infinite scroll
- [ ] Wire WriteReviewSheet mutation (auth-gated; sign-in prompt if unauth)
- [ ] Wire ContactSheet, DirectionsSheet
- [ ] Wire HeroSection favourite toggle (optimistic + rollback)
- [ ] Wire FreeUserGateModal triggered on free-user redeem CTA
- [ ] On-device manual smoke check via Map tab: tap a merchant pin (or Home merchant card after Home rebaseline lands)

### M3 — Tests + integration
- [ ] Add `tests/features/merchant/MerchantProfileScreen.test.tsx` covering: loading state, error state, all four tabs render, favourite toggle optimistic + rollback, free-user gate modal trigger, subscription-aware redeem CTA, distance sort on Branches, review write flow (mock mutation)
- [ ] Add `tests/features/merchant/HeroSection.test.tsx`, `MetaSection.test.tsx`, `VouchersTab.test.tsx` for tightly-coupled presentational logic
- [ ] Reshape salvaged tests (if any) to current Plan-1.5 fixture builder
- [ ] Targeted suite passing (≥ X/X)
- [ ] Full customer-app suite passing (no new failures vs main baseline)
- [ ] PR description follows PR C's structure: scope, tests, locked-baseline impact, known follow-ups

---

## 7. Dependencies on PR B / PR C / chore PRs

- **PR B (#19, merged):** discovery API client + `useCategories`, `useHomeFeed` hooks. NOT directly consumed by Merchant Profile screen, but its `MerchantTile` Zod schema in `discovery.ts` defines the *list* shape — the *single-merchant* shape in this PR's new `merchant.ts` is a SUPERSET (all the tile fields + branches[] + vouchers[] + photos[] + opening hours + amenities + reviews summary).
- **PR C (#20, merged):** Map screen. Its `MapMerchantTile` swipeable card taps through to `/merchant/[id]` — currently 404. This PR makes that route exist.
- **PR #21 (chore react-native-worklets, in flight):** required for any further dev-build to bundle. Not a hard dependency for this PR's code but a hard dependency for any on-device verification. Should land first.
- **PR #22 (Map tab visible, in flight):** independent. Adds the Map tab. Doesn't gate Merchant Profile but improves the QA loop.

**Recommendation:** wait until PRs #21 + #22 are merged before starting M1, so the on-device QA loop is intact when M2 lands.

---

## 8. Risks / known mismatches / things to watch

### 8.1 🟧 Plan 1.5 contract drift in salvaged components

`feature/customer-app`'s `MetaSection.tsx`, `VouchersTab.tsx`, `VoucherCard.tsx`, `FreeUserGateModal.tsx` were written against a pre-Plan-1.5 `Merchant` shape that:
- Computed `descriptor` client-side from `primaryCategory.name`.
- Did its own redundancy filtering on highlights.
- Used `category.name` directly rather than `descriptor`.

The Plan-1.5 server-side shape is authoritative. Audit each file and replace any client-side derivation of these fields with direct reads. **Visual compatibility is the test:** post-rebaseline screen should look the same as `feature/customer-app`'s, just powered by server-computed fields.

### 8.2 🟨 No lat/lng on tile contract → distance is null on most discovery surfaces

The Merchant Profile API DOES compute `distance` server-side (uses `branches[].latitude/longitude`). So distance works on this surface even though it doesn't on tile lists. **Watch out for:** Branches tab nearest-first sort, which reads `branches[i].distance`. Works as long as the user has granted location permission. If location unknown, all distances are null and the sort falls back to `isMainBranch desc` (existing service-layer behaviour).

### 8.3 🟨 Subscription gate UX

Locked rule (CLAUDE.md §"Key Business Rules"): "Subscription gates redemption. Free tier can browse and view vouchers but cannot redeem." Currently on main, no client surface enforces this. This PR introduces the FIRST client surface that gates on subscription. Owner decision required:
- Where exactly does the gate fire? (Tap "Redeem" on a voucher card → modal? Or grey out the CTA entirely for free users?)
- What does the modal say? (`feature/customer-app`'s FreeUserGateModal already has copy — check whether locked-spec deviates.)
- Does tapping "Subscribe" from the modal route to the locked subscription-prompt placeholder, or to the (deferred) real purchase flow?

### 8.4 🟨 Review write flow auth gating

`POST /customer/branches/:branchId/reviews` requires auth. WriteReviewSheet on `feature/customer-app` may assume the user is always authenticated — which is true on main once they've finished onboarding (per `resolveRedirect`). But the redirect rules MAY have edge cases (e.g., user with `onboardingCompletedAt = null` shouldn't reach merchant profile). Verify that this PR's screen does not break when `useAuthStore.user` is null.

### 8.5 🟨 Review submission cooldown / validation

Server-side rules (server `service.ts` for reviews) enforce: only one review per user per branch, edit window, content limits. Client should surface clear errors for these. Audit `WriteReviewSheet`'s error mapping.

### 8.6 🟨 `MerchantTile` vs `Merchant` shape mismatch in tests

PR C's tests use `makeMerchantTile()` for tile-shape fixtures. This PR needs a similar `makeMerchant()` builder for the full single-merchant shape. Do NOT try to use `makeMerchantTile()` — fields differ.

### 8.7 🟦 Photos contract

The current backend serialises photos as `string[]` (just URLs, flattened across branches). Salvaged PhotosCard.tsx may expect a richer `[{ url, sortOrder }]` shape. Audit + adjust.

### 8.8 🟦 Open-hours formatting

`useOpenStatus.ts` reads `openingHours: [{ dayOfWeek, openTime, closeTime, isClosed }]`. Backend sends times as `HH:MM:SS` strings (Postgres `TIME` columns). Confirm the salvaged hook parses this format correctly.

### 8.9 🟦 No breaking change to backend contract

This PR is **client-only**. No backend changes. If during implementation we discover a missing field, that's a separate backend PR — do NOT bundle.

### 8.10 🟧 QA from a non-UK location (owner currently in Qatar)

`useUserLocation` (`apps/customer-app/src/hooks/useLocation.ts`) reads device GPS and passes `lat`/`lng` to discovery queries. From Qatar coordinates, no seeded UK merchants are reachable — Merchant Profile QA would be impossible. **See §13 for the QA location strategy.** The recommendation (verify-existing-mechanism-first) is zero-cost for production but needs verification before M1 starts.

---

## 9. Owner decisions — LOCKED 2026-05-01

1. **Subscription gate UX (8.3):** ✅ Free users can browse the merchant page and view voucher cards normally. Gate is on **redemption only** — when a free user taps a voucher's redeem CTA, show a clear modal/CTA prompting subscription. Do NOT block merchant browsing or voucher-detail viewing.
2. **Voucher tap behaviour:** ✅ Merchant Profile voucher card → tap → opens **Voucher Detail screen first**. PIN-entry / redemption flow lives in Voucher Detail, NOT directly from the Merchant Profile voucher card. Voucher Detail rebaseline is a separate next-next PR; for this PR, the voucher card just navigates with the right voucher ID.
3. **Map tab visibility:** ✅ Confirmed visible. Tap-merchant-pin → Merchant Profile becomes the M2 on-device test loop.
4. **Reviews:** ✅ Free users can **read** reviews. **Writing reviews is deferred** unless the salvaged WriteReviewSheet is already cleanly wired against existing backend endpoints (Phase 3B / current main). Do NOT expand scope to build review submission if it requires new backend or hook work — strip the write-review CTA in that case and document as a Tier 1 follow-up.
5. **Distance unit:** ✅ **Miles** for UK users. Match existing discovery UI conventions on Home / Map / Search (use the same formatter). Do not introduce per-screen variants.
6. **QA location strategy (§13):** ✅ **Option A first** (deny GPS, profile-city fallback). Pause and propose **Option B** (dev-only `EXPO_PUBLIC_DEV_LOCATION_OVERRIDE` gated by `__DEV__`, no production impact) only if Option A fails. Plan 4 location model NOT in scope.

---

## 10. Constraints (locked — DO NOT expand)

- ❌ No backend changes.
- ❌ No location-model work (Plan 4 deferred).
- ❌ No voucher detail / redemption work (separate next PR).
- ❌ No favourites tab / savings tab / profile tab work (separate later PRs).
- ❌ No Mapbox migration.
- ❌ No `feature/customer-app` merge.
- ❌ Salvage via `git checkout cefaf45 -- <path>` only — never cherry-pick commits.

---

## 11. Open scope question — split or single PR?

Single PR (M1 + M2 + M3 in one branch) mirrors PR C's pattern and is the recommended default. Estimated 22 files (1 route + 21 components/hooks/screens) + 3 new lib/api modules + tests + plan-doc updates. ~1500–2000 net lines.

If the diff exceeds 2500 lines or M2's gating UX prompts owner re-design, consider splitting into:
- `feature/customer-app-merchant-profile-data` (M1 — clients + hooks + skeleton)
- `feature/customer-app-merchant-profile-ui` (M2 + M3 — wiring + tests)

Default: single PR. Re-evaluate after M1 lands.

---

## 12. Self-review checklist (run before opening PR)

- [ ] Every salvaged file's imports point to current paths on main (no stale `@/lib/...` references)
- [ ] Every component reads `descriptor`, `highlights[]`, `subcategory` from server-computed fields, not derived client-side
- [ ] Every API call is wrapped in a Zod-validated client method (no raw `api.get<unknown>` at the screen level)
- [ ] `useSubscription()` is consumed exactly once at the screen level, passed down via prop or context — not re-imported in each tab
- [ ] No `any` types leak through to the screen body — every API response narrowed at the client edge
- [ ] Tests exercise: loading, error, all 4 tab switches, favourite-toggle optimistic + rollback, free-user gate trigger, subscribed-user no-gate, write-review happy + error path, distance-aware branches sort, distance-null fallback
- [ ] PR description structured like PR C: scope / tests / locked-baseline impact / known follow-ups / explicit non-scope
- [ ] No `feature/customer-app` commit hashes are in the new branch's git log (pure salvage via checkout-paths)
- [ ] §13 Option A verified working on-device from Qatar (or §13 Option B implemented if A is insufficient)
- [ ] On-device QA pass run from Qatar (UK merchants visible on Home / Map / Search / Merchant Profile)

---

## 13. QA location strategy (testing UK merchants from non-UK locations)

### 13.1 Context

Owner is currently QA-testing from Qatar; Redeemo is UK-only. Live location resolution lives in `useUserLocation` (`apps/customer-app/src/hooks/useLocation.ts:17`) — on app start, if location permission was previously granted, it auto-fetches GPS coords and reverse-geocodes into `{ lat, lng, area, city }`. Those coords are then passed to discovery queries on Home, Search, Map (and will be passed to Merchant Profile distance computation in this rebaseline).

From Qatar coords, the backend discovery queries return nothing useful — seeded merchants are all UK-located. Merchant Profile QA requires the app to think the user is in the UK.

### 13.2 Existing mechanism — verify before adding code

The current location resolution **already has a graceful no-permission path**: if the user denies / hasn't granted location permission, `location` stays `null`, and discovery queries are made without `lat`/`lng`. Per memory `project_post_plan1_direction.md` the documented backend fallback is:

> GPS → profile city → platform-wide

If denying location permission falls through cleanly to "use profile city" (or "show platform-wide UK merchants when profile city is set to a UK postcode"), that's the QA path with **zero code change**.

The seeded test user `customer@redeemo.com` already has a UK postcode set during onboarding. After today's QA we know HD1 4RU (Huddersfield) and CO7 0UB (Brightlingsea) both round-trip correctly through PC2. So the user-side state is already QA-ready.

**Verification step (pre-M1, ~10 minutes on device):**
1. iOS Settings → Privacy & Security → Location Services → Redeemo → set to **Never**
2. Force-quit the Redeemo dev build, reopen
3. Log in as `customer@redeemo.com`
4. Check Home / Map / Search → confirm UK merchants render
5. If yes → Option A is the QA strategy, no code work needed
6. If no (e.g. backend doesn't gracefully fall back to profile city without coords; or app shows an empty state) → escalate to Option B

### 13.3 Options assessed

| # | Option | What it does | Cost | Verdict |
|---|---|---|---|---|
| **A** | **Existing mechanism — deny GPS permission** | iOS Settings → Location Services → Redeemo → Never. App's existing no-coords code path used. Backend serves profile-city / platform-wide UK results. | **Zero code change** | **Recommended** if §13.2 verification passes |
| **B** | **Dev-only env override** | New `EXPO_PUBLIC_DEV_LOCATION_OVERRIDE="lat,lng"` env var. `useUserLocation` reads it inside `if (__DEV__)` guard and uses those coords instead of GPS. Production builds (`__DEV__ === false`) ignore it entirely. Documented in `.env.example`. | ~10 lines in `useLocation.ts`, no production impact, no new dependencies | **Fallback** if A doesn't give clean control |
| **C** | **Debug city-picker UI** | Hidden debug menu (long-press app version, etc.) with city-picker UI. State persisted to AsyncStorage. | ~80 lines, dev-only | **Skip for now** — bigger than necessary |
| **D** | **Backend / profile location override** | Server-side flag that ignores client coords for specific users (e.g. `@redeemo.com` test emails). | Backend changes — out of scope per §10 constraints | **Skip** — touches Tier 3 territory |
| **E** | **Seeded test user with UK location** | Already exists. `customer@redeemo.com` is seeded with `SW1A 1AA` (London) and PC2 lets the user override to any UK postcode (HD1 4RU, CO7 0UB, etc.). | Already done | **Required for both A and B** — supplements, doesn't replace |

### 13.4 Recommendation

1. **Pre-M1:** verify Option A works on the current main build (per §13.2 verification step). This is a 10-minute on-device check, no code commit.
2. **If A works:** done. Document the QA setup ("set Location Services to Never, log in as `customer@redeemo.com`") in the PR description's test plan. No changes to `useLocation.ts`.
3. **If A doesn't work:** implement Option B inside M1 as a tiny bounded addition (~10 lines, dev-only path). Add to `.env.example` so other devs / future QA passes can use it.
4. **Skip Options C and D unless A and B both fall short.** Both add scope this Tier 2 doesn't need.

### 13.5 QA test data — what to use from Qatar

Seed already includes UK merchants outside London (PR #23 `chore/non-london-seed-merchants` merged 2026-05-01):
- **Covelum** — Brightlingsea, CO7 0UB
- **My Kerala** — Ipswich

Plus pre-existing seed merchants in London / Birmingham / Manchester. Sufficient diversity for Merchant Profile QA from Qatar (different cities, different category mixes, both has-branches and single-branch merchants).

### 13.6 Constraints

- ❌ **No production behaviour change.** Whatever path is chosen must NOT alter what real UK users on real iPhones experience.
- ❌ **No backend changes** for QA support (per §10).
- ❌ **No location-model work** (Plan 4 deferred per memory `project_discovery_sequencing_plan4.md`).
- ✅ **Reversible.** Whatever QA path is chosen, the owner must be able to flip back to "real GPS" by toggling iOS settings or removing the env var — no permanent state baked into the user/app.
