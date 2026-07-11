# Map Phase 2 Programme: Discovery + Plan (owner-commissioned 2026-07-10)

**Status:** APPROVED-TO-PLAN by owner 2026-07-10 ("make the Map tab feel complete end-to-end").
Slices execute per the boundaries below; S0 pre-authorised as clearly safe.
**Lead:** Fable 5 (planning/adjudication/gates) · Sonnet max-effort implementation · Opus 4.8
for location/privacy/API-risk review. **Hard boundaries:** no schema migrations, provider
changes, production changes, or billable API/backfill runs without explicit owner approval;
backend needs are proposed, never worked around.

## 1. Current state (verified by two-agent discovery on main @ b641fa0f)

BUILT: branch-first pins (react-native-maps, native providers) with category `pinColour` +
letter glyph; category pills (top-level only); bottom carousel using the shared BranchTile
(has FavouriteHeart); list bottom-sheet (custom weaker rows, NO heart); UK_CITIES location
search (city recentre only, locked no-q); 3 empty states; deterministic in-area results +
`branchesOnly` fast path + 3dp bbox-quantized cache (120s) + keepPreviousData (all PR #434);
location-trust integration complete: pins now surface MANUALLY_CONFIRMED + ADDRESS_GEOCODED
+ MERCHANT_CONFIRMED (`CONFIRMED_LOCATION_SET`), POSTCODE_CENTROID/NEEDS_REVIEW stay
redacted (L3 lock), `googlePlaceId` never exposed to customers (verified).

MISSING/BROKEN (full list; nothing narrowed):
- **BUG (live):** FilterSheet voucher-type values are display strings ('Discount', 'Freebie',
  'Spend & Save', 'Package Deal') sent verbatim into the backend enum filter: only 'BOGO'
  matches; the rest silently return zero results (FilterSheet.tsx:52 + service enum filter).
- **BUG (live):** `searchBranches` accepts-and-silently-ignores SEVEN params (`amenityIds`,
  `tagIds`, `openNow`, `featured`, `topRated`, `sortBy`, `maxDistanceMiles`): §BX.1-§BX.7.
  Map + Category render `branches[]`, so those FilterSheet controls have zero server effect.
- Pins vanish briefly on pan-back (no cross-viewport region accumulation; cache keys on the
  quantized viewport only): the owner's twice-reported felt pain.
- No request cancellation anywhere (api client has no AbortSignal); filtered-map path lacks
  bbox quantization + uses 30s staleTime (parity gap vs 120s unfiltered path); no map
  focus/blur lifecycle; no discovery rate tier; no server-side caching.
- No clustering; circle+letter pins instead of the spec §7.2 teardrop + category icon
  (schema already carries `Category.pinIcon`, unused; no parent-fallback for null
  subcategory `pinColour`/`pinIcon`); no drop animation; no selected pulse ring.
- Carousel↔pin sync is one-way (swipe does not move selection/camera); no swipe-down
  dismiss; list sheet lacks sort selector, hearts, and shared-tile parity.
- SearchScreen has NO FilterSheet at all (reverse inconsistency); `tagIds` fully honoured by
  the backend but unreachable from any UI; `region` scope dropped client-side.
- Design evidence located: spec §7 (2026-04-17) + 10 HTML pin/filter mockups at
  `.superpowers/brainstorm/29364-1776892625/content/` (pin anatomy, logo/label chips,
  category pills, cluster/legend states, tap behaviours, basemap styles).

## 2. Recommended end-state experience

Pins: teardrop/pill pins coloured by category with the category's white SVG `pinIcon`
(parent-fallback when the subcategory's is null); label chip appears at high zoom
(mockup `pin-refined` + `pin-label-variants` direction); selected pin scales + pulse ring;
staggered drop-in on first load; clusters (navy circle + count, tap to zoom) past a density
threshold. Panning: pins from every visited area persist and render instantly from a
client region cache while refreshing quietly; in-flight requests cancel on supersede.
Cards: carousel card at full Home-card richness (aggregate savings block included); list
rows become shared BranchTiles (hearts included) with a sort selector; swiping the carousel
moves the selected pin and pans the camera; swipe-down dismisses. Filters: one FilterSheet
across Map/Category/Search whose every control provably filters the rendered branches
(voucher types mapped to real enums; amenities/open-now/sort honoured server-side);
category pills gain subcategory drill-down; tags surfaced where product decides.
Coherence: identical tiles, hearts, savings language, and filter semantics as
Home/Search/Favourites; trust tiers remain the only exposure gate.

## 3. Implementation slices (ordered)

| # | Slice | Scope | Surface | Safety |
|---|---|---|---|---|
| S0 | Filter truth quick fixes: voucher-type label→enum mapping (+ display mapping test); bbox quantization + 120s staleTime parity for the filtered map path | none→small | customer-app only | SAFE: pre-authorised, starts now |
| S1 | `searchBranches` honours the seven ignored params (§BX.1-§BX.7 closure); route/service tests per param; Category + Map inherit for free | query logic only, NO schema | backend | Safe to build; normal PR gates; Opus review on the query composition |
| S2 | Feel: client region-accumulation cache (quantized-tile union render + background refresh + TTL/memory cap); AbortSignal in the api client + react-query cancellation wiring (map first); map focus/blur pause; camera-pan + two-way carousel sync; swipe-down dismiss | none | customer-app (+api client) | Safe after S1 lands |
| S3 | Pin system v2: teardrop/pill + category icon pins (use existing `pinColour`/`pinIcon`, read-time parent-fallback: no migration), label-chip zoom behaviour, selected pulse ring, drop-in animation, marker perf discipline; client-side clustering (supercluster-style, no provider change) | additive read-time fallback only | customer-app (+tiny backend read) | **SHIPPED** (branch `feat/map-p2-s3-pins`): see §7 as-shipped addendum |
| S4 | Cards + list: carousel card parity with Home language; MapListView → shared BranchTile rows (hearts); sort selector; half-sheet resize audit | none | customer-app | **SHIPPED** (branch `feat/map-p2-s4-cards`): see §8 as-shipped addendum |
| S5 | Filter/search coherence: FilterSheet on SearchScreen (D2), subcategory drill on pills, tags surfacing (D3), `region` scope re-add or retire (D4) | none | customer-app | **S5a SHIPPED** (branch `feat/map-p2-s5a-filters`): see §9 as-shipped addendum. §D3 (tag surfacing) intentionally NOT in S5a scope: remains open, tracked for a later S5 pickup |
| S6 | Platform (propose-only): discovery rate tier, server in-area caching, pin-only lite endpoint, gazetteer LocationSearch, marker native-image migration | TBD | backend | PROPOSED, not scheduled; needs measurement first |

## 4. Decision register

OWNER decisions: **D1: RESOLVED** (owner 2026-07-10, artifact
`280f262f-2728-4968-af93-ace7dbb27bb5`): pin visual direction is Option A: teardrop pins
34×44 (white 2px keyline, drop shadow) filled with the category `pinColour`, white
stroke-style category icon inside; selected pin grows one step (~42×54) + a brand-red pulse
ring (shipped static: see the S3 as-shipped addendum §7 for why); navy #010C35 44px cluster
circles with 3px white border + white count; name chips at close zoom, density-gated. S3
implements this (as-shipped addendum below records the exact shipped geometry/behaviour
where it differs in specifics from the brief). **D2: RESOLVED** (yes: one coherent
FilterSheet system; S5a ships it on SearchScreen, independent per-surface filter state; see
§9). **D3** which tag types surface to customers (backend ready; product call): still OPEN,
NOT in S5a scope. **D4: RESOLVED**: `region` retired from customer-facing scope UI; S5a
audit found this was ALREADY fully satisfied by prior work (§9 records the evidence: no code
change was needed). NO provider/billable/schema decisions are required by S0-S5 (Mapbox
exploration from the mockups is explicitly NOT proposed; staying on react-native-maps).
LEAD-adjudicated (recorded): clustering is client-side only; `pinIcon` parent-fallback is
read-time (no migration); `MerchantCategory.isPrimary` duplicate-field cleanup is deferred
hygiene (tracked, not in this programme); LocationSearch stays UK_CITIES until S6.
DESIGN input needed: D1 mockup pick; card-parity visual QA on device (S4).

## 5. Acceptance criteria ("Map Phase 2 complete")

1. Pan Huddersfield→London→back: Huddersfield pins render instantly from cache (no blank
   beat), refresh quietly. 2. Every FilterSheet control changes the rendered branches
   (proven by per-param tests + device QA). 3. Pins are category-recognisable at a glance
   (icon + colour) and cluster in dense viewports. 4. Carousel swipe moves selection +
   camera; list rows carry hearts; savings language matches Home. 5. No regression to the
   trust exposure gates (redaction tests stay green). 6. Filter semantics identical across
   Map/Category/Search. 7. Owner device sign-off on feel (dev build acceptable; production
   build for the perf verdict).

## 6. Cross-check: audit findings + owner goals → slices

| Item | Covered by |
|---|---|
| Pins missing (confidence gate) | DONE (trust slices 1-3) |
| Pins vanish/change on pan-back | DONE (determinism, #434) + S2 (accumulation) |
| Slow loads (merchant-wide query) | DONE (#434) + S2 (cancel) + S6 (cache/lite endpoint) |
| Raw float bbox / cache misses | DONE (#434) + S0 (filtered-path parity) |
| Clustering | S3 |
| Richer category pins / mockups | S3 (D1) |
| Region accumulation | S2 |
| Cancellation | S2 |
| §CZ.1 category filter under-returns / §CZ.2 distance recompute | S1 / S2 |
| §BX.1-§BX.7 ignored params | S1 |
| Voucher-type filter silent-zero bug | S0 |
| Carousel sync / swipe dismiss / camera pan | S2 |
| List-view hearts + sort + tile parity | S4 |
| Filters/search coherence + tags + subcategories | S5 (D2-D4) |
| Goal: coherent with Home/favourites/trust | S3/S4 + criteria 5-6 |
| Deferred beyond programme | S6 items; gazetteer; Mapbox (not proposed) |

## 7. S3 as-shipped addendum (2026-07-10, branch `feat/map-p2-s3-pins`)

**Backend (tiny, additive, no schema change):** `BRANCH_TILE_SELECT` (service.ts) nests
`parent: { pinColour }` under both `merchant.primaryCategory` and
`merchant.categories.category`. `enrichBranchTile` resolves `pinColour` as
own-value-else-parent-value-else-null for both the primary category and the derived
`subcategory` field. This is wire-safe: it only changes the VALUE of an existing nullable
field, never adds a key. `enrichBranchTile` + its `BranchSelectResult` type are now exported
for direct unit testing (were previously module-private). 6 backend unit tests.

**CORRECTION (2026-07-10, lead review, release-safety blocker):** the branch as FIRST pushed
also added a NEW wire field `topLevelName` to branch-tile category summaries (backend
emission + both tile schemas). REVERTED before merge. Hazard: the CLIENT branch-tile schema
(`apps/customer-app/src/lib/api/discovery.ts`) is `.strict()` on every INSTALLED build, so a
new backend-emitted KEY makes existing builds reject the ENTIRE discovery payload the moment
the backend deploys: instant and total, strictly worse than the MERCHANT_CONFIRMED
enum-value case (a new enum VALUE degrades gradually and only needs tolerant parsing to be
in the field first; an unknown KEY fails the whole parse immediately). **Standing rule
recorded:** wire ADDITIONS to branch tiles require the same tolerance-first release
sequencing as enum additions: ship the tolerant client parser through the app stores FIRST,
add the backend emitter in a later release. For S3 the need was eliminated instead: the
top-level category name is now resolved CLIENT-SIDE (`resolveTopLevelCategoryName` +
`buildCategoryTreeIndex` in `categoryPinGlyph.ts`) by walking `parentId` over the category
tree the app ALREADY loads via `useCategories` (the same data MapCategoryPills filters with
`c.parentId === null`); `<MapPins>` memoizes the index from a new optional `categories` prop
passed by MapScreen. Fallback ladder while the categories query loads (pins must never
blank): a top-level primary category resolves from its own `parentId === null` without the
index; a subcategory leaf degrades to its OWN name (default glyph) until the query lands and
the next render upgrades the glyph; a missing/cyclic parent degrades the same way
(walk-depth guard).

**Client pin glyph:** `apps/customer-app/src/features/map/utils/categoryPinGlyph.ts` mirrors
RailHeader's name-cascade matching approach (`'medical'` before `'health'`, etc.) but renders
via the app's existing lucide icon system (Utensils/Scissors/Stethoscope/Dumbbell/Compass/
ShoppingBag/Home/Plane/Baby/Car/PawPrint, default MapPin) rather than hand-authored SVG path
data: lower maintenance risk, consistent with the locked customer-app rule that lucide icons
import via the design-system `icons.ts` barrel. It matches against the CLIENT-RESOLVED
top-level category name (see the correction paragraph above). `Category.pinIcon` is NOT read
(confirmed unused/null in seed); it remains the documented FUTURE admin-driven icon-key hook
: no remote-icon pipeline was built.

**Pin geometry:** outer marker container is 60×63 (constant across every state: selected,
unselected, ring visible or not), engineered so the teardrop's tip lands exactly at
react-native-maps' default bottom-centre anchor (`{x:0.5,y:1}`, no anchor-prop override
needed) AND there's headroom above the teardrop's head for the pulse-ring halo. The teardrop
itself is intrinsically 42×54 (the brief's SELECTED size) with the unselected "34×44" look
achieved via `transform: scale(0.81)` on its wrapper: SAME mechanism the pre-S3 pin used for
its 34-vs-42 circle, just applied to an SVG teardrop path instead. The §BC/§BF/§BI freeze/
thaw discipline (SELECTION_TRACK_MS = 1000ms, constant-outer-bounds, no unmount on selection
toggle) is byte-for-byte unchanged in `MapPins.tsx`.

**Pulse ring: SHIPPED STATIC, not animated.** The design brief asked for an animated brand-
red pulse ring with a static fallback under reduce-motion. This was scoped down to a
STATIC ring (two concentric stroked circles, opacity-toggled only) for ALL users, not just
reduce-motion. Rationale: react-native-maps renders Marker content as a bitmap snapshot;
`tracksViewChanges` controls re-capture. A continuously-animated ring inside a Marker would
need `tracksViewChanges=true` for the entire animation: the exact "animated bitmap
re-render" perf trap this slice was briefed to avoid, and a stronger/more sustained version
of the failure class §BC/§BF/§BI already document (stuck-invisible markers after a bitmap
regeneration races an in-flight capture). This codebase has no device evidence for how short
a *repeating* capture window can safely be: the existing 1000ms constant was arrived at
because 250ms was observed UNSAFE for a ONE-TIME cold-mount capture on real iOS hardware
(§BI); inventing a shorter window for a repeating animation, undevice-testable in this
environment, would be an unverified perf gamble. A screen-space overlay (a plain Reanimated
View positioned via lat/lng→pixel projection, entirely outside the Marker/bitmap system) was
also considered: genuinely animatable at 60fps with zero bitmap risk: but correct
projection needs either disabling map rotate/pitch (both enabled by default and out of this
slice's explicitly scoped MapScreen edits) or a full heading/pitch-aware affine transform
with no precedent in this codebase. Full reasoning + the exact ring implementation is in
`MapPins.tsx`'s "Pulse ring safety note" comment. **Revisit trigger:** device QA
characterising a safe short capture window, or an owner decision to disable map rotate/pitch.

**Drop-in: SHIPPED ANIMATED, safely.** Reuses the ALREADY-OPEN cold-mount
`tracksViewChanges=true` window (the same one §BI already justified) rather than opening a
new one: capped stagger delay (≤300ms) + typical spring settle (~450ms) finishes well inside
the existing 1000ms freeze window, so the bitmap that gets frozen is the pin already in its
settled position: zero additional bitmap-capture risk. Scoped literally to "first viewport
load" (spec §7.2): only branches present in the very first non-empty render get the
staggered entrance; branches appearing later from panning settle in immediately with no
motion, rather than extending the choreography to every pan.

**Clustering:** hand-rolled deterministic grid clustering (`mapClustering.ts`, no new
dependency): `clusterBranchPins(points, region) -> {clusters, singles}`, cell size derived
from the current viewport's region deltas (the standard cross-provider zoom proxy),
grid-cell-coordinate-keyed cluster ids for stable Marker reuse. Swap-in point documented for
`supercluster` if density ever demands a KD-tree approach. Cluster tap (`MapClusterMarker`)
zooms the camera in one step (halves both region deltas) centred on the cluster centroid, via
MapScreen's existing `animateAndQuery` helper.

**Name chips:** density-gated (`mapNameChipGate.ts`) by two documented constants :
`CHIP_ZOOM_LATITUDE_DELTA_THRESHOLD = 0.03` (zoom gate) and `CHIP_MAX_VISIBLE_SINGLES = 8`
(visible-count gate, singles only: a cluster already summarises via its count badge).
Within a passing viewport, a greedy nearest-viewport-centre-first pass drops any chip that
would overlap an already-accepted one (`CHIP_MIN_SEPARATION_FRACTION = 0.12`, a
normalized-viewport-unit approximation, not a real pixel projection). Chips render as
SEPARATE, always-frozen Markers (`MapNameChipMarker`) rather than extra pin content, per the
brief's explicit fallback option: appending chip content to the pin's own marker would need
per-render bounds growth, violating the constant-outer-bounds contract.

**MapScreen hunks (for S2 reconciliation: `feat/map-p2-s2-feel` is unmerged and also
touches this file):** (1) new `handleClusterPress` callback (reuses `animateAndQuery`);
(2) `<MapPins>` gets three new props, `region={region}` (pre-existing state),
`onClusterPress={handleClusterPress}`, and `categories={categories}` (pre-existing
useCategories-derived variable; added by the strict-schema correction above). No other
MapScreen changes.

**Test updates:** `CustomPin.test.tsx`'s shape-specific assertions (which searched for a
`borderRadius>0 && width===height` View: the old circle) no longer apply to the SVG
teardrop and were rewritten to the equivalent v2 properties (the Path's own `fill` prop, the
teardrop wrapper's constant size): every invariant they protect stays covered, none deleted.
`MapPins.test.tsx` (marker-level §BC/§BI tests) is untouched and fully green, confirming
clustering/chips/drop-in don't disturb the locked marker contract. New coverage: 18 glyph-
matcher tests + 10 client-side top-level-resolver tests (correction), 13 clustering tests,
9 chip-gating tests, 3 new CustomPin ring/glyph tests; the 4 backend topLevelName wire tests
from the first push were removed with the revert (6 pinColour fallback tests remain).

**Verification:** customer-app full jest suite and backend `test:unit` + root tsc all green
(exact counts in the branch's final commit / PR description). No PR opened per task scope :
branch pushed for lead review.

## 8. S4 as-shipped addendum (2026-07-11, branch `feat/map-p2-s4-cards`)

**Hard guardrail honoured:** `BranchTile` is shared with Search (via `CategoryResultsScreen`)
and Category, both LOCKED test-pinned surfaces. Every enrichment below is opt-in via a new
prop with a default that reproduces the pre-S4 render exactly; the full Search + Favourites
jest suites (174 tests) ran green with zero changes required, and a dedicated regression test
(`BranchTile.aggregateSavings.test.tsx`) pins the default path against a fixture where
`maxEstimatedSaving` and `totalEstimatedSaving` deliberately differ, so a regression that
accidentally read the wrong field would fail immediately.

**Task 1 — carousel card parity.** `BranchTile` gains `savingsDisplay?: 'max' | 'aggregate'`
(default `'max'`, byte-identical to pre-S4). `'aggregate'` reads
`merchant.totalEstimatedSaving`/`voucherCount` instead of `merchant.maxEstimatedSaving`, and
renders Home's stacked treatment from `NearbyCard`/`PopularCard` verbatim: a small "Save"
label, a Mustica-green amount (`#15803D`, `MusticaPro-Semibold`, same font sizes as the Home
cards), and "across N vouchers" (or "N vouchers available" when there's no positive saving —
same null/zero handling as Home: `save !== null && save > 0`). Only `MapBranchTile` (the Map
carousel) passes `savingsDisplay="aggregate"`; the proximity-band chip (a Map-only concept
Home cards don't have) still renders alongside it on the same row.

**Task 2 — MapListView rows.** The bespoke `BranchRow` (a 52×52 category-coloured letter
thumb, no heart, no logo, `formatDistance`'s long-form "X.X miles away") is replaced by the
shared `<BranchTile size="compact">`. This is a genuine behaviour change on Map's list
surface, not merely additive: the row now carries a real banner + straddling logo (or the
tile's own navy-initials fallback), `FavouriteHeart` (branch-level, `entity="branch"`,
reusing the tile's already-wired heart — no new heart plumbing), and the compact distance
formatter ("X.X mi", matching every other `BranchTile` consumer). `BranchTile`'s `'compact'`
size tier had ZERO callers anywhere in the codebase pre-S4 (grep-verified) — its exact banner/
logo geometry (`BANNER_HEIGHT`/`LOGO_SIZE`/`CONTENT_MIN_H`) was free to tune down (72/40/96,
from the placeholder 96/48/130) specifically for list-row density, with no blast radius on
`'standard'` (Search/Category/Map-carousel) or `'hero'`. Row tap is unchanged:
`BranchTile.onPress` is already `(id: string) => void`, so `onBranchPress` wires straight
through with no adapter — same `?branch=${id}&from=map` contract as before.
`MapListView.test.tsx` was rewritten in place: the header/count/branch-first-cardinality
(§M) invariants are preserved unchanged; the two Fold-2 pinColour-thumbnail tests are
superseded (there is no bespoke thumb left to pin — coverage moves to `BranchTile`'s own
image tests plus new logo/heart-parity assertions in this file) and were replaced, not
silently dropped; the distance assertions were updated to the new compact format with an
explicit comment explaining why.

**Task 3 — sort selector (spec §7.8: "sort selector (red text)").** New
`MapListSortSelector.tsx` renders the four `FilterState.sortBy` options (`relevance` /
`nearest` / `top_rated` / `highest_saving`, re-exported from `FilterSheet.SORT_OPTIONS` as
the single label source) with the active option in `color.brandRose` (`#E20C04`, the locked
red token). `MapListView` takes `sortBy`/`onSortByChange` props; `MapScreen` supplies
`filters.sortBy` and a new `handleSortByChange` that patches the SAME `filters` state object
the `FilterSheet` reads/writes — there is no separate list-only sort state to drift out of
sync. Since S1 shipped, `sortBy` genuinely re-orders the server-side result set for both the
`/search` and `/discovery/in-area` hybrid-hook arms; this selector does no client-side
re-ordering.

**Task 4 — half-sheet drag-to-resize audit.** The task brief cited "§CK item 12"; the actual
deferred-followups entry matching this description is **§CK.9** ("Drag-to-resize half-sheet
on `MapListView` … Audit at pickup whether the shared `<BottomSheet>` already supports
drag-to-resize; if not, extend it") — §CK.12 in the live register is the unrelated
non-MANUALLY_CONFIRMED-branches product decision. Noted here for the record; the audit below
answers §CK.9's actual question.

Audited `src/design-system/motion/BottomSheet.tsx`. Finding: **NOT a small, safe addition —
deferred, not implemented.** Reasoning:

1. `BottomSheet` has exactly ONE detent today: a single `ty` shared value that animates
   between `0` (open, sheet's natural content height — the sheet has no fixed height, it
   already sizes to its children) and `500` (fully off-screen). The existing `Gesture.Pan()`
   only ever composes a binary decision at release — dismiss (`onDismiss()`) past
   `DISMISS_DISTANCE`/`DISMISS_VELOCITY`, or spring back to the SAME single open position.
   There is no second "half-open" resting state to drag between; "drag-to-resize" would mean
   building a genuinely new two-detent (or N-detent) state machine, not exposing a hidden
   capability that already exists.
2. `BottomSheet` is shared by 21 other call sites across the app (grep-verified), including
   several LOCKED test-pinned surfaces per `.claude/rules/customer-app.md`: `PinEntrySheet`
   (redemption/Show-to-Staff flow), multiple Merchant Profile sheets (`HoursPreviewSheet`,
   `DirectionsSheet`, `ContactSheet`, `WriteReviewSheet`, `BranchPickerSheet`), and several
   Profile-tab sheets (`ChangePasswordSheet`, `SubscriptionManagementSheet`,
   `PersonalInfoSheet`, `DeleteAccountFlow`, `AddressSheet`, `InterestsSheet`). Any change to
   the component's shared gesture/animation core carries real regression risk across those
   surfaces unless it is strictly opt-in (a new prop, default off) — itself a bigger, riskier
   change than "small addition" describes, and one that would need its own dedicated
   device-QA pass per detent (this codebase's established precedent for tuning gesture/
   animation timings — see the S3 addendum's pulse-ring discussion of the §BI 250ms-unsafe /
   1000ms-safe finding — is that these numbers are NOT guessable from first principles).
3. What it would actually take: (a) an opt-in `detents`/`snapPoints`-style prop on
   `BottomSheet` (default: today's single-detent behaviour, unchanged for the 21 existing
   callers); (b) measuring each detent's target height (content `onLayout`, since sheets size
   to content today — a fixed "half height" is meaningless without knowing what fits at that
   height per consumer); (c) extending `dragGesture.onEnd` from today's binary
   dismiss-or-springback to a genuine nearest-detent snap (by position AND velocity, mirroring
   how `MapBranchTile`'s own swipe-down-dismiss and `CustomPin`'s selection-freeze logic were
   each hand-tuned against real thresholds); (d) re-verifying the existing keyboard-avoidance
   `paddingBottom`/`keyboardHeight` logic against a partial-height detent (untested combination
   today); (e) a dedicated test pass proving the 21 existing non-Map callers are unaffected
   (an opt-in default makes this provable by inspection, but still needs device QA for the
   Map-specific gesture feel). None of this fits inside a Tier-1/S4-scope change; it's its own
   Tier-2 slice with a device-QA-gated interaction design, consistent with the deferred-
   register's own classification of §CK.9 as Tier-1 *polish* pickup work, not something to
   improvise mid-S4. **Revisit trigger:** a dedicated pickup of §CK.9 (or the broader §CK
   Tier-2 Map design-polish bundle per the deferred-followups index's pickup-path #2), ideally
   alongside product input on which two heights the half-sheet should actually snap between.

**Test updates:** `BranchTile.aggregateSavings.test.tsx` (new, 8 tests) covers both the
default-unchanged guardrail and the new aggregate variant's null/zero/singular/proximity
cases. `MapListView.test.tsx` rewritten in place (13 tests: 3 unchanged header/count/name
pins, 1 unchanged §M cardinality pin with a widened accessibility-label regex, 3 new logo/
heart-parity tests, 2 updated distance-format tests, 3 new sort-selector tests) plus 2 removed
Fold-2 pinColour tests (superseded, see Task 2 above). No changes needed to
`BranchTile.premium.test.tsx`, `BranchTile.image.test.tsx`, or any Search/Category test file.

**Verification:** map + search + category + favourites subsets green
(24 map suites / 205 tests; 21 search+favourites suites / 174 tests), full customer-app suite
result recorded in the branch's final commit. Backend untouched (customer-app-only slice, no
backend rebuild/test run needed). No PR opened per task scope: branch pushed for lead review.

## 9. S5a as-shipped addendum (2026-07-11, branch `feat/map-p2-s5a-filters`)

**Scope:** the filter system redesign: D2 (FilterSheet on SearchScreen, independent
per-surface state), D4 (retire `region` from customer-facing scope UI: audit only, no code
change needed), and GRILL Q4 (subcategory drill-down on `MapCategoryPills`). D3 (tag
surfacing) is explicitly OUT of S5a scope and stays open for a later S5 pickup.

**D4 evidence (audit, no change required):** grepped every client scope-pill surface
(`ScopePillRow.tsx`, `SearchScreen.tsx`'s `effectiveScopeFromMetaCascadedScope`,
`CategoryResultsScreen.tsx`) and the client `SearchParams` type
(`src/lib/api/discovery.ts:472`). `ScopePillRow`'s `Scope` type is already the locked
3-value `'nearby' | 'city' | 'platform'` with an explicit doc comment ("the backend `region`
value is reserved-for-future and explicitly NOT exposed"); `SearchParams.scope` already
excludes `'region'` with an inline comment to the same effect; `SearchScreen`'s cascaded-scope
mapper already collapses the wire's `'region'` value into the `'city'` PILL (never a distinct
pill). This was evidently done defensively in earlier Discovery-rebaseline work (Task 2.1.0
scope parity) even though D4 itself wasn't formally resolved until now. Backend `discoveryMetaSchema.scope`
enum keeps all four wire values (`nearby | city | region | platform`) unchanged: the backend
enum stays, per the decision's own framing.

**D2: FilterSheet comes to SearchScreen (`src/features/search/screens/SearchScreen.tsx`):**
new independent `filters` / `filterVisible` / `filterDraft` state (NOT shared with Map's or
Category's own state: only the `FilterSheet` COMPONENT and `FilterState` TYPE are shared).
The screen's own `useSearch` call now also composes `categoryId` / `sortBy` / `voucherTypes`
/ `amenityIds` / `openNow` from `filters` (previously only `q` / `lat` / `lng` / `scope`). A
new filter icon button sits inline with `ScopePillRow` (same row, button anchored right,
carries the active-filter count badge): placed only when `searchEnabled`.

**Entry-point badge (owner design brief item 1):** `FilterButtonBadge` (new,
`src/features/search/components/FilterButtonBadge.tsx`) replaces the boolean
`filter-active-dot` `View` that only ever existed on Map with a small numbered circle
(caps at "9+"), rendering `null` when the count is 0. Backing count comes from
`nonScopeFilterCount` (new, `src/features/search/utils/filterState.ts`): a direct
generalisation of MapScreen's pre-existing `hasNonScopeFilters` boolean into a number.
Deliberately EXCLUDES `categoryId`: `MapScreen.test.tsx`'s locked "filter button active-dot"
suite pins "does NOT show the active-dot when only categoryId is set" (category already has
its own visible affordance: the active pill turns brand-rose), so the badge stays
category-blind on all three surfaces for identical semantics (acceptance criterion 6). Same
testID (`filter-active-dot`) preserved so the existing Map assertions needed zero rewrites.

**The sheet (`FilterSheet.tsx` redesign):** new header row ("Filters" title + explicit close
`X`, previously the sheet had no dismiss affordance beyond the shared `BottomSheet`'s
grabber/tap-outside). Sections reordered to the brief's rhythm (Category/Subcategory stays
first as the foundational selector, then Sort → Voucher Type → Open Now → Amenities, with
`Divider`s between groups) and pill touch targets bumped to a 44pt `minHeight`. Footer is now
Reset (ghost button, `RotateCcw` icon, ONLY resets the draft: does not call `onApply` or
`onDismiss`) + the existing Apply button. New opt-in props, every one defaulting to
byte-identical pre-S5a behaviour when omitted (verified: `FilterSheet.test.tsx`'s original 20
tests pass unchanged): `baseFilters` (Reset's target, defaults to the new exported
`EMPTY_FILTERS`: CategoryResultsScreen passes `{ ...EMPTY_FILTERS, categoryId: routeId }` so
Reset can't filter the user out of the category page they're on), `liveCount` /
`liveCountPending` (drives the Apply button's count; falls back to the existing `resultCount`
prop when `undefined`/`null`), `onDraftChange` (fires on every draft change, including the
initial sync, so a parent can mirror the draft into its own state).

**Live result count (owner design brief item 2):** implemented, not fallen back to plain
"Apply": reuses `useSearch` (no new endpoint) via a new shared hook,
`useFilterPreviewCount` (`src/features/search/hooks/useFilterPreviewCount.ts`), debounced
350ms. Deliberate architecture choice: the live-count `useSearch` call is NOT made inside
`<FilterSheet>` itself: it is made by each SCREEN (Map / Search / CategoryResults), textually
BEFORE that screen's own existing `useSearch`/`useCategoryMerchants` call, with the resolved
count threaded down as the `liveCount` prop. Reason: `FilterSheet` mounts unconditionally as a
child of all three screens regardless of sheet visibility (confirmed:
`BottomSheet`'s `Modal` still executes its children's hooks), so a `useSearch` call living
inside `FilterSheet` would be the LAST `useSearch` invocation captured on every render :
directly colliding with `MapScreen.test.tsx`'s locked
`mockSearchCalls[mockSearchCalls.length - 1]` hook-call-ordering assertions (used by the
"hybrid hook switching" and "filtered-path bbox quantization + staleTime parity" suites).
Keeping the preview call textually first in each screen's body preserves that ordering
contract with zero rewrites to those pinned assertions. Each screen reports its FilterSheet's
draft via the new `onDraftChange` prop into a local `filterDraft` state, which
`useFilterPreviewCount` debounces and composes into `/search` params (categoryId / sortBy /
voucherTypes / amenityIds / openNow from the draft; q / lat / lng / scope / bbox from a
screen-supplied `baseParams`/`previewBaseParams`). Gated so the backend's own
"q OR categoryId OR bbox" requirement is honoured (`hasQueryableContext`): e.g. opening
Search's FilterSheet before typing anything correctly shows no live count and falls back to
`resultCount` (0 in that case) rather than firing a request that would 400.

**Applied-filters chips row (owner design brief item 3):** new `FilterChipsRow`
(`src/features/search/components/FilterChipsRow.tsx`), backed by a diff-based
`appliedFilterEntries`/`removeAppliedFilter` pair in `filterState.ts`: every FilterState field
that differs from a `baseFilters` (defaults to `EMPTY_FILTERS`) becomes one removable chip
(category/subcategory, sort, each voucher-type CHIP GROUP, each amenity, open-now), plus a
"Clear all" affordance once 2+ chips are showing. Unlike the button badge, this INCLUDES
category: it is a full audit trail of everything currently applied, not the narrower
"non-scope" badge semantics. The `baseFilters` parameterisation is what lets
CategoryResultsScreen show a chip ONLY for a genuine subcategory drill-down (never for the
route category itself, which is already communicated by the page title). Mounted directly
under `MapCategoryPills` on Map, inline with the header's filter button on Search, and under
`ScopePillRow` on CategoryResultsScreen. Uses the existing `FadeInDown` motion primitive
(`design-system/motion/FadeIn.tsx`) for its reveal: no new animation code.

**Subcategory drill-down on `MapCategoryPills` (GRILL Q4):** tapping a top-level pill keeps
its EXACT pre-existing behaviour (`onSelect(cat.id)`; MapScreen's `handleSelectCategory`
still owns tap-same-clears / tap-different-promotes-from-subcategory toggle semantics,
untouched). What's new: when the resulting `activeId` resolves (walking `parentId`) to a
top-level with children, a second, visually lighter row (outlined pills, no elevation, smaller
type) slides in beneath via `FadeInDown`: its subcategories plus an "All &lt;Parent&gt;" pill
to widen back out. No separate expand/collapse state was needed: the row's visibility is
purely derived from `activeId`, so selecting is the reveal trigger and clearing (`onSelect(null)`,
including the "All categories" pill) closes it automatically: "map stays clean at rest" falls
out of the derivation for free. `activeId` can be either a top-level id OR a subcategory id
(same contract `FilterSheet.categoryId` already uses); the top-level ancestor is resolved by
the same `parentId`-walk pattern FilterSheet's own drill-down uses, so a subcategory picked
from EITHER surface keeps both in sync and both correctly key `useEligibleAmenities` off the
resolved category: verified by a new `MapCategoryPills.test.tsx` test asserting a
subcategory-id `activeId` still highlights the correct parent pill.

**Shared-extraction summary (owner directive: "extract shared pieces rather than
duplicating"):** `src/hooks/useDebouncedValue.ts` (new, generic; `SearchScreen`'s previously
God-file-local `useDebounce` now delegates to it: zero behaviour change, confirmed by the
full SearchScreen suite passing unchanged); `src/features/search/utils/filterState.ts`
(`nonScopeFilterCount`, `appliedFilterEntries`, `removeAppliedFilter`: pure functions, no
React); `src/features/search/hooks/useFilterPreviewCount.ts`; `src/features/search/components/
FilterChipsRow.tsx` and `FilterButtonBadge.tsx`. `EMPTY_FILTERS` is now the single
canonical "all clear" `FilterState` (exported from `FilterSheet.tsx`), replacing THREE
independently-hand-written duplicates that previously lived one-per-screen (MapScreen's
`DEFAULT_FILTERS`, CategoryResultsScreen's inline object literal ×2, SearchScreen had none :
D2 is net-new there).

**MapScreen hunks (for any future S6/S2 reconciliation):** (1) new imports :
`useEligibleAmenities`, `EMPTY_FILTERS`, `FilterChipsRow`, `FilterButtonBadge`,
`nonScopeFilterCount`, `useFilterPreviewCount`/`FilterPreviewBaseParams`; (2) local
`DEFAULT_FILTERS` constant deleted, replaced by the imported `EMPTY_FILTERS` at both its call
sites (`useState` initialiser, `handleClearFilters`); (3) new `filterDraft` state +
`eligibleAmenitiesData` hook call (both declared AFTER the `filters` state: an initial
placement before it hit a genuine `used-before-declaration` TS error, moved and fixed); (4) new
`previewBaseParams` + `filterPreview = useFilterPreviewCount(...)` block inserted between
`quantizedQueryBbox` and the screen's own `searchResultQuery = useSearch(...)` call (ordering
is load-bearing: see the live-count architecture note above); (5) `<MapCategoryPills>` JSX
unchanged (same three props); (6) new `<FilterChipsRow>` JSX directly beneath it; (7) filter
button JSX: `SlidersHorizontal` unchanged, the inline `hasNonScopeFilters && <View
testID="filter-active-dot" .../>` replaced by `<FilterButtonBadge count=
{nonScopeFilterCount(filters)} />`; (8) `<FilterSheet>` JSX gains three new props
(`liveCount`, `liveCountPending`, `onDraftChange`); (9) the now-dead `filterActiveDot`
StyleSheet entry removed. No changes to bbox/pan/debounce/hybrid-hook-routing/carousel/pins
logic.

**Test updates:** `MapScreen.test.tsx`'s "tapping the same pill twice clears categoryId" test
updated (`getByText` → `getAllByText(...)[0]` for the SECOND press): once a category is
selected, its name now ALSO appears in the new `FilterChipsRow` chip beneath the pills
(mirrors the exact "active pill renders its label twice" precedent `FilterSheet.test.tsx`
already established for its own Category section); no other MapScreen assertion needed
touching. `MapCategoryPills.tsx`'s "All &lt;Parent&gt;" pill text changed from two JSX
children (`All {name}`) to one template-literal child (`` {`All ${name}`} ``): the
two-children form let React Native Testing Library's `getByText` match the SECOND child in
isolation, which incidentally equalled the parent's own bare name and collided with the
top-level pill's `getByText`. New coverage: `FilterSheet.test.tsx` +8 tests (S5a redesign
describe block: header/close, Reset with default + custom `baseFilters`, `liveCount` override
+ null-fallback, `onDraftChange`); `MapCategoryPills.test.tsx` (new, 9 tests); `filterState.test.ts`
(new, 18 tests); `useFilterPreviewCount.test.tsx` (new, 9 tests); `useDebouncedValue.test.ts`
(new, 4 tests); `FilterButtonBadge.test.tsx` (new, 5 tests); `FilterChipsRow.test.tsx` (new,
7 tests). Six pre-existing `SearchScreen.*.test.tsx` files gained a `jest.mock` for
`useCategories`/`useEligibleAmenities` (SearchScreen now calls both, for the FilterSheet +
chips row) with no assertion changes.

**Deviations from the task brief:** (1) the live-count query intentionally lives in each
SCREEN, not inside `<FilterSheet>`: see the architecture note above; this is a structural
deviation from the most literal reading of "FilterSheet... running the existing query with
draft filters" but preserves the exact same user-visible outcome (a debounced live count on
the Apply button) without breaking the locked Map hook-call-ordering tests. (2) D4 required no
code change: already satisfied by prior Discovery-rebaseline work; recorded here as evidence
rather than a diff. (3) D3 (tag surfacing) is explicitly out of scope, not attempted.

**Verification:** map + search subsets (which contain every touched suite plus every new
suite) fully green in one run: 50 suites / 437 tests. Full-suite runs on this machine flaked
under parallel-worker resource contention (two overlapping full runs; 5s-timeout failures
concentrated in suites this slice never touched: voucher, merchant, profile, home; individual
suites reporting up to 1221s wall time); every touched suite that appeared in a contended
failure list (`useFilterPreviewCount.test.tsx`, `MapScreen.focusLifecycle.test.tsx`,
`SearchScreen.placeFallback.test.tsx`, `MapScreen.accumulation.test.tsx`,
`MapScreen.carouselSync.test.tsx`, `SearchScreen.locality.test.tsx`) was re-run in isolation
and passed cleanly: contention, not regression. CI runs the full matrix as the authoritative
gate. Backend untouched (customer-app-only slice). No PR opened per task scope: branch pushed
for lead review.
