import React, { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { spacing } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'

const MONTHLY_COST = 6.99
const ANNUAL_MONTHLY_COST = 69.99 / 12 // £5.83

type Props = {
  thisMonthSaving: number
  billingInterval: 'MONTHLY' | 'ANNUAL'
  hasPromo: boolean
}

export function RoiCallout({ thisMonthSaving, billingInterval, hasPromo }: Props) {
  const motionScale = useMotionScale()
  const shimmerX = useSharedValue(-1.2)

  useEffect(() => {
    if (motionScale === 0 || thisMonthSaving <= 0) return
    shimmerX.value = withDelay(
      1800,
      withRepeat(
        withSequence(
          withTiming(2, { duration: 1200 }),
          withTiming(-1.2, { duration: 0 }),
        ),
        -1,
        false,
      ),
    )
  }, [motionScale, shimmerX, thisMonthSaving])

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value * 300 }],
  }))

  if (thisMonthSaving <= 0) return null

  const planCost = billingInterval === 'ANNUAL' ? ANNUAL_MONTHLY_COST : MONTHLY_COST
  const isAboveBreakeven = thisMonthSaving >= planCost
  const multiplier = (thisMonthSaving / planCost).toFixed(1)
  const amount = `£${thisMonthSaving.toFixed(2)}`

  let content: React.ReactNode

  if (hasPromo) {
    content = (
      <Text variant="body.md" style={styles.copy}>
        You saved <Text variant="heading.sm" style={styles.bold}>{amount}</Text> this month. Keep it up!
      </Text>
    )
  } else if (!isAboveBreakeven) {
    content = (
      <Text variant="body.md" style={styles.copy}>
        You're on your way — <Text variant="heading.sm" style={styles.bold}>{amount}</Text> saved this month
      </Text>
    )
  } else if (billingInterval === 'MONTHLY') {
    content = (
      <Text variant="body.md" style={styles.copy}>
        Saved <Text variant="heading.sm" style={styles.bold}>{amount}</Text> on your £6.99/mo plan — that's{' '}
        <Text variant="heading.sm" style={styles.bold}>{multiplier}×</Text> your money back
      </Text>
    )
  } else {
    content = (
      <Text variant="body.md" style={styles.copy}>
        Saved <Text variant="heading.sm" style={styles.bold}>{amount}</Text> on your plan — that's{' '}
        <Text variant="heading.sm" style={styles.bold}>{multiplier}×</Text> your money back
      </Text>
    )
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFF1EE', '#FEF3C7']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
      />
      {/* Shimmer sweep */}
      <Animated.View style={[styles.shimmer, shimmerStyle]}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.6)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={styles.inner}>
        {content}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(226,12,4,0.15)',
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 120,
  },
  inner: {
    padding: spacing[4],
  },
  copy: {
    color: '#010C35',
    textAlign: 'center',
    lineHeight: 22,
  },
  bold: {
    color: '#010C35',
    fontFamily: 'Lato-SemiBold',
  },
})
