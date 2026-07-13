import React, { memo, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Marker, type Region } from 'react-native-maps'
import Svg, { Path, Circle } from 'react-native-svg'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated'
import { color, useMotionScale } from '@/design-system'
import { BranchTile } from '@/lib/api/discovery'
import {
  getCategoryPinGlyph,
  buildCategoryTreeIndex,
  resolveTopLevelCategoryName,
  resolveTopLevelPinColour,
  type CategoryTreeNode,
} from '../utils/categoryPinGlyph'
import { clusterBranchPins, type ClusterPoint } from '../utils/mapClustering'
import { selectChipCandidates } from '../utils/mapNameChipGate'
import { MapClusterMarker } from './MapClusterMarker'
import { MapNameChipMarker } from './MapNameChipMarker'

// §BC — track-then-freeze pattern for selection transitions.
//
// `tracksViewChanges={false}` is a perf-critical freeze that stops
// react-native-maps from re-rendering each marker's bitmap on every
// camera change. But it also caches the bitmap so aggressively that
// when the marker's child content changes (selection toggle), the
// affected pin disappears briefly during the native-side bitmap
// rebuild. The mechanism here re-enables `tracksViewChanges` for
// `SELECTION_TRACK_MS` so the new bitmap captures cleanly.
//
// §BI 2026-05-16 — bumped from 250ms to 1000ms. EAS preview QA
// post-§BF showed an intermittent missing-pin case on cold-mount /
// zoom-transition (e.g. London → Huddersfield → London, the Wagtail
// Hackney pin sometimes failed to render). Hypothesis: 250ms was
// enough for selection-transition recaptures but NOT always enough
// for the FIRST bitmap commit on cold mount under heavy frames
// (camera animation + N markers mounting simultaneously + JS thread
// under load). 1000ms gives iOS a wider safety margin to commit the
// first bitmap before the freeze restores. The perf cost is N extra
// frames of bitmap-tracking per marker on cold mount only — once
// the bitmap is captured, the freeze still applies for the rest of
// the session.
const SELECTION_TRACK_MS = 1000

// §BF — stable marker dimensions.
//
// On real iOS, §BC alone wasn't enough: the 34→42px size change on
// selection toggle caused the native bitmap regeneration to leave
// markers stuck-invisible after multiple tap interactions, only
// recovered by force-quitting the app. The fix is to keep the
// marker's outer layout-bounds CONSTANT across selected/unselected
// states. Selection emphasis is conveyed via a transform scale
// applied to the inner content — `transform: scale(...)` is a
// 2D affine compositing operation that doesn't change layout bounds,
// so the native marker bitmap dimensions stay the same and no
// regeneration is triggered.
//
// ── v2 (Map Phase 2 Slice S3, 2026-07-10, owner-approved Option A) ──
//
// Redesign: teardrop pin (was a circle+letter), category SVG glyph
// (was a letter), selected pulse ring, staggered drop-in. The §BC/§BF
// discipline above is a LOCKED invariant this redesign must (and
// does) preserve — only the VISUAL CONTENT inside the constant-bounds
// container changed:
//
//   - `CONTAINER_WIDTH`/`CONTAINER_HEIGHT` (60×63) replace the old
//     `MARKER_SIZE`/`MARKER_TAIL_HEIGHT` — engineered so the teardrop's
//     tip lands exactly at the container's bottom-centre (matching
//     react-native-maps' default `anchor={{x:0.5,y:1}}`, so no
//     `anchor` prop override is needed) AND there's headroom above the
//     teardrop's head for the pulse ring halo to render without
//     enlarging the declared container size when selected. The
//     container is IDENTICAL in every state — selected, unselected,
//     ring visible or not.
//   - The teardrop itself keeps the OLD 34-vs-42-equivalent trick:
//     its own intrinsic SVG size is fixed at the SELECTED size
//     (`PIN_WIDTH`×`PIN_HEIGHT` = 42×54, per the design brief), and
//     the UNSELECTED "smaller" look comes from `transform: scale(...)`
//     on its wrapping View (`INNER_SCALE_UNSELECTED`) — SAME mechanism
//     as before, just applied to an SVG teardrop instead of a circle.
//   - The pulse ring is a SEPARATE, always-STATIC (non-animated)
//     element inside the same constant-bounds container, toggled via
//     OPACITY only (not size) — see the "pulse ring safety" note on
//     `PulseRing` below for why it's static rather than animated.
//   - The drop-in entrance animation reuses the EXISTING cold-mount
//     `tracksViewChanges=true` window (see `MapPinMarker`) rather than
//     opening a new one — see that component's comment for the safety
//     argument.
const PIN_WIDTH  = 42
const PIN_HEIGHT = 54
const RING_SIZE   = 60
// Container is exactly RING_SIZE wide (ring is the widest element) and
// tall enough that the teardrop's tip sits at the very bottom AND the
// ring's top edge sits at the very top — see the worked geometry in
// the header comment above.
const CONTAINER_WIDTH  = RING_SIZE
const CONTAINER_HEIGHT = RING_SIZE - PIN_WIDTH / 2 + PIN_HEIGHT // 60 - 21 + 54 = 63
const TEARDROP_LEFT = (CONTAINER_WIDTH - PIN_WIDTH) / 2
const TEARDROP_TOP  = CONTAINER_HEIGHT - PIN_HEIGHT
// The ring/glyph share ONE centre point: the teardrop's own head
// centre (a teardrop's circular head has diameter = its width, so its
// local centre is at (width/2, width/2)), offset into container space.
const HEAD_CENTER_X = TEARDROP_LEFT + PIN_WIDTH / 2
const HEAD_CENTER_Y = TEARDROP_TOP + PIN_WIDTH / 2
const GLYPH_SIZE = 16
const INNER_SCALE_UNSELECTED = 0.81 // ≈ 34/42 — preserves the old visual feel, now applied to the teardrop

