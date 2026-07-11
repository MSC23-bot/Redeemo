import React, { useMemo } from 'react'
import { ScrollView, View, StyleSheet } from 'react-native'
import { X } from 'lucide-react-native'
import { Text, color, spacing, radius } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { FadeInDown } from '@/design-system/motion/FadeIn'
import type { Category } from '@/lib/api/discovery'
import { FilterState, SORT_OPTIONS, EMPTY_FILTERS } from './FilterSheet'
import { appliedFilterEntries, removeAppliedFilter, type AppliedFilterEntry } from '../utils/filterState'

type Props = {
  filters:      FilterState
  categories:   Category[]
  amenities?:   { id: string; name: string }[]
  baseFilters?: FilterState
  onChange:     (next: FilterState) => void
}

function chipLabel(entry: AppliedFilterEntry): string {
  switch (entry.kind) {
    case 'category':    return entry.label
    case 'sort':         return `Sort: ${entry.label}`
    case 'voucherType':  return entry.chipLabel
    case 'amenity':      return entry.label
    case 'openNow':      return 'Open now'
  }
}

function chipKey(entry: AppliedFilterEntry): string {
  switch (entry.kind) {
    case 'category':    return `category:${entry.id}`
    case 'sort':         return 'sort'
    case 'voucherType':  return `voucherType:${entry.chipLabel}`
    case 'amenity':      return `amenity:${entry.id}`
    case 'openNow':      return 'openNow'
  }
}

/**
 * Map Phase 2 S5a — horizontally-scrollable row of removable chips for
 * every currently-APPLIED filter (owner design brief item 3: "this is
 * what makes the system feel trustworthy"). Shared across Map / Search /
 * CategoryResults. Renders nothing when no filter differs from
 * `baseFilters` (defaults to `EMPTY_FILTERS`).
 */
export function FilterChipsRow({ filters, categories, amenities = [], baseFilters, onChange }: Props) {
  const categoryNameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const amenityNameById  = useMemo(() => new Map(amenities.map((a) => [a.id, a.name])), [amenities])
  const sortLabelByKey   = useMemo(
    () => new Map(SORT_OPTIONS.map((o) => [o.key, o.label])) as Map<FilterState['sortBy'], string>,
    [],
  )

  const base = baseFilters ?? EMPTY_FILTERS
  const entries = appliedFilterEntries(filters, categoryNameById, amenityNameById, sortLabelByKey, base)

  if (entries.length === 0) return null

  return (
    <FadeInDown duration={180}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityRole="none"
      >
        {entries.map((entry) => (
          <PressableScale
            key={chipKey(entry)}
            onPress={() => onChange(removeAppliedFilter(filters, entry, base))}
            hapticStyle="light"
            accessibilityLabel={`Remove filter: ${chipLabel(entry)}`}
          >
            <View style={styles.chip}>
              <Text style={styles.chipText}>{chipLabel(entry)}</Text>
              <X size={12} color={color.onBrand} style={styles.chipIcon} />
            </View>
          </PressableScale>
        ))}

        {entries.length > 1 && (
          <PressableScale
            onPress={() => onChange(base)}
            hapticStyle="light"
            accessibilityLabel="Clear all filters"
          >
            <View style={styles.clearAll}>
              <Text style={styles.clearAllText}>Clear all</Text>
            </View>
          </PressableScale>
        )}
      </ScrollView>
    </FadeInDown>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical:   spacing[2],
  },
  chip: {
    flexDirection:     'row',
    alignItems:        'center',
    borderRadius:      radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical:   spacing[2],
    gap:               6,
    backgroundColor:   color.brandRose,
  },
  chipText: {
    fontSize:   12,
    fontFamily: 'Lato-SemiBold',
    color:      color.onBrand,
  },
  chipIcon: {
    marginLeft: 2,
  },
  clearAll: {
    paddingHorizontal: spacing[3],
    paddingVertical:   spacing[2],
  },
  clearAllText: {
    fontSize:      12,
    fontFamily:    'Lato-SemiBold',
    color:         color.text.secondary,
    textDecorationLine: 'underline',
  },
})
