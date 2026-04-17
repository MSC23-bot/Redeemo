import React, { useRef } from 'react'
import { Pressable, PressableProps, Animated } from 'react-native'
import { haptics } from '../haptics'

type Props = PressableProps & { children: React.ReactNode; hapticStyle?: 'light' | 'medium' | 'none' }

export function PressableScale({ children, onPressIn, onPressOut, hapticStyle = 'light', disabled, style, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style as object]}>
      <Pressable
        disabled={disabled}
        onPressIn={(e) => {
          Animated.timing(scale, { toValue: 0.97, duration: 120, useNativeDriver: true }).start()
          if (hapticStyle !== 'none') haptics.touch[hapticStyle]()
          onPressIn?.(e)
        }}
        onPressOut={(e) => {
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()
          onPressOut?.(e)
        }}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}
