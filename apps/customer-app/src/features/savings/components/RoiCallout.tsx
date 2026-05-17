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
import { Text } from '@/design-system/Text'
import { spacing } from '@/design-system/tokens'
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

  // §Savings fidelity fixup-2 2026-05-17 — full rework to match the
  // brainstorm composition (was: centred 16pt body text).  New shape:
  //   - flex row: 38x38 rose-tinted icon tile + text block
  //   - eyebrow line (10px, +1px tracking, uppercase, brand-red)
  //   - body line (13px, deep brand-red, inline strong emphasis)
  // No em-dashes in copy (locked rule); replaced with "—" → "·" /
  // sentence break.
  const headline = hasPromo
    ? "YOUR PROMO IS DELIVERING"
    : !isAboveBreakeven
    ? "YOU'RE ON YOUR WAY"
    : "THIS MONTH'S RETURN"

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
          <Text style={styles.iconGlyph}>🎉</Text>
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.headline}>{headline}</Text>
          {hasPromo ? (
            <Text style={styles.body}>
              You saved <Text style={styles.bodyStrong}>{amount}</Text> this month. Keep it up!
            </Text>
          ) : !isAboveBreakeven ? (
            <Text style={styles.body}>
              You&apos;re on your way. <Text style={styles.bodyStrong}>{amount}</Text> saved so far.
            </Text>
          ) : (
            <Text style={styles.body}>
              Saved <Text style={styles.bodyStrong}>{amount}</Text> on {planCopy}. That&apos;s{' '}
              <Text style={styles.pill}>{`${multiplier}×`}</Text> your money back.
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
  // Brainstorm: 38x38 rounded-12 rose-tinted tile, 20pt glyph.
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(226,12,4,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconGlyph: {
    fontSize: 20,
    lineHeight: 24,
  },
  textBlock: {
    flex: 1,
  },
  // Brainstorm eyebrow: 10px Lato-SemiBold +1px tracking uppercase
  // deep brand-red (#C01010).
  headline: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 10,
    letterSpacing: 1,
    color: '#C01010',
    marginBottom: 3,
  },
  // Brainstorm body: 13px Lato regular, deep brand-red, 1.45 lh.
  body: {
    fontFamily: 'Lato-Regular',
    fontSize: 13,
    lineHeight: 19,
    color: '#7C1E1E',
  },
  // Strong inline emphasis: darker brand-red, semibold.
  bodyStrong: {
    fontFamily: 'Lato-SemiBold',
    color: '#5C0F0F',
  },
  // Multiplier emphasis: bright brand-rose semibold (RN doesn't
  // support a true inline pill background on text inside a parent
  // <Text>; rely on weight + colour for emphasis).
  pill: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 13,
    color: '#E20C04',
    fontVariant: ['tabular-nums'],
  },
})
