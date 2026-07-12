import React, { useEffect, useMemo, useState } from 'react'
import { View, ScrollView, Switch, StyleSheet, TouchableOpacity, Pressable } from 'react-native'
import { X, RotateCcw } from 'lucide-react-native'
import { Text, color, spacing, radius } from '@/design-system'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { GradientBrand } from '@/design-system/components/GradientBrand'
import { Divider } from '@/design-system/components/Divider'
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

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Filter results">
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.scrollView}
      >
        {/* Category section — TOP-LEVELS ONLY (filter to parentId === null) */}
        {topLevels.length > 0 && (
          <View>
            <Text variant="label.eyebrow" color="secondary" style={styles.sectionLabel}>
              Category
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
            >
              {topLevels.map((cat) => {
                const active = activeTopLevelId === cat.id
                return (
                  <PressableScale key={cat.id} onPress={() => selectTopLevel(cat.id)} hapticStyle="light">
                    <View style={[styles.pill, active && styles.pillActive]}>
                      {active && (
                        <X size={12} color={color.onBrand} style={styles.pillIcon} />
                      )}
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>
                        {cat.name}
                      </Text>
                    </View>
                  </PressableScale>
                )
              })}
            </ScrollView>
          </View>
        )}

        {/* Subcategory drill-down — only when a top-level is selected and has ≥1 subcategory */}
        {activeTopLevelId !== null && subcategories.length > 0 && (
          <View>
            <Text variant="label.eyebrow" color="secondary" style={styles.sectionLabel}>
              Subcategory
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
            >
              {subcategories.map((sub) => {
                const active = local.categoryId === sub.id
                return (
                  <PressableScale key={sub.id} onPress={() => selectSubcategory(sub.id)} hapticStyle="light">
                    <View style={[styles.pill, active && styles.pillActive]}>
                      {active && (
                        <X size={12} color={color.onBrand} style={styles.pillIcon} />
                      )}
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>
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

        {/* Sort by section */}
        <View>
          <Text variant="label.eyebrow" color="secondary" style={styles.sectionLabel}>
            Sort By
          </Text>
          <View style={styles.pillWrap}>
            {SORT_OPTIONS.map((opt) => {
              const active = local.sortBy === opt.key
              return (
                <PressableScale key={opt.key} onPress={() => setSortBy(opt.key)} hapticStyle="light">
                  <View style={[styles.pill, active && styles.pillActive]}>
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {opt.label}
                    </Text>
                  </View>
                </PressableScale>
              )
            })}
          </View>
        </View>

        {/* Voucher type section */}
        <View>
          <Text variant="label.eyebrow" color="secondary" style={styles.sectionLabel}>
            Voucher Type
          </Text>
          <View style={styles.pillWrap}>
            {VOUCHER_TYPE_CHIPS.map((chip) => {
              const active = chip.values.every((v) => local.voucherTypes.includes(v))
              return (
                <PressableScale key={chip.label} onPress={() => toggleVoucherType(chip)} hapticStyle="light">
                  <View style={[styles.pill, active && styles.pillActive]}>
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {chip.label}
                    </Text>
                  </View>
                </PressableScale>
              )
            })}
          </View>
        </View>

        {/* Open now section */}
        <View style={styles.openNowRow}>
          <Text variant="body.sm">Open Now</Text>
          <Switch
            value={local.openNow}
            onValueChange={(val) => setLocal((prev) => ({ ...prev, openNow: val }))}
            trackColor={{ true: color.success, false: color.border.default }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Open now filter"
          />
        </View>

        {/* Amenities — hidden until a category is selected (decision #3).
            Pulls real Amenity.id UUIDs from /categories/:id/amenities so
            the filter can actually match merchants on the backend. */}
        {local.categoryId !== null && eligibleAmenities.length > 0 && (
          <View>
            <Divider />
            <Text variant="label.eyebrow" color="secondary" style={styles.sectionLabel}>
              Amenities
            </Text>
            <View style={styles.pillWrap}>
              {eligibleAmenities.map((amenity) => {
                const active = local.amenityIds.includes(amenity.id)
                return (
                  <PressableScale key={amenity.id} onPress={() => toggleAmenity(amenity.id)} hapticStyle="light">
                    <View style={[styles.pill, active && styles.pillAmenityActive]}>
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

      {/* Footer — Reset (draft-only, does not close the sheet) + Apply
          (shows the live/fallback result count). Replaces the previous
          Apply-only footer (owner design brief item 2). */}
      <View style={styles.footer}>
        <PressableScale onPress={handleReset} accessibilityLabel="Reset filters" hapticStyle="light" style={styles.resetButton}>
          <RotateCcw size={16} color={color.text.secondary} />
          <Text variant="label.lg" style={styles.resetButtonText}>Reset</Text>
        </PressableScale>

        <TouchableOpacity
          onPress={handleApply}
          activeOpacity={0.9}
          style={styles.applyButtonWrap}
          accessibilityLabel={`Show ${displayCount} results`}
        >
          <GradientBrand style={liveCountPending ? styles.applyButtonPendingCombined : styles.applyButton}>
            <Text variant="heading.sm" style={styles.applyButtonText}>
              Show {displayCount} results
            </Text>
          </GradientBrand>
        </TouchableOpacity>
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
    backgroundColor: color.surface.neutral,
  },
  scrollView: {
    maxHeight: 460,
  },
  sectionLabel: {
    marginTop:    spacing[4],
    marginBottom: spacing[2],
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
  pill: {
    flexDirection:    'row',
    alignItems:       'center',
    borderRadius:     radius.pill,
    paddingHorizontal: spacing[4],
    paddingVertical:  spacing[3],
    minHeight:        44,               // generous touch target (owner design brief item 2)
    backgroundColor:  color.surface.neutral,
  },
  pillActive: {
    backgroundColor: color.brandRose,
  },
  pillAmenityActive: {
    backgroundColor: color.navy,
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
  openNowRow: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    marginTop:        spacing[4],
    marginBottom:     spacing[2],
    minHeight:        44,
  },
  footer: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing[3],
    marginTop:     spacing[4],
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
  },
})
