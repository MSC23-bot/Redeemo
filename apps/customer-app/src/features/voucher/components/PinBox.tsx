import React from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { color, radius } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'

type Props = {
  digit: string | null
  isActive: boolean
  isError: boolean
  shakeX: Animated.SharedValue<number>
  index: number
}

export function PinBox({ digit, isActive, isError, shakeX, index }: Props) {
  const scale = useMotionScale()

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: scale > 0 ? shakeX.value : 0 }],
  }))

  return (
    <Animated.View
      style={[
        styles.box,
        isActive && styles.active,
        isError && styles.error,
        digit && !isError && styles.filled,
        animatedStyle,
      ]}
      accessibilityLabel={`PIN digit ${index + 1} of 4`}
    >
      {digit && (
        <Text variant="display.md" color="primary" style={styles.digit}>{digit}</Text>
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  box: {
    width: 54,
    height: 54,
    borderRadius: radius.md + 2,
    borderWidth: 2,
    borderColor: '#E8E2DC',
    backgroundColor: '#FFF9F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  active: {
    borderColor: color.brandRose,
    backgroundColor: '#FFF',
    shadowColor: color.brandRose,
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  filled: {
    borderColor: color.brandRose,
    backgroundColor: '#FFF',
  },
  error: {
    borderColor: '#B91C1C',
    backgroundColor: '#FEF2F2',
  },
  digit: { fontWeight: '800', fontSize: 26 },
})
