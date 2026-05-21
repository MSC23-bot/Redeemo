// §CS Phase A — Category results loading skeleton.
//
// Mounted by `<CategoryResultsScreen>` while `isLoading && branches.length === 0`
// so the user sees a populated placeholder layout instead of a blank
// screen during the cold-load round-trip.  Reuses the existing shared
// `<SkeletonTile>` shimmer primitive so the animation matches Home's
// loading affordance.
//
// Owner-locked row count = 6 (≈ one mobile viewport).
//
// Out of scope (queued under §CS Phase B): backend performance work,
// request-scope caching, sub-1s warm + sub-2s cold targets.

import React from 'react'
import { View, StyleSheet, Dimensions } from 'react-native'
import { SkeletonTile } from '@/features/shared/SkeletonTile'
import { spacing } from '@/design-system'

const SCREEN_WIDTH = Dimensions.get('window').width
// Match the Category FlatList content padding (`listContent` style in
// CategoryResultsScreen). Falls back to a safe min if the screen is
// implausibly narrow during tests.
const ROW_WIDTH = Math.max(120, SCREEN_WIDTH - spacing[4] * 2)

const ROW_COUNT = 6

export function CategoryResultsSkeleton() {
  return (
    <View style={styles.list} testID="category-results-skeleton">
      {Array.from({ length: ROW_COUNT }).map((_, i) => (
        <View key={i} style={styles.row} testID="category-results-skeleton-row">
          <SkeletonTile width={ROW_WIDTH} />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { paddingTop: spacing[2], paddingHorizontal: spacing[4] },
  row:  { marginBottom: spacing[3] },
})