// ── Voucher-count badge: REMOVED (Map P2 W1.1 F14, owner decision W2-D6) ──
//
// The S5b Task 4a badge (small count circle at the pin's top-right, W1's
// F2 repositioned it onto the head shoulder) is deleted per the owner's
// round-2 W2 decision brought forward: pins carry NO count at all (no
// stub, no badge, no bare number). The voucher count returns inside the
// W2 close-zoom ticket lockup with an explanatory cue ("N vouchers" +
// red ticket mark), never as a bare figure. Removing pin CONTENT does
// not touch the §BF constant-outer-bounds contract: CONTAINER_WIDTH x
// CONTAINER_HEIGHT and every remaining element's position are unchanged.

/**
 * Builds a classic teardrop/map-pin silhouette in a `w`×`h` box: a
 * circular head (diameter = w) tapering to a point at the bottom
 * centre. Parametrized rather than a hand-tuned magic path string, so
 * the geometry is legible and the same helper produces a correctly-
 * proportioned path at any size.
 */
function buildTeardropPath(w: number, h: number): string {
  const r = w / 2
  const cx = r
  const cy = r
  // Upper semicircle: left point → (clockwise, over the top) → right point.
  // Then two quadratic curves taper down to the tip at (cx, h), mirrored
  // left/right, using a control point offset proportional to the radius
  // for a smooth (not pointy-too-early) taper.
  const tipX = cx
  const tipY = h
  const ctrlOffsetX = r * 0.9
  const ctrlY = cy + r * 1.5
  return [
    `M${cx - r},${cy}`,
    `A${r},${r} 0 1,1 ${cx + r},${cy}`,
    `Q${cx + ctrlOffsetX},${ctrlY} ${tipX},${tipY}`,
    `Q${cx - ctrlOffsetX},${ctrlY} ${cx - r},${cy}`,
    'Z',
  ].join(' ')
}

const TEARDROP_PATH = buildTeardropPath(PIN_WIDTH, PIN_HEIGHT)

type Props = {
  branches:    BranchTile[]
  selectedId:  string | null
  onPress:     (branch: BranchTile) => void
  // Map Phase 2 Slice S3 additions — all OPTIONAL with safe defaults
  // so existing callers/tests that only pass branches/selectedId/onPress
  // keep working unchanged (no clustering/chips kick in without a real
  // viewport region; glyphs degrade to leaf-name matching without the
  // category tree).
  region?:          Region
  onClusterPress?:  (cluster: { latitude: number; longitude: number; branchIds: string[] }) => void
  // The full category list (top-levels + subcategories) from
  // useCategories — S3 correction 2026-07-10: the pin glyph's top-level
  // category name is resolved CLIENT-SIDE by walking parentId over this
  // tree, NOT from a wire field (see categoryPinGlyph.ts header).
  // Optional: while the categories query is loading (or for callers
  // that don't pass it), glyph matching degrades to the branch's own
  // leaf category name — pins never blank waiting on categories.
  categories?:      CategoryTreeNode[]
}

// A reasonably tight default viewport used when the caller doesn't
// pass `region` (existing test call sites, or any future consumer
// that doesn't care about clustering/chips). At this delta, branches
// separated by more than a few hundred metres never spuriously
// cluster — matches the granularity of `LONDON_REGION` in MapScreen.
const DEFAULT_REGION: Region = {
  latitude:       0,
  longitude:      0,
  latitudeDelta:  0.05,
  longitudeDelta: 0.05,
}

