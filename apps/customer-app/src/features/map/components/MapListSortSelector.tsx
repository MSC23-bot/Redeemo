import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Text, color, spacing } from '@/design-system'
import { SORT_OPTIONS, FilterState } from '@/features/search/components/FilterSheet'

// Map Phase 2 S4 Task 3 (spec §7.8) — "Header: 'Nearby Merchants' + count +
// sort selector (red text)". Options are the SAME four `FilterState.sortBy`
// values FilterSheet exposes (single source of truth, imported from there)
// — since S1 these genuinely re-order the server results, so this is a
// thin selector UI, no client-side sort logic here.
type Props = {
  value:    FilterState['sortBy']
  onChange: (sortBy: FilterState['sortBy']) => void
}

export function MapListSortSelector({ value, onChange }: Props) {
  return (
    <View style={styles.row} accessibilityRole="tablist" testID="map-list-sort-selector">
      {SORT_OPTIONS.map((opt) => {
        const active = value === opt.key
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${opt.label}`}
            accessibilityState={{ selected: active }}
            hitSlop={6}
            style={styles.item}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    columnGap:     spacing[4],
    rowGap:        spacing[1],
    marginBottom:  spacing[3],
  },
  item: {
    paddingVertical: spacing[1],
  },
  label: {
    fontSize:   13,
    fontFamily: 'Lato-SemiBold',
    color:      color.text.tertiary,
  },
  // Spec §7.8 — red text accent. `brandRose` is the locked red token
  // (root CLAUDE.md §9: red #E20C04).
  labelActive: {
    color: color.brandRose,
  },
})
