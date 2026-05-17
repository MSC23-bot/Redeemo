import React, { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withSpring } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { spacing, elevation } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'
import type { CategorySaving } from '@/lib/api/savings'

// §Savings Rebaseline spec §Insight Section / Card 3 "By Category".
// Horizontal progress bars per category.  Fill animates width 0 → %
// using the brand red→orange gradient.  Spec: 0.65s spring with
// cubic-bezier(0.34,1.1,0.64,1) easing equivalent (springs in
// Reanimated default to similar curve).  900ms start delay so the
// trend chart bars complete their entrance first.

const BAR_STAGGER = 65
const BAR_START_DELAY = 900

function CategoryBar({ category, maxSaving, index }: { category: CategorySaving; maxSaving: number; index: number }) {
  const fillPct = maxSaving > 0 ? (category.saving / maxSaving) * 100 : 0
  const width = useSharedValue(0)
  const scale = useMotionScale()

  useEffect(() => {
    if (scale === 0) {
      width.value = fillPct
      return
    }
    width.value = withDelay(
      BAR_START_DELAY + index * BAR_STAGGER,
      withSpring(fillPct, { damping: 16, stiffness: 140 }),
    )
  }, [fillPct, index, scale, width])

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value}%` as unknown as number,
  }))

  return (
    <View style={styles.categoryRow} testID={`savings-category-row-${category.categoryId}`}>
      <View style={styles.categoryHeader}>
        <Text style={styles.categoryName}>{category.name}</Text>
        <Text style={styles.categoryValue}>£{category.saving.toFixed(2)}</Text>
      </View>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, fillStyle]}>
          <LinearGradient
            colors={['#C01010', '#E20C04', '#CC3500']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </View>
  )
}

type Props = {
  categories: CategorySaving[]
  // §Savings fixup 2026-05-17: see TopBranches.Props for the
  // identical empty-state contract.  Same null-fallback when
  // omitted.  Explicit `| undefined` for tsc strict
  // `exactOptionalPropertyTypes`.
  emptyLabel?: string | undefined
}

export function ByCategory({ categories, emptyLabel }: Props) {
  if (categories.length === 0) {
    if (!emptyLabel) return null
    return (
      <View style={styles.card} testID="savings-by-category-empty">
        <Text variant="label.eyebrow" style={styles.sectionLabel}>By Category</Text>
        <Text variant="body.sm" color="tertiary" style={styles.emptyLabel}>
          {emptyLabel}
        </Text>
      </View>
    )
  }

  const maxSaving = Math.max(...categories.map((c) => c.saving), 1)

  return (
    <View style={styles.card} testID="savings-by-category">
      <Text variant="label.eyebrow" style={styles.sectionLabel}>By Category</Text>
      {categories.map((cat, i) => (
        <CategoryBar key={cat.categoryId} category={cat} maxSaving={maxSaving} index={i} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  // §Savings fidelity fixup-2 2026-05-17: match brainstorm densities
  // (track 6px not 8; row marginBottom ~10px; tighter card padding).
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...elevation.sm,
  },
  sectionLabel: {
    marginBottom: spacing[2],
    color: '#9CA3AF',
  },
  categoryRow: {
    marginBottom: spacing[2],
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  categoryName: {
    fontFamily: 'Lato-Medium',
    fontSize: 13,
    color: '#010C35',
  },
  categoryValue: {
    fontFamily: 'Lato-Bold',
    fontSize: 13,
    color: '#16A34A',
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 6,
    borderRadius: 99,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 99,
    overflow: 'hidden',
  },
  emptyLabel: {
    color: '#9CA3AF',
    fontStyle: 'italic',
    paddingVertical: spacing[2],
  },
})
