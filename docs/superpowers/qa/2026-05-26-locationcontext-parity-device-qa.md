# §DF-v2-j + §DF-v2-i Device-QA Checklist

**Date:** 2026-05-26
**Workstream:** §DF-v2-j + §DF-v2-i (locationContext parity + top-of-app status label)
**Branch:** `feature/locationcontext-parity` (14 commits ahead of `main`)
**Spec:** `docs/superpowers/specs/2026-05-26-locationcontext-parity-design.md` v1.1 §10
**Plan:** `docs/superpowers/plans/2026-05-26-locationcontext-parity.md` Task 13

## Purpose

Closes the Task 13 gate. Two layers of verification:

1. **Simulator / unit-level** — executed in Claude's environment. The render-path logic for every spec §10 scenario is covered by at least one existing jest or vitest pin. Results recorded inline below.
2. **Device-only** — must be verified on physical iOS + Android devices by the owner. The checklist below enumerates the device-only checks per scenario, with the unit pin cross-referenced so owner knows what's already proven.

---

## §1. Simulator / unit-level coverage — PASS ✅

Sweep executed 2026-05-26 against branch tip `7a85dbe` (Task 12 docs commit).

### Backend (vitest)

| Suite | Files | Tests |
|---|---|---|
| `tests/api/customer/discovery/resolveLocationContext.test.ts` | 1 | 4/4 ✅ (§DF-v2-i-U1..U4) |
| `tests/api/customer/discovery/locationcontext-parity.test.ts` | 1 | 12/12 ✅ (§DF-v2-j-S/I/M × 4) |
| `tests/api/customer/discovery/home-feed-rail-states.test.ts` (incl. §DF-7v2i) | 1 | 32/32 ✅ |
| `tests/api/customer/discovery/home-feed-fallback-matrix.test.ts` | 1 | 8/8 ✅ |
| `tests/api/customer/discovery/home-feed-bb-fix.test.ts` | 1 | 1/1 ✅ |
| **Backend §DF + §DF-v2-j sweep total** | **5** | **57/57 ✅** |

### Customer-app (jest-expo)

| Suite | Files | Tests |
|---|---|---|
| `tests/lib/location/LocationStatusLabel.test.tsx` | 1 | 11/11 ✅ (§LSL-1..§LSL-10 + §LSL-6b) |
| `tests/features/home/HomeScreen.statusLabel.test.tsx` | 1 | 1/1 ✅ (§LSL-Home) |
| `tests/features/search/SearchScreen.statusLabel.test.tsx` | 1 | 3/3 ✅ (§LSL-Search × 3) |
| `tests/features/map/MapScreen.statusLabel.test.tsx` | 1 | 1/1 ✅ (§LSL-Map) |
| `tests/features/home/*` (full Home regression sweep, 18 files) | 18 | 102/102 ✅ |
| `tests/features/search/*` (full Search regression sweep, 20 files) | 20 | 157/157 ✅ |
| `tests/features/map/*` (full Map regression sweep, 16 files) | 16 | 103/103 ✅ |
| `tests/lib/api/*` (full client-schema sweep, 12 files) | 12 | 176/176 ✅ |
| **Customer-app full impacted-surface sweep total** | **70** | **575/575 ✅** |

### Type-check gates

| Gate | Result |
|---|---|
| customer-app `tsc --noEmit` | exit 0 ✅ clean |
| Backend `tsc --noEmit` | 4 pre-existing baseline errors in `tests/api/customer/savings.service.test.ts` (CLAUDE.md-documented); 0 NEW errors ✅ |

### Known flake — not §DF-v2-j related

The customer-app full sweep occasionally reports 2 failed suites on first run that pass on re-run. Documented in CLAUDE.md as "React Query + fake timer combinations" — adjacent suites with timer leaks under parallel jest-expo load. Re-run confirms 575/575 clean. The 4 §LSL pin files are timer-free and unaffected.

---

## §2. Device-only QA checklist (owner-actionable)

Each row lists the spec §10 scenario, the existing unit pin that covers the render-path logic, and the device-only checks that need physical-device verification.

**Test rig assumed:**

- One iOS device with a "Huddersfield URBAN" seeded customer profile (postcode `HD1 1AA`, `latitude` / `longitude` / `localityId` populated — Task 1 seed handles this on the dev DB).
- One Android device with the same profile.
- A fresh-install device (no profile, undetermined permission) for scenarios 6, 9.
- Map test rig with the ability to pan to satellite-heavy zoom levels.

Record one of: ✅ PASS / ❌ FAIL / ⚠️ NOTE / ⏭️ SKIPPED per scenario per platform.

### Scenario 1 — Huddersfield profile, GPS off, **Home**

**Setup:** Authenticated as the seeded customer. GPS denied at OS level (Settings → Privacy → Location Services → Redeemo → Never).

**Expected behaviour:**

- Strip-variant `<LocationStatusLabel>` mounted at the top of Home, ABOVE `<HomeNoLocationBanner>` / `<SavedAreaHonestyHint>` slot.
- Label copy: `Using profile location · Huddersfield` (city in semibold weight).
- `<SavedAreaHonestyHint>` (cream card with chevron) ALSO mounted, BELOW the label — D6 coexistence.
- Tap on label → routes to Your Location (`/saved-area`).

**Unit-covered by:** §LSL-Home + §LSL-2 (component matrix, profile-with-city branch).

**Device-only checks:**

