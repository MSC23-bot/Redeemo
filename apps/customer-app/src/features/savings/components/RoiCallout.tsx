import React, { useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { TrendingUp, X } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { color, spacing } from '@/design-system/tokens'

// §Savings Rebaseline spec §ROI Callout.  Warm gradient card sitting
// in the populated insight section.  Hidden when
// `thisMonthSaving <= 0` or a past month is selected (the parent
// gates the past-month case).  Four variant copy branches.
//
// §Savings device-QA fixup 4 2026-05-18 — three changes:
//   1. Copy: contraction + "monthly plan" instead of "/mo plan".
//      Reads as a sentence, not a marketing tagline.
//   2. Motion dropped: the shimmer sweep was found "annoying" on
//      device QA.  Static warm gradient — no looped highlight.
//   3. X dismiss: small X in the top-right; tap hides the card for
//      the current session.  Re-appears on next app launch (no
//      persistence yet — explicit owner direction).

const MONTHLY_COST = 6.99
const ANNUAL_MONTHLY_COST = 69.99 / 12 // £5.83

type Props = {
  thisMonthSaving: number
  billingInterval: 'MONTHLY' | 'ANNUAL'
  hasPromo: boolean
}

export function RoiCallout({ thisMonthSaving, billingInterval, hasPromo }: Props) {
  // Session-only dismissal — local component state.  No async storage,
  // no React Query mutation.  Resets on app relaunch by design.
  const [dismissed, setDismissed] = useState(false)

  if (thisMonthSaving <= 0) return null
  if (dismissed) return null

  const planCost = billingInterval === 'ANNUAL' ? ANNUAL_MONTHLY_COST : MONTHLY_COST
  const isAboveBreakeven = thisMonthSaving >= planCost
  const multiplier = (thisMonthSaving / planCost).toFixed(1)
  const amount = `£${thisMonthSaving.toFixed(2)}`

  const planCopy = billingInterval === 'ANNUAL'
    ? 'your annual plan'
    : 'your £6.99 monthly plan'

  return (
    <View style={styles.container} testID="savings-roi-callout">
      <LinearGradient
        colors={['#FFF1EE', '#FEF3C7']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
      />
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
              You&apos;ve saved <Text style={styles.bodyStrong}>{amount}</Text> on {planCopy}. That&apos;s{' '}
              <Text style={styles.bodyStrong}>{`${multiplier}×`}</Text> your money back.
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => setDismissed(true)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss savings callout"
          testID="savings-roi-callout-dismiss"
          style={styles.dismissButton}
        >
          <X size={14} color={color.text.tertiary} />
        </Pressable>
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
  inner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  // 40x40 savings-green tinted tile pairs with the green TrendingUp
  // icon — warm gradient + green tile reads "your money is growing".
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
  // body.sm-ish (14/20) in text.primary navy.  No invented hex.
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
  // Top-right dismiss — small tap target, hitSlop for accessibility.
  // No backdrop; the X sits directly on the warm gradient.
  dismissButton: {
    alignSelf: 'flex-start',
    padding: 2,
    marginLeft: spacing[1],
    marginTop: -2,
  },
})