// Fold 1 (PR-3 Phase B) — read the backend-emitted
// `branch.merchant.primaryCategory.pinColour` first and only fall
// through to the hardcoded palette when that field is null/undefined.
// Closes the §7.2 visual-correctness gap where non-Big-Four
// categories all defaulted to `color.pin.default` (brandRose).
//
// S3 (2026-07-10) — the backend now resolves a parent-category
// fallback for `pinColour` itself (read-time, `enrichBranchTile`), so
// this client-side fallback chain is belt-and-braces for the
// remaining null case (neither the subcategory nor its parent has a
// configured colour) — final fallback to the hardcoded palette by
// category NAME, then to the flat default.
function getPinColor(branch: BranchTile): string {
  const backendPinColour = branch.merchant.primaryCategory?.pinColour
  if (backendPinColour) return backendPinColour
  const catName = branch.merchant.primaryCategory?.name?.toLowerCase() ?? ''
  if (catName.includes('food') || catName.includes('drink')) return color.pin.foodDrink
  if (catName.includes('beauty') || catName.includes('wellness')) return color.pin.beautyWellness
  if (catName.includes('fitness') || catName.includes('sport')) return color.pin.fitnessSport
  if (catName.includes('shopping')) return color.pin.shopping
  return color.pin.default
}

// Map P2 W1 (F7, 2026-07-12) — tree-aware pin colour.
//
// Walkthrough finding F7: subcategory-primary branches ("Cafe & Coffee",
// "Gift Shop") rendered the flat default red instead of their top-level
// category colour. Root cause: the backend read-time parent-fallback
// (`enrichBranchTile`, S3) IS correct and unit-tested, but it lives in
// the same UNMERGED map wave; when the app runs against a backend without
// it, those tiles arrive with `primaryCategory.pinColour: null`, and the
// keyword fallback in `getPinColor` above only matches TOP-LEVEL names
// ("Food & Drink"), never subcategory leaves ("Cafe & Coffee").
//
// Fix at the CLIENT seam using the SAME mechanism S3 chose for the pin
// GLYPH (not the forbidden "extend the keyword list" workaround): resolve
// the TOP-LEVEL category's `pinColour` from the category tree the app
// already loads via `useCategories` (walk `parentId`). This makes the pin
// colour correct regardless of backend deploy state. Ladder:
//   1. the tile's OWN backend `pinColour` (a fully-up-to-date backend
//      already merged own-else-parent — trust it first);
//   2. else the tree-resolved TOP-LEVEL `pinColour`;
//   3. else the legacy name-keyword palette (degrades on the tree-
//      resolved top-level NAME, which top-level names always match);
//   4. else the flat default.
// The category index is empty while `useCategories` loads, in which case
// this degrades to (3)/(4) — pins never blank waiting on it, exactly like
// the glyph resolver.
function resolvePinColorWithTree(
  branch: BranchTile,
  categoryIndex: ReadonlyMap<string, CategoryTreeNode>,
): string {
  const own = branch.merchant.primaryCategory?.pinColour
  if (own) return own
  const treeColour = resolveTopLevelPinColour(branch.merchant.primaryCategory, categoryIndex)
  if (treeColour) return treeColour
  const topLevelName = resolveTopLevelCategoryName(branch.merchant.primaryCategory, categoryIndex)
  const catName = (topLevelName ?? branch.merchant.primaryCategory?.name ?? '').toLowerCase()
  if (catName.includes('food') || catName.includes('drink')) return color.pin.foodDrink
  if (catName.includes('beauty') || catName.includes('wellness')) return color.pin.beautyWellness
  if (catName.includes('fitness') || catName.includes('sport')) return color.pin.fitnessSport
  if (catName.includes('shopping') || catName.includes('shop')) return color.pin.shopping
  return color.pin.default
}

// S3 (corrected 2026-07-10) — glyph selection resolves the TOP-LEVEL
// category name CLIENT-SIDE: `resolveTopLevelCategoryName` walks the
// branch's `primaryCategory.parentId` through the category tree index
// built from the `categories` prop (useCategories data). While that
// query hasn't loaded (empty index), it degrades to the leaf's own
// name — top-level primary categories still match correctly, and
// subcategory leaves get the default glyph until the categories query
// lands and the next render upgrades them. Pins never blank waiting.
// (The original push resolved this via a new `topLevelName` wire field;
// REVERTED — the installed builds' branch-tile schema is .strict(), so
// a new backend key would instantly fail the whole discovery parse on
// every existing build. See categoryPinGlyph.ts header.)
function getPinGlyphName(
  branch: BranchTile,
  categoryIndex: ReadonlyMap<string, CategoryTreeNode>,
): string | null {
  return resolveTopLevelCategoryName(branch.merchant.primaryCategory, categoryIndex)
}

