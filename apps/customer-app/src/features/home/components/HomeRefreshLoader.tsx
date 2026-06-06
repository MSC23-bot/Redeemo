import React, { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated'
import { RedeemoLoader } from '@/design-system/motion/RedeemoLoader'
import { useMotionScale } from '@/design-system/useMotionScale'

// Enter slightly faster-settling, exit quicker (exit < enter reads responsive).
const ENTER_MS = 300
const EXIT_MS = 200
// The loader starts tucked UP toward the header and settles DOWN to its resting
// spot, so it reads as emerging from beneath the header. Retracts upward on exit.
const SLIDE_FROM = -14

type Props = {
  /** True while the refetch is in flight (native RefreshControl owns the trigger). */
  refreshing: boolean
  /** Absolute screen Y of the loader's resting spot (HomeScreen passes the body
   *  surface just below the header). 0 until the header is measured — the
   *  component renders NOTHING until seamY > 0 (seam-height guard, prevents a
   *  pre-layout flash at the top of the screen if a refresh fires before layout). */
  seamY: number
}

/**
 * Branded refresh loader (§HSH.1). An absolute overlay owned by HomeScreen
 * (sibling of the ScrollView, like HomeCollapsedHeader), resting just BELOW the
 * header on the body surface. It is driven ENTIRELY by `refreshing` — no
 * scroll-linked reaction, so nothing re-renders during the pull gesture itself
 * (that churn twitched the header). When a refresh triggers it animates in from
 * beneath the header (fade + slide-down + scale), holds + spins while loading,
 * then retracts upward and unmounts when the refetch resolves.
 *
 * Reduced motion (useMotionScale()===0): instant show/hide, no slide/scale.
 * pointerEvents="none" so it never blocks touches.
 */
export function HomeRefreshLoader({ refreshing, seamY }: Props) {
  const reduce = useMotionScale() === 0
  const progress = useSharedValue(0)
  // Kept mounted through the exit animation, then unmounted (so the retract
  // motion can play before the loader leaves the tree).
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (refreshing) {
      setMounted(true)
      progress.value = reduce
        ? 1
        : withTiming(1, { duration: ENTER_MS, easing: Easing.out(Easing.cubic) })
      return
    }
    // Not refreshing: if it was never shown there is nothing to retract.
    if (!mounted) return
    if (reduce) {
      progress.value = 0
      setMounted(false)
      return
    }
    progress.value = withTiming(0, { duration: EXIT_MS, easing: Easing.in(Easing.cubic) })
    const t = setTimeout(() => setMounted(false), EXIT_MS)
    return () => clearTimeout(t)
  }, [refreshing, reduce, mounted, progress])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [SLIDE_FROM, 0]) },
      { scale: interpolate(progress.value, [0, 1], [0.85, 1]) },
    ],
  }))

  // Seam-height guard (`seamY > 0`): never render before HomeHeader is measured.
  if (seamY <= 0 || !mounted) return null

  return (
    <Animated.View
      testID="home-refresh-loader"
      pointerEvents="none"
      style={[styles.overlay, { top: seamY }, animatedStyle]}
    >
      <RedeemoLoader size="md" accessibilityLabel="Refreshing" />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
})
