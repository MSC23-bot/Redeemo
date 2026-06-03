import type { ViewStyle, StyleProp } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedReaction, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated'
import { useMotionScale } from '../useMotionScale'
import { scrollActivity } from './scrollActivity'

// Hoisted so the easing isn't rebuilt inside the reaction worklet.
const PULSE_EASE = Easing.inOut(Easing.ease)

type Props = {
  color: string
  size?: number
  /** Trough scale of the pulse (1 = no shrink). Default 0.6. Raise toward 1
   *  for a gentler breath (e.g. the Home open-status dot). */
  minScale?: number
  /** Trough opacity of the pulse. Default 0.3. Raise toward 1 to dim less. */
  minOpacity?: number
  /** Half-cycle duration (ms). Default 700. Increase to slow the pulse. */
  duration?: number
  /** Optional override style — composed with the computed pulse style. Used
   *  by ShowToStaff (M3 Task 13) to nudge spacing inside the LIVE badge. */
  style?: StyleProp<ViewStyle>
  /** Optional test hook so PulsingDot can be discovered in unit tests. */
  testID?: string
}

export function PulsingDot({ color, size = 7, minScale = 0.6, minOpacity = 0.3, duration = 700, style, testID }: Props) {
  const scale   = useSharedValue(1)
  const opacity = useSharedValue(1)
  const motion  = useMotionScale()

  // Drive the loop from the UI thread, reacting to the scroll flag (and motion).
  // PAUSE (freeze in place) while the feed is scrolling so the pulse doesn't
  // compete with the scroll; RESUME when it stops. motion<=0 (reduce-motion)
  // snaps to rest. Runs on mount via the initial reaction fire.
  useAnimatedReaction(
    () => scrollActivity.value,
    (scrolling) => {
      // Reset to the resting pose FIRST, then start the loop from rest. Without
      // this, withRepeat oscillates between the frozen mid-pulse value and the
      // target — which collapses to ~no movement after a scroll freezes it near
      // the extreme (that's why the dot looked dead after scrolling).
      cancelAnimation(scale)
      cancelAnimation(opacity)
      scale.value = 1
      opacity.value = 1
      if (motion > 0 && scrolling === 0) {
        scale.value   = withRepeat(withTiming(minScale,   { duration, easing: PULSE_EASE }), -1, true)
        opacity.value = withRepeat(withTiming(minOpacity, { duration, easing: PULSE_EASE }), -1, true)
      }
    },
    [motion, minScale, minOpacity, duration],
  )

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
    width:  size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: color,
  }))

  return <Animated.View testID={testID} style={[animatedStyle, style]} />
}
