import React from 'react'
import { View } from 'react-native'
import { color, radius, spacing } from '../tokens'

type Props = {
  total: number
  current: number
  activeColor?: string
  segmentWidth?: number
  barHeight?: number
}

export function StepIndicator({ total, current, activeColor, segmentWidth = 24, barHeight = 4 }: Props) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: current }}
      style={{ flexDirection: 'row', gap: spacing[1] }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            width: segmentWidth,
            height: barHeight,
            borderRadius: radius.xs,
            backgroundColor: i < current ? (activeColor ?? color.navy) : color.border.subtle,
          }}
        />
      ))}
    </View>
  )
}
