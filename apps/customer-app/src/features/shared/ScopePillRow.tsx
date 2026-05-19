import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Text, spacing, radius } from '@/design-system'

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

// PR #112 device-QA fixup-3 (2026-05-19) — active-pill colour aligned to
// DESIGN.md "navy active-tab tint" rule.  Brand Rose stays load-bearing
// on the redemption CTA / LIVE pip per the One-Voice Brand-Rose Rule
// (≤10% of any screen) — a scope filter highlight is selection state,
// not CTA, so it routes through navy.  Active pill also gets a subtle
// elevation.sm lift so the selected affordance reads on-device.
const styles = StyleSheet.create({
  row: {
    flexDirection:    'row',
    flexWrap:         'wrap',
    gap:              spacing[2],
    paddingHorizontal: 16,
    paddingVertical:  spacing[2],
  },
  pill: {
    borderRadius:      radius.pill,
    paddingHorizontal: 14,
    paddingVertical:   8,
    backgroundColor:   '#F3F4F6',           // surface-subtle (inactive)
  },
  pillActive: {
    backgroundColor: '#010C35',             // navy / text.primary
    shadowColor:     '#010C35',
    shadowOpacity:   0.10,
    shadowRadius:    4,
    shadowOffset:    { width: 0, height: 2 },
    elevation:       1,
  },
  pillText: {
    fontSize:      12,
    fontFamily:    'Lato-Medium',           // label.md
    color:         '#4B5563',               // text.secondary (inactive)
    letterSpacing: 0.2,
  },
  pillTextActive: {
    color:      '#FFFFFF',                  // text.inverse
    fontFamily: 'Lato-SemiBold',
  },
})
