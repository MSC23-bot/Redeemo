import React, { useEffect, useRef } from 'react'
import { Animated, View } from 'react-native'

type Props = { children: React.ReactNode; delay?: number; y?: number; duration?: number }

export function FadeIn({ children, delay = 0, y = 0, duration = 240 }: Props) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(y)).current
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration, useNativeDriver: true }),
      ]).start()
    }, delay)
    return () => clearTimeout(t)
  }, [delay, duration, opacity, translateY])
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>
  )
}

export function FadeInDown({ children, delay, duration }: { children: React.ReactNode; delay?: number; duration?: number }) {
  return (
    <FadeIn y={12} {...(delay !== undefined ? { delay } : {})} {...(duration !== undefined ? { duration } : {})}>
      {children}
    </FadeIn>
  )
}
