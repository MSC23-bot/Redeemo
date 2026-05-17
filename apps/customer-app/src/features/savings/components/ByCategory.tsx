import React, { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withSpring } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { radius, spacing, elevation } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'
import type { CategorySaving } from '@/lib/api/savings'
import { SavingsCardTitleRow } from './TopBranches'

// §Savings Rebaseline spec §Insight Section / Card 3 "By Category".
// Horizontal progress bars per category.  Fill animates width 0 → %
// using the brand red→orange gradient.  Spec: 0.65s spring with
// cubic-bezier(0.34,1.1,0.64,1) easing equivalent (springs in
// Reanimated default to similar curve).  900ms start delay so the
// trend chart bars complete their entrance first.

const BAR_STAGGER = 65
const BAR_START_DELAY = 900

function CategoryBar({ category, maxSaving, index }: { category: CategorySaving; maxSaving: number; index: number }) {
  // §Savings emil-pass 2/7 2026-05-17 — hardware acceleration.
  // The fill bar previously animated `width` from 0% → fillPct%.
  // `width` is NOT GPU-accelerated; every frame triggers layout +
  // paint.  Switched to `scaleX` from 0 → fillPct/100 with
  // `transformOrigin: 'left'`.  Visually identical (the bar still
  // grows from the left edge to the target percentage) but the
  // animation now runs on the compositor thread.
  //
  // The track is the constant-width container; the fill spans
  // `width: '100%'` and scales DOWN by default, scaling UP to the
  // target ratio during the entrance.
  const fillRatio = maxSaving > 0 ? category.saving / maxSaving : 0
  const scaleX = useSharedValue(0)
  const motionScale = useMotionScale()

  useEffect(() => {
    if (motionScale === 0) {
      scaleX.value = fillRatio
      return
    }
    scaleX.value = withDelay(
      BAR_START_DELAY + index * BAR_STAGGER,
      withSpring(fillRatio, { damping: 16, stiffness: 140 }),
    )
  }, [fillRatio, index, motionScale, scaleX])

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: scaleX.value }],
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
  // §Savings fixup 2026-05-17: see TopPlaces.Props for the identical
  // empty-state contract.  Same null-fallback when omitted.
  emptyLabel?: string | undefined
  // §Savings fidelity fixup-3 2026-05-17: brainstorm card-title
  // context label rendered on the right of "By category".  "This
  // month" for the default; month name (e.g. "April") under a
  // selection.
  contextLabel?: string | undefined
}

export function ByCategory({ categories, emptyLabel, contextLabel }: Props) {
  if (categories.length === 0) {
    if (!emptyLabel) return null
    return (
      <View style={styles.card} testID="savings-by-category-empty">
        <SavingsCardTitleRow title="By category" context={contextLabel} />
        <Text variant="body.sm" color="tertiary" style={styles.emptyLabel}>
          {emptyLabel}
        </Text>
      </View>
    )
  }

  const maxSaving = Math.max(...categories.map((c) => c.saving), 1)

  return (
    <View style={styles.card} testID="savings-by-category">
      <SavingsCardTitleRow title="By category" context={contextLabel} />
      {categories.map((cat, i) => (
        <CategoryBar key={cat.categoryId} category={cat} maxSaving={maxSaving} index={i} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  // §Savings impeccable 5/6 — tokenised: borderRadius 20 → radius.lg
  // (16); asymmetric padding → uniform spacing[4] (16).  Matches
  // TopPlaces + TrendChart card silhouette across the insight section.
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    padding: spacing[4],
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
    // emil-pass 2/7: the fill is a constant-width 100% bar that
    // scales horizontally from 0 → fillRatio.  transformOrigin: 'left'
    // anchors the scale at the leading edge so the bar appears to
    // grow rightward (matching the previous width-animated behaviour).
    width:           '100%',
    height:          6,
    borderRadius:    99,
    overflow:        'hidden',
    transformOrigin: 'left',
  },
  emptyLabel: {
    color: '#9CA3AF',
    fontStyle: 'italic',
    paddingVertical: spacing[2],
  },
})
