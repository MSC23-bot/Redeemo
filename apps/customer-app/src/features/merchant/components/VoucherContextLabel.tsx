import React from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { useMotionScale } from '@/design-system/useMotionScale'

type Props = {
  branchShortName: string
  isMultiBranch:   boolean
  hasVouchers:     boolean
  /** Trigger value: change to fire the fade animation. Pass `selectedBranch.id`. */
  switchTrigger?: string | null | undefined
}

export function VoucherContextLabel({ branchShortName, isMultiBranch, hasVouchers, switchTrigger }: Props) {
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

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  if (!isMultiBranch || !hasVouchers) return null

  return (
    <Animated.View style={[styles.root, animatedStyle]} testID="voucher-context-label">
      <Text variant="label.md" style={styles.text}>
        Showing offers for {branchShortName}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 8 },
  text: { color: '#666', fontSize: 11, fontWeight: '500' },
})