// ── Pulse ring safety note ──────────────────────────────────────────
//
// The design brief specifies an ANIMATED brand-red pulse ring on the
// selected pin (0-motion under reduce-motion). react-native-maps
// Markers are rendered as a BITMAP SNAPSHOT of their JS content —
// `tracksViewChanges` controls whether that bitmap re-captures. A
// continuously-animated ring INSIDE a Marker would require
// `tracksViewChanges=true` for the ENTIRE animation duration (the
// bitmap has to be re-captured every frame to show motion), which is
// exactly the "animated bitmap re-render" perf trap this task was
// briefed to avoid — and is a stronger, more sustained version of the
// exact failure class §BC/§BF/§BI document (stuck-invisible markers
// after a bitmap regeneration races with an in-flight capture).
//
// This codebase has NO device-QA evidence for how short a per-frame
// (or per-step) `tracksViewChanges=true` window can safely be — the
// existing SELECTION_TRACK_MS (1000ms) was arrived at BECAUSE 250ms
// was observed to be unsafe for a ONE-TIME cold-mount capture on real
// iOS hardware (§BI). Inventing a shorter window for a REPEATING
// animation, with no way to device-test it in this environment, would
// be exactly the kind of unverified perf gamble this slice was briefed
// to avoid ("maximum effort... documented marker-bitmap perf
// minefields").
//
// A screen-space overlay (a plain Reanimated View positioned via
// lat/lng→pixel projection, entirely OUTSIDE react-native-maps'
// Marker/bitmap system) was also considered — genuinely animatable at
// 60fps with zero bitmap risk. It was rejected for THIS slice because
// correct projection under map rotation/pitch (both enabled by
// default on `MapView` and not touched here — see the "MapScreen
// hunks" note in the PR/report) needs either (a) disabling
// rotate/pitch (a map-wide interaction change outside this slice's
// explicitly scoped "pin-layer props, cluster tap handler, zoom
// threshold wiring" MapScreen edits) or (b) a full affine transform
// keyed to heading/pitch that has no precedent in this codebase and
// no way to be device-verified here.
//
// DECISION: ship a STATIC ring (two concentric stroked circles, brand
// red, toggled by OPACITY only — no size/position change, so it never
// touches the constant-outer-bounds contract or `tracksViewChanges`
// beyond the pin's OWN existing selection-toggle re-capture window).
// This is a deliberate, documented scope-down from "animated pulse" to
// "static selected-state ring" — applied uniformly (not just under
// reduce-motion, since there is no verified-safe animated path to fall
// back FROM). If/when device QA can characterise a safe short capture
// window (or the rotate/pitch-disable product decision is made), this
// is the place to revisit.
function PulseRing({ visible }: { visible: boolean }) {
  const cx = RING_SIZE / 2
  const cy = RING_SIZE / 2
  return (
    <View
      pointerEvents="none"
      style={[styles.ringWrap, { opacity: visible ? 1 : 0 }]}
    >
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle cx={cx} cy={cy} r={28} stroke={color.brandRose} strokeWidth={1} fill="none" opacity={0.18} />
        <Circle cx={cx} cy={cy} r={19} stroke={color.brandRose} strokeWidth={1.5} fill="none" opacity={0.32} />
      </Svg>
    </View>
  )
}

// ── Drop-in entrance ─────────────────────────────────────────────────
//
// Plays ONCE per marker instance (mount-only `useEffect`, empty deps —
// §BC/§BF guarantee this component never unmounts/remounts on
// selection toggle, so "once per instance" IS "once per pin's
// lifetime on screen"), and ONLY when the caller sets `dropIn=true` —
// `MapPins` sets this only for branches present in the FIRST non-empty
// render (spec §7.2 "on first viewport load"); branches that appear
// later from panning into a new area render immediately with
// `dropIn=false` (no motion), matching the spec literally rather than
// extending the choreography to every subsequent pan.
//
// SAFE by construction: this reuses the ALREADY-OPEN, ALREADY-
// JUSTIFIED `tracksViewChanges=true` cold-mount window from
// `MapPinMarker` (SELECTION_TRACK_MS = 1000ms, §BI) rather than
// opening any NEW tracked window. The animation (spring, capped
// stagger delay ≤ 300ms + typical settle ≤ ~450ms ≈ 750ms worst case)
// comfortably finishes and settles BEFORE the 1000ms freeze re-engages,
// so the bitmap that gets frozen is the pin in its final, settled
// position — exactly as if no entrance animation had played, just
// arrived at more pleasantly. No additional bitmap-capture risk.
const DROP_SPRING_CONFIG = { damping: 16, stiffness: 180 }

