import { useEffect } from 'react'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated'
import { useMotionScale } from '../useMotionScale'

type Props = { color: string; size?: number }

export function PulsingDot({ color, size = 7 }: Props) {
  const scale   = useSharedValue(1)
  const opacity = useSharedValue(1)
  const motion  = useMotionScale()

  useEffect(() => {
    if (motion <= 0) return
    scale.value   = withRepeat(withTiming(0.6, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true)
    opacity.value = withRepeat(withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true)
  }, [scale, opacity, motion])

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
    width:  size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: color,
  }))

  return <Animated.View style={style} />
}
