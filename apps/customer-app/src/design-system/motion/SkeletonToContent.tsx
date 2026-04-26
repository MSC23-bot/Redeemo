import React from 'react'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useMotionScale } from '../useMotionScale'

type Props = { loading: boolean; skeleton: React.ReactNode; children: React.ReactNode }

export function SkeletonToContent({ loading, skeleton, children }: Props) {
  const progress = useSharedValue(loading ? 0 : 1)
  const scale = useMotionScale()
  React.useEffect(() => {
    progress.value = withTiming(loading ? 0 : 1, { duration: scale === 0 ? 0 : 180 })
  }, [loading, progress, scale])
  const skelStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value, position: 'absolute', top: 0, left: 0, right: 0 }))
  const bodyStyle = useAnimatedStyle(() => ({ opacity: progress.value }))
  return (
    <Animated.View>
      <Animated.View style={skelStyle} pointerEvents={loading ? 'auto' : 'none'}>{skeleton}</Animated.View>
      <Animated.View style={bodyStyle} pointerEvents={loading ? 'none' : 'auto'}>{children}</Animated.View>
    </Animated.View>
  )
}
