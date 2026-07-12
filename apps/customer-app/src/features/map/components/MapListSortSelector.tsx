import React from 'react'
import { Pressable, StyleSheet, ScrollView } from 'react-native'
import { Text, color, spacing } from '@/design-system'
import { SORT_OPTIONS, FilterState } from '@/features/search/components/FilterSheet'

// Map Phase 2 S4 Task 3 (spec §7.8) — sort selector in the Map list
// header. Options are the SAME four `FilterState.sortBy` values FilterSheet
// exposes (single source of truth, imported from there) — since S1 these
// genuinely re-order the server results, so this is a thin selector UI, no
// client-side sort logic here.
//
// Map Phase 2 W2b (F9) — the flat "red text" link row is replaced by a
// SEGMENTED CONTROL: a pill container whose active segment is solid navy
// with white text. The visible segment labels are a display-only rename
// ("Top rated", "Best saving" for the `highest_saving` value); the
// canonical `SORT_OPTIONS.label` is retained for the accessibilityLabel so
// the a11y contract (and the pinned MapListView sort tests) are unchanged.
type Props = {
  value:    FilterState['sortBy']
  onChange: (sortBy: FilterState['sortBy']) => void
}

// W2b display-only labels (canonical values/keys unchanged). "Best saving"
// is the friendlier surface for the `highest_saving` sort; "Top rated"
// drops the title-case second cap.
const SORT_DISPLAY_LABEL: Record<FilterState['sortBy'], string> = {
  relevance:      'Relevance',
  nearest:        'Nearest',
  top_rated:      'Top rated',
  highest_saving: 'Best saving',
}

export function MapListSortSelector({ value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.track}
      testID="map-list-sort-selector"
      accessibilityRole="tablist"
    >
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
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {SORT_DISPLAY_LABEL[opt.key]}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  // Pill container (segmented control track).
  track: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             spacing[1],
    backgroundColor: color.surface.neutral,
    borderRadius:    999,
    padding:         4,
    marginBottom:    spacing[3],
  },
  segment: {
    paddingHorizontal: spacing[3],
    paddingVertical:   6,
    borderRadius:      999,
  },
  // Active segment — solid navy fill, white text (spec §7.8 accent moved to
  // a filled segment for the segmented-control treatment).
  segmentActive: {
    backgroundColor: color.navy,
  },
  label: {
    fontSize:   13,
    fontFamily: 'Lato-SemiBold',
    color:      color.text.secondary,
  },
  labelActive: {
    color: color.onBrand,
  },
})
