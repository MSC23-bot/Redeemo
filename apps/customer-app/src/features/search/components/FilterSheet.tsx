import React, { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { View, ScrollView, StyleSheet, Pressable, type LayoutChangeEvent } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { LucideProps } from 'lucide-react-native'
import {
  X, RotateCcw, Copy, Percent, Gift, PoundSterling, Package, Clock, RefreshCw,
} from '@/design-system/icons'
import { Text, color, spacing, radius, useMotionScale } from '@/design-system'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { SegmentedControl } from '@/design-system/motion/SegmentedControl'
import { GradientBrand } from '@/design-system/components/GradientBrand'
import { Divider } from '@/design-system/components/Divider'
import { hexWithAlpha } from '@/design-system/utils/colorAlpha'
import { getCategoryPinGlyph } from '@/features/map/utils/categoryPinGlyph'
import { useCategories } from '@/hooks/useCategories'
import { useEligibleAmenities } from '@/hooks/useEligibleAmenities'

/**
 * FilterState — applied filters for SearchScreen / CategoryResultsScreen /
 * MapScreen.
 *
 * `categoryId` is the canonical category being filtered to. It can be
 * either a top-level id OR a subcategory id; the backend treats both
 * uniformly. There is no separate `subcategoryId` field — the FilterSheet
 * UI exposes a top-level / subcategory drill-down internally but the
 * effective filter is the deepest selected category id.
 *
 * Distance / minSaving / maxDistanceMiles fields from PR #4's pre-Plan-1.5
 * FilterState are intentionally NOT included here — both deferred to
 * Plan 2 per PR B's locked scope.
 */
export type FilterState = {
  categoryId:    string | null
  sortBy:        'relevance' | 'nearest' | 'top_rated' | 'highest_saving'
  voucherTypes:  string[]
  amenityIds:    string[]
  openNow:       boolean
}

// Map Phase 2 S5a — the canonical "nothing applied" filter state. Was
// previously duplicated as a local `DEFAULT_FILTERS` constant inside
// MapScreen; centralised here so every surface (and the shared
// filterState utils — nonScopeFilterCount / appliedFilterEntries) shares
// ONE definition instead of three drifting copies. Also doubles as the
// default RESET target (`baseFilters` prop, below) for surfaces that
// don't need a narrower one (Map, Search). CategoryResultsScreen passes
// its own `baseFilters` (route category + defaults) so Reset returns to
// "just this category page", not out of it.
export const EMPTY_FILTERS: FilterState = {
  categoryId:   null,
  sortBy:       'relevance',
  voucherTypes: [],
  amenityIds:   [],
  openNow:      false,
}

type Props = {
  visible:     boolean
  filters:     FilterState
  resultCount: number
  onApply:     (filters: FilterState) => void
  onDismiss:   () => void
  /**
   * Map Phase 2 S5a — the filter state the Reset button returns the DRAFT
   * to. Defaults to `EMPTY_FILTERS`. CategoryResultsScreen passes a
   * category-scoped base (`{ ...EMPTY_FILTERS, categoryId: routeId }`) so
   * Reset can't filter the user out of the category page they're on.
   */
  baseFilters?: FilterState
  /**
   * Map Phase 2 S5a — live result-count preview. The PARENT screen owns
   * the debounced query (via `useFilterPreviewCount`, run against the
   * screen's OWN `useSearch` call so hook-call ordering / test mocks stay
   * exactly where each screen's existing suite expects them — see the
   * hook's doc comment) and passes the resolved count down here. When
   * `undefined`/`null` (no context to preview against yet, e.g. Search
   * with an empty query, or the debounce hasn't settled) the Apply button
   * falls back to `resultCount` — the currently-APPLIED count — so the
   * button never shows a stale "0" or blank state.
   */
  liveCount?: number | null
  /** True while the live-count preview query is in flight. */
  liveCountPending?: boolean
  /**
   * Map Phase 2 S5a — fires on every draft change (including the initial
   * sync from `filters`) so the parent can drive `useFilterPreviewCount`
   * off the SAME draft the sheet is showing, without lifting the whole
   * draft-state up permanently (Apply/Dismiss/Reset stay sheet-local).
   */
  onDraftChange?: (draft: FilterState) => void
}

// Map Phase 2 S4 Task 3 — exported so MapListView's sort selector (spec
// §7.8) shares this exact list/label set instead of maintaining a second
// copy that could drift from FilterSheet's own options.
export const SORT_OPTIONS: { key: FilterState['sortBy']; label: string }[] = [
  { key: 'relevance',      label: 'Relevance' },
  { key: 'nearest',        label: 'Nearest' },
  { key: 'top_rated',      label: 'Top Rated' },
  { key: 'highest_saving', label: 'Highest Saving' },
]

// Map Phase 2 W2b round 2 — display-only segment labels for the ONE shared
// `<SegmentedControl>` ("Best saving" for `highest_saving`; "Top rated"
// drops the title-case second cap). Canonical keys/values unchanged; the
// canonical SORT_OPTIONS label stays the accessibilityLabel ("Sort by
// Top Rated"), preserving the pinned a11y contract. Defined HERE next to
// SORT_OPTIONS (the single source) and imported by MapListSortSelector so
// the FilterSheet's Sort By section and the Map list's sort selector render
// the IDENTICAL segment set.
export const SORT_DISPLAY_LABEL: Record<FilterState['sortBy'], string> = {
  relevance:      'Relevance',
  nearest:        'Nearest',
  top_rated:      'Top rated',
  highest_saving: 'Best saving',
}

export const SORT_SEGMENTS = SORT_OPTIONS.map((opt) => ({
  key:                opt.key,
  label:              SORT_DISPLAY_LABEL[opt.key],
  accessibilityLabel: `Sort by ${opt.label}`,
}))

// Map Phase 2 S0 (2026-07-10) — voucher-type label→enum mapping.
//
// PR B shipped display-only strings ('BOGO', 'Discount', 'Freebie',
// 'Spend & Save', 'Package Deal') straight into `FilterState.voucherTypes`,
// which the backend then matched against `VoucherType` verbatim
// (`prisma/schema.prisma`: BOGO, SPEND_AND_SAVE, DISCOUNT_FIXED,
// DISCOUNT_PERCENT, FREEBIE, PACKAGE_DEAL, TIME_LIMITED, REUSABLE). Only
// 'BOGO' happened to match; every other chip silently returned zero
// results (live bug, Map Phase 2 programme plan §1).
//
// Each chip now carries the REAL enum value(s) it sends — `FilterState`'s
// shape is unchanged (`voucherTypes: string[]`), it just now contains
// enum values instead of display strings. 'Discount' is a single chip
// that maps to BOTH DISCOUNT_FIXED and DISCOUNT_PERCENT (mirrors the
// existing collapse in `voucherTypeLabel`/`productCopy.ts`, which also
// treat the two as one user-facing "Discount" concept) — toggling it
// adds/removes both values together.
//
// TIME_LIMITED and REUSABLE are real, filterable voucher types with no
// owner-locked exclusion found in docs/memory — added as 'Time-Limited'
// and 'Reusable' chips so every backend enum value is reachable from the
// filter UI.
export type VoucherTypeChip = { label: string; values: string[] }

export const VOUCHER_TYPE_CHIPS: VoucherTypeChip[] = [
  { label: 'BOGO',         values: ['BOGO'] },
  { label: 'Discount',     values: ['DISCOUNT_FIXED', 'DISCOUNT_PERCENT'] },
  { label: 'Freebie',      values: ['FREEBIE'] },
  { label: 'Spend & Save', values: ['SPEND_AND_SAVE'] },
  { label: 'Package Deal', values: ['PACKAGE_DEAL'] },
  { label: 'Time-Limited', values: ['TIME_LIMITED'] },
  { label: 'Reusable',     values: ['REUSABLE'] },
]

// Map Phase 2 W2b (F10, W2-D4) — each voucher-type chip carries its own
// lucide glyph inside the mini-ticket shape. Keyed by the chip label
// (VOUCHER_TYPE_CHIPS above) so the two lists cannot drift. BOGO uses the
// paired-document Copy glyph ("2 for 1"); the icon inherits the chip's
// content colour (RN has no `currentColor`, so the colour is passed
// explicitly at the call site and tracks selected/unselected tint).
const VOUCHER_TYPE_ICON: Record<string, ComponentType<LucideProps>> = {
  'BOGO':         Copy,
  'Discount':     Percent,
  'Freebie':      Gift,
  'Spend & Save': PoundSterling,
  'Package Deal': Package,
  'Time-Limited': Clock,
  'Reusable':     RefreshCw,
}

// Map Phase 2 W2b (F10, W2-D3) — category chip icon tint. The categories
// payload already carries `pinColour` on top-levels (the same field the
// pins resolve); fall back to the default pin colour when a category has
// none, mirroring the pin resolver ladder's terminal rung.
function categoryIconColour(pinColour: string | null | undefined): string {
  return pinColour ?? color.pin.default
}

// Map Phase 2 W2b (F10) — subtle per-section selected-summary shown at the
// right of each section header, in brand red. Category / Sort / Open Now
// are single-state (so "1 selected" vs "Any"); Voucher Type / Amenities
// count. Deliberately NOT the chip labels themselves (a label duplicated
// into the header would break the FilterSheet suite's single-match
// `getByText` pins on the sort/voucher chips).
function summaryLabel(count: number): string {
  return count > 0 ? `${count} selected` : 'Any'
}

// ─── W2b round 3 ITEM 3a — measured mid-control fold ────────────────────────
//
// Owner round-2 feedback: a peeking section HEADER at the fold was too
// subtle a scroll cue. The fold must land MID-CONTROL: a chip row visibly
// half-cut is an unambiguous "there is more". Approach (documented per the
// brief): every section registers its container's y (relative to the
// scroll content) and its CONTROL block's rect (relative to the section)
// via onLayout; `resolveScrollFold` then picks the DEEPEST control whose
// midpoint falls inside the [FOLD_MIN, FOLD_MAX] band and sets the
// ScrollView's maxHeight to that midpoint — cutting that control in half
// by construction, whatever the section composition (subcategory row and
// amenities appear conditionally, shifting everything). When no control
// midpoint lands in the band (or before layout has fired, incl. jest,
// where onLayout never runs), the height falls back to the round-2 value.
export const SCROLL_FOLD_FALLBACK = 400
const FOLD_MIN = 300
const FOLD_MAX = 430

export function resolveScrollFold(
  blocks: readonly { top: number; height: number }[],
): number {
  let fold: number | null = null
  for (const b of [...blocks].sort((a, z) => a.top - z.top)) {
    const mid = b.top + b.height / 2
    if (mid >= FOLD_MIN && mid <= FOLD_MAX) fold = mid
  }
  return Math.round(fold ?? SCROLL_FOLD_FALLBACK)
}

// ─── W2b round 3 ITEM 3b — one-time scroll hint, per app session ────────────
//
// Module-level (not state): "once per session" means once per JS runtime,
// across every FilterSheet instance on every surface. Reduce-motion skips
// the hint entirely and deliberately does NOT consume the flag.
let scrollHintShownThisSession = false
export function __resetFilterSheetScrollHintForTests(): void {
  scrollHintShownThisSession = false
}

export function FilterSheet({
  visible, filters, resultCount, onApply, onDismiss,
  baseFilters, liveCount, liveCountPending, onDraftChange,
}: Props) {
  const [local, setLocal] = useState<FilterState>(filters)
  const { data: categoriesData } = useCategories()
  const allCategories = categoriesData?.categories ?? []

  // Sync local state when the parent's `filters` prop changes (e.g. apply
  // closes the sheet then re-opens with the new state).
  useEffect(() => {
    setLocal(filters)
  }, [filters])

  // Map Phase 2 S5a — report every draft change upward (incl. the initial
  // sync above) so the parent can run its debounced live-count preview
  // off the same draft the sheet is showing. Cheap no-op when the parent
  // doesn't pass a callback (opt-in — every existing FilterSheet call
  // site keeps working unchanged).
  useEffect(() => {
    onDraftChange?.(local)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local])

  // ─── W2b round 3 ITEM 3a — mid-control fold measurement ──────────────────
  // Each section registers TWO layouts: its container's y (a direct child
  // of the scroll content, so y is content-relative) and its control
  // block's rect (section-relative). Their sum gives the control's
  // content-coordinate top; `resolveScrollFold` picks the fold. Converges
  // in one pass: content-internal positions don't depend on the scroll
  // viewport's height, so changing maxHeight never re-shifts the blocks.
  const sectionTopsRef  = useRef<Record<string, number>>({})
  const controlRectsRef = useRef<Record<string, { y: number; h: number }>>({})
  const [scrollMaxHeight, setScrollMaxHeight] = useState(SCROLL_FOLD_FALLBACK)

  const recomputeFold = useCallback(() => {
    const blocks: { top: number; height: number }[] = []
    for (const key of Object.keys(controlRectsRef.current)) {
      const sectionTop = sectionTopsRef.current[key]
      const rect = controlRectsRef.current[key]
      if (sectionTop === undefined || rect === undefined) continue
      blocks.push({ top: sectionTop + rect.y, height: rect.h })
    }
    const next = resolveScrollFold(blocks)
    setScrollMaxHeight((prev) => (Math.abs(prev - next) > 1 ? next : prev))
  }, [])

  const onSectionLayout = useCallback(
    (key: string) => (e: LayoutChangeEvent) => {
      sectionTopsRef.current[key] = e.nativeEvent.layout.y
      recomputeFold()
    },
    [recomputeFold],
  )
  const onControlLayout = useCallback(
    (key: string) => (e: LayoutChangeEvent) => {
      const l = e.nativeEvent.layout
      controlRectsRef.current[key] = { y: l.y, h: l.height }
      recomputeFold()
    },
    [recomputeFold],
  )
  const dropSectionMeasurement = useCallback((key: string) => {
    // Conditional sections (subcategory, amenities) must not leave stale
    // rects behind when they unmount — the remaining sections' onLayout
    // refires as content shifts, triggering the recompute.
    delete sectionTopsRef.current[key]
    delete controlRectsRef.current[key]
  }, [])

  // ─── W2b round 3 ITEM 3b — one-time scroll hint on first open ────────────
  // After the sheet settles, gently nudge the content down ~24pt and
  // settle back, signalling scrollability. RN's scrollTo has no duration
  // parameter, so the two-step nudge (down at 450ms post-open, back 200ms
  // later; native scroll animation is ease-out) approximates the brief's
  // 350ms ease-out envelope. Reduce-motion: skipped entirely.
  const scrollRef = useRef<ScrollView>(null)
  const motionScale = useMotionScale()
  useEffect(() => {
    if (!visible || scrollHintShownThisSession || motionScale === 0) return
    scrollHintShownThisSession = true
    const down = setTimeout(() => { scrollRef.current?.scrollTo({ y: 24, animated: true }) }, 450)
    const back = setTimeout(() => { scrollRef.current?.scrollTo({ y: 0, animated: true }) }, 650)
    return () => { clearTimeout(down); clearTimeout(back) }
  }, [visible, motionScale])

  // Resolve the active top-level for the subcategory drill-down panel.
  // local.categoryId can be either a top-level id OR a subcategory id —
  // we walk to the parent (or use itself when no parent) to find which
  // top-level pill should appear selected.
  const { topLevels, activeTopLevelId, subcategories } = useMemo(() => {
    const tops = allCategories.filter((c) => c.parentId === null)
    const current = local.categoryId
      ? allCategories.find((c) => c.id === local.categoryId) ?? null
      : null
    const activeTop = current?.parentId ?? current?.id ?? null
    const subs = activeTop
      ? allCategories.filter((c) => c.parentId === activeTop)
      : []
    return { topLevels: tops, activeTopLevelId: activeTop, subcategories: subs }
  }, [allCategories, local.categoryId])

  // Eligible amenities are category-scoped. Hidden when no category is
  // selected (decision #3 — eligibility varies by category, so showing it
  // for a free-text search risks the user picking an amenity that filters
  // out otherwise-relevant results).
  const { data: amenitiesData } = useEligibleAmenities(local.categoryId)
  const eligibleAmenities = amenitiesData?.amenities ?? []

  function selectTopLevel(id: string) {
    setLocal((prev) => ({
      ...prev,
      // Tap-same → clear (deselect).
      // Tap-different (incl. parent of currently-selected subcategory) → set.
      // Note: tapping the parent pill while a subcategory is selected
      // PROMOTES to the parent (drops the subcategory) rather than clearing
      // — matches user intent of "broaden to all of this category".
      categoryId: prev.categoryId === id ? null : id,
      // Eligibility differs per category — clear amenities to avoid sending
      // amenityIds that don't apply under the new category.
      amenityIds: [],
    }))
  }

  function selectSubcategory(id: string) {
    setLocal((prev) => ({
      ...prev,
      // Toggling deselects the subcategory (falls back to the top-level).
      categoryId: prev.categoryId === id ? activeTopLevelId : id,
      amenityIds: [],
    }))
  }

  function setSortBy(key: FilterState['sortBy']) {
    setLocal((prev) => ({ ...prev, sortBy: key }))
  }

  // Toggles a chip's full `values` set together — a multi-value chip
  // (e.g. Discount → DISCOUNT_FIXED + DISCOUNT_PERCENT) is either fully
  // in `voucherTypes` or fully out, never half-applied. `active` reads
  // "every value present" so a chip only shows selected once its whole
  // group has landed.
  function toggleVoucherType(chip: VoucherTypeChip) {
    setLocal((prev) => {
      const active = chip.values.every((v) => prev.voucherTypes.includes(v))
      const withoutChip = prev.voucherTypes.filter((t) => !chip.values.includes(t))
      return {
        ...prev,
        voucherTypes: active ? withoutChip : [...withoutChip, ...chip.values],
      }
    })
  }

  function toggleAmenity(id: string) {
    setLocal((prev) => {
      const has = prev.amenityIds.includes(id)
      return {
        ...prev,
        amenityIds: has
          ? prev.amenityIds.filter((a) => a !== id)
          : [...prev.amenityIds, id],
      }
    })
  }

  function handleApply() {
    onApply(local)
  }

  function handleReset() {
    setLocal(baseFilters ?? EMPTY_FILTERS)
  }

  // Live-count fallback ladder: while the parent's debounced preview
  // hasn't resolved yet (or the surface didn't opt in), show the
  // currently-APPLIED count rather than nothing — never a stale "0" or a
  // blank button.
  const displayCount = liveCount ?? resultCount
  // W2b footer copy (owner brief): "Show N places", or "Show places" when
  // the count is unknown (no live context AND no applied count yet).
  const applyLabel = typeof displayCount === 'number'
    ? `Show ${displayCount} places`
    : 'Show places'

  // Map Phase 2 W2b — per-section selected summaries (brand-red, right of
  // each header). Category / Sort / Open Now are single-state.
  const categoryCount = local.categoryId !== null ? 1 : 0
  const subcategorySelected = local.categoryId !== null && local.categoryId !== activeTopLevelId
  const sortCount = local.sortBy !== 'relevance' ? 1 : 0
  const voucherTypeCount = VOUCHER_TYPE_CHIPS.filter((chip) =>
    chip.values.every((v) => local.voucherTypes.includes(v)),
  ).length

  // Map Phase 2 W2b — small-caps section header + subtle selected summary
  // in brand red. Reused across every section so the sheet reads as one
  // consistent, brand-forward system (F10).
  function SectionHeader({ label, summary }: { label: string; summary: string }) {
    return (
      <View style={styles.sectionHeader}>
        <Text variant="label.eyebrow" color="secondary" style={styles.sectionLabel}>
          {label}
        </Text>
        <Text style={styles.sectionSummary}>{summary}</Text>
      </View>
    )
  }

  // Round 3 ITEM 3a — conditional sections must not leave stale fold
  // measurements behind when hidden (the surviving sections' onLayout
  // refires as content shifts, which re-runs the recompute).
  if (!(activeTopLevelId !== null && subcategories.length > 0)) dropSectionMeasurement('subcategory')
  if (!(local.categoryId !== null && eligibleAmenities.length > 0)) dropSectionMeasurement('amenities')

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Filter results" surface="cream">
      {/* Header — title + explicit close. The sheet previously relied
          solely on the BottomSheet grabber / tap-outside to dismiss;
          an explicit affordance is a small, safe addition (owner
          "anchors, not a closed scope" directive). */}
      <View style={styles.header}>
        <Text variant="heading.md" style={styles.headerTitle}>Filters</Text>
        <Pressable onPress={onDismiss} accessibilityLabel="Close filters" hitSlop={10} style={styles.closeButton}>
          <X size={20} color={color.navy} />
        </Pressable>
      </View>

      {/* Scroll affordance (owner rounds 2+3: "I did not even realize I
          could scroll") — measures together: the fold is MEASURED to land
          mid-control (a half-cut chip row, round 3); a soft cream
          continuation fade floats above the footer; the scrollbar stays
          visible; a one-time per-session scroll hint nudges the content
          on first open. */}
      <View style={styles.scrollWrap}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
          style={[styles.scrollView, { maxHeight: scrollMaxHeight }]}
        >
        {/* Category section — TOP-LEVELS ONLY (filter to parentId === null).
            W2b v3 (W2-D3 + round-2 premium pass): white chip on the cream
            ground; the category glyph sits in a small round disc tinted at
            12% of that category's pinColour (icon full colour). Selected:
            the pill blooms the category colour (14% tint fill + 1.5px
            colour border, navy text) — colour with MEANING; red stays
            reserved for brand actions. */}
        {topLevels.length > 0 && (
          <View onLayout={onSectionLayout('category')}>
            <SectionHeader label="Category" summary={summaryLabel(categoryCount)} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
              onLayout={onControlLayout('category')}
            >
              {topLevels.map((cat) => {
                const active = activeTopLevelId === cat.id
                const Glyph = getCategoryPinGlyph(cat.name)
                const catColour = categoryIconColour(cat.pinColour)
                return (
                  <PressableScale key={cat.id} onPress={() => selectTopLevel(cat.id)} hapticStyle="light">
                    <View
                      style={[
                        styles.pill,
                        active && {
                          backgroundColor: hexWithAlpha(catColour, 0.14),
                          borderColor:     catColour,
                          borderWidth:     1.5,
                        },
                      ]}
                    >
                      <View style={[styles.iconDisc, { backgroundColor: active ? '#FFFFFF' : hexWithAlpha(catColour, 0.12) }]}>
                        <Glyph size={13} color={catColour} strokeWidth={2.2} />
                      </View>
                      <Text style={styles.pillText}>
                        {cat.name}
                      </Text>
                    </View>
                  </PressableScale>
                )
              })}
            </ScrollView>
          </View>
        )}

        {/* Subcategory drill-down — only when a top-level is selected and
            has ≥1 subcategory. Selected subcategories bloom the PARENT
            category's colour (same meaning system as the top-level row). */}
        {activeTopLevelId !== null && subcategories.length > 0 && (
          <View onLayout={onSectionLayout('subcategory')}>
            <SectionHeader label="Subcategory" summary={summaryLabel(subcategorySelected ? 1 : 0)} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
              onLayout={onControlLayout('subcategory')}
            >
              {subcategories.map((sub) => {
                const active = local.categoryId === sub.id
                const parentColour = categoryIconColour(
                  topLevels.find((t) => t.id === activeTopLevelId)?.pinColour,
                )
                return (
                  <PressableScale key={sub.id} onPress={() => selectSubcategory(sub.id)} hapticStyle="light">
                    <View
                      style={[
                        styles.pill,
                        active && {
                          backgroundColor: hexWithAlpha(parentColour, 0.14),
                          borderColor:     parentColour,
                          borderWidth:     1.5,
                        },
                      ]}
                    >
                      {active && (
                        <X size={12} color={color.navy} style={styles.pillIcon} />
                      )}
                      <Text style={styles.pillText}>
                        {sub.name}
                      </Text>
                    </View>
                  </PressableScale>
                )
              })}
            </ScrollView>
          </View>
        )}

        <Divider />

        {/* Sort by section — v3: the ONE shared segmented control (white
            track, sliding navy thumb), same component the Map list renders. */}
        <View onLayout={onSectionLayout('sort')}>
          <SectionHeader label="Sort By" summary={summaryLabel(sortCount)} />
          <View onLayout={onControlLayout('sort')}>
            <SegmentedControl
              segments={SORT_SEGMENTS}
              value={local.sortBy}
              onChange={setSortBy}
              testID="filter-sheet-sort-segmented"
            />
          </View>
        </View>

        {/* Voucher type section — v3 (W2-D4): true TICKET silhouettes.
            White body with two cream side notches (absolutely positioned
            circles clipped at the mid edges), a red dashed perforation
            inside the left edge, and the per-type glyph in coral. Selected:
            warm red tint fill + 1.5px red border (brand action family). */}
        <View onLayout={onSectionLayout('voucherType')}>
          <SectionHeader label="Voucher Type" summary={summaryLabel(voucherTypeCount)} />
          <View style={styles.pillWrap} onLayout={onControlLayout('voucherType')}>
            {VOUCHER_TYPE_CHIPS.map((chip) => {
              const active = chip.values.every((v) => local.voucherTypes.includes(v))
              const Glyph = VOUCHER_TYPE_ICON[chip.label]
              return (
                <PressableScale key={chip.label} onPress={() => toggleVoucherType(chip)} hapticStyle="light">
                  <View style={[styles.ticketChip, active && styles.ticketChipActive]}>
                    <View style={styles.ticketNotchLeft} />
                    <View style={styles.ticketNotchRight} />
                    <View style={styles.ticketPerforation} />
                    {Glyph ? <Glyph size={13} color={color.brandCoral} strokeWidth={2.2} style={styles.pillIcon} /> : null}
                    <Text style={styles.pillText}>
                      {chip.label}
                    </Text>
                  </View>
                </PressableScale>
              )
            })}
          </View>
        </View>

        {/* Open now section — chip-style toggle (same FilterState.openNow
            semantics). v3 selected state: navy fill, white text (navy ink
            = state, red = brand action, category colour = identity). */}
        <View onLayout={onSectionLayout('openNow')}>
          <SectionHeader label="Open Now" summary={local.openNow ? 'On' : 'Any'} />
          <View style={styles.pillWrap} onLayout={onControlLayout('openNow')}>
            <Pressable
              onPress={() => setLocal((prev) => ({ ...prev, openNow: !prev.openNow }))}
              accessibilityRole="button"
              accessibilityLabel="Open now filter"
              accessibilityState={{ selected: local.openNow }}
            >
              <View style={[styles.pill, local.openNow && styles.pillNavyActive]}>
                <Clock size={13} color={local.openNow ? color.onBrand : color.navy} strokeWidth={2.2} style={styles.pillIcon} />
                <Text style={[styles.pillText, local.openNow && styles.pillTextActive]}>
                  Open now
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Amenities — hidden until a category is selected (decision #3).
            Pulls real Amenity.id UUIDs from /categories/:id/amenities so
            the filter can actually match merchants on the backend. */}
        {local.categoryId !== null && eligibleAmenities.length > 0 && (
          <View onLayout={onSectionLayout('amenities')}>
            <Divider />
            <SectionHeader label="Amenities" summary={summaryLabel(local.amenityIds.length)} />
            <View style={styles.pillWrap} onLayout={onControlLayout('amenities')}>
              {eligibleAmenities.map((amenity) => {
                const active = local.amenityIds.includes(amenity.id)
                return (
                  <PressableScale key={amenity.id} onPress={() => toggleAmenity(amenity.id)} hapticStyle="light">
                    <View style={[styles.pill, active && styles.pillNavyActive]}>
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>
                        {amenity.name}
                      </Text>
                    </View>
                  </PressableScale>
                )
              })}
            </View>
          </View>
        )}
        </ScrollView>

        {/* Continuation cue — cream fade over the last visible strip of
            content, floating above the footer. Purely visual. */}
        <LinearGradient
          colors={['rgba(255,249,245,0)', color.cream]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.scrollFade}
          pointerEvents="none"
        />
      </View>

      {/* Footer — Reset (draft-only, does not close the sheet) + Apply
          (brand gradient, shows the live/fallback place count). W2b copy:
          "Show N places" (owner brief), "Show places" when unknown. The
          live-count HOOK stays in the parent screen (locked pin); the
          sheet only renders the resolved count. v3: hairline top border +
          slight upward shadow keep the footer visually separate from the
          scrolling content. */}
      <View style={styles.footer}>
        <PressableScale onPress={handleReset} accessibilityLabel="Reset filters" hapticStyle="light" style={styles.resetButton}>
          <RotateCcw size={16} color={color.text.secondary} />
          <Text variant="label.lg" style={styles.resetButtonText}>Reset</Text>
        </PressableScale>

        <PressableScale
          onPress={handleApply}
          pressedScale={0.98}
          style={styles.applyButtonWrap}
          accessibilityLabel={applyLabel}
        >
          <GradientBrand style={liveCountPending ? styles.applyButtonPendingCombined : styles.applyButton}>
            <Text variant="heading.sm" style={styles.applyButtonText}>
              {applyLabel}
            </Text>
          </GradientBrand>
        </PressableScale>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    marginBottom:     spacing[2],
  },
  headerTitle: {
    color: color.navy,
  },
  closeButton: {
    width:           32,
    height:          32,
    borderRadius:    16,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: '#FFFFFF',
    borderWidth:     1,
    borderColor:     'rgba(1,12,53,0.06)',
  },
  scrollWrap: {
    position: 'relative',
  },
  // Round 3 ITEM 3a — maxHeight is now DYNAMIC (measured mid-control fold,
  // see resolveScrollFold); this style carries the non-height chrome only.
  scrollView: {},
  // Continuation fade — cream-to-transparent over the content's last
  // strip. Round 3 ITEM 3c: taller (36) for a stronger cue; it sits just
  // above (under, in stacking terms) the footer's upward shadow (the
  // footer is a later sibling, so its hairline + shadow render over it).
  scrollFade: {
    position: 'absolute',
    left:     0,
    right:    0,
    bottom:   0,
    height:   36,
  },
  // W2b — section header row: small-caps navy label left, selected summary
  // right in brand red. v3 rhythm: 24 above / 12 below.
  sectionHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginTop:      spacing[6],
    marginBottom:   spacing[3],
  },
  sectionLabel: {
    color: color.navy,
  },
  sectionSummary: {
    fontSize:   11,
    fontFamily: 'Lato-SemiBold',
    letterSpacing: 0.3,
    color:      color.brandRose,
  },
  pillRow: {
    flexDirection: 'row',
    gap:           spacing[2],
    paddingBottom: spacing[1],
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing[2],
  },
  // v3 — chips are WHITE cards on the cream sheet ground: warmth + real
  // elevation via a navy-tinted hairline, never grey-wash.
  pill: {
    flexDirection:    'row',
    alignItems:       'center',
    borderRadius:     radius.pill,
    paddingHorizontal: spacing[4],
    paddingVertical:  spacing[3],
    minHeight:        44,               // generous touch target (owner design brief item 2)
    backgroundColor:  '#FFFFFF',
    borderWidth:      1,
    borderColor:      'rgba(1,12,53,0.06)',
  },
  // v3 — navy state fill (Open Now, Amenities). Navy ink = state; red is
  // reserved for brand actions; category colours carry identity.
  pillNavyActive: {
    backgroundColor: color.navy,
    borderColor:     color.navy,
  },
  // W2b (W2-D3) v3 — the category glyph's tinted disc (12% category colour;
  // full-colour icon inside).
  iconDisc: {
    width:          22,
    height:         22,
    borderRadius:   11,
    alignItems:     'center',
    justifyContent: 'center',
    marginRight:    6,
  },
  // W2b (W2-D4) v3 — voucher-type TICKET silhouette: white body, two cream
  // side notches (circles clipped at the mid edges via overflow: hidden),
  // red dashed perforation inside the left edge, coral glyph.
  ticketChip: {
    flexDirection:     'row',
    alignItems:        'center',
    borderRadius:      9,
    paddingLeft:       spacing[4],
    paddingRight:      spacing[4],
    paddingVertical:   spacing[3],
    minHeight:         44,
    backgroundColor:   '#FFFFFF',
    borderWidth:       1,
    borderColor:       'rgba(1,12,53,0.06)',
    overflow:          'hidden',
  },
  ticketChipActive: {
    backgroundColor: hexWithAlpha(color.brandRose, 0.10),
    borderWidth:     1.5,
    borderColor:     color.brandRose,
  },
  ticketNotchLeft: {
    position:        'absolute',
    left:            -5,
    top:             '50%',
    marginTop:       -5,
    width:           10,
    height:          10,
    borderRadius:    5,
    backgroundColor: color.cream,
  },
  ticketNotchRight: {
    position:        'absolute',
    right:           -5,
    top:             '50%',
    marginTop:       -5,
    width:           10,
    height:          10,
    borderRadius:    5,
    backgroundColor: color.cream,
  },
  ticketPerforation: {
    height:          18,
    borderLeftWidth: 2,
    borderStyle:     'dashed',
    borderColor:     'rgba(226,12,4,0.45)',
    marginRight:     spacing[2],
  },
  pillIcon: {
    marginRight: 4,
  },
  pillText: {
    fontSize:   12,
    fontFamily: 'Lato-SemiBold',
    color:      color.navy,
  },
  pillTextActive: {
    color: color.onBrand,
  },
  // v3 — footer separation: hairline top border + a slight upward shadow.
  footer: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing[3],
    marginTop:      spacing[3],
    paddingTop:     spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(1,12,53,0.08)',
    backgroundColor: color.cream,
    shadowColor:    '#010C35',
    shadowOpacity:  0.04,
    shadowRadius:   6,
    shadowOffset:   { width: 0, height: -3 },
  },
  resetButton: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical:   spacing[3],
    minHeight:         48,
  },
  resetButtonText: {
    color: color.text.secondary,
  },
  applyButtonWrap: {
    flex: 1,
  },
  applyButton: {
    borderRadius:    radius.md,
    paddingVertical: spacing[4],
    alignItems:      'center',
    justifyContent:  'center',
  },
  // Subtle dim while the live-count preview is in flight — a lightweight
  // "this number is refreshing" cue without a spinner competing for
  // attention on the primary CTA. A single merged object (not a style
  // array) — `GradientBrand`'s `style` prop is typed `ViewStyle`, not
  // `StyleProp<ViewStyle>`.
  applyButtonPendingCombined: {
    borderRadius:    radius.md,
    paddingVertical: spacing[4],
    alignItems:      'center',
    justifyContent:  'center',
    opacity:         0.85,
  },
  applyButtonText: {
    color:      '#FFFFFF',
    fontFamily: 'Lato-Bold',
    // v3 — tabular numerals so the live count doesn't jitter the label
    // width as the preview refreshes.
    fontVariant: ['tabular-nums'],
  },
})
