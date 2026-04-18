import React, { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withSpring } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { spacing, radius, elevation } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'
import type { CategorySaving } from '@/lib/api/savings'

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
    <View style={styles.categoryRow}>
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
}

export function ByCategory({ categories }: Props) {
  if (categories.length === 0) return null

  const maxSaving = Math.max(...categories.map((c) => c.saving), 1)

  return (
    <View style={styles.card}>
      <Text variant="label.eyebrow" style={styles.sectionLabel}>By Category</Text>
      {categories.map((cat, i) => (
        <CategoryBar key={cat.categoryId} category={cat} maxSaving={maxSaving} index={i} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: spacing[4],
    ...elevation.sm,
  },
  sectionLabel: {
    marginBottom: spacing[3],
    color: '#9CA3AF',
  },
  categoryRow: {
    marginBottom: spacing[3],
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[1],
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
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
})