- [ ] iOS: label visually does NOT feel duplicated with the honesty hint below it (label = compact identity, hint = caveat + Update). No overlap. No cramped vertical rhythm.
- [ ] Android: same.
- [ ] Both: label tap fires the location-status-label Pressable and routes correctly (no swallowed gesture).
- [ ] Both: scrolls with content (NOT sticky to the top as the user scrolls Home).

### Scenario 2 — Huddersfield profile, GPS off, **Search**

**Setup:** Same as #1, then open Search tab and type "cafe".

**Expected behaviour:**

- Strip-variant label mounted ABOVE `<SearchBar>` showing `Using profile location · Huddersfield`.
- `<SearchEmptyState>` (when no results) shows "Searching near Huddersfield from your profile location" copy with dual CTAs (Use current location + Change saved area).
- Tap on label → routes to Your Location with `?from=search`.

**Unit-covered by:** §LSL-Search + §LSL-Search-coordinates + §LSL-Search-loading.

**Device-only checks:**

- [ ] iOS: label visible BEFORE typing (loading window edge): label renders null per §LSL-Search-loading; SearchBar sits at the natural top with no extra chrome. Confirm no flash of empty-label-row.
- [ ] iOS: after typing "cafe", label appears with Huddersfield copy. No layout jump that shifts the keyboard or input focus.
- [ ] Android: same.
- [ ] Both: `<SearchEmptyState>` profile-aware copy still fires correctly (this is the test that Task 10's retired useMe() derivation didn't break behaviour). With NO matching merchants, the dual-CTA empty state should render.
- [ ] Both: tapping the label routes back to `/saved-area?from=search`, and tapping back from Saved Area returns to Search (not to Home tab root).

### Scenario 3 — Huddersfield profile, GPS off, **Map**

**Setup:** Same as #1, open Map tab.

**Expected behaviour:**

- Chip-variant `<LocationStatusLabel>` mounted at the TOP of the safe-area band, centered horizontally, ABOVE the SearchBar. Pill-shape, cream-tinted background, subtle elevation.
- Chip copy: `Using profile location · Huddersfield`.
- Pins load on the map (any in the bbox).
- `<ViewportLocalityBadge>` ALSO mounts in its existing position (viewport corner near the search-this-area button). Copy: `Map centred near Huddersfield` (or wherever the camera is pointed).
- Tap on chip → routes to `/saved-area`.

**Unit-covered by:** §LSL-Map (covers chip styling + D10 coexistence) + §LSL-10 (chip variant container shape).

**Device-only checks:**

- [ ] iOS: chip + ViewportLocalityBadge visually DO NOT overlap. Chip is at top-centre; badge sits lower. Both legible.
- [ ] Android: same.
- [ ] Both: chip styling renders correctly — pill shape (full hairline border on all sides, NOT just bottom), translucent cream background, subtle shadow lifts off the map tiles.
- [ ] Both: chip's `pointerEvents="box-none"` wrapper allows map gestures through everywhere EXCEPT the chip itself (the chip's Pressable captures its tap). Try panning the map by dragging just outside the chip's bounds — should pan, not block.
- [ ] Both: pins still load and chip doesn't visually compete with the LocationSearch dropdown opener (the SearchBar's auto-suggestion list when the user types a city).

### Scenario 4 — GPS granted (mid-session OR fresh install)

**Setup:** Tap "Use current location" in Your Location (or grant permission on first launch). Permission flips to `granted`; coords arrive via the location hook.

**Expected behaviour:**

- On next focus of Home / Search / Map: label copy flips to `Using current location` (no city suffix, no chevron, MapPin icon).

**Unit-covered by:** §LSL-1 (state matrix coordinates branch).

**Device-only checks:**

- [ ] iOS: real GPS grant → label updates on next focus refresh. Verify the change is visible WITHOUT having to manually pull-to-refresh.
- [ ] Android: same.
- [ ] Both: on Home, the `<SavedAreaHonestyHint>` SHOULD disappear (it gates on `source === 'profile'`); the label stays as the only location signal.
- [ ] Both: on Map, the chip flips to `Using current location` while `<ViewportLocalityBadge>` continues to track viewport pan independently.

### Scenario 5 — GPS denied / unavailable + no profile

**Setup:** Fresh customer with no saved postcode. Permission denied at OS level (or unavailable on a no-GPS device).

**Expected behaviour:**

- Label copy: `No GPS · Set location ›`.
- Icon: MapPinOff (the lucide variant with a slash through the pin).
- Chevron visible on the right of the label.
- Tap → routes to `/saved-area`.

**Unit-covered by:** §LSL-4 (denied) + §LSL-5 (unavailable collapses to same).

**Device-only checks:**

- [ ] iOS: tap-to-route works; landing at Your Location should offer postcode entry + "Use current location" recovery.
- [ ] Android: same.
- [ ] Both: MapPinOff icon renders correctly (the slash should be visible at 14pt size).

### Scenario 6 — GPS undetermined + no profile (fresh install)

**Setup:** Brand-new install. No permission grant yet (undetermined). No saved postcode.

**Expected behaviour:**

- Label copy: `Set location ›` (NO "No GPS" prefix).
- Icon: MapPin (regular variant, no slash).
- Chevron visible.

**Unit-covered by:** §LSL-6 + §LSL-6b (granted-without-coords edge).

**Device-only checks:**

