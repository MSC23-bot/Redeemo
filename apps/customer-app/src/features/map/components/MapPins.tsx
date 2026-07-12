import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Marker, type Region } from 'react-native-maps'
import Svg, { Path, Circle } from 'react-native-svg'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated'
import { Text, color, useMotionScale } from '@/design-system'
import { BranchTile } from '@/lib/api/discovery'
import {
  getCategoryPinGlyph,
  buildCategoryTreeIndex,
  resolveTopLevelCategoryName,
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

// ── Voucher-count badge (Map Phase 2 S5b Task 4a) ──────────────────
//
// Small white-keyline circle at the pin's top-right showing the
// branch's `voucherCount` (capped "9+"). §BC/§BF/§BI constant-outer-
// bounds rule: the badge must NOT grow the marker's declared
// CONTAINER_WIDTH × CONTAINER_HEIGHT bounds (that's what makes the
// bitmap-freeze discipline safe — see the file header). It doesn't
// need to: the container is already 60px wide and the teardrop's own
// right edge sits at `TEARDROP_LEFT + PIN_WIDTH` = 51px (9px short of
// the container's right edge), so a badge anchored at the container's
// OWN top-right corner (`right: 0, top: 0`) fits entirely inside
// bounds that are ALREADY allocated — no growth, no overflow, no risk
// to the native bitmap snapshot. It sits as a sibling of the teardrop
// (not a child of `teardropWrap`), so it stays a fixed on-screen size
// regardless of the pin's selected/unselected inner scale — the badge
// communicates DATA about the branch, not selection state, so it
// deliberately doesn't participate in that transform.
const VOUCHER_BADGE_SIZE = 16

function formatVoucherBadgeCount(voucherCount: number): string {
  return voucherCount > 9 ? '9+' : String(voucherCount)
}

function VoucherCountBadge({ voucherCount, id }: { voucherCount: number; id: string }) {
  if (voucherCount <= 0) return null
  return (
    <View testID={`pin-voucher-badge-${id}`} style={styles.voucherBadge} pointerEvents="none">
      <Text variant="label.md" style={styles.voucherBadgeText}>{formatVoucherBadgeCount(voucherCount)}</Text>
    </View>
  )
}

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
}) {
  const pinColor = getPinColor(branch)
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
        <VoucherCountBadge id={branch.id} voucherCount={branch.merchant.voucherCount} />
      </Animated.View>
    </View>
  )
}

function MapPinMarker({
  branch,
  selected,
  onPress,
  dropIn,
  dropInDelayMs,
  glyphName,
}: {
  branch: BranchTile
  selected: boolean
  onPress: (b: BranchTile) => void
  dropIn: boolean
  dropInDelayMs: number
  glyphName: string | null
}) {
  const { branchLatitude, branchLongitude } = branch
  // Initial render captures the first bitmap (tracks=true). After the
  // capture settles, freeze for perf. The effect re-enables tracking
  // every time `selected` toggles so the resize is captured cleanly
  // without an unmount/remount flicker on the affected pin.
  const [tracks, setTracks] = useState(true)
  useEffect(() => {
    if (branchLatitude === null || branchLongitude === null) return
    setTracks(true)
    const t = setTimeout(() => setTracks(false), SELECTION_TRACK_MS)
    return () => clearTimeout(t)
  }, [selected, branchLatitude, branchLongitude])

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
      <CustomPin branch={branch} selected={selected} dropIn={dropIn} dropInDelayMs={dropInDelayMs} glyphName={glyphName} />
    </Marker>
  )
}

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

  // ── Clustering (S3 task 4) ──────────────────────────────────────────
  // Hand-rolled deterministic grid clustering (no new dependency) —
  // see `mapClustering.ts` for the algorithm + swap-in note re:
  // supercluster if density ever demands it.
  const validPoints: (ClusterPoint & { branch: BranchTile })[] = useMemo(
    () => branches
      .filter((b) => b.branchLatitude !== null && b.branchLongitude !== null)
      .map((b) => ({ id: b.id, latitude: b.branchLatitude as number, longitude: b.branchLongitude as number, branch: b })),
    [branches],
  )
  const { clusters, singles } = useMemo(
    () => clusterBranchPins(validPoints, effectiveRegion),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [validPoints, effectiveRegion.latitude, effectiveRegion.longitude, effectiveRegion.latitudeDelta, effectiveRegion.longitudeDelta],
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
          />
        )
      })}

      {clusters.map((c) => (
        <MapClusterMarker
          key={c.id}
          id={c.id}
          latitude={c.latitude}
          longitude={c.longitude}
          count={c.count}
          onPress={() => onClusterPress?.({
            latitude:  c.latitude,
            longitude: c.longitude,
            branchIds: c.points.map((p) => p.id),
          })}
        />
      ))}

      {chipCandidates.map((p) => {
        const branch = singleBranchesById.get(p.id)
        if (!branch) return null
        return (
          <MapNameChipMarker
            key={`chip-${branch.id}`}
            id={branch.id}
            latitude={p.latitude}
            longitude={p.longitude}
            label={branch.branchName}
            dotColor={getPinColor(branch)}
            maxEstimatedSaving={branch.merchant.maxEstimatedSaving}
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
  // Map Phase 2 S5b Task 4a — voucher-count badge. Anchored to the
  // CONTAINER's own top-right corner (`right: 0, top: 0`), which is
  // ALREADY inside the constant CONTAINER_WIDTH × CONTAINER_HEIGHT
  // bounds (see the VOUCHER_BADGE_SIZE comment above) — no bounds
  // growth, so this never touches the §BF stable-dimensions contract.
  voucherBadge: {
    position:        'absolute',
    right:           0,
    top:             0,
    width:           VOUCHER_BADGE_SIZE,
    height:          VOUCHER_BADGE_SIZE,
    borderRadius:    VOUCHER_BADGE_SIZE / 2,
    backgroundColor: color.brandRose,
    borderWidth:     1.5,
    borderColor:     '#FFFFFF',
    alignItems:      'center',
    justifyContent:  'center',
  },
  voucherBadgeText: {
    color:      '#FFFFFF',
    fontFamily: 'Lato-Bold',
    fontSize:   9,
    lineHeight: 11,
  },
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
