/**
 * Phase 3C.1g M2.5 — `<FavouritesSkeleton>` (3 rows, layout matches
 * the active card height).
 */

import React from 'react'
import { StyleSheet, View } from 'react-native'
import { color, elevation, radius, spacing } from '@/design-system/tokens'

interface Props {
  rows?: number
  testID?: string
}

export function FavouritesSkeleton({ rows = 3, testID }: Props): React.ReactElement {
  return (
    <View testID={testID ?? 'favourites-skeleton'}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.logo} />
          <View style={styles.body}>
            <View style={[styles.bar, styles.barWide]} />
            <View style={[styles.bar, styles.barMid]} />
            <View style={[styles.bar, styles.barNarrow]} />
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection:    'row',
    alignItems:       'center',
    padding:          spacing[3],
    marginHorizontal: spacing[4],
    marginVertical:   spacing[2],
    borderRadius:     radius.lg,
    backgroundColor:  color.surface.raised,
    ...elevation.sm,
  },
  logo: {
    width:           56,
    height:          56,
    borderRadius:    radius.md,
    backgroundColor: color.surface.subtle,
  },
  body: {
    flex:       1,
    marginLeft: spacing[3],
    gap:        spacing[2],
  },
  bar: {
    height:          12,
    borderRadius:    6,
    backgroundColor: color.surface.subtle,
  },
  barWide:   { width: '70%' },
  barMid:    { width: '50%' },
  barNarrow: { width: '30%' },
})
