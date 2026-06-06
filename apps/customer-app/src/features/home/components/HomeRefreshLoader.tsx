import React, { useState } from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated'
import { RedeemoLoader } from '@/design-system/motion/RedeemoLoader'
import { useMotionScale } from '@/design-system/useMotionScale'

// Overscroll px before the loader mounts on iOS (scrollY goes negative on pull).
const PULL_START_PX = 6
// Overscroll px at which the loader reaches full opacity/scale.
const PULL_REVEAL_PX = 64

type Props = {
  /** UI-thread scroll offset (negative on iOS overscroll; ~0 on Android). */
  scrollY: SharedValue<number>
  /** True while the refetch is in flight (native RefreshControl owns the trigger). */
  refreshing: boolean
  /** Absolute screen Y of the wave seam (HomeScreen passes headerHeight - WAVE_HEIGHT).
   *  0 until the header is measured — the component renders NOTHING until seamY > 0
   *  (seam-height guard, prevents a first-frame flash at top:0 if a refresh fires
   *  before layout). */
  seamY: number
}

/**
 * Branded wave-seam refresh loader (§HSH.1). An absolute overlay owned by
 * HomeScreen (sibling of the ScrollView, like HomeCollapsedHeader). The header +
 * wave stay anchored on pull (HomeScreen's expandedHeaderStyle); this reveals the
 * Redeemo R in the gap that opens below the wave.
 *
 * iOS (motion on): mounts as soon as the user pulls past PULL_START_PX and the
 *   opacity/scale track the pull depth, then hold at full while `refreshing`.
 * Android (scrollY stays >= 0) + reduced motion: simple show/hide tied to
 *   `refreshing` only — RedeemoLoader is already static under reduced motion.
 *
 * pointerEvents="none" so it never blocks touches.
 */
export function HomeRefreshLoader({ scrollY, refreshing, seamY }: Props) {
  const reduce = useMotionScale() === 0
  const [pulling, setPulling] = useState(false)

  // Flip a JS `pulling` flag when the user overscrolls past the start threshold.
  // On Android scrollY never goes below 0, so this stays false there by nature.
  useAnimatedReaction(
    () => scrollY.value < -PULL_START_PX,
    (active, prev) => {
      if (active !== prev) runOnJS(setPulling)(active)
    },
  )

  const animatedStyle = useAnimatedStyle(() => {
    if (reduce) return { opacity: refreshing ? 1 : 0 }
    const p = Math.min(Math.max(-scrollY.value / PULL_REVEAL_PX, 0), 1)
    const o = refreshing ? 1 : p
    return { opacity: o, transform: [{ scale: 0.8 + 0.2 * o }] }
  })

  // Seam-height guard (`seamY > 0`): never render at top:0 before HomeHeader has
  // been measured — prevents a first-frame flash at the top of the screen if a
  // refresh fires before layout. Combined with: mount only when there's
  // something to show — during refetch, or (iOS, motion on) while actively
  // pulling. Reduced motion ignores the pull (show/hide only).
  const show = seamY > 0 && (refreshing || (pulling && !reduce))
  if (!show) return null

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
