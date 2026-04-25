import React, { useEffect } from 'react'
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { motion } from '../tokens'
import { useMotionScale } from '../useMotionScale'

type Props = { children: React.ReactNode; delay?: number; y?: number; duration?: number }

export function FadeIn({ children, delay = 0, y = 0, duration = motion.duration.base }: Props) {
  const opacity = useSharedValue(0)
  const translateY = useSharedValue(y)
  const scale = useMotionScale()
  useEffect(() => {
    const t = setTimeout(() => {
      opacity.value = withTiming(1, { duration: scale === 0 ? 0 : duration })
      translateY.value = withTiming(0, { duration: scale === 0 ? 0 : duration })
    }, delay)
    return () => clearTimeout(t)
  }, [delay, duration, opacity, scale, translateY])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: translateY.value }] }))
  return <Animated.View style={style}>{children}</Animated.View>
}

export function FadeInDown({ children, delay, duration }: { children: React.ReactNode; delay?: number; duration?: number }) {
  return (
    <FadeIn
      y={12}
      {...(delay !== undefined ? { delay } : {})}
      {...(duration !== undefined ? { duration } : {})}
    >
      {children}
    </FadeIn>
  )
}
