import React, { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { spacing, radius } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'
import { SavingsHeroGradient } from './SavingsHeroGradient'

function ShimmerBlock({ width, height, style }: { width: number | string; height: number; style?: object }) {
  const opacity = useSharedValue(0.3)
  const scale = useMotionScale()

  useEffect(() => {
    if (scale === 0) return
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800 }),
        withTiming(0.3, { duration: 800 }),
      ),
      -1,
    )
  }, [opacity, scale])

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Animated.View
      style={[
        { width: width as number, height, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.2)' },
        animStyle,
        style,
      ]}
    />
  )
}

/** Full-screen skeleton shown on first load before data resolves. */
export function SavingsSkeleton() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.container}>
      {/* Hero skeleton */}
      <SavingsHeroGradient style={styles.hero}>
        <View style={[styles.heroInner, { paddingTop: insets.top + 10 }]}>
          <ShimmerBlock width={100} height={26} />
          <View style={styles.heroStats}>
            <ShimmerBlock width={80} height={12} />
            <ShimmerBlock width={180} height={48} />
            <View style={styles.chipRowSkel}>
              <ShimmerBlock width={120} height={56} style={{ borderRadius: radius.lg }} />
              <ShimmerBlock width={120} height={56} style={{ borderRadius: radius.lg }} />
            </View>
          </View>
        </View>
      </SavingsHeroGradient>

      {/* Insight card skeletons */}
      <View style={styles.cards}>
        <ShimmerBlock width={'100%' as unknown as number} height={180} style={{ borderRadius: radius.xl, backgroundColor: '#E5E7EB' }} />
        <ShimmerBlock width={'100%' as unknown as number} height={120} style={{ borderRadius: radius.xl, backgroundColor: '#E5E7EB' }} />
        <ShimmerBlock width={'100%' as unknown as number} height={100} style={{ borderRadius: radius.xl, backgroundColor: '#E5E7EB' }} />
      </View>
    </View>
  )
}

/** Skeleton for insight cards only (used during month drill-down fetch). */
export function InsightSkeleton() {
  return (
    <View style={styles.insightSkelContainer}>
      <ShimmerBlock width={'100%' as unknown as number} height={120} style={{ borderRadius: radius.xl, backgroundColor: '#E5E7EB' }} />
      <ShimmerBlock width={'100%' as unknown as number} height={100} style={{ borderRadius: radius.xl, backgroundColor: '#E5E7EB' }} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  hero: { overflow: 'hidden' },
  heroInner: { paddingHorizontal: spacing[5], paddingBottom: spacing[6] },
  heroStats: { alignItems: 'center', paddingTop: spacing[5], gap: spacing[3] },
  chipRowSkel: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] },
  cards: { paddingHorizontal: spacing[5], paddingTop: spacing[5], gap: spacing[3] },
  insightSkelContainer: { gap: spacing[3] },
})
