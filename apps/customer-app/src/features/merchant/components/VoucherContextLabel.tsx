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
// Previous: "Showing offers for {branch}" — read as if the vouchers
// belonged to the branch. They don't. Vouchers are merchant-wide;
// only redemption is branch-attributed.
//
// New copy keeps the two product facts visible together:
//
//   "{count} offers available · Redeem at {branch}"
//
//   • "{count} offers available"        primary fact, navy 600
//   • "· Redeem at {branch}"            secondary fact, grey 500
//
// Singular form: "1 offer available · Redeem at {branch}".
//
// Style bumped 11pt 500 grey → 12pt navy/grey for owner-flagged
// readability. paddingTop/Bottom 4/8 → 6/12 so the label has air
// above the first voucher card.
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

  if (!isMultiBranch || !hasVouchers) return null

  const noun = count === 1 ? 'offer' : 'offers'

  return (
    <Animated.View style={[styles.root, animatedStyle]} testID="voucher-context-label">
      <Text variant="label.md" style={styles.text}>
        <Text variant="label.md" style={styles.primary}>{`${count} ${noun} available`}</Text>
        <Text variant="label.md" style={styles.secondary}>{` · Redeem at ${branchShortName}`}</Text>
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
