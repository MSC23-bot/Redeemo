import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text, color } from '@/design-system'

type Props = {
  count: number
  /**
   * Kept as `filter-active-dot` by default — the pre-existing testID on
   * MapScreen's boolean dot (`MapScreen.test.tsx`'s "filter button
   * active-dot" suite asserts `queryByTestId('filter-active-dot')`).
   * Upgrading the dot to a numbered badge in place (same testID) keeps
   * those assertions valid without a test rewrite.
   */
  testID?: string
}

/**
 * Map Phase 2 S5a — active-filter COUNT badge for the filter icon button
 * (owner design brief item 1: "add an ACTIVE-FILTER COUNT badge... so
 * state is visible without opening"). Renders nothing when `count` is 0.
 *
 * Shared across Map / Search / CategoryResults so the badge looks and
 * behaves identically everywhere (Map Phase 2 acceptance criterion 6).
 * Callers pass `nonScopeFilterCount(filters)` — see filterState.ts for
 * why category is deliberately excluded from this count.
 */
export function FilterButtonBadge({ count, testID = 'filter-active-dot' }: Props) {
  if (count <= 0) return null
  return (
    <View testID={testID} style={styles.badge}>
      <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    position:          'absolute',
    top:               6,
    right:             6,
    minWidth:          17,
    height:            17,
    borderRadius:      9,
    paddingHorizontal: 3,
    alignItems:        'center',
    justifyContent:    'center',
    backgroundColor:   color.brandRose,
    borderWidth:       1.5,
    borderColor:       '#FFFFFF',
  },
  badgeText: {
    fontSize:   10,
    lineHeight: 12,
    fontFamily: 'Lato-Bold',
    color:      '#FFFFFF',
  },
})
