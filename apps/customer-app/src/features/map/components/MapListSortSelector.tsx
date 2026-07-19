import React from 'react'
import { View, StyleSheet } from 'react-native'
import { spacing } from '@/design-system'
import { SegmentedControl } from '@/design-system/motion/SegmentedControl'
import { SORT_SEGMENTS, FilterState } from '@/features/search/components/FilterSheet'

// Map Phase 2 S4 Task 3 (spec §7.8) — sort selector in the Map list
// header. A thin wrapper around the ONE shared `<SegmentedControl>`
// (design-system/motion), rendering the SAME `SORT_SEGMENTS` set the
// FilterSheet's Sort By section renders (single source, defined next to
// SORT_OPTIONS in FilterSheet) — so the two surfaces cannot drift. The
// canonical SORT_OPTIONS labels stay the accessibilityLabels ("Sort by
// Top Rated" etc.), preserving the pinned a11y contract; visible labels
// are the W2b display renames ("Top rated", "Best saving").
// Round 4 dedup: this file previously carried its own copy of the
// segment set; it now imports FilterSheet's.

type Props = {
  value:    FilterState['sortBy']
  onChange: (sortBy: FilterState['sortBy']) => void
}

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
