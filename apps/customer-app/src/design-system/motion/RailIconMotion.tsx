import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated'
import { useMotionScale } from '../useMotionScale'
import { scrollActivity } from './scrollActivity'

/**
 * Logical, per-icon LOOPING motion for the Home rail-header glyphs — the
 * category icons + the Featured star (2026-06-03, owner direction: these
 * should stay alive in a loop, like the Popular / Trending flame, not a
 * one-off entrance).
 *
 * Design intent (interaction-design + design-engineering motion frameworks):
 *
 *  - Each glyph gently animates FOREVER, like <TrendingFlame>, so the section
 *    reads as alive. The gesture fits the icon's meaning and is DISTINCT from
 *    the flame's flicker: the food glyph breathes like steam, the fitness
 *    heart beats, the shopping bag swings like a pendulum, the travel plane
 *    floats and banks, the Featured star twinkles.
 *  - Kept SUBTLE + SLOW (small amplitudes, ~0.8-1.5s cycles) so a screen full
 *    of looping glyphs stays calm rather than frantic.
 *  - Transform + opacity only (GPU-safe; never layout properties).
 *  - Reduced-motion safe BY CONSTRUCTION: when useMotionScale() reports
 *    reduce-motion (0) the glyph snaps to its natural resting pose and no
 *    loop runs.
 *
 * A single `phase` shared value oscillates 0->1 (auto-reverse) and the
 * per-kind interpolation maps it to a gentle transform. `rest` is the phase
 * that shows the natural pose: 0 for one-sided breaths/bobs, 0.5 for centred
 * sways (so a pendulum swings both ways through centre, yet still snaps to
 * upright under reduce-motion).
 */
export type RailIconKind =
  | 'food'
  | 'beauty'
  | 'fitness'
  | 'medical'
  | 'outabout'
  | 'shopping'
  | 'homeservices'
  | 'travel'
  | 'family'
  | 'auto'
  | 'pets'
  | 'featured'
  | 'default'

// Per-kind loop: one-leg duration (ms), the phase showing the natural pose,
// and `reverse` — true (default) auto-reverses to oscillate; false runs a
// continuous one-direction cycle (used by the spinning Featured star).
const LOOP: Record<RailIconKind, { duration: number; rest: number; reverse?: boolean }> = {
  food:         { duration: 1100, rest: 0 },
  beauty:       { duration: 1300, rest: 0 },
  fitness:      { duration: 780,  rest: 0 },
  medical:      { duration: 1300, rest: 0 },
  outabout:     { duration: 1500, rest: 0.5 },
  shopping:     { duration: 1400, rest: 0.5 },
  homeservices: { duration: 1300, rest: 0 },
  travel:       { duration: 1200, rest: 0 },
  family:       { duration: 1000, rest: 0 },
  auto:         { duration: 900,  rest: 0 },
  pets:         { duration: 850,  rest: 0 },
  // Featured star: a slow, graceful full rotation (owner direction 2026-06-03).
  featured:     { duration: 5000, rest: 0, reverse: false },
  default:      { duration: 1200, rest: 0 },
}

const EASE = Easing.inOut(Easing.ease)

type Props = {
  kind: RailIconKind
  style?: StyleProp<ViewStyle>
  testID?: string
  children: ReactNode
}

export function RailIconMotion({ kind, style, testID, children }: Props) {
  const motion = useMotionScale()
  const spec = LOOP[kind] ?? LOOP.default
  const rest = spec.rest
  const dur = spec.duration
  // Auto-reverse oscillations ease in-out; a continuous spin (reverse=false)
  // must be linear so each revolution doesn't visibly wobble.
  const reverse = spec.reverse ?? true
  const easing = reverse ? EASE : Easing.linear
  // Start at the natural resting pose so reduce-motion never flashes a
  // deviated frame; the loop (when motion is on) kicks off from there.
  const phase = useSharedValue(rest)

  // UI-thread loop, paused (frozen) while the feed scrolls and resumed when it
  // stops; reduce-motion (motion<=0) snaps to rest. Fires on mount too.
  useAnimatedReaction(
    () => scrollActivity.value,
    (scrolling) => {
      cancelAnimation(phase)
      if (motion > 0 && scrolling === 0) {
        phase.value = rest
        phase.value = withRepeat(withTiming(1, { duration: dur, easing }), -1, reverse)
      } else {
        phase.value = rest
      }
    },
    [motion, rest, dur, reverse, easing],
  )

  const animatedStyle = useAnimatedStyle(() => {
    const p = phase.value
    switch (kind) {
      case 'food':
        // steam breath: a soft rise + swell, like a warm plate
        return { transform: [{ translateY: interpolate(p, [0, 1], [0, -2.5]) }, { scale: interpolate(p, [0, 1], [1, 1.05]) }] }
      case 'beauty':
        // bloom: a calm swell with a slight unwind
        return { transform: [{ scale: interpolate(p, [0, 1], [1, 1.07]) }, { rotate: `${interpolate(p, [0, 1], [0, -3])}deg` }] }
      case 'fitness':
        // heartbeat: a steady beat
        return { transform: [{ scale: interpolate(p, [0, 1], [1, 1.14]) }] }
      case 'medical':
        // a slow, calm clinical pulse (monitor-like)
        return { opacity: interpolate(p, [0, 1], [1, 0.9]), transform: [{ scale: interpolate(p, [0, 1], [1, 1.07]) }] }
      case 'outabout':
        // compass-needle wobble, centred on upright
        return { transform: [{ rotate: `${interpolate(p, [0, 1], [-3.5, 3.5])}deg` }] }
      case 'shopping':
        // bag pendulum, swinging both ways through centre
        return { transform: [{ rotate: `${interpolate(p, [0, 1], [-4.5, 4.5])}deg` }] }
      case 'homeservices':
        // grounded, settled breath
        return { transform: [{ scale: interpolate(p, [0, 1], [1, 1.05]) }] }
      case 'travel':
        // plane float: gently lifts and banks
        return { transform: [{ translateY: interpolate(p, [0, 1], [0, -3]) }, { rotate: `${interpolate(p, [0, 1], [0, 3])}deg` }] }
      case 'family':
        // light, playful bob
        return { transform: [{ translateY: interpolate(p, [0, 1], [0, -3.5]) }] }
      case 'auto':
        // a gentle rev: small bob + swell
        return { transform: [{ translateY: interpolate(p, [0, 1], [0, -2]) }, { scale: interpolate(p, [0, 1], [1, 1.03]) }] }
      case 'pets':
        // playful paw hop with a touch of squash
        return { transform: [{ translateY: interpolate(p, [0, 1], [0, -4]) }, { scale: interpolate(p, [0, 1], [1, 1.04]) }] }
      case 'featured':
        // a slow full rotation, with a subtle size + glow twinkle. Seamless at
        // the loop seam (opacity/scale return to rest at phase 1 == phase 0).
        return { opacity: interpolate(p, [0, 0.5, 1], [1, 0.85, 1]), transform: [{ rotate: `${interpolate(p, [0, 1], [0, 360])}deg` }, { scale: interpolate(p, [0, 0.5, 1], [1, 1.06, 1]) }] }
      default:
        // gentle breath
        return { transform: [{ scale: interpolate(p, [0, 1], [1, 1.05]) }] }
    }
  })

  return (
    <Animated.View testID={testID} style={[style, animatedStyle]} pointerEvents="none">
      {children}
    </Animated.View>
  )
}
