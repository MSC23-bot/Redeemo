import React from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withSequence, withTiming,
  Easing, interpolateColor,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { useMotionScale } from '@/design-system/useMotionScale'

type Props = {
  merchantName: string
  branchLine:   string | null
  /** Trigger value: change to fire the flash animation. Pass `selectedBranch.id`. */
  switchTrigger?: string | null
}

export function MerchantHeadline({ merchantName, branchLine, switchTrigger }: Props) {
  const motionScale = useMotionScale()
  const flash = useSharedValue(0)
  const scale = useSharedValue(1)
  const isFirstRender = React.useRef(true)

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (motionScale === 0) return
    flash.value = withSequence(
      withTiming(1, { duration: 120, easing: Easing.out(Easing.ease) }),
      withTiming(0, { duration: 180, easing: Easing.out(Easing.ease) }),
    )
    scale.value = withSequence(
      withTiming(1.04, { duration: 150, easing: Easing.out(Easing.ease) }),
      withTiming(1.0,  { duration: 150, easing: Easing.out(Easing.ease) }),
    )
  }, [switchTrigger, motionScale, flash, scale])

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(flash.value, [0, 1], ['rgba(226,12,4,0)', 'rgba(226,12,4,0.12)']),
    transform: [{ scale: scale.value }],
  }))

  return (
    <View style={styles.root}>
      <Text variant="display.lg" style={styles.name} numberOfLines={1} ellipsizeMode="tail">
        {merchantName}
      </Text>
      {branchLine ? (
        <Animated.View style={[styles.branchLineWrap, animatedStyle]}>
          <Text
            variant="label.lg"
            style={styles.branchLine}
            numberOfLines={1}
            ellipsizeMode="tail"
            testID="merchant-branch-line"
            accessibilityLiveRegion="polite"
          >
            {branchLine}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root:           { gap: 2 },
  name:           { color: '#010C35', fontWeight: '800' },
  branchLineWrap: { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 2 },
  branchLine:     { color: '#E20C04', fontWeight: '700' },
})
