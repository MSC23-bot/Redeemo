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
  /** Total number of vouchers available on the merchant. The voucher list is
   *  merchant-wide; the redemption is branch-attributed. The label keeps
   *  these two facts visible in the same line. */
  count:           number
  branchShortName: string
  isMultiBranch:   boolean
  hasVouchers:     boolean
  /** Trigger value: change to fire the fade animation. Pass `selectedBranch.id`. */
  switchTrigger?: string | null | undefined
}

// Round 6 §1: copy + style update.
//
// Two forms:
//   • Multi-branch:  "{n} offers available · Redeem at {branch}"
//                    The redemption context tells the user which
//                    branch they're viewing for redemption.
//   • Single-branch: "{n} offers available"
//                    There's only one branch — the redemption
//                    context is implicit, so just the count.
//
// Both forms keep the product fact "vouchers are merchant-wide"
// front and centre. Owner correction (Round 6 follow-up): single-
// branch merchants must also show the offer count; the previous
// version returned null on single-branch which left the tab
// missing the count entirely.
//
// Singular form: "1 offer available".
export function VoucherContextLabel({ count, branchShortName, isMultiBranch, hasVouchers, switchTrigger }: Props) {
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

  if (!hasVouchers) return null

  const noun = count === 1 ? 'offer' : 'offers'

  return (
    <Animated.View style={[styles.root, animatedStyle]} testID="voucher-context-label">
      <Text variant="label.md" style={styles.text}>
        <Text variant="label.md" style={styles.primary}>{`${count} ${noun} available`}</Text>
        {isMultiBranch && (
          <Text variant="label.md" style={styles.secondary}>{` · Redeem at ${branchShortName}`}</Text>
        )}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root:      { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 12 },
  text:      { fontSize: 12, letterSpacing: -0.05 },
  primary:   { color: '#010C35', fontWeight: '600', fontSize: 12 },
  secondary: { color: '#6B7280', fontWeight: '500', fontSize: 12 },
})