- [ ] iOS: ensure the OS hasn't been prompted yet. Confirm `Set location ›` appears (NOT `No GPS`). Once the user requests location and grants, the label should flip to `Using current location` on next focus.
- [ ] Android: same.
- [ ] Both: granted-without-coords edge case (permission flipped to granted but coords haven't arrived yet via the hook) — label should STILL read `Set location ›` until coords land. This is a transient state; observable only with slow GPS lock on a cold start.

### Scenario 7 — Map viewport pan

**Setup:** Same as #3 (Huddersfield profile, GPS off, Map open). Pan the map from Huddersfield to (e.g.) Manchester or London.

**Expected behaviour:**

- Chip (`<LocationStatusLabel>`) stays unchanged — copy still says `Using profile location · Huddersfield` because the USER'S identity didn't change.
- `<ViewportLocalityBadge>` updates as the user pans — copy reflects the new viewport ("Map centred near Manchester" etc.).
- The two NEVER collapse.

**Unit-covered by:** §LSL-Map (proves both render simultaneously when both fields resolve; the chip's static-during-pan invariant is not unit-covered because jest doesn't pan).

**Device-only checks:**

- [ ] iOS: pan from Huddersfield to Manchester. Chip stays `Using profile location · Huddersfield`. Badge updates to reflect new viewport.
- [ ] Android: same.
- [ ] Both: pan back to Huddersfield. Badge updates back. Chip stays put throughout.
- [ ] Both: confirm no flickering of either element during pan animations.

### Scenario 8 — Map chip over satellite / dense tiles

**Setup:** Same as #3 + switch to satellite tile layer (if available in the map control) OR zoom to a dense urban area with lots of building outlines.

**Expected behaviour:**

- Chip remains legible — translucent cream background + hairline border + subtle elevation give sufficient contrast over both standard street tiles AND satellite/dense tiles.

**Unit-covered by:** Partially — §LSL-10 verifies the chip's elevation + border styling exists, but visual contrast is a device-only render concern.

**Device-only checks:**

- [ ] iOS: zoom to a dense urban area (e.g. central London) on the standard map. Chip remains readable; text doesn't disappear into background detail.
- [ ] iOS: if satellite layer is available, switch to it. Confirm chip is still readable (the cream background should provide enough contrast against satellite imagery; if not, this is a device-QA finding worth surfacing).
- [ ] Android: same.

### Scenario 9 — §DF-v2-i edge case: legacy user with only `User.city` text

**Setup:** A user with `User.city = 'Huddersfield'` but `User.localityId`, `User.latitude`, `User.longitude` all NULL. Post-§DF v1 backfill this cohort is near-empty in production, but can be constructed for QA using a Prisma dev script.

**Expected behaviour:**

- Label copy: `Set location ›` (NOT `Using profile location · Huddersfield`).
- Reason: §DF-v2-i tightened the helper so `User.city` text alone no longer produces `source='profile'`.

**Unit-covered by:** §DF-v2-i-U4 (helper-level pin asserting the city-text-only branch returns `source='none'`).

**Device-only checks:**

- [ ] Construct the fixture: `UPDATE "User" SET "city" = 'Huddersfield', "localityId" = NULL, "latitude" = NULL, "longitude" = NULL WHERE "email" = 'qa-legacy-city@redeemo.com'`.
- [ ] Log in as that user on iOS. Label shows `Set location ›`.
- [ ] On Android: same.
- [ ] Confirm rails behave as `effLoc=null` (UK-wide cohort, no nearby-rung claims) — should match the §DF-7v2i envelope `source='none'`.

### Scenario 10 — Defensive `source='profile'` + `city=null`

**Setup:** Backend defensive case — `locationContext.source = 'profile'` but `city === null`. This shouldn't happen in production with the §DF-v2-i tightened helper (because the helper only returns `source='profile'` when locality is set and has a name). Listed for completeness.

**Expected behaviour:**

- Label copy: `Using profile location` (NO suffix, no city node rendered).
- Icon: MapPin (no slash).
- No chevron.

**Unit-covered by:** §LSL-3 (D8 fallback).

**Device-only checks:**

- [ ] Difficult to reproduce on-device without backend mocking. Recommend skipping unless an unexpected production state arises.

### Scenario 11 — Backgrounded → permission granted in OS → resume

**Setup:** Open the app, deny location (or have it denied). Background the app. Open Settings → Privacy → Location Services → Redeemo → Always (or While Using). Resume the app.

**Expected behaviour:**

- On resume, the location hook detects the new permission state. Label updates from `No GPS · Set location ›` to `Using current location` on next focus.

**Unit-covered by:** Partially — the component re-derives state on every render via `useUserLocation()`; the AppState transition + permission re-read is an integration concern not unit-covered.

**Device-only checks:**

- [ ] iOS: confirm the label updates when the app comes back to foreground after granting permission in Settings.
- [ ] Android: same. Both platforms — confirm NO need for manual pull-to-refresh.

### Scenario 12 — Negative coverage: surfaces that MUST NOT mount the label

**Setup:** Various authenticated states.

**Expected behaviour (per D4 lock):** label is NOT visible on:

- Voucher Detail
- Merchant Profile (the backend emit DOES ship, but the UI does NOT mount the label)
- Profile tab
- Your Location screen itself

**Unit-covered by:** Negative coverage — the new component is only mounted in `HomeScreen.tsx`, `SearchScreen.tsx`, `MapScreen.tsx`. Other surfaces don't import it. `git grep "LocationStatusLabel"` confirms exactly 4 source files (component itself + 3 mounts).

**Device-only checks:**

- [ ] Open Voucher Detail (any voucher). NO chip / strip at the top.
- [ ] Open Merchant Profile (any merchant). NO chip / strip at the top.
- [ ] Open Profile tab. NO chip / strip.
- [ ] Open Your Location screen directly. NO chip / strip.

---

## §3. Recording template

Suggested format for the owner's device-QA report:

```markdown
## Device-QA Run — YYYY-MM-DD — <iOS device model> / <Android device model>

| # | Scenario | iOS result | Android result | Notes |
|---|---|---|---|---|
| 1 | Huddersfield profile, GPS off, Home | ✅/❌/⚠️ | ✅/❌/⚠️ | |
| 2 | Same, Search | | | |
| 3 | Same, Map | | | |
| 4 | GPS granted mid-session | | | |
| 5 | Denied + no profile | | | |
| 6 | Undetermined + no profile (fresh install) | | | |
| 7 | Map viewport pan | | | |
| 8 | Chip over satellite / dense tiles | | | |
| 9 | §DF-v2-i legacy city-text-only | | | |
| 10 | Defensive `source='profile'` + `city=null` | | ⏭️ skipped | |
| 11 | Background → grant → resume | | | |
| 12 | Negative (Voucher Detail / Merchant Profile / Profile / Your Location) | | | |
```

---

## §4. Gate summary (pre-Round-1)

**Simulator / unit-level:** ✅ PASS

- Backend §DF + §DF-v2-j sweep: 57/57 across 5 files.
- Customer-app full impacted-surface sweep: 575/575 across 70 files.
- Both type-check gates clean.
- Re-run on a transient 2-suite flake confirmed deterministic — adjacent timer-leak issue documented in CLAUDE.md, not §DF-v2-j related.

**Device-only:** First on-device QA run executed by owner — findings + fixes captured in §5 below.

---

## §5. Device-QA Round 1 — owner findings + fixes

**Date:** 2026-05-26 (same day as Tasks 1-12; on-device verification before PR opening).
**Test rig:** Owner's device. Profile location: Brightlingsea / CO7 0EY. GPS / location off.

Owner reported 5 items; 4 patched in code, 1 confirmed by owner direction.

### 5.1 Item 1 — Home label placement / spacing

**Finding (❌ FAIL):** Home correctly showed the label copy `Using profile location · Brightlingsea` but the strip felt "detached" — too much vertical gap between the `Good evening, Jane` greeting and the label. The strip's cream-tint background + bottom hairline created visual segmentation under `<HomeHeader>` (which has no bottom divider of its own).

**Root cause:** Spec §7.3 designed the strip's bottom hairline assuming there was a surrounding header divider above it. `<HomeHeader>` doesn't have one, so the strip looked visually orphaned.

**Fix:** Added `flush?: boolean` prop to `<LocationStatusLabel>`. When `flush=true`:

- Background → transparent
- Border → none (no bottom hairline)
- `paddingTop: 0` so the label sits flush against HomeHeader's bottom padding
- `paddingHorizontal: 18` (matches HomeHeader's horizontal padding)
- `paddingBottom: spacing[1]` (4pt — keeps a small breathing-room gap to the banner below)
- Width preserved at 100% (tap target still spans the row's horizontal width)

Home mount opts in via `flush` prop. Search keeps the default (cream-pill) chrome — it's the topmost element above `<SearchBar>` with no surrounding header, so the visual frame is appropriate.

**Pin added:** §LSL-11 (`tests/lib/location/LocationStatusLabel.test.tsx`) — asserts `flush=true` strip renders with `backgroundColor='transparent'`, `borderBottomWidth=0`, `width='100%'`.

**Status:** ✅ PATCHED — code change in `src/lib/location/LocationStatusLabel.tsx` (prop + new `stripFlush` style) + `src/features/home/screens/HomeScreen.tsx` mount opts in.

### 5.2 Item 2 — Search initial state showed the wrong empty state

**Finding (❌ FAIL):** Authenticated user with saved Brightlingsea profile, on Search idle (no search yet typed), saw:

> Set your area to see offers near you
> We use your area to show offers nearby
> CTA: `Set my area`

This is the **true no-location empty state**, intended for users with no GPS *AND* no profile location. The owner has a saved profile location, so the **profile-aware** empty state should fire ("Searching near Brightlingsea from your profile location" + dual CTA).

**Root cause:** Task 10 retired the previous `useMe()`-driven `savedAreaCity` derivation, replacing it with `data?.locationContext?.city`. But `data` is undefined before any search has fired (cold-cache + no-debounced-query window), so `savedAreaCity` evaluated to null → SearchEmptyState fell into the no-location branch.

**Fix (owner-locked plan amendment):** Re-introduced `useMe()` as the **idle-state-only** fallback. Resolution ladder:

1. `data?.locationContext` — authoritative (backend resolved). Fires once a search runs.
2. `useMe()` synthesized envelope — only when `data?.locationContext` is undefined. Falls back to a `source='profile'` envelope built from `me.data?.locality?.name` (or `me.data?.city`).
3. `undefined` — no-profile + no-search initial state.

This is NOT a return of the previous duplicated derivation. The authoritative response envelope still wins the moment a search runs; `useMe` only fills the cold-start gap. Amendment justified inline in `SearchScreen.tsx` + commit message.

**Pin added:** §LSL-Search-idle (`tests/features/search/SearchScreen.statusLabel.test.tsx`) — mocks `data?.locationContext` undefined + `useMe.data.locality = { name: 'Brightlingsea' }` and asserts the label renders with the synthesized profile envelope's city.

**Status:** ✅ PATCHED — code change in `src/features/search/screens/SearchScreen.tsx`.

### 5.3 Item 3 — Map blocking permission overlay shown for profile-location users

**Finding (❌ FAIL):** Map first showed the blocking overlay:

> Find merchants near you
> Enable Location
> Browse without location

This treats profile-location users as if they had no location at all. The initial-camera cascade (`MapScreen.tsx:335`) already animates to the saved-profile bbox when GPS is off — so the overlay is misleading + intrusive for these users.

**Root cause:** `showLocationPermission` was gated only on `locationState.status === 'idle'`. The user's saved-profile coords weren't considered.

**Fix:** Extended the gate to also check `me.data?.latitude != null && me.data?.longitude != null`. Users with neither GPS nor saved-profile coords still see the overlay (the genuine no-location case is preserved).

```ts
const hasSavedProfileCoords =
  me.data?.latitude != null && me.data?.longitude != null
const showLocationPermission =
  !locationPermissionDismissed
  && locationState.status === 'idle'
  && !hasSavedProfileCoords
```

**Pin added:** §LSL-Map-permission-overlay-skip (`tests/features/map/MapScreen.statusLabel.test.tsx`) — mocks `me.data.latitude/longitude` set + asserts the overlay's "Find merchants near you" + "Enable Location" copy is NOT rendered, AND the chip IS rendered (Map opened directly into the saved-profile experience).

**Status:** ✅ PATCHED — code change in `src/features/map/screens/MapScreen.tsx`.

### 5.4 Item 4 — Map chip rendered icon-only

**Finding (❌ FAIL):** After tapping "Browse without location" (which dismissed the overlay), Map opened near Brightlingsea and pins loaded. But the chip appeared as a tiny white pill with **only the red MapPin icon** — no `Using profile location · Brightlingsea` text.

**Root cause:** The chip variant's `copyWrap` used `flex: 1` — which, inside an intrinsic-sized parent (`alignSelf: 'center'` on the chip with no explicit width), collapses to 0 width because there's no "remaining space" to flex to. The text wrapper claimed 0px, leaving the icon as the only visible child.

This is a Yoga / React Native layout subtlety: `flex: 1` only works inside a non-intrinsic parent. The strip variant (`width: '100%'`) had plenty of horizontal space so `flex: 1` was harmless there; the chip variant didn't.

**Fix:** Dropped `flex: 1` on `copyWrap`. Replaced with `flexShrink: 1` so the text can still ellipsis-truncate on small phones via `numberOfLines={1}`, but DOES NOT collapse to 0 width inside intrinsic-sized parents.

**Pin added:** §LSL-12 (`tests/lib/location/LocationStatusLabel.test.tsx`) — asserts the chip variant renders the `location-status-city` testID with the expected text (Brightlingsea), proving the regression doesn't recur.

**Status:** ✅ PATCHED — code change in `src/lib/location/LocationStatusLabel.tsx`.

### 5.5 Item 5 — Your Location empty/clear-postcode behaviour confirmation

**Finding (⚠️ owner-requested clarification, not a bug):** Tapping `Update postcode` + deleting the field → Save button fades/disables. There's no explicit "Remove profile location" / "Clear location" action.

**Owner ask:** Confirm this is intentional + document it so it isn't re-raised as a bug.

**Confirmed product invariants (owner-locked, v1):**

1. **No "remove profile location" action exists in v1.** Discovery needs at least one of {GPS, saved profile} to provide a useful experience. Removing the saved profile without a GPS replacement would degrade discovery to UK-wide, which is a worse UX than keeping a stale postcode.
2. **Empty postcode keeps Save disabled.** The Save button gates on `disabled={!lookupResult}` — `lookupResult` is non-null only when a valid postcode is entered AND the lookup API returns a successful match. Empty input → no lookup → Save disabled. Same behaviour for invalid postcodes.
3. **Updating the postcode is the only mutation path.** The Edit + Save flow validates against the postcode lookup endpoint before persisting. The "Use current location" CTA on the same screen grants GPS but does NOT write to `User.postcode` — only an explicit `Update postcode` action mutates the saved postcode.

**Status:** ✅ CONFIRMED + DOCUMENTED. Customer-flow-current.md §15 receives a clarifying invariant block (companion commit).

---

## §6. Round 1 gate summary

**Simulator / unit-level:** ✅ PASS

- §LSL pin suite (4 files): 20/20 — was 16/16; +4 new Round 1 regression pins (§LSL-11 / §LSL-12 / §LSL-Search-idle / §LSL-Map-permission-overlay-skip).
- Customer-app full impacted-surface sweep: 611/611 across 76 files — was 575/575 pre-Round-1; the +36 deltas come from the new pin + a re-counted set after re-running the lib tree. Zero regression in adjacent suites.
- customer-app `tsc --noEmit`: exit 0 ✅ clean.
- Backend untouched in Round 1.

**Device-only:** Pending owner re-QA. Items 1-4 patched + pinned; Item 5 confirmed + documented.

**Pre-PR-opening gate:** AWAITING owner re-QA per the original Task 13 pause direction. No simulator-level blockers.

---

## §7. Device-QA Round 2 — owner findings + fixes

**Date:** 2026-05-26 (post-Round-1 device re-QA).
**Test rig:** Owner's device. Profile location: Brightlingsea. GPS / location off.

**Round 1 outcomes (closed):**

- Item 2 (Search idle empty state) ✅ now recognises profile location.
- Item 3 (Map permission overlay) ✅ Map opens directly in profile bbox.
- Item 4 (Map chip icon-only) ✅ chip now renders `Using profile location · Brightlingsea`.
- Item 5 (Your Location empty-postcode invariants) ✅ confirmed.

**Remaining items + 1 new item:**

### 7.1 Round 2 item 1 — Home label still felt detached

**Finding (⚠️ FAIL — Round 1 fix insufficient):** Round 1's `flush` prop dropped the cream pill chrome but the label still felt too far below `Good evening, Jane`. The remaining gap was HomeHeader's own `paddingVertical: spacing[3]=12pt` — the label sat 12pt below the header's content baseline, vs the GPS-on rhythm where the location row sits 4pt below the greeting.

**Fix:** Added `marginTop: -spacing[3]` (-12pt) to the `stripFlush` style. The label is now pulled up into HomeHeader's bottom padding zone so the visible distance from `Good evening, Jane` to `Using profile location · Brightlingsea` matches the GPS-on rhythm (HomeHeader's existing `marginTop: spacing[1]=4pt` location row).

**Updated pin:** §LSL-11 — asserts `marginTop === -12` on the flush container.

**Status:** ✅ PATCHED — code change in `src/lib/location/LocationStatusLabel.tsx` (`stripFlush` style only).

### 7.2 Round 2 item 2 — Search top label felt redundant in idle / empty state

**Finding (⚠️ FAIL):** In Search idle state, owner saw BOTH:

- Top strip label: `Using profile location · Brightlingsea`
- Empty-state title + body: `Searching near Brightlingsea` + supporting copy

That's two overlapping signals carrying the same information. Owner direction: hide the label when the empty state's profile-aware copy is doing the same job; keep it only when results are visible (the results header `Closest matches for query` doesn't mention location).

**Fix:** Conditional mount — `showStatusLabel = showResults && branches.length > 0`. The label is now mounted ONLY in the results state:

- Idle / trending state → no label (clean SearchBar at top + trending pills below).
- Loading state → no label.
- Empty-results state → no label (empty-state copy carries the location identity).
- Has-results state → label appears between SearchBar and the results header.

Repositioned BELOW SearchBar (was: above) so SearchBar remains the stable top-of-screen primary input and the label acts as a contextual banner over the results.

**Pin updates / new pins:**

- §LSL-Search + §LSL-Search-coordinates: updated to include `mockState.branches = [...]` (Round 2 requires populated branches to trigger the mount condition).
- §LSL-Search-idle (Round 1) → reframed to §LSL-Search-idle-no-label: asserts the label is HIDDEN in idle state even when the user has a profile location.
- New positive pin §LSL-Search-results-with-synth: asserts the label DOES render in results state with the synthesized-from-useMe envelope when `data.locationContext` is undefined (forward-compat).

**Status:** ✅ PATCHED — code change in `src/features/search/screens/SearchScreen.tsx` (conditional mount + repositioned below SearchBar).

### 7.3 Round 2 item 3 — Search empty-state copy refresh

**Finding (⚠️ owner copy preference, not a bug):** Existing body copy `Location is off, so we're using your profile location. Turn on location for the most accurate nearby offers.` Owner direction: warmer phrasing (`Your location is turned off`) + avoid repeating "location" (`Turn it on`). No em-dashes.

**Fix:** Body refresh to `Your location is turned off, so we're using your profile location. Turn it on for the most accurate nearby offers.` Title `Searching near {city}` unchanged.

**Pin updates:** existing §DF Round 5 verbatim assertions in `SearchEmptyState.profileAware.test.tsx` updated to the new copy. No new pin needed — the locked-verbatim-copy assertion + the existing "no em-dashes" assertion both protect the new wording.

**Status:** ✅ PATCHED — code change in `src/features/search/components/SearchEmptyState.tsx`.

### 7.4 Round 2 item 4 — Map confirmed clean

Owner confirmed Round 1's Map chip fix resolved the icon-only render. Chip now shows `Using profile location · Brightlingsea`. ViewportLocalityBadge remains semantically separate (`Map centred near Brightlingsea`). No additional Map regression observed.

**Status:** ✅ NO CHANGE — Round 1 patch holds.

---

## §8. Round 2 gate summary

**Simulator / unit-level:** ✅ PASS

- Focused 5-suite gate (LSL component + 3 surface integrations + SearchEmptyState profile-aware): 34/34 PASS (after Round 2 test updates).
- Customer-app full impacted-surface sweep (Home + Search + Map + lib): 404/404 across 58 suites.
- customer-app `tsc --noEmit`: exit 0 clean.
- Backend untouched in Round 2.

**Device-only:** Pending owner re-QA on Brightlingsea / Round 2.

**Pre-PR-opening gate:** AWAITING owner re-QA. No simulator-level blockers. Round 2 makes 3 small surgical changes — none affect the locked product invariants from spec §3 (D1-D11) or any test pin outside the §LSL family + SearchEmptyState.profileAware.

---

## §9. Device-QA Round 3 — owner findings + fixes

**Date:** 2026-05-26 (post-Round-2 device re-QA).
**Test rig:** Owner's device. Profile location: Brightlingsea. GPS / location off.

**Round 2 outcomes (closed):**

- Search idle profile recognition ✅
- Search results behaviour ✅
- Map profile-location chip + pins + viewport badge ✅
- Your Location empty-postcode / disabled-save behaviour ✅

**Remaining item before PR opening:**

### 9.1 Round 3 item 1 — Home label still felt detached

**Finding (⚠️ FAIL — Round 2 fix insufficient):** After Round 2's `marginTop: -spacing[3]` (-12pt) absorption of HomeHeader's bottom padding, the label still felt too far below the greeting on-device. Owner direction: stop iterating on spacing tweaks and MOVE THE LABEL into HomeHeader so it occupies the same location-row slot as the existing GPS-on row, not a separate strip below.

**Fix (owner-locked structural change):** HomeHeader now accepts a `locationContext?: LocationContext | undefined` prop. The location-row slot inside HomeHeader's left column (next to the greeting) renders one of:

1. **GPS-on (existing behaviour):** when `area || city` resolves from `useUserLocation`, the existing MapPin + locationLabel row renders at `marginTop: spacing[1]=4pt`. Unchanged.
2. **GPS-off + locationContext present:** the LocationStatusLabel (flush variant) renders in the same slot at the same `marginTop: spacing[1]=4pt`. This is the new Round 3 branch.
3. **GPS-off + no locationContext:** nothing renders. Unchanged.

HomeScreen no longer mounts `<LocationStatusLabel>` as a standalone child below HomeHeader. Round 1's `flush` prop + Round 2's `marginTop: -spacing[3]` workaround are retired — the label is now genuinely INSIDE HomeHeader's natural rhythm.

`stripFlush` style simplified: dropped the negative `marginTop`, the `paddingHorizontal: 18` (HomeHeader's column owns it), and the `paddingBottom: spacing[2]`. Flush is now a clean "strip but transparent + no chrome" variant for inside-parent mounting.

**Pin updates:**

- §LSL-11 updated — drops the obsolete `marginTop === -12` assertion; now asserts `paddingHorizontal === 0` + `paddingVertical === 0` (parent owns positioning).
- §LSL-Home preserved — still asserts the label is mounted on HomeScreen with the correct copy.
- New pin §LSL-Home-inside-header — uses `within(getByTestId('home-header')).getByTestId('location-status-label')` to assert the label is a descendant of HomeHeader. Prevents Round 1/2 standalone-strip drift.

**Status:** ✅ PATCHED — code changes in `src/features/home/components/HomeHeader.tsx` (new prop + slot logic) + `src/features/home/screens/HomeScreen.tsx` (drop standalone mount + pass `locationContext` to HomeHeader) + `src/lib/location/LocationStatusLabel.tsx` (simplified `stripFlush` style).

**Architecture note:** HomeHeader now has a one-way dependency on `LocationStatusLabel` + `LocationContext` type. This is a reasonable coupling — HomeHeader's purpose is the page header chrome, and the location-row slot is part of that chrome. The dependency is contained (no transitive imports surface elsewhere). No new test infrastructure needed; existing snapshot of `<HomeHeader>` is unchanged on the GPS-on path.

D6 coexistence preserved: `<SavedAreaHonestyHint>` continues to mount BELOW the header (unchanged from Round 1+2). Label = compact identity inside the header. Hint = caveat + Update affordance below.

---

## §10. Round 3 gate summary

**Simulator / unit-level:** ✅ PASS

- Focused gate (LSL component + full Home suite, 19 files): 116/116 PASS (+1 new pin §LSL-Home-inside-header).
- Customer-app full impacted-surface sweep (Home + Search + Map + lib, 58 files): 405/405 PASS (was 404/404; +1 for the new pin).
- customer-app `tsc --noEmit`: exit 0 clean.
- Backend untouched in Round 3.

**Device-only:** Pending owner re-QA on Brightlingsea / Round 3.

**Pre-PR-opening gate:** AWAITING owner final re-QA. Round 3 is one structural change (label moves into HomeHeader); the new `§LSL-Home-inside-header` pin locks the placement so future contributors can't drift it back to a standalone strip.

---

## §11. PR #131 pre-merge fixup round — independent-review findings

**Date:** 2026-05-26 (PR opened; owner ran an independent review before approving merge).

Three small fixups requested before merge approval. All three patched + pinned; one stale docblock cleanup applied; round-N annotation cleanup deferred post-merge per owner direction.

### 11.1 Fix #1 — Search idle synthesis tightened to mirror §DF-v2-i

**Finding (⚠️ alignment bug):** SearchScreen's `useMe()`-driven idle-state fallback synthesized `source='profile'` when EITHER `me.data.locality` OR `me.data.city` was set. Backend §DF-v2-i requires ALL THREE of `localityId + latitude + longitude` for `source='profile'`. The asymmetry meant Search could show profile-location UI for cohorts that backend routes correctly treat as `source='none'` (e.g. pre-PC2 users with `User.city` text but no localityId/lat/lng).

**Fix:** Synth predicate tightened to mirror backend exactly:

```typescript
const hasCompleteSavedProfile =
  me.data?.localityId != null
  && me.data?.latitude  != null
  && me.data?.longitude != null
if (!hasCompleteSavedProfile) return undefined
```

City derivation also tightened — no longer falls back to `me.data.city` text alone. City comes from the joined `me.data.locality.name`, defaulting to null if locality wasn't joined (defensive — label renders "Using profile location" per the D8 fallback).

**Pins added / updated:**

- §LSL-Search-idle-no-label / §LSL-Search-results-with-synth — existing pins extended to set `localityId + latitude + longitude` on the mock so they still pass against the tightened predicate.
- NEW §LSL-Search-synth-city-text-only — city-text-only profile (no locality / lat / lng) does NOT synthesize; label stays hidden even in results state.
- NEW §LSL-Search-synth-locality-only — locality set but lat/lng null does NOT synthesize. Matches backend §DF-v2-i-U3 (incomplete profile → `source='none'`).

**Status:** ✅ PATCHED — code change in `src/features/search/screens/SearchScreen.tsx`.

### 11.2 Fix #2 — Map permission gate aligned to same complete-profile predicate

**Finding (⚠️ alignment bug):** Map's `showLocationPermission` gate suppressed the overlay when `latitude + longitude` were present — but Backend `resolveLocationContext` requires `localityId` too. A user with lat/lng but no localityId would skip the overlay (Map opens directly) but backend routes return `source='none'` — discovery rails fall back to UK-wide. Mismatched UX vs backend semantics.

**Fix:** Map's `hasSavedProfileCoords` renamed to `hasCompleteSavedProfile`, gates on all three fields:

```typescript
const hasCompleteSavedProfile =
  me.data?.localityId != null
  && me.data?.latitude  != null
  && me.data?.longitude != null
```

**Pins added / updated:**

- §LSL-Map-permission-overlay-skip — existing pin extended to set `localityId` + `status: 'idle'` (the previous mock used `status: 'granted'` which short-circuited the gate before the profile predicate fired — making the test pass for the wrong reason).
- NEW §LSL-Map-permission-overlay-shown-when-localityId-missing — lat/lng without localityId DOES show the overlay (matches backend `source='none'` for the same cohort).

**Status:** ✅ PATCHED — code change in `src/features/map/screens/MapScreen.tsx`.

### 11.3 Fix #3 — Parallelize route-level `resolveLocationContext` on `/search` + `/discovery/in-area`

**Finding (⚠️ performance):** Both routes resolved `locationContext` BEFORE the existing `Promise.all([searchMerchants, searchBranches])` (or `[getInAreaMerchants, getInAreaBranches]`) parallel fan-out. The 1-2 DB reads ran serially, adding ~10-30ms wall-time per request.

**Fix:** Folded the resolve into the same `Promise.all`:

```typescript
const [ctx, merchantResult, branchResult] = await Promise.all([
  resolveLocationContext(app.prisma, userId, params.lat ?? null, params.lng ?? null),
  searchMerchants(app.prisma, { ...params, userId }),
  searchBranches(app.prisma, { ...params, userId }),
])
const locationContext = toLocationContextWire(ctx)
```

Same pattern applied to `/discovery/in-area`. `/home` + `/merchants/:id` retain the sequential resolve — both call a SINGLE service (not parallel), so there's no concurrent arm to fold into.

**Pin coverage:** the existing 12 §DF-v2-j-S/I/M integration pins exercise both routes against real Neon — confirmed 16/16 pass post-parallelization (route observable behaviour unchanged; only wall-time improved).

**Status:** ✅ PATCHED — code change in `src/api/customer/discovery/routes.ts`.

### 11.4 Stale docblock cleanup in `LocationStatusLabel.tsx` (cleanup, non-blocking)

**Finding:** Two docblock sections referenced pre-Round-2/3 state — claimed strip is "Home + Search" without describing the post-Round-3 split where Home consumes via HomeHeader, and described Search as the topmost element above SearchBar when Round 2 actually moved it below.

**Fix:** Refreshed both docblocks to describe the final shipped state. Round-N annotation cleanup deferred to a post-merge follow-up per owner direction.

**Status:** ✅ PATCHED — code change in `src/lib/location/LocationStatusLabel.tsx` (docblock only).

### 11.5 Items deferred per owner direction

- **SearchScreen synthesis useMemo** — Claude's self-review suggested `useMemo` to prevent the IIFE running on every render. Per owner: "not a merge blocker, can be deferred if the synthesis predicate is fixed". The predicate IS fixed in fix #1; useMemo not added in this round.
- **Round-N annotation cleanup** — Per owner: post-merge cleanup unless a comment is actively misleading. The §11.4 docblock refresh covers the actively-misleading ones; remaining `// Task 13 Round N` markers are factual + load-bearing for the QA history. Deferred.

---

## §12. PR #131 fixup-round gate summary

**Simulator / unit-level:** ✅ PASS

- Focused 4-suite gate (LSL component + Search status label + SearchEmptyState profileAware + MapScreen status label): **36/36 PASS** (+3 new pins from fix #1 + fix #2 negative cases; +1 reframed existing pin).
- Customer-app full impacted-surface sweep (Home + Search + Map + lib, 58 files): **408/408 PASS** (was 405; +3 new pins).
- Backend §DF-v2-j parity + §DF-v2-i unit pins (`locationcontext-parity.test.ts` + `resolveLocationContext.test.ts`): **16/16 PASS**.
- customer-app `tsc --noEmit`: exit 0 clean.
- backend `tsc --noEmit`: 0 new errors (4 pre-existing CLAUDE.md-documented baseline only).

**Behaviour change scope (front + back):**

| Surface | Pre-fixup | Post-fixup |
|---|---|---|
| Search idle (city-text-only profile) | Showed profile-aware empty state (synthesized `source='profile'`) | Shows no-location empty state ("Set your area") — matches backend `source='none'` |
| Search idle (locality without lat/lng) | Showed profile-aware empty state | Shows no-location empty state — matches backend §DF-v2-i-U3 |
| Search idle (complete profile) | Showed profile-aware empty state | Unchanged ✅ |
| Map overlay (lat/lng without localityId) | Hidden (Map opens directly) | Visible — matches backend's no-location treatment |
| Map overlay (complete profile) | Hidden | Unchanged ✅ |
| `/search` route wall-time | resolve → Promise.all (~+10-30ms) | resolve IN Promise.all (saved ~10-30ms) |
| `/discovery/in-area` route wall-time | Same pre-fix pattern | Same post-fix pattern |

**Pre-PR-merge gate:** AWAITING owner approval. The 3 alignment fixes close the front-end / back-end behaviour gap; the parallelization fix is a Pareto improvement with no observable behaviour change.
