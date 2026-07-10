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
| S4 | Cards + list: carousel card parity with Home language; MapListView → shared BranchTile rows (hearts); sort selector; half-sheet resize audit | none | customer-app | Safe after S1 |
| S5 | Filter/search coherence: FilterSheet on SearchScreen (D2), subcategory drill on pills, tags surfacing (D3), `region` scope re-add or retire (D4) | none | customer-app | After owner D2-D4 |
| S6 | Platform (propose-only): discovery rate tier, server in-area caching, pin-only lite endpoint, gazetteer LocationSearch, marker native-image migration | TBD | backend | PROPOSED, not scheduled; needs measurement first |

## 4. Decision register

OWNER decisions: **D1: RESOLVED** (owner 2026-07-10, artifact
`280f262f-2728-4968-af93-ace7dbb27bb5`): pin visual direction is Option A: teardrop pins
34×44 (white 2px keyline, drop shadow) filled with the category `pinColour`, white
stroke-style category icon inside; selected pin grows one step (~42×54) + a brand-red pulse
ring (shipped static: see the S3 as-shipped addendum §7 for why); navy #010C35 44px cluster
circles with 3px white border + white count; name chips at close zoom, density-gated. S3
implements this (as-shipped addendum below records the exact shipped geometry/behaviour
where it differs in specifics from the brief). **D2** FilterSheet on SearchScreen (recommend
yes, for one coherent system); **D3** which
tag types surface to customers (backend ready; product call); **D4** `region` scope: re-add
to clients or retire the enum value. NO provider/billable/schema decisions are required by
S0-S5 (Mapbox exploration from the mockups is explicitly NOT proposed; staying on
react-native-maps).
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