function useDropInStyle(playDropIn: boolean, delayMs: number) {
  const motion = useMotionScale()
  const progress = useSharedValue(playDropIn && motion > 0 ? 0 : 1)
  useEffect(() => {
    if (!playDropIn || motion <= 0) {
      progress.value = 1 // reduce-motion / not requested: settle instantly, no motion
      return
    }
    progress.value = withDelay(delayMs, withSpring(1, DROP_SPRING_CONFIG))
    // Mount-only by design — see header comment. `delayMs`/`playDropIn`
    // are fixed for a marker instance's whole lifetime (computed once
    // by the parent from the initial-load snapshot).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return useAnimatedStyle(() => ({
    opacity:   progress.value,
    transform: [{ translateY: (1 - progress.value) * -14 }],
  }))
}

// Exported for §BF stable-dimensions tests. Not part of the public
// component API.
export function CustomPin({
  branch,
  selected,
  dropIn = false,
  dropInDelayMs = 0,
  glyphName,
  pinColor: pinColorProp,
}: {
  branch: BranchTile
  selected: boolean
  /** Play the staggered drop-in entrance once on mount. Default false
   *  keeps pre-S3 call sites (and any consumer that doesn't care about
   *  the entrance choreography) unaffected. */
  dropIn?: boolean
  dropInDelayMs?: number
  /** Resolved TOP-LEVEL category name for glyph selection — computed by
   *  <MapPins> via the client-side category-tree walk (S3 correction:
   *  never a wire field). Optional: direct renders (tests, future
   *  consumers without the tree) degrade to the branch's own leaf
   *  category name. */
  glyphName?: string | null
  /** Map P2 W1 (F7) — resolved pin colour, computed by <MapPins> via the
   *  client-side category-tree walk (`resolvePinColorWithTree`) so a
   *  subcategory-primary branch inherits its top-level colour even when
   *  the backend hasn't merged the parent-fallback yet. Optional: direct
   *  renders (tests, consumers without the tree) fall back to the
   *  tree-free `getPinColor(branch)` — backend colour, then name-keyword
   *  palette, then default. */
  pinColor?: string
}) {
  const pinColor = pinColorProp ?? getPinColor(branch)
  const Glyph = getCategoryPinGlyph(glyphName ?? branch.merchant.primaryCategory?.name ?? null)
  // §BF — outer marker bounds stay constant (CONTAINER_WIDTH ×
  // CONTAINER_HEIGHT). The inner teardrop uses transform: scale to
  // express the unselected visual size. Layout bounds don't change →
  // native marker bitmap dimensions don't change → no regeneration
  // trigger on selection toggle.
  const innerScale = selected ? 1.0 : INNER_SCALE_UNSELECTED
  const dropInStyle = useDropInStyle(dropIn, dropInDelayMs)

  return (
    <View
      testID={`custom-pin-${branch.id}`}
      style={styles.pinContainer}
    >
      <Animated.View style={[styles.dropInWrap, dropInStyle]}>
        <PulseRing visible={selected} />
        <View
          testID={`pin-teardrop-wrap-${branch.id}`}
          style={[
            styles.teardropWrap,
            { transform: [{ scale: innerScale }] },
          ]}
        >
          <Svg width={PIN_WIDTH} height={PIN_HEIGHT}>
            <Path
              testID={`pin-shape-${branch.id}`}
              d={TEARDROP_PATH}
              fill={pinColor}
              stroke="#FFFFFF"
              strokeWidth={2}
            />
          </Svg>
          <View style={styles.glyphWrap} pointerEvents="none">
            <Glyph size={GLYPH_SIZE} color="#FFFFFF" strokeWidth={2.5} />
          </View>
        </View>
        {/* Voucher-count badge REMOVED here (W1.1 F14 / owner W2-D6) —
            see the "Voucher-count badge: REMOVED" comment above. */}
      </Animated.View>
    </View>
  )
}

