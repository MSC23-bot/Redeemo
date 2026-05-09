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
  /** Number of vouchers STILL REDEEMABLE on the merchant for the current
   *  cycle. Drops by the count of vouchers redeemed in the current cycle
   *  (PR-B T8h fix). When 0 AND `totalCount > 0`, the label switches to
   *  "All offers redeemed this cycle" copy. The voucher list is
   *  merchant-wide; the redemption is branch-attributed. The label
   *  keeps these two facts visible in the same line. */
  count:           number
  /** Total number of vouchers on the merchant (redeemed + available).
   *  Used to disambiguate `count === 0` between "merchant has no
   *  vouchers at all" (early return) vs "merchant has vouchers but
   *  the user has redeemed them all this cycle" (use the all-redeemed
   *  copy). PR-B T8h. Optional for backwards compatibility — when
   *  omitted, the label assumes count === totalCount. */
  totalCount?:     number
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
// PR-B T8h all-redeemed edge case: when `count === 0` AND
// `totalCount > 0` (i.e. the merchant HAS vouchers but the user has
// redeemed them all this cycle), the label switches to "All offers
// redeemed this cycle" instead of "0 offers available". The
// branch-context segment ("Redeem at {branch}") drops in that state
// since there's nothing left to redeem at the branch.
//
// Both forms keep the product fact "vouchers are merchant-wide"
// front and centre. Owner correction (Round 6 follow-up): single-
// branch merchants must also show the offer count; the previous
// version returned null on single-branch which left the tab
// missing the count entirely.
//
// Singular form: "1 offer available".
export function VoucherContextLabel({ count, totalCount, branchShortName, isMultiBranch, hasVouchers, switchTrigger }: Props) {
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

  // PR-B T8h all-redeemed edge case.  When the available count drops
  // to zero AND the merchant DOES have vouchers, the user has
  // redeemed every offer this cycle — surface a clear product
  // statement rather than the awkward "0 offers available".
  const allRedeemed = count === 0 && (totalCount ?? count) > 0

  if (allRedeemed) {
    return (
      <Animated.View style={[styles.root, animatedStyle]} testID="voucher-context-label">
        <Text variant="label.md" style={styles.text}>
          <Text variant="label.md" style={styles.primary}>All offers redeemed this cycle</Text>
        </Text>
      </Animated.View>
    )
  }

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
