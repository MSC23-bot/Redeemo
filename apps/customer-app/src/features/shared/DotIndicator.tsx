import React from 'react'
import { View } from 'react-native'
import { color, spacing } from '@/design-system'

export function DotIndicator({ count, activeIndex }: { count: number; activeIndex: number }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing[1], paddingVertical: spacing[2] }}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i === activeIndex ? 20 : 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: i === activeIndex ? color.brandRose : '#D1D5DB',
          }}
        />
      ))}
    </View>
  )
}
