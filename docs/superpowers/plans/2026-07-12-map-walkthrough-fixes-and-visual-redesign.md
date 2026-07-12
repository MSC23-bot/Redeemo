# Map P2 walkthrough findings: fix slice (W1) + visual redesign (W2)

**Status:** W1 APPROVED-TO-BUILD (owner walkthrough feedback 2026-07-12, simulator device,
8 screenshots); W2 MOCKUP-GATED (owner asked for creative redesign; mockups go to owner
before implementation, D1-precedent).
**Tier:** 2 (multi-file customer-app work; this plan is the required doc).
**Parent programme:** `2026-07-10-map-phase-2-programme.md` (S0-S5b built; #490/#493 open
awaiting Codex). W1/W2 stack on `feat/map-p2-s5b-chrome` so the whole map wave composes.
**Routing (owner directive 2026-07-12):** Fable 5 leads design/orchestration/review;
Opus 4.8 implements; Sonnet 5 max effort for routine review tasks.

## 1. Walkthrough findings (owner + lead screenshot analysis, 2026-07-12 18:43-18:54)

Bugs (W1):

- **F1 pin teleport / zoom flicker (CRITICAL):** pins intermittently vanish from their
  coordinates and render at the SCREEN TOP-LEFT corner (two captured frames: 18:43:31 pin +
  badge at origin with map otherwise empty; 18:52 second occurrence while filter sheet open);
  zooming flickers/disappears pins. Lead hypothesis: frozen-marker child re-render — MapPins
  recomputes clusters/chips on EVERY region delta change (`effectiveRegion` in useMemo deps),
  re-rendering `tracksViewChanges={false}` markers; iOS annotation views relocate to the view
  origin until recapture (same failure family as §BC/§BF/§BI). Cluster↔single transitions
  also unmount/remount markers mid-gesture. Fix directions: recompute only on settled region
  (quantized deps), stable branch object identity from the accumulation store, React.memo the
  marker subtree, open a §BC-style track window when child content genuinely changes,
  cluster↔single hysteresis. §BC/§BF/§BI invariants are LOCKED and must be preserved.
- **F2 voucher badge reads dislocated:** badge anchors at the 60×63 container's top-right
  corner while the teardrop (scaled 0.81 unselected) sits centre-bottom — 15-20pt of empty
  air between pin head and badge; reads as a floating random number.
