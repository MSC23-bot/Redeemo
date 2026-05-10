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
  /** Outer ring diameter at peak scale.  Defaults to 56pt — wraps a 22pt check ring with breathing room. */
  size?: number
  /** Delay before the pulse starts.  Defaults to 360ms — fires soon after the check-ring lands. */
  delayMs?: number
  /** Total duration of the pulse (rise + fade).  Defaults to 1400ms. */
  durationMs?: number
}

/**
 * SparkleRing — soft brand-rose halo that breathes once around the
 * SuccessPopup check ring.  Single 1.4s pulse combining opacity
 * 0 → 0.55 → 0 AND scale 0.7 → 1.0 → 1.05.  The combined opacity +
 * scale gives the halo a perceptible "breathe" feel — the
 * earlier-iteration pure-opacity-only pulse was too quiet on
 * device (T8b device-QA fix).
 *
 * Brief §3.2 (PR-B T2) — restraint register.  No confetti, no
 * radial sparks; one premium halo that suggests "earned" without
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
  size = 56,
  delayMs = 360,
  durationMs = 1400,
}: Props) {
  const reducedMotion = useReducedMotion()
  const opacity = useSharedValue(0)
  const scale = useSharedValue(0.7)

  useEffect(() => {
    if (!visible || reducedMotion) {
      opacity.value = 0
      scale.value = 0.7
      return
    }
    // Opacity rise + fade: 0 → 0.55 over the first 35% of the
    // pulse, then 0.55 → 0 over the remaining 65%.  Bumped from
    // 0.3 peak (T2 baseline) to 0.55 (T8b fix) so the halo reads
    // on-device against the cream popup body.
    opacity.value = withDelay(
      delayMs,
      withTiming(
        0.55,
        { duration: durationMs * 0.35, easing: Easing.out(Easing.exp) },
        () => {
          opacity.value = withTiming(0, {
            duration: durationMs * 0.65,
            easing: Easing.in(Easing.exp),
          })
        },
      ),
    )
    // Scale breathe: 0.7 → 1.0 over the first 35%, then 1.0 →
    // 1.05 over the remaining 65%.  Subtle outward expansion keeps
    // the halo feeling "alive" rather than a static fade.
    scale.value = withDelay(
      delayMs,
      withTiming(
        1.0,
        { duration: durationMs * 0.35, easing: Easing.out(Easing.exp) },
        () => {
          scale.value = withTiming(1.05, {
            duration: durationMs * 0.65,
            easing: Easing.out(Easing.quad),
          })
        },
      ),
    )
  }, [visible, reducedMotion, delayMs, durationMs, opacity, scale])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))

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
    // Bumped from 2 (T2 baseline) to 3 (T8b fix): the 56pt ring at
    // 55% peak alpha needs slightly more stroke weight to read at
    // device pixel density without looking thready.
    borderWidth: 3,
    // 55% alpha hex variant on brand-rose.  '8C' suffix = 55%
    // (140/255 ≈ 0.549).  Bumped from '40' (25%) per T8b device
    // QA: the earlier 25% halo was effectively invisible on a
    // cream background.
    borderColor: color.brandRose + '8C',
  },
})
