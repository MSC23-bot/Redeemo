import React from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, Easing } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { lightHaptic } from '@/design-system/haptics'
import { useMotionScale } from '@/design-system/useMotionScale'

type Props = {
  isMultiBranch: boolean
  onPress: () => void
  /** Play first-visit caret bounce hint once on mount. Default true. */
  hintOnFirstVisit?: boolean
}

// Section 1 of the visual correction round: removed the caret-nod-on-switch
// animation (was decorative — Emil framework: "if purpose is just 'looks
// cool' don't animate"). The branch-switch feedback is now centralised in
// the BranchContextBand's coordinated transition (Section 4).
//
// First-visit caret hint kept but calmed:
//   - Magnitude reduced -2pt → -1pt (half the bounce height).
//   - Spring replaced with strong-ease-out (no rebound, matches brand-red
//     premium tone — Emil ban on spring/bounce in professional UI).
//   - Fires once per session per merchant on mount when multi-branch.
export function BranchChip({ isMultiBranch, onPress, hintOnFirstVisit = true }: Props) {
  const motionScale = useMotionScale()
  const caretBounce = useSharedValue(0)
  const isFirstRender = React.useRef(true)
  const hasHinted = React.useRef(false)

  React.useEffect(() => {
    if (!isFirstRender.current) return
    isFirstRender.current = false
    if (isMultiBranch && hintOnFirstVisit && !hasHinted.current && motionScale !== 0) {
      hasHinted.current = true
      caretBounce.value = withSequence(
        withTiming(-1, { duration: 180, easing: Easing.bezier(0.23, 1, 0.32, 1) }),
        withTiming(0,  { duration: 220, easing: Easing.bezier(0.23, 1, 0.32, 1) }),
      )
    }
  }, [isMultiBranch, hintOnFirstVisit, motionScale, caretBounce])

  const caretStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: caretBounce.value }],
  }))

  if (!isMultiBranch) return null

  return (
    <Pressable
      style={styles.chip}
      accessibilityRole="button"
      accessibilityLabel="Switch branch"
      onPress={() => { lightHaptic(); onPress() }}
      hitSlop={8}
    >
      <Text variant="label.md" style={styles.text}>Switch branch</Text>
      <Animated.View style={caretStyle} testID="chip-caret">
        <Text variant="label.md" style={styles.caret}>▾</Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: 'rgba(226,12,4,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(226,12,4,0.20)',
  },
  text:  { color: '#E20C04', fontWeight: '600', fontSize: 11 },
  caret: { color: '#E20C04', fontSize: 12 },
})
