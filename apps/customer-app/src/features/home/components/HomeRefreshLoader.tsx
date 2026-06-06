import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  withTiming,
  interpolate,
  Extrapolation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated'
import { RedeemoLoader } from '@/design-system/motion/RedeemoLoader'
import { useMotionScale } from '@/design-system/useMotionScale'

// Overscroll px before the loader starts revealing (iOS pull = scrollY negative).
const PULL_START_PX = 8
// Overscroll px at which the pull reveal reaches full opacity/scale.
const PULL_REVEAL_PX = 70
// Starts tucked UP toward the header and settles DOWN, so it reads as emerging
// from beneath the header (it sits behind the header — lower zIndex — so the
// top of its travel is hidden by the header). Retracts upward on exit.
const SLIDE_FROM = -14
const HOLD_IN_MS = 180
const RETRACT_MS = 240
// Loader diameter. Slightly under the design-system `md` (48) so that
// REFRESH_LOADER_GAP + LOADER_SIZE stays well below the native refresh-hold
// height, leaving clear space between the bottom dot and the first content row.
const LOADER_SIZE = 40
// Pull distance (px) mapped to how far the dots wind, and how many turns. The
// dots rotate clockwise in proportion to the pull (the user is in control); once
// a refresh fires RedeemoLoader's own continuous orbit takes over. Range runs
// past PULL_REVEAL_PX so the dots keep winding as you pull on toward the native
// trigger threshold. PULL_TURNS = 2/3 lands the 3 dots on a symmetric position
// (they sit at 0, 1/3, 2/3) so the hand-off to the continuous orbit is seamless.
const ROTATION_RANGE_PX = 130
const PULL_TURNS = 2 / 3

type Props = {
  /** UI-thread scroll offset (negative on iOS overscroll/pull; ~0 on Android). */
  scrollY: SharedValue<number>
  /** True while the refetch is in flight (native RefreshControl owns the trigger). */
  refreshing: boolean
  /** Absolute screen Y of the loader's resting spot (HomeScreen passes the body
   *  surface just below the header). 0 until the header is measured — the
   *  component renders NOTHING until seamY > 0 (seam-height guard). */
  seamY: number
}

/**
 * Branded refresh loader (§HSH.1). Absolute overlay owned by HomeScreen, resting
 * just below the header on the body surface, sitting BEHIND the header (lower
 * zIndex) so it appears to emerge from beneath it.
 *
 * Reveal is driven on the UI thread:
 *   • Pull (overscroll): opacity/scale track the pull depth, so it appears as
 *     soon as you start pulling — not only once the refresh triggers.
 *   • Refreshing: holds at full while the refetch runs.
 *   • Done: retracts upward and unmounts.
 *
 * The only JS state changes are the mount gate (pull-start / refresh / retract),
 * which re-render THIS small component only — never the feed — so the pull
 * gesture itself stays free of feed re-renders. Reduced motion = instant
 * show/hide tied to `refreshing` (no pull tracking, no slide/scale).
 * pointerEvents="none" so it never blocks touches.
 */
export function HomeRefreshLoader({ scrollY, refreshing, seamY }: Props) {
  const reduce = useMotionScale() === 0
  const [pulling, setPulling] = useState(false)
  const [retracting, setRetracting] = useState(false)
  const wasRefreshing = useRef(false)
  // Hold/retract progress: driven to 1 when refreshing starts, back to 0 (timed)
  // when it ends, so the loader retracts smoothly after the content has settled.
  const hold = useSharedValue(0)

  // Mount as soon as the user pulls past the start threshold. runOnJS re-renders
  // THIS component only (not HomeScreen), so the pull gesture stays jank-free.
  // On Android scrollY never goes below 0, so this stays false there by nature.
  useAnimatedReaction(
    () => scrollY.value < -PULL_START_PX,
    (active, prev) => {
      if (active !== prev) runOnJS(setPulling)(active)
    },
  )

  useEffect(() => {
    if (refreshing) {
      wasRefreshing.current = true
      setRetracting(false)
      hold.value = reduce ? 1 : withTiming(1, { duration: HOLD_IN_MS, easing: Easing.out(Easing.cubic) })
      return
    }
    // Only retract if it was actually shown (avoids a phantom retract on mount).
    if (!wasRefreshing.current) return
    wasRefreshing.current = false
    if (reduce) {
      hold.value = 0
      setRetracting(false)
      return
    }
    hold.value = withTiming(0, { duration: RETRACT_MS, easing: Easing.in(Easing.cubic) })
    setRetracting(true)
    const t = setTimeout(() => setRetracting(false), RETRACT_MS)
    return () => clearTimeout(t)
  }, [refreshing, reduce, hold])

  // Pull-driven dot rotation: the user winds the dots clockwise in proportion to
  // the pull (in control). 0 under reduced motion. Once a refresh fires we stop
  // feeding this and let RedeemoLoader's own continuous orbit take over (its
  // withRepeat lives in the design-system motion layer). PULL_TURNS = 2/3 leaves
  // the dots on a symmetric position so that hand-off is seamless.
  const pullPhase = useDerivedValue(() =>
    reduce
      ? 0
      : interpolate(-scrollY.value, [PULL_START_PX, ROTATION_RANGE_PX], [0, PULL_TURNS], Extrapolation.CLAMP),
  )

  const animatedStyle = useAnimatedStyle(() => {
    const pull = reduce
      ? 0
      : interpolate(-scrollY.value, [PULL_START_PX, PULL_REVEAL_PX], [0, 1], Extrapolation.CLAMP)
    const o = reduce ? (refreshing ? 1 : 0) : Math.max(pull, hold.value)
    // Anchor to the header: travel UP with it on downward scroll (the SAME
    // -max(scrollY,0) the header uses), so during a refresh the loader scrolls
    // away with the header instead of floating mid-screen, and returns at the
    // top. On pull (scrollY < 0) this term is 0, so it reveals at the seam.
    const scrollAwayY = -Math.max(scrollY.value, 0)
    const revealY = interpolate(o, [0, 1], [SLIDE_FROM, 0])
    return {
      opacity: o,
      transform: [
        { translateY: revealY + scrollAwayY },
        { scale: interpolate(o, [0, 1], [0.85, 1]) },
      ],
    }
  })

  // Seam-height guard (`seamY > 0`): never render before HomeHeader is measured.
  const show = seamY > 0 && (pulling || refreshing || retracting)
  if (!show) return null

  return (
    <Animated.View
      testID="home-refresh-loader"
      pointerEvents="none"
      style={[styles.overlay, { top: seamY }, animatedStyle]}
    >
      {/* Dot rotation: while pulling we feed `pullPhase` so the user winds the
          dots clockwise in proportion to the pull (in control); once refreshing
          we drop the external phase and `animating` lets RedeemoLoader's own
          continuous orbit take over. A small pull that won't trigger a refresh
          therefore never looks like it's already loading. */}
      <RedeemoLoader
        size={LOADER_SIZE}
        accessibilityLabel="Refreshing"
        animating={refreshing}
        {...(refreshing ? {} : { phase: pullPhase })}
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    // zIndex 0 + rendered before the ScrollView → it sits BEHIND the feed, so the
    // campaign banner / content cover it as they scroll over its spot, and it
    // only shows through the transparent gap that opens on pull. (The header,
    // zIndex 10, still hides the top of its travel so it emerges from beneath.)
    zIndex: 0,
  },
})
