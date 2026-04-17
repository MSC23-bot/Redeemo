import React, { useEffect, useRef } from 'react'
import { Animated, View } from 'react-native'

type Props = { loading: boolean; skeleton: React.ReactNode; children: React.ReactNode }

export function SkeletonToContent({ loading, skeleton, children }: Props) {
  const progress = useRef(new Animated.Value(loading ? 0 : 1)).current
  useEffect(() => {
    Animated.timing(progress, { toValue: loading ? 0 : 1, duration: 180, useNativeDriver: true }).start()
  }, [loading, progress])
  return (
    <View>
      <Animated.View style={{ opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), position: 'absolute', top: 0, left: 0, right: 0 }} pointerEvents={loading ? 'auto' : 'none'}>
        {skeleton}
      </Animated.View>
      <Animated.View style={{ opacity: progress }} pointerEvents={loading ? 'none' : 'auto'}>
        {children}
      </Animated.View>
    </View>
  )
}