// Map P2 W1 (F1, 2026-07-12) — `MapPinMarker` is `React.memo`-wrapped
// (see `export ... = memo(MapPinMarkerBase)` below).
//
// Walkthrough finding F1 (CRITICAL): pins intermittently teleported to
// the screen's top-left origin and flickered/vanished during zoom. Root
// cause proven at the source: <MapPins> recomputes its clusters/singles/
// chip arrays whenever the region changes, AND the `branches` array it
// receives is a fresh reference on every region change (the region-
// accumulation store returns a new `Array.from(...)` each render). That
// re-runs the singles `.map`, producing fresh marker elements every
// region delta. WITHOUT memoization, react-native-maps re-renders each
// `tracksViewChanges={false}` (frozen) marker; on iOS a frozen
// annotation view whose JS content re-renders relocates to the map
// view's ORIGIN until its bitmap re-captures — the exact top-left
// teleport the owner saw (same failure family as §BC/§BF/§BI).
//
// Fix: memo the marker subtree so a frozen pin whose data has NOT changed
// never re-renders on a pure region/pan/zoom delta. The branch object
// identity is stable across region changes (it comes from the store /
// live query, not rebuilt per render), and <MapPins> now passes a stable
// `onPress` plus value-stable `glyphName`/`pinColor` primitives, so the
// default shallow prop compare bails out correctly. The §BC/§BF/§BI
// invariants are PRESERVED unchanged: the freeze/thaw window
// (SELECTION_TRACK_MS) and constant outer bounds are untouched; this only
// stops SPURIOUS re-renders that were never supposed to happen.
function MapPinMarkerBase({
  branch,
  selected,
  onPress,
  dropIn,
  dropInDelayMs,
  glyphName,
  pinColor,
}: {
  branch: BranchTile
  selected: boolean
  onPress: (b: BranchTile) => void
  dropIn: boolean
  dropInDelayMs: number
  glyphName: string | null
  pinColor: string
}) {
  const { branchLatitude, branchLongitude } = branch
  // Initial render captures the first bitmap (tracks=true). After the
  // capture settles, freeze for perf. The effect re-enables tracking
  // whenever the marker's VISIBLE CONTENT genuinely changes so the new
  // bitmap captures cleanly without an unmount/remount flicker on the
  // affected pin:
  //   - `selected` (§BC — the original selection-toggle resize case);
  //   - Map P2 W1 (F1): `glyphName` / `pinColor` — these upgrade after
  //     mount (the categories query lands and resolves the top-level
  //     glyph/colour), and a frozen bitmap would otherwise keep showing
  //     the pre-upgrade content.
  //   - Map P2 W1.1 (F13/F14): `voucherCount` DROPPED from this list —
  //     the badge is removed (F14, owner W2-D6), so the count no longer
  //     appears anywhere in this marker's bitmap. This dependency list
  //     is kept deliberately IN LOCKSTEP with the memo comparator below:
  //     the comparator's fields are exactly the ways this marker can
  //     re-render, and each visual one re-opens the capture window here.
  const [tracks, setTracks] = useState(true)
  useEffect(() => {
    if (branchLatitude === null || branchLongitude === null) return
    setTracks(true)
    const t = setTimeout(() => setTracks(false), SELECTION_TRACK_MS)
    return () => clearTimeout(t)
  }, [selected, branchLatitude, branchLongitude, glyphName, pinColor])

  // Defensive client-side null-coord filter (PR-3 plan §6.3).
  // Backend `getInAreaBranches` is CONFIRMED_LOCATION_SET-only
  // (MANUALLY_CONFIRMED + ADDRESS_GEOCODED; Branch Location Trust Slice 1
  // spec 2026-07-09 §2.3) at the SQL predicate — POSTCODE_CENTROID /
  // NEEDS_REVIEW branches never leave the database on this route, so
  // `branchLatitude` / `branchLongitude` arrive non-null in practice.
  // This guard is belt-and-braces
  // against (a) a future backend predicate regression, (b) a fixture
  // mistake injecting null-coord rows directly into <MapPins>,
  // (c) malformed wire data from a serialization bug.
  if (branchLatitude === null || branchLongitude === null) return null

  return (
    <Marker
      identifier={branch.id}
      coordinate={{ latitude: branchLatitude, longitude: branchLongitude }}
      onPress={() => onPress(branch)}
      tracksViewChanges={tracks}
    >
      <CustomPin branch={branch} selected={selected} dropIn={dropIn} dropInDelayMs={dropInDelayMs} glyphName={glyphName} pinColor={pinColor} />
    </Marker>
  )
}

// Map P2 W1.1 (F13) — custom PRIMITIVE-FIELD comparator, hardening the
// W1 memo. W1 used the default shallow compare, which leans on `branch`
// OBJECT identity; the owner's re-test showed the residual teleport
// because the accumulation store rebuilds branch objects when a tile
// refreshes (same id, new reference), so an identity-based memo still
// re-rendered frozen markers. The store now interns canonical branch
// objects (fix layer 1, regionAccumulationStore.ts), and this comparator
// is the belt-and-braces layer 2: compare exactly the fields that affect
// this marker's BITMAP or TAP TARGET, so even an unavoidable fresh
// reference with identical content cannot re-render a frozen pin.
//
// Compared fields (in lockstep with the track-reopen effect above):
//   - branch.id                  (Marker identifier + key)
//   - branch.branchLatitude/Longitude (coordinate)
//   - selected                   (§BC resize/ring toggle)
//   - glyphName / pinColor       (bitmap content)
//   - dropIn / dropInDelayMs     (fixed per marker lifetime; cheap)
//   - onPress                    (tap behaviour; stable via branchesRef)
// NOT compared: the rest of the `branch` object — nothing else renders
// inside this marker (the name/save-chip is a SEPARATE marker; the
// voucher-count badge was removed in F14). A skipped re-render keeps the
// OLD branch reference in the `onPress` closure; the handler only reads
// `branch.id` (see MapScreen.handleBranchPress), so a content-equal
// stale reference is harmless by contract.
const MapPinMarker = memo(
  MapPinMarkerBase,
  (prev, next) =>
    prev.branch.id === next.branch.id &&
    prev.branch.branchLatitude === next.branch.branchLatitude &&
    prev.branch.branchLongitude === next.branch.branchLongitude &&
    prev.selected === next.selected &&
    prev.glyphName === next.glyphName &&
    prev.pinColor === next.pinColor &&
    prev.dropIn === next.dropIn &&
    prev.dropInDelayMs === next.dropInDelayMs &&
    prev.onPress === next.onPress,
)

