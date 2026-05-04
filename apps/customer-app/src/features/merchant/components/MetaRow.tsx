import React from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, Easing } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { useMotionScale } from '@/design-system/useMotionScale'
import { StatusPill } from './StatusPill'
import { RatingBlock } from './RatingBlock'
import { smartStatus } from '../utils/smartStatus'
import type { OpeningHourEntry } from '@/lib/api/merchant'

type Props = {
  isOpenNow:      boolean
  openingHours:   OpeningHourEntry[]
  distanceMetres: number | null
  avgRating:      number | null
  reviewCount:    number
  switchTrigger?: string | null
  // Test injection point — defaults to new Date(). Production never passes.
  now?: Date
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  if (metres >= 100_000) return null  // suppress: ≥100km hidden per existing rule
  return `${(metres / 1609.34).toFixed(1)} mi`
}

export function MetaRow({ isOpenNow, openingHours, distanceMetres, avgRating, reviewCount, switchTrigger, now }: Props) {
  const motionScale = useMotionScale()
  const opacity = useSharedValue(1)
  const isFirstRender = React.useRef(true)

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (motionScale === 0) return
    opacity.value = withSequence(
      withTiming(0.7, { duration: 90, easing: Easing.out(Easing.ease) }),
      withTiming(1.0, { duration: 90, easing: Easing.out(Easing.ease) }),
    )
  }, [switchTrigger, motionScale, opacity])

  const animatedTextStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  const status = smartStatus(isOpenNow, openingHours, now)
  const distance = formatDistance(distanceMetres)

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <StatusPill state={status.pillState} label={status.pillLabel} />
        <Animated.View style={animatedTextStyle}>
          <Text variant="label.md" style={styles.statusText} testID="meta-row-status-text" numberOfLines={1} ellipsizeMode="tail">
            {status.statusText}
          </Text>
        </Animated.View>
        {distance !== null ? (
          <>
            <Text variant="label.md" style={styles.separator}>·</Text>
            <Animated.View style={animatedTextStyle}>
              <Text variant="label.md" style={styles.distance} testID="meta-row-distance">{distance}</Text>
            </Animated.View>
          </>
        ) : null}
      </View>
      <RatingBlock avgRating={avgRating} reviewCount={reviewCount} />
    </View>
  )
}

const styles = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  left:       { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 },
  statusText: { color: '#222', fontWeight: '500', fontSize: 11 },
  separator:  { color: '#D1D5DB', fontSize: 11 },
  distance:   { color: '#9CA3AF', fontWeight: '400', fontSize: 11 },
})
