import React, { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { color } from '@/design-system/tokens'

type Props = {
  /**
   * Drives the entrance pulse.  Mirrors SuccessPopup `visible` so
   * the ring fires once on popup mount and again after a remount.
   */
  visible: boolean
  /** Outer ring diameter.  Defaults to 36pt — sized to wrap a 22pt check ring. */
  size?: number
  /** Delay before the pulse starts.  Defaults to 480ms — fires after the check-ring lands. */
  delayMs?: number
  /** Total duration of the pulse (rise + fade).  Defaults to 1200ms. */
  durationMs?: number
}

/**
 * SparkleRing — subtle brand-rose ring around the SuccessPopup
 * check ring.  Single 1.2s opacity pulse: 0 → 0.3 → 0.  Triggers
 * 480ms after the check ring lands (so the user reads the check
 * first, then the soft halo confirms).
 *
 * Brief §3.2 (PR-B T2) — restraint register.  No confetti, no
 * radial sparks; one quiet halo that suggests "earned" without
 * shouting.  Cross-references Apple Pay micro-celebration energy.
 *
 * Reduced-motion contract:
 *   - When `useReducedMotion()` returns true, this component
 *     returns null entirely.  The ring is decoration, not data;
 *     the check ring + saving callout already carry the
 *     confirmation signal.
 *
 * Positioning is the caller's responsibility — the ring renders
 * with `position: absolute` so the parent must place it relative
 * to the check ring it wraps.
 */
export function SparkleRing({
  visible,
  size = 36,
  delayMs = 480,
  durationMs = 1200,
}: Props) {
  const reducedMotion = useReducedMotion()
  const opacity = useSharedValue(0)

  useEffect(() => {
    if (!visible || reducedMotion) {
      opacity.value = 0
      return
    }
    // Rise + fade: 0 → 0.3 over the first 40% of the pulse, then
    // 0.3 → 0 over the remaining 60%.  Cubic-style ease in/out
    // approximated via Easing.exp curves which read smoothly
    // under Reanimated's worklet runtime.
    opacity.value = withDelay(
      delayMs,
      withTiming(
        0.3,
        { duration: durationMs * 0.4, easing: Easing.out(Easing.exp) },
        () => {
          opacity.value = withTiming(0, {
            duration: durationMs * 0.6,
            easing: Easing.in(Easing.exp),
          })
        },
      ),
    )
  }, [visible, reducedMotion, delayMs, durationMs, opacity])

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  if (reducedMotion) return null

  return (
    <Animated.View
      pointerEvents="none"
      testID="success-popup-sparkle-ring"
      style={[
        styles.ring,
        { width: size, height: size, borderRadius: size / 2 },
        animatedStyle,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderWidth: 2,
    // 25% alpha hex variant on brand-rose.  Matches brief §3.2 spec:
    // soft halo, not a saturated outline.  '40' suffix = 25% in hex
    // alpha (64/255 ≈ 0.25).
    borderColor: color.brandRose + '40',
  },
})