// Staggered drop-in constants (spec §7.2 "Drop animation: pinDrop
// 500ms spring, staggered per pin"). Capped so the LAST staggered
// pin's total (delay + settle) stays comfortably inside the
// SELECTION_TRACK_MS cold-mount window — see `useDropInStyle`'s
// header comment for the safety argument.
const DROP_STAGGER_STEP_MS = 25
const DROP_STAGGER_MAX_MS  = 300

export function MapPins({ branches, selectedId, onPress, region, onClusterPress, categories }: Props) {
  const effectiveRegion = region ?? DEFAULT_REGION

  // S3 correction — client-side category-tree index for the pin-glyph
  // top-level resolution (see categoryPinGlyph.ts header). Memoized on
  // the categories array identity; useCategories' 5-minute staleTime
  // keeps that identity stable between fetches. Empty map while the
  // categories query is loading — `resolveTopLevelCategoryName` then
  // degrades to the leaf's own name, so pins never blank on it.
  const categoryIndex = useMemo(() => buildCategoryTreeIndex(categories), [categories])

  // "Staggered drop-in on first viewport load" (spec §7.2) — captures
  // the branch-id → stagger-index map from the FIRST non-empty render
  // only. Branches present in that first batch get a staggered delay;
  // anything appearing later (panned into a new area) gets dropIn=true
  // with delay=0 (a single settle-in, not a re-triggered cascade —
  // avoids a jarring repeated-choreography feel while panning).
  const initialOrderRef = useRef<Map<string, number> | null>(null)
  if (initialOrderRef.current === null && branches.length > 0) {
    const order = new Map<string, number>()
    branches.forEach((b, i) => order.set(b.id, i))
    initialOrderRef.current = order
  }

  // ── Clustering (S3 task 4; W2a round 3 rewrite) ─────────────────────
  // Hand-rolled deterministic DISTANCE-BASED clustering (union-find
  // single-linkage; no new dependency) — replaced the original grid
  // bucketing, whose fixed-origin cells made cluster/single membership
  // depend on grid PHASE and oscillate while zooming OUT (owner round-3
  // bug). See `mapClustering.ts` for the algorithm + the monotonicity
  // argument + the swap-in note re: supercluster.
  const validPoints: (ClusterPoint & { branch: BranchTile })[] = useMemo(
    () => branches
      .filter((b) => b.branchLatitude !== null && b.branchLongitude !== null)
      .map((b) => ({ id: b.id, latitude: b.branchLatitude as number, longitude: b.branchLongitude as number, branch: b })),
    [branches],
  )
  const { clusters, singles } = useMemo(
    () => clusterBranchPins(validPoints, effectiveRegion),
    // Map P2 W1 (F1) — `clusterBranchPins` derives its merge THRESHOLD
    // purely from the region DELTAS (zoom); pair separations are
    // absolute lat/lng differences, so the region CENTRE (latitude/
    // longitude) is not an input at all (true of both the original grid
    // and the round-3 distance-based rewrite). The pre-W1 deps listed
    // the centre too, which forced a full re-cluster on every pan even
    // though the output was identical — needless churn feeding the F1
    // teleport. Depending only on the deltas means clustering recomputes
    // on ZOOM, not on pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [validPoints, effectiveRegion.latitudeDelta, effectiveRegion.longitudeDelta],
  )
  const singleBranchesById = useMemo(
    () => new Map(validPoints.map((p) => [p.id, p.branch])),
    [validPoints],
  )

  // ── Name chips (S3 task 5) ───────────────────────────────────────────
  const chipCandidates = useMemo(
    () => selectChipCandidates(singles.map((s) => s.point), effectiveRegion),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [singles, effectiveRegion.latitude, effectiveRegion.longitude, effectiveRegion.latitudeDelta, effectiveRegion.longitudeDelta],
  )

  return (
    <>
      {singles.map(({ point: p }) => {
        const branch = singleBranchesById.get(p.id)
        if (!branch) return null
        // Spec §7.2 scopes the drop-in to "first viewport load" — only
        // branches present in the FIRST non-empty batch (captured by
        // `initialOrderRef`) get the entrance animation; anything that
        // appears later (panned into a new area) renders immediately
        // with no motion, matching the spec literally rather than
        // extending the choreography to every subsequent pan.
        const dropIndex = initialOrderRef.current?.get(branch.id)
        const dropIn = dropIndex !== undefined
        const dropInDelayMs = dropIndex !== undefined
          ? Math.min(dropIndex * DROP_STAGGER_STEP_MS, DROP_STAGGER_MAX_MS)
          : 0
        return (
          <MapPinMarker
            key={branch.id}
            branch={branch}
            selected={selectedId === branch.id}
            onPress={onPress}
            dropIn={dropIn}
            dropInDelayMs={dropInDelayMs}
            glyphName={getPinGlyphName(branch, categoryIndex)}
            pinColor={resolvePinColorWithTree(branch, categoryIndex)}
          />
        )
      })}

      {clusters.map((c) => (
        // Map P2 W1 (F1) — pass the STABLE `onClusterPress` straight
        // through (not a fresh arrow per render) plus the cluster's own
        // fields, so the memoized <MapClusterMarker> can bail on pan. The
        // marker builds the tap payload internally.
        <MapClusterMarker
          key={c.id}
          id={c.id}
          latitude={c.latitude}
          longitude={c.longitude}
          count={c.count}
          branchIds={c.points.map((p) => p.id)}
          onPress={onClusterPress}
        />
      ))}

      {chipCandidates.map((p) => {
        const branch = singleBranchesById.get(p.id)
        if (!branch) return null
        return (
          // Map P2 W2a — the close-zoom label is now the TICKET LOCKUP
          // (icon block + name + Save £X + "N vouchers" with a ticket mark).
          // It is fed the SAME resolved category colour (`pinColor`) and
          // top-level glyph name the pin uses, plus the voucher count (which
          // appears ONLY here, never on the pin — W2-D2/D6). All primitive/
          // value-stable, so its memo bail-out survives pan/zoom churn.
          <MapNameChipMarker
            key={`chip-${branch.id}`}
            id={branch.id}
            latitude={p.latitude}
            longitude={p.longitude}
            label={branch.branchName}
            pinColor={resolvePinColorWithTree(branch, categoryIndex)}
            glyphName={getPinGlyphName(branch, categoryIndex)}
            maxEstimatedSaving={branch.merchant.maxEstimatedSaving}
            voucherCount={branch.merchant.voucherCount}
          />
        )
      })}
    </>
  )
}

