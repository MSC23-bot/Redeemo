import React, { useEffect, useRef } from 'react'
import { View, Animated } from 'react-native'
import { radius, spacing, elevation } from '@/design-system'

export function SkeletonTile({ width = 260 }: { width?: number }) {
  const shimmer = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1500, useNativeDriver: true }),
    ).start()
  }, [shimmer])

  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-width, width] })

  return (
    <View style={[{ width, borderRadius: radius.lg, backgroundColor: '#F3F4F6', overflow: 'hidden' }, elevation.sm]}>
      <View style={{ height: 80, backgroundColor: '#E5E7EB' }}>
        <Animated.View
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            transform: [{ translateX }],
            backgroundColor: 'rgba(255,255,255,0.3)',
            width: '50%',
          }}
        />
      </View>
      <View style={{ padding: spacing[3], gap: spacing[2] }}>
        <View style={{ height: 14, width: '70%', borderRadius: 4, backgroundColor: '#E5E7EB' }} />
        <View style={{ height: 10, width: '50%', borderRadius: 4, backgroundColor: '#E5E7EB' }} />
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <View style={{ height: 18, width: 60, borderRadius: 9, backgroundColor: '#E5E7EB' }} />
          <View style={{ height: 18, width: 80, borderRadius: 9, backgroundColor: '#E5E7EB' }} />
        </View>
      </View>
    </View>
  )
}
