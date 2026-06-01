import { useEffect } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated'
import { Flame } from '@/design-system/icons'
import { useMotionScale } from '../useMotionScale'

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
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function TrendingFlame({ color, size = 16, style, testID }: Props) {
  const scale  = useSharedValue(1)
  const rotate = useSharedValue(0)
  const motion = useMotionScale()

  useEffect(() => {
    if (motion <= 0) return
    // Flicker: a gentle scale breath + a small left/right sway, looped with
    // auto-reverse so it oscillates around the static (upright) resting pose.
    scale.value  = withRepeat(withTiming(1.12, { duration: 600, easing: Easing.inOut(Easing.ease) }), -1, true)
    rotate.value = withRepeat(withTiming(4,    { duration: 560, easing: Easing.inOut(Easing.ease) }), -1, true)
  }, [scale, rotate, motion])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }))

  return (
    <Animated.View testID={testID} style={[animatedStyle, style]} pointerEvents="none">
      <Flame size={size} color={color} fill={color} />
    </Animated.View>
  )
}
