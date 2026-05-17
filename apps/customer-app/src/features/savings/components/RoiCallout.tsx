import React, { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { TrendingUp } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { color, spacing } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'

// §Savings Rebaseline spec §ROI Callout.  Warm gradient card with a
// shimmer sweep that runs every 2.8s after a 1.8s initial delay.
// Hidden when `thisMonthSaving <= 0` or a past month is selected (the
// parent gates the past-month case).  Four variant copy branches.
//
// §Savings emil-pass 6/7 2026-05-17 — shimmer easing.
// Was: `withTiming(2, { duration: 1200 })` with no easing — default
// linear curve.  Linear is correct for constant motion (skeleton
// shimmer, marquee) but the ROI callout shimmer is a discrete event,
// not constant — each sweep is a deliberate highlight.  Per Emil's
// framework: strong ease-out gives the sweep a punchier landing
// instead of grinding to a stop.  Curve = cubic-bezier(0.23, 1,
// 0.32, 1), the Emil-prescribed strong ease-out.

const MONTHLY_COST = 6.99
const ANNUAL_MONTHLY_COST = 69.99 / 12 // £5.83
const EASE_OUT_STRONG = Easing.bezier(0.23, 1, 0.32, 1)

type Props = {
  thisMonthSaving: number
  billingInterval: 'MONTHLY' | 'ANNUAL'
  hasPromo: boolean
}

export function RoiCallout({ thisMonthSaving, billingInterval, hasPromo }: Props) {
  const motionScale = useMotionScale()
  const shimmerX = useSharedValue(-1.2)

  useEffect(() => {
    if (motionScale === 0 || thisMonthSaving <= 0) return
    shimmerX.value = withDelay(
      1800,
      withRepeat(
        withSequence(
          // The sweep itself decelerates strongly — feels intentional
          // rather than mechanical.
          withTiming(2,    { duration: 1200, easing: EASE_OUT_STRONG }),
          // Reset is instant (duration 0) — no easing needed; the
          // value snaps off-screen before the next sweep starts.
          withTiming(-1.2, { duration: 0 }),
        ),
        -1,
        false,
      ),
    )
  }, [motionScale, shimmerX, thisMonthSaving])

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value * 300 }],
  }))

  if (thisMonthSaving <= 0) return null

  const planCost = billingInterval === 'ANNUAL' ? ANNUAL_MONTHLY_COST : MONTHLY_COST
  const isAboveBreakeven = thisMonthSaving >= planCost
  const multiplier = (thisMonthSaving / planCost).toFixed(1)
  const amount = `£${thisMonthSaving.toFixed(2)}`

  // §Savings impeccable 2/6 2026-05-17 — rework against DESIGN.md tokens.
  //
  // Was: 🎉 emoji + UPPERCASE eyebrow headline + deep-brand-red body
  // (custom hex #7C1E1E / #5C0F0F / #C01010 — not in DESIGN.md).
  // Two issues per impeccable:
  //   1. Emoji renders system-dependent (different on iOS / Android /
  //      Hermes); breaks DESIGN.md's typography commitment.
  //   2. Eyebrow-as-Eyebrow Rule: label.eyebrow (uppercase, +1.8
  //      tracking) is a SECTION HEADER, not a body headline.  Using
  //      "YOUR PROMO IS DELIVERING" as a card headline reads SaaS-
  //      celebration — exactly the anti-pattern PRODUCT.md flags.
  //   3. The savings amount in this callout is product narrative, not
  //      state feedback — DESIGN.md prescribes savings-green
  //      `#16A34A` for that role, not deep brand-red.
  //
  // Now:
  //   - Lucide TrendingUp icon (from design-system barrel) replaces the
  //     emoji.  Semantic for "your money back" rationale.
  //   - Eyebrow headline dropped.  The body sentence already does the
  //     work; an extra label muddies the message.
  //   - Body in text.primary navy 14pt Lato Regular.
  //   - Inline emphasis (saving amount + multiplier) in savings-green
  //     Lato-SemiBold.  Tokens, not invented hex.

  const planCopy = billingInterval === 'ANNUAL'
    ? 'your annual plan'
    : 'your £6.99/mo plan'

  return (
    <View style={styles.container} testID="savings-roi-callout">
      <LinearGradient
        colors={['#FFF1EE', '#FEF3C7']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
      />
      <Animated.View style={[styles.shimmer, shimmerStyle]}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.6)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={styles.inner}>
        <View style={styles.iconTile}>
          <TrendingUp size={20} color={color.savingsGreen} />
        </View>
        <View style={styles.textBlock}>
          {hasPromo ? (
            <Text style={styles.body}>
              You&apos;ve saved <Text style={styles.bodyStrong}>{amount}</Text> this month with your promo. Keep it up.
            </Text>
          ) : !isAboveBreakeven ? (
            <Text style={styles.body}>
              You&apos;re on your way. <Text style={styles.bodyStrong}>{amount}</Text> saved so far.
            </Text>
          ) : (
            <Text style={styles.body}>
              Saved <Text style={styles.bodyStrong}>{amount}</Text> on {planCopy}. That&apos;s{' '}
              <Text style={styles.bodyStrong}>{`${multiplier}×`}</Text> your money back.
            </Text>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(226,12,4,0.15)',
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 120,
  },
  // Brainstorm: 14px 16px padding, flex row, gap 12, items start.
  inner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  // 40x40 savings-green tinted tile (background uses savings-green at
  // 10% alpha — pairs with the green TrendingUp icon).  The warm
  // gradient + green tile reads "your money is growing".
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(22,163,74,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
  },
  // body.md (Lato Regular 16/24) in text.primary navy — DESIGN.md
  // standard reading body.  No invented hex.
  body: {
    fontFamily: 'Lato-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: color.text.primary,
  },
  // Inline emphasis on saving amount + multiplier.  Savings-green
  // semibold per DESIGN.md "savings-green is the 'you saved £X'
  // colour" rule.  Tabular-nums keeps amounts aligned across renders.
  bodyStrong: {
    fontFamily: 'Lato-SemiBold',
    color: color.savingsGreen,
    fontVariant: ['tabular-nums'],
  },
})
