import React from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, withSpring, Easing } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { lightHaptic } from '@/design-system/haptics'
import { useMotionScale } from '@/design-system/useMotionScale'

type Props = {
  isMultiBranch: boolean
  onPress: () => void
  /** Animate caret nod when this changes. Pass selectedBranch.id. */
  switchTrigger?: string | null
  /** Play first-visit caret bounce hint once on mount. Default true. */
  hintOnFirstVisit?: boolean
}

export function BranchChip({ isMultiBranch, onPress, switchTrigger, hintOnFirstVisit = true }: Props) {
  const motionScale = useMotionScale()
  const caretRotate = useSharedValue(0)
  const caretBounce = useSharedValue(0)
  const isFirstRender = React.useRef(true)
  const hasHinted = React.useRef(false)

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      // First-visit hint
      if (isMultiBranch && hintOnFirstVisit && !hasHinted.current && motionScale !== 0) {
        hasHinted.current = true
        caretBounce.value = withSequence(
          withTiming(-2, { duration: 200, easing: Easing.out(Easing.ease) }),
          withSpring(0, { damping: 6, stiffness: 180 }),
        )
      }
      return
    }
    // Subsequent switches: nod tilt
    if (!isMultiBranch || motionScale === 0) return
    caretRotate.value = withSequence(
      withTiming(-8, { duration: 100, easing: Easing.out(Easing.ease) }),
      withSpring(0, { damping: 5, stiffness: 200 }),
    )
  }, [switchTrigger, isMultiBranch, hintOnFirstVisit, motionScale, caretRotate, caretBounce])

  const caretStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: caretBounce.value },
      { rotate: `${caretRotate.value}deg` },
    ],
  }))

  if (!isMultiBranch) return null

  return (
    <Pressable
      style={styles.chip}
      accessibilityRole="button"
      accessibilityLabel="Switch branch"
      onPress={() => { lightHaptic(); onPress() }}
    >
      <Text variant="label.md" style={styles.text}>Switch branch</Text>
      <Animated.View style={caretStyle} testID="chip-caret">
        <Text variant="label.md" style={styles.caret}>▾</Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip:  { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 11, borderRadius: 8, backgroundColor: 'rgba(226,12,4,0.07)', borderWidth: 1, borderColor: 'rgba(226,12,4,0.20)' },
  text:  { color: '#E20C04', fontWeight: '600', fontSize: 11 },
  caret: { color: '#E20C04', fontSize: 12 },
})