const styles = StyleSheet.create({
  // §BF — explicit outer bounds. Constant across every state (see the
  // "v2" header comment for the geometry this size was engineered
  // from). Stays constant across selected/unselected/ring-visible
  // states so native bitmap doesn't regenerate on selection toggle.
  pinContainer: {
    width:      CONTAINER_WIDTH,
    height:     CONTAINER_HEIGHT,
    alignItems: 'flex-start',
  },
  // Matches `pinContainer`'s own bounds exactly so the drop-in
  // animation's translateY/opacity has an explicitly-sized box to
  // apply to — avoids relying on RN's auto-size-from-content behaviour
  // for a View whose only children are position:'absolute' (which are
  // removed from normal flow and would leave an unstyled wrapper at
  // its default 0×0 auto size).
  dropInWrap: {
    width:  CONTAINER_WIDTH,
    height: CONTAINER_HEIGHT,
  },
  ringWrap: {
    position: 'absolute',
    left:     HEAD_CENTER_X - RING_SIZE / 2,
    top:      HEAD_CENTER_Y - RING_SIZE / 2,
    width:    RING_SIZE,
    height:   RING_SIZE,
  },
  // voucherBadge / voucherBadgeText styles removed (W1.1 F14, owner
  // W2-D6) along with the badge component itself.
  teardropWrap: {
    position: 'absolute',
    left:     TEARDROP_LEFT,
    top:      TEARDROP_TOP,
    width:    PIN_WIDTH,
    height:   PIN_HEIGHT,
    // Shadow (spec §7.2 / brief "drop shadow"). Applied to the wrapper
    // so it travels with the scale transform, matching the old
    // circle's shadow-on-the-scaled-element approach.
    shadowColor:   '#000',
    shadowOpacity: 0.22,
    shadowRadius:  4,
    shadowOffset:  { width: 0, height: 2 },
    elevation:     4,
  },
  glyphWrap: {
    position: 'absolute',
    left:     PIN_WIDTH / 2 - GLYPH_SIZE / 2,
    top:      PIN_WIDTH / 2 - GLYPH_SIZE / 2,
  },
})
