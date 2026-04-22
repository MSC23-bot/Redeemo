import React, { useEffect } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated'
// eslint-disable-next-line tokens/no-raw-tokens
import { X } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { spacing, radius } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatMonth(yyyymm: string): string {
  const [year, mon] = yyyymm.split('-')
  return `${MONTH_NAMES[parseInt(mon, 10) - 1]} ${year}`
}

type Props = {
  month: string | null
  onDismiss: () => void
}

export function ViewingChip({ month, onDismiss }: Props) {
  const scale = useSharedValue(0.8)
  const opacity = useSharedValue(0)
  const motionScale = useMotionScale()

  useEffect(() => {
    if (!month) return
    if (motionScale === 0) {
      scale.value = 1
      opacity.value = 1
      return
    }
    scale.value = withSpring(1, { damping: 12, stiffness: 200 })
    opacity.value = withSpring(1, { damping: 20, stiffness: 260 })
  }, [month, motionScale, opacity, scale])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))

  if (!month) return null

  const label = `Viewing: ${formatMonth(month)}`

  return (
    <Animated.View style={[styles.chip, animStyle]}>
      <Text variant="label.md" style={styles.chipText}>{label}</Text>
      <Pressable
        onPress={onDismiss}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`Viewing ${formatMonth(month)}. Tap to return to current month`}
      >
        <X size={14} color="#B45309" />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    gap: spacing[2],
  },
  chipText: {
    color: '#B45309',
    fontFamily: 'Lato-SemiBold',
    fontSize: 12,
  },
})
