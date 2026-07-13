import React from 'react'
import { Pressable, PressableProps } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated'
import { useMotionScale } from '../useMotionScale'
import { haptics } from '../haptics'
import { motion } from '../tokens'

type Props = PressableProps & {
  children: React.ReactNode
  hapticStyle?: 'light' | 'medium' | 'none'
  /**
   * Map W2b round 2 — optional pressed-state scale override (default 0.97,
   * the historical value every existing call site keeps). Rows/CTAs that
   * want the quieter 0.98 press pass it explicitly.
   */
  pressedScale?: number
}

export function PressableScale({ children, onPressIn, onPressOut, hapticStyle = 'light', pressedScale = 0.97, disabled, style, ...rest }: Props) {
  const scale = useSharedValue(1)
  const motionScale = useMotionScale()
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Animated.View style={[animatedStyle, style as any]}>
      <Pressable
        disabled={disabled}
        onPressIn={(e) => {
          if (motionScale === 1) scale.value = withTiming(pressedScale, { duration: motion.duration.xfast })
          if (hapticStyle !== 'none') haptics.touch[hapticStyle]()
          onPressIn?.(e)
        }}
        onPressOut={(e) => {
          if (motionScale === 1) scale.value = withSpring(1, { damping: 18, stiffness: 260 })
          onPressOut?.(e)
        }}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}
