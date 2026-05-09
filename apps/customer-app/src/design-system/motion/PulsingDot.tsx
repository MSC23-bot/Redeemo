import { useEffect } from 'react'
import type { ViewStyle, StyleProp } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated'
import { useMotionScale } from '../useMotionScale'

type Props = {
  color: string
  size?: number
  /** Optional override style — composed with the computed pulse style. Used
   *  by ShowToStaff (M3 Task 13) to nudge spacing inside the LIVE badge. */
  style?: StyleProp<ViewStyle>
  /** Optional test hook so PulsingDot can be discovered in unit tests. */
  testID?: string
}

export function PulsingDot({ color, size = 7, style, testID }: Props) {
  const scale   = useSharedValue(1)
  const opacity = useSharedValue(1)
  const motion  = useMotionScale()

  useEffect(() => {
    if (motion <= 0) return
    scale.value   = withRepeat(withTiming(0.6, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true)
    opacity.value = withRepeat(withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true)
  }, [scale, opacity, motion])

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