- **F3 badge/chip collision:** the name chip's decorative offset (`translateX 22 /
  translateY -44`, bottom-anchored at the same coordinate) lands the chip exactly in the
  badge zone — screenshot: red "2" covering "Store" in "The Kraft Store · Save £10".
- **F4 chip dislocated from pin:** the same approximate-offset approach floats the chip well
  above/right of the pin with no visual tether (owner: "the merchant name and save value is
  also dislocated from the pin").
- **F5 carousel clipping/spacing:** active card renders LEFT-CLIPPED (starts off-screen)
  with the next card crammed at a tiny gap (18:54 screenshot). Snap interval / content inset
  / separator geometry mismatch in the MapScreen carousel.
- **F6 distance flips 0.9 mi → 0.0 mi:** same store, one minute apart (18:53 vs 18:54).
  Suspect distance is computed from the moving map centre (query point) rather than the
  user's location context, or a swipe-triggered refetch rebased it. Root-cause; distance on
  cards must be stable and honest.
- **F7 category colours not reaching pins:** all 11 top-level categories carry distinct
  seeded `pinColour` values (`prisma/seed-data/categories.ts`), and the category pills show
  them — but Karaara (Indian Restaurant → Food & Drink, #E65100) and The Kraft Store
  (Gift Shop → Shopping, #7C4DFF) both rendered `color.pin.default` red. The backend
  read-time parent-fallback (`enrichBranchTile`, S3) or the in-area route's payload is not
  delivering `primaryCategory.pinColour`, and the client name-fallback ("indian restaurant",
  "gift shop") misses its keyword list. Root-cause server-side first; fix at the seam, not
  the client keyword list.

Design (W2, owner-commissioned, mockup-gated):

- **F8 pins:** owner wants voucher-themed, Redeemo-branded creative pins; category colours
  as the differentiator; the count badge integrated and self-explanatory; merchant name +
  "Save £X" attached to the pin as one lockup (name without pin context "becomes
  irrelevant"). 11 category glyph slugs already seeded (`pinIcon`) + lucide glyph system
  from S3; `assets/category-icons/` PNG sets exist for Home.
- **F9 list bottom sheet:** "generic and boring" — richer rows, better sort control, motion.
- **F10 filter sheet:** S5a layout is functional but "boring and generic" — friendlier,
  more visually pleasing, brand-forward; keep the live-count + chips + drill mechanics.
- **F11 carousel merchant card:** redesign structure/layout/sizing/alignment; not generic.

## 2. Slices

| # | Scope | Gate |
|---|---|---|
| W1 | F1-F7 fixes, surgical; no visual redesign beyond what the fix requires (W2 replaces visuals) | none: build now, PR stacked on S5b, Codex review |
| W2 | F8-F11 redesign: mockups first (pins + list sheet + filter sheet + card), owner picks/edits, then implement | OWNER mockup approval |

W2 direction pitched 2026-07-12 (artifact c92daa35-72b1-454c-bc8c-9f99dceb2470): TICKET-PIN
system: perforated voucher-ticket language as the map signature; close-zoom pin unfolds
into a full ticket lockup (icon block, name + Save £X, perforation, count) replacing the
separate name chip. Owner edits received same day (round 1, all applied to the board):

- **W2-D1 clusters are Redeemo red** (white ring + white count): supersedes the D1 navy
  cluster detail from the programme plan; red is the brand colour and must stand out.
- **W2-D2 the count is never a bare number:** a small red ticket mark accompanies the count
  in the pin stub at every zoom; users must be able to read it as "vouchers here" without
  prior learning. Close zoom spells it out ("N offers").
- **W2-D3 category filter chips carry the category icons** (the app's existing category
  icon set) tinted in each category's colour.
- **W2-D4 every voucher type gets its own icon** inside the mini-ticket chip (2 for 1
  paired tickets, Discount percent, Freebie gift, Spend & Save pound, etc.).
- **W2-D5 card fallbacks are brand-locked:** no banner photo = red-to-coral brand gradient
  (soft cream glow); no logo = navy tile with merchant initial. Never arbitrary colours.

Still open before build: final owner go on the updated board; unfolding-ticket-replaces-
name-chip stands unless the owner objects.

## 3. Boundaries

No schema migrations, no wire-shape additions without the tolerance-first standing rule
(branch-tile schema is `.strict()` on installed builds), no provider changes, no billable
runs. Locked invariants: §BC/§BF/§BI marker-bitmap discipline; L3 redaction; D10 indicator
semantics; no emojis; no em-dashes; brand colours via tokens. Customer-app tests on
Node 20.19.4. W1 must not regress the S5a/S5b pinned tests except where a fixed behaviour
was itself the pin (document each).

## 4. As-shipped addendum

### W1 (2026-07-12, branch `feat/map-p2-w1-walkthrough-fixes`, stacked on `feat/map-p2-s5b-chrome`)

Customer-app-only. Full customer-app jest green (324 suites / 3076 tests; map subset 27
suites / 258 tests, +20 new W1 regression tests). No backend code shipped in W1: see the F6
proposal below.

**F1 (pin teleport / zoom flicker) — CONFIRMED root cause + fix.** Proven cause: <MapPins>
receives a FRESH `branches` array reference on every region change (the region-accumulation
store returns a new `Array.from(...)` each render), which rebuilds the internal
clusters/singles arrays and re-runs the singles `.map`, re-rendering every
`tracksViewChanges={false}` (frozen) marker. On iOS a frozen annotation view whose JS content
re-renders relocates to the map-view ORIGIN until the bitmap re-captures: the top-left
teleport. Fixes (all preserve §BC/§BF/§BI byte-for-byte — the freeze/thaw window, constant
outer bounds and SELECTION_TRACK_MS are untouched):
  1. `MapPinMarker`, `MapNameChipMarker`, `MapClusterMarker` are now `React.memo`-wrapped, so
     a frozen marker whose data has not changed never re-renders on a pure pan/zoom delta.
     Branch object identity is stable across region changes (it comes from the store/live
     query, not rebuilt per render); the cluster marker uses a custom comparator that ignores
     its per-render `branchIds` array (unused downstream) and relies on the stable
     `onClusterPress`.
  2. Marker props are made referentially/value stable: `MapScreen.handleBranchPress` (the
     `onPress` fed to <MapPins>) now reads `branchesRef.current` instead of closing over
     `branches`, so its identity survives region churn; `glyphName` and the new `pinColor`
     are value-stable strings; `onClusterPress` was already `useCallback`d on the zoom deltas
     (stable on pan).
  3. The `tracksViewChanges` re-open window (§BC) is extended to genuine CONTENT changes
     (`glyphName` / `pinColor` / `voucherCount`, in addition to `selected`) so a post-mount
     upgrade (categories query lands; a refetch changes the badge) recaptures the frozen
     bitmap cleanly.
  4. The clustering `useMemo` deps dropped the region CENTRE (`latitude`/`longitude`):
     `clusterBranchPins` buckets points by absolute lat/lng and derives cell size only from
     the region DELTAS, so the centre was never an input — its presence forced a needless
     re-cluster on every pan.
  Deliberately NOT done: a stateful cluster↔single hysteresis machine. The teardrop teleport
  is caused by the frozen-marker re-render (now fixed by memo); cluster↔single transitions
  only happen on an actual zoom threshold crossing, and a hysteresis machine needs device-QA
  tuning of thresholds that cannot be characterised in this environment (same rationale as
  the §BI 250ms-vs-1000ms finding). Revisit trigger: device QA showing residual oscillation
  at a zoom boundary.

**F2 (voucher badge dislocated) — fixed (interim; W2 replaces pin visuals).** The badge was
anchored at the marker CONTAINER's bare top-right corner (`right: 0, top: 0`), but the resting
teardrop is scaled to `INNER_SCALE_UNSELECTED` about the teardrop-wrapper centre, pulling the
visible head down-and-in and leaving the badge floating. The badge is now positioned via
computed `left`/`top` on the SCALED head's 45deg top-right shoulder (derived from
`HEAD_VISIBLE_RADIUS` + the scaled head-centre Y), staying entirely inside the constant 60x63
bounds. Minimal, well-commented; §BF constant-outer-bounds untouched.

**F3 + F4 (chip/badge collision + chip dislocated) — fixed.** The chip's decorative offset
(`translateX 22, translateY -44`) landed it in the pin's top-right badge zone (F3) and read as
detached (F4). The chip is now centred over the pin (`translateX 0`) and lifted clear of the
whole 60x63 pin stack (`translateY -(PIN_STACK_HEIGHT + CHIP_GAP_ABOVE_PIN)` = -67), so it
tethers directly above the head for any name length (centre-anchored pill grows symmetrically)
and is provably disjoint from the badge zone (which lives inside the pin stack).

**F5 (carousel clipping/spacing) — CONFIRMED root cause + fix.** Cause: the ScrollView
combined `pagingEnabled` (snaps to the SCROLLVIEW FRAME width) with a `snapToInterval` equal to
the card width AND sat inside a horizontally-padded container, so the two snap mechanisms
disagreed on the page boundary; cards also had zero inter-card gap and no peek. Replaced with a
single standard peek-carousel geometry: full-width ScrollView, active card inset via
`contentContainerStyle` padding (`PAGE_INSET`), consistent `CARD_GAP`, modest `CARD_PEEK`, and
`snapToInterval = CARD_WIDTH + CARD_GAP` with `snapToAlignment="start"` (no `pagingEnabled`).
`PAGE_INSET + CARD_WIDTH + CARD_GAP + CARD_PEEK === SCREEN_WIDTH` by construction, pinned by a
test.

**F6 (distance flips 0.9 mi -> 0.0 mi) — CONFIRMED root cause; BACKEND FIX PROPOSED, not
shipped.** Proven at the seam by calling `getInAreaBranches` directly against the shared DB:
the in-area branch `distance`/`distanceMetres` is sourced from `rankBranchesV3(..., { effLoc:
viewportEffLoc })` (the VIEWPORT CENTRE), NOT from the user's location. The step-5 comment in
`getInAreaBranches` claims "the caller's lat/lng ... drives the per-tile distance display", but
the code passes `distance: t.distanceMetres` (viewport-ranked) and `enrichBranchTile` sets both
`distance` and `distanceMetres` from that input verbatim (it does not recompute from lat/lng).
So as the camera recentres on a pin (pin tap or carousel swipe both call
`animateCameraToBranch`), that store's distance collapses toward 0.0 mi. The live probe returned
Karaara at 171 m from a bbox centred on Karaara with `userId: null` and no lat/lng, proving the
viewport-centre source. This also affects the Map LIST rows (same in-area feed, via
`BranchTile size="compact"`).
  Proposed fix (Map-route-scoped; deferred to the lead per the "propose backend changes rather
  than make them" instruction, since it is a backend distance-semantics change even if scoped
  to the Map route): in `getInAreaBranches` step 5, compute the DISPLAY distance from the
  caller's `lat`/`lng` (GPS) against each branch's own coords when present, else `null` (mirror
  the exact `hasUserGps && hasExact ? haversineMetres(...) : null` pattern Home already uses in
  `fanOutMerchantToBranchInputs`), instead of passing `t.distanceMetres`. Ranking stays
  viewport-relative (rungs/proximity bands are correctly "near this area"); only the DISPLAYED
  distance becomes user-relative and stable, matching Home (which shows distance only for GPS,
  `effectiveLat = source==='coordinates' ? lat : null`). Wire-safe: `distance`/`distanceMetres`
  are existing fields; value-only change. `MapScreen` already passes GPS lat/lng to the in-area
  query, so no client change is needed for the core fix.

**F7 (category colours not reaching pins) — root-caused server-side; fixed at the CLIENT seam
(robust to backend deploy state).** The backend read-path is already CORRECT and unit-tested
on this stack: `BRANCH_TILE_SELECT` nests `primaryCategory.parent.pinColour`, `enrichBranchTile`
resolves `pinColour` as own-else-parent, the seed wires subcategory `parentId` + top-level
`pinColour`, and a live `getInAreaBranches` probe emitted `pinColour=#E65100` for Karaara
("Cafe & Coffee" -> Food & Drink) and `#7C4DFF` for a Shopping subcategory. The walkthrough
reproduced F7 because the app was tested against a backend WITHOUT the S3 parent-fallback (the
map wave, including that backend change, is unmerged; the running backend was effectively
`main`): a subcategory-primary tile then arrives with `pinColour: null` and the client's
name-keyword fallback only matches TOP-LEVEL names ("Food & Drink"), never leaves ("Cafe &
Coffee") -> flat default red. Fix at the client seam using the SAME mechanism S3 chose for the
GLYPH (explicitly NOT the forbidden "extend the keyword list" workaround): new
`resolveTopLevelPinColour` walks `parentId` over the already-loaded `useCategories` tree;
`<MapPins>.resolvePinColorWithTree` uses backend `pinColour` -> tree-resolved top-level colour
-> name-keyword palette (on the tree-resolved top-level name) -> default, and passes the result
to `CustomPin` (new optional `pinColor` prop) and the chip dot. This makes pin colour correct
regardless of backend deploy state. `CategoryTreeNode` gained an optional `pinColour` field.

**Pinned-test changes:** none regressed. All map suites are additive or unchanged; the only
existing behaviour touched by W1 that was itself pinned is the carousel snap geometry, whose
tests are new (no prior snap-geometry pin existed), and the pin/chip marker re-render behaviour,
where the existing §BC/§BI marker tests still pass unchanged (memoization does not alter the
freeze/thaw contract they protect).
