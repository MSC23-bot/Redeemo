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

// PR #112 fixup-6.4 (2026-05-20) — owner-locked label refresh:
//   third pill `UK-wide` → `More places`.
// Reasoning: "UK-wide" implied a national directory; users already know
// Redeemo operates UK-wide, so the label felt redundant and overly
// abstract. `More places` is plain-spoken and matches the cascade
// behaviour ("show me more places when nearer rungs are thin").
// Cumulative count semantics preserved: `More places · 13` reads as
// "13 places when you broaden the search."
const PILLS: Array<{ key: Scope; label: string }> = [
  { key: 'nearby',   label: 'Nearby' },
  { key: 'city',     label: 'Your city' },
  { key: 'platform', label: 'More places' },
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

// PR #112 fixup-4 (2026-05-19) — owner override: active pill uses
// Redeemo brand-rose, NOT navy.  Owner direction explicit: "Use Redeemo
// primary brand red for the active Search scope pill."  This is an
// intentional override of DESIGN.md's "navy active-tab tint" rule + the
// One-Voice Brand-Rose Rule for THIS surface — scope selection on
// Search is a primary-action affordance per the owner's mental model,
// not just a filter state.  Other surfaces (tab bar) keep navy active.
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
    backgroundColor: '#E20C04',             // brand-rose
    shadowColor:     '#E20C04',
    shadowOpacity:   0.18,
    shadowRadius:    6,
    shadowOffset:    { width: 0, height: 3 },
    elevation:       2,
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
