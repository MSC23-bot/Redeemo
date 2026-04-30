import React, { useEffect, useMemo, useState } from 'react'
import { View, ScrollView, Switch, StyleSheet, TouchableOpacity } from 'react-native'
import { X } from 'lucide-react-native'
import { Text, color, spacing, radius } from '@/design-system'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { GradientBrand } from '@/design-system/components/GradientBrand'
import { useCategories } from '@/hooks/useCategories'
import { useEligibleAmenities } from '@/hooks/useEligibleAmenities'

/**
 * FilterState — applied filters for SearchScreen / CategoryResultsScreen.
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

type Props = {
  visible:     boolean
  filters:     FilterState
  resultCount: number
  onApply:     (filters: FilterState) => void
  onDismiss:   () => void
}

const SORT_OPTIONS: { key: FilterState['sortBy']; label: string }[] = [
  { key: 'relevance',      label: 'Relevance' },
  { key: 'nearest',        label: 'Nearest' },
  { key: 'top_rated',      label: 'Top Rated' },
  { key: 'highest_saving', label: 'Highest Saving' },
]

// Voucher type labels — unchanged from PR #4. The backend enum has 8 values
// (BOGO, SPEND_AND_SAVE, DISCOUNT_AMOUNT, DISCOUNT_PERCENT, FREEBIE,
// PACKAGE_DEAL, TIME_LIMITED, REUSABLE) but the client surfaces 5 user-
// friendly groupings. Mapping these display labels to backend enum values
// is a separate follow-up — out of PR B's locked scope.
const VOUCHER_TYPES = ['BOGO', 'Discount', 'Freebie', 'Spend & Save', 'Package Deal']

export function FilterSheet({ visible, filters, resultCount, onApply, onDismiss }: Props) {
  const [local, setLocal] = useState<FilterState>(filters)
  const { data: categoriesData } = useCategories()
  const allCategories = categoriesData?.categories ?? []

  // Sync local state when the parent's `filters` prop changes (e.g. apply
  // closes the sheet then re-opens with the new state).
  useEffect(() => {
    setLocal(filters)
  }, [filters])

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

  function toggleVoucherType(type: string) {
    setLocal((prev) => {
      const has = prev.voucherTypes.includes(type)
      return {
        ...prev,
        voucherTypes: has
          ? prev.voucherTypes.filter((t) => t !== type)
          : [...prev.voucherTypes, type],
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

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Filter results">
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
            {VOUCHER_TYPES.map((type) => {
              const active = local.voucherTypes.includes(type)
              return (
                <PressableScale key={type} onPress={() => toggleVoucherType(type)} hapticStyle="light">
                  <View style={[styles.pill, active && styles.pillActive]}>
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {type}
                    </Text>
                  </View>
                </PressableScale>
              )
            })}
          </View>
        </View>

        {/* Amenities — hidden until a category is selected (decision #3).
            Pulls real Amenity.id UUIDs from /categories/:id/amenities so
            the filter can actually match merchants on the backend. */}
        {local.categoryId !== null && eligibleAmenities.length > 0 && (
          <View>
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

        {/* Open now section */}
        <View style={styles.openNowRow}>
          <Text variant="body.sm">Open Now</Text>
          <Switch
            value={local.openNow}
            onValueChange={(val) => setLocal((prev) => ({ ...prev, openNow: val }))}
            trackColor={{ true: '#10B981', false: '#D1D5DB' }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Open now filter"
          />
        </View>

        {/* Apply button */}
        <TouchableOpacity onPress={handleApply} activeOpacity={0.9} accessibilityLabel={`Show ${resultCount} results`}>
          <GradientBrand style={styles.applyButton}>
            <Text variant="heading.sm" style={styles.applyButtonText}>
              Show {resultCount} results
            </Text>
          </GradientBrand>
        </TouchableOpacity>
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  scrollView: {
    maxHeight: 500,
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
    paddingVertical:  spacing[2],
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
  },
  applyButton: {
    borderRadius:    radius.md,
    marginTop:       spacing[5],
    paddingVertical: spacing[4],
    alignItems:      'center',
    justifyContent:  'center',
  },
  applyButtonText: {
    color:      '#FFFFFF',
    fontFamily: 'Lato-Bold',
  },
})
