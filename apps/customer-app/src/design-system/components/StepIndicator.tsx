import React from 'react'
import { View } from 'react-native'
import { color, radius, spacing } from '../tokens'

export function StepIndicator({ total, current }: { total: number; current: number }) {
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: current }} style={{ flexDirection: 'row', gap: spacing[1] }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ width: 24, height: 4, borderRadius: radius.xs, backgroundColor: i < current ? color.navy : color.border.subtle }} />
      ))}
    </View>
  )
}
