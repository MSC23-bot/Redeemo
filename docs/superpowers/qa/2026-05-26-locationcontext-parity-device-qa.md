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
