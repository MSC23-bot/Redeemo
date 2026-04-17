import React, { useEffect } from 'react'
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { motion } from '../tokens'
import { useMotionScale } from '../useMotionScale'

export function TransitionScreen({ children }: { children: React.ReactNode }) {
  const opacity = useSharedValue(0)
  const ty = useSharedValue(8)
  const scale = useMotionScale()
  useEffect(() => {
    opacity.value = withTiming(1, { duration: scale === 0 ? 0 : motion.duration.base })
    ty.value = withTiming(0, { duration: scale === 0 ? 0 : motion.duration.base })
  }, [opacity, ty, scale])
  const style = useAnimatedStyle(() => ({ flex: 1, opacity: opacity.value, transform: [{ translateY: ty.value }] }))
  return <Animated.View style={style}>{children}</Animated.View>
}
