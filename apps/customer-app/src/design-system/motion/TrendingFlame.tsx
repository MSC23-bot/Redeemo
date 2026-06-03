import type { StyleProp, ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedReaction, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated'
import { Flame } from '@/design-system/icons'
import { BrandGradientVector } from '../components/BrandGradientGlyph'
import { useMotionScale } from '../useMotionScale'
import { scrollActivity } from './scrollActivity'

// Hoisted so the easing isn't rebuilt inside the reaction worklet.
const FLAME_EASE = Easing.inOut(Easing.ease)

// lucide "flame" path — used when a brand gradient fill is requested (the solid
// `color` <Flame> can't take a gradient).
const FLAME_PATH =
  'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'

/**
 * Batch 2 M4 (2026-06-01, owner revision) — animated "trending" mark for the
 * Popular / Trending "happening now" rails (spec §9.5). A brand-coral flame
 * that gently flickers (subtle scale pulse + a small sway), reading clearly
 * as trending / hot. Deliberately an ICON in motion, NOT a pulsing dot — the
 * pulse/dot is used widely elsewhere in the app and would not read as
 * distinctively "trending" here.
 *
 * Reduced-motion safe BY CONSTRUCTION: when `useMotionScale()` reports
 * reduce-motion (0), no animation starts and the flame renders static
 * (upright, normal scale). `withRepeat` lives here in design-system/motion
 * per the project motion rule.
 */
type Props = {
  color: string
  /** Flame glyph size (px). Default 16. */
  size?: number
  /** When set, the flame is filled with this brand gradient instead of the
   *  solid `color` (owner direction 2026-06-03: rail icons share the brand
   *  red->orange gradient). `color` stays the reduce-motion / fallback tint. */
  gradient?: readonly [string, string]
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function TrendingFlame({ color, size = 16, gradient, style, testID }: Props) {
  const scale  = useSharedValue(1)
  const rotate = useSharedValue(0)
  const motion = useMotionScale()

  // UI-thread loop, paused while the feed scrolls (frozen in place) and resumed
  // when it stops; reduce-motion (motion<=0) snaps upright. Flicker = a gentle
  // scale breath + a small left/right sway, auto-reversed around the resting pose.
  useAnimatedReaction(
    () => scrollActivity.value,
    (scrolling) => {
      // Reset to rest FIRST, then loop from rest — otherwise withRepeat
      // oscillates between the frozen value and the target, collapsing to no
      // movement after a scroll freeze. Mirrors RailIconMotion.
      cancelAnimation(scale)
      cancelAnimation(rotate)
      scale.value = 1
      rotate.value = 0
      if (motion > 0 && scrolling === 0) {
        scale.value  = withRepeat(withTiming(1.12, { duration: 600, easing: FLAME_EASE }), -1, true)
        rotate.value = withRepeat(withTiming(4,    { duration: 560, easing: FLAME_EASE }), -1, true)
      }
    },
    [motion],
  )

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }))

  return (
    <Animated.View testID={testID} style={[animatedStyle, style]} pointerEvents="none">
      {gradient ? (
        <BrandGradientVector path={FLAME_PATH} size={size} />
      ) : (
        <Flame size={size} color={color} fill={color} />
      )}
    </Animated.View>
  )
}
