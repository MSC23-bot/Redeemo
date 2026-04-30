import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Text, color, spacing, radius } from '@/design-system'

/**
 * Three-pill scope selector for SearchScreen + CategoryResultsScreen.
 *
 * Surfaces the locked PR B contract: three pills only — `nearby | city |
 * platform`. The backend `region` value is reserved-for-future and explicitly
 * NOT exposed.
 *
 * Counts are optional. When `counts` is provided, each pill shows
 * "Label · count" (e.g. "Your city · 47"); otherwise just the label.
 */

export type Scope = 'nearby' | 'city' | 'platform'

type Props = {
  selectedScope:  Scope | undefined
  onScopeChange:  (scope: Scope) => void
  counts?: {
    nearby:   number
    city:     number
    platform: number
  }
}

const PILLS: Array<{ key: Scope; label: string }> = [
  { key: 'nearby',   label: 'Nearby' },
  { key: 'city',     label: 'Your city' },
  { key: 'platform', label: 'UK-wide' },
]

export function ScopePillRow({ selectedScope, onScopeChange, counts }: Props) {
  return (
    <View style={styles.row}>
      {PILLS.map((pill) => {
        const active = selectedScope === pill.key
        const count  = counts?.[pill.key]
        return (
          <Pressable
            key={pill.key}
            onPress={() => onScopeChange(pill.key)}
            accessibilityRole="button"
            accessibilityLabel={`Filter to ${pill.label}${count !== undefined ? `, ${count} merchants` : ''}`}
            accessibilityState={{ selected: active }}
            style={[styles.pill, active && styles.pillActive]}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>
              {pill.label}{count !== undefined ? ` · ${count}` : ''}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection:    'row',
    flexWrap:         'wrap',
    gap:              spacing[2],
    paddingHorizontal: 18,
    paddingVertical:  spacing[2],
  },
  pill: {
    borderRadius:      radius.pill,
    paddingHorizontal: spacing[4],
    paddingVertical:   spacing[2],
    backgroundColor:   color.surface.neutral,
  },
  pillActive: {
    backgroundColor: color.brandRose,
  },
  pillText: {
    fontSize:   12,
    fontFamily: 'Lato-SemiBold',
    color:      color.navy,
  },
  pillTextActive: {
    color: color.onBrand,
  },
})
