import React from 'react'
import { View, StyleSheet } from 'react-native'
import { spacing } from '@/design-system'
import { SegmentedControl } from '@/design-system/motion/SegmentedControl'
import { SORT_OPTIONS, FilterState } from '@/features/search/components/FilterSheet'

// Map Phase 2 S4 Task 3 (spec §7.8) — sort selector in the Map list
// header. Options are the SAME four `FilterState.sortBy` values FilterSheet
// exposes (single source of truth, imported from there) — since S1 these
// genuinely re-order the server results, so this is a thin selector UI, no
// client-side sort logic here.
//
// Map Phase 2 W2b round 2 — now a thin wrapper around the SHARED
// `<SegmentedControl>` (design-system/motion), the same component the
// FilterSheet's Sort By section renders, so the two surfaces cannot drift
// (owner direction: one segmented control). Display labels are the W2b
// display-only renames; the canonical `SORT_OPTIONS.label` stays the
// accessibilityLabel ("Sort by Top Rated" etc.), preserving the pinned
// a11y contract.

type Props = {
  value:    FilterState['sortBy']
  onChange: (sortBy: FilterState['sortBy']) => void
}

// W2b display-only labels (canonical values/keys unchanged). "Best saving"
// is the friendlier surface for the `highest_saving` sort; "Top rated"
// drops the title-case second cap.
export const SORT_DISPLAY_LABEL: Record<FilterState['sortBy'], string> = {
  relevance:      'Relevance',
  nearest:        'Nearest',
  top_rated:      'Top rated',
  highest_saving: 'Best saving',
}

// Exported so FilterSheet's Sort By section renders the IDENTICAL segment
// set (labels + canonical a11y labels) through the same shared control.
export const SORT_SEGMENTS = SORT_OPTIONS.map((opt) => ({
  key:                opt.key,
  label:              SORT_DISPLAY_LABEL[opt.key],
  accessibilityLabel: `Sort by ${opt.label}`,
}))

export function MapListSortSelector({ value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <SegmentedControl
        segments={SORT_SEGMENTS}
        value={value}
        onChange={onChange}
        testID="map-list-sort-selector"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing[3],
  },
})
