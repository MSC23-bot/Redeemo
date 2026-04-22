import React, { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, interpolateColor,
} from 'react-native-reanimated'

function SkeletonBox({ style }: { style?: object }) {
  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 900 }), -1, true)
  }, [progress])
  const animStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['#E5E7EB', '#F3F4F6']),
  }))
  return <Animated.View style={[animStyle, style]} />
}

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <SkeletonBox style={styles.banner} />
      <View style={styles.content}>
        <SkeletonBox style={styles.lineWide} />
        <SkeletonBox style={styles.lineNarrow} />
        <View style={styles.pillRow}>
          <SkeletonBox style={styles.pill} />
          <SkeletonBox style={styles.pill} />
        </View>
      </View>
    </View>
  )
}

export function FavouritesSkeleton() {
  return (
    <View style={styles.container}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 12, paddingHorizontal: 12, paddingTop: 14 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, overflow: 'hidden' },
  banner: { height: 64, borderRadius: 0 },
  content: { padding: 12, gap: 8 },
  lineWide: { height: 12, borderRadius: 6, width: '60%' },
  lineNarrow: { height: 10, borderRadius: 5, width: '40%' },
  pillRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  pill: { height: 18, borderRadius: 9, width: 60 },
})
