import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Lock, PiggyBank } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { spacing, radius } from '@/design-system/tokens'
import { SavingsHeroGradient } from './SavingsHeroGradient'
import { useCountUp } from '../hooks/useCountUp'

// §Savings Rebaseline spec §State 1 / §State 2 / §State 3.
//
// State 1 — Free user: Lock-icon ring + "Unlock your savings" + Subscribe CTA.
// State 2 — Subscribed empty: PiggyBank ring + "Start saving today" + Browse CTA.
// State 3 — Populated: "Total saved" eyebrow + animated 48pt lifetime + two
//           frosted stat chips ("This month" + "Redemptions").
//
// Two notable design-fidelity decisions vs the brainstorm sketches:
//   - Lifetime amount is 48pt MusticaPro-SemiBold (spec locks display.xl
//     hero size), NOT the brainstorm sketch's 32pt.  The brainstorm is
//     a directional mood board; the spec wins for measurements.
//   - Stat chips are `rgba(255,255,255,0.12)` frosted (spec) NOT the
//     brainstorm's `rgba(255,255,255,0.15)`.  Spec wins.

type State = 'free' | 'subscriber-empty' | 'populated'

type Props = {
  state: State
  onSubscribe: () => void
  onBrowse: () => void
  lifetimeSaving: number
  thisMonthSaving: number
  thisMonthRedemptionCount: number
}

function formatPounds(value: number): string {
  return `£${value.toFixed(2)}`
}

// Reanimated-driven amount.  Drives the hero count-up on the
// populated state. Reduce-motion (via useMotionScale inside useCountUp)
// snaps the underlying value to target immediately; the rendered text
// here always reflects the target value for simplicity — the visual
// "count-up" is an opacity / scale primitive that would slot in for a
// future polish round (deferred; §S2 design-pass scope).
function AnimatedPounds({ value, duration }: { value: number; duration: number }) {
  useCountUp(value, duration)
  return (
    <Animated.Text
      style={styles.lifetimeTotal}
      accessibilityLabel={`${formatPounds(value)} total saved`}
      testID="savings-hero-lifetime"
    >
      {formatPounds(value)}
    </Animated.Text>
  )
}

export function SavingsHeroHeader({
  state,
  onSubscribe,
  onBrowse,
  lifetimeSaving,
  thisMonthSaving,
  thisMonthRedemptionCount,
}: Props) {
  const insets = useSafeAreaInsets()

  return (
    <SavingsHeroGradient style={styles.container}>
      <View
        style={[styles.appBar, { paddingTop: insets.top + 10 }]}
        testID="savings-hero-appbar"
      >
        <Text variant="display.md" style={styles.appBarTitle}>
          Savings
        </Text>
      </View>

      {state === 'free' && (
        <View style={styles.emptyContent} testID="savings-hero-free">
          <View style={styles.iconRing}>
            <Lock size={28} color="#FFFFFF" />
          </View>
          <Text variant="display.sm" style={styles.emptyTitle}>
            Unlock your savings
          </Text>
          <Text variant="body.sm" style={styles.emptyBody}>
            Subscribe to start redeeming vouchers at local businesses and tracking every penny saved.
          </Text>
          <Pressable
            onPress={onSubscribe}
            style={styles.ctaButton}
            accessibilityRole="button"
            accessibilityLabel="Subscribe from 6 pounds 99 per month"
            testID="savings-hero-subscribe-cta"
          >
            <Text variant="heading.sm" style={styles.ctaText}>
              Subscribe — from £6.99/mo
            </Text>
          </Pressable>
        </View>
      )}

      {state === 'subscriber-empty' && (
        <View style={styles.emptyContent} testID="savings-hero-subscriber-empty">
          <View style={styles.iconRing}>
            <PiggyBank size={28} color="#FFFFFF" />
          </View>
          <Text variant="display.sm" style={styles.emptyTitle}>
            Start saving today
          </Text>
          <Text variant="body.sm" style={styles.emptyBody}>
            You&apos;re all set. Redeem a voucher at any local business and your savings will appear here.
          </Text>
          <Pressable
            onPress={onBrowse}
            style={styles.ctaButton}
            accessibilityRole="button"
            accessibilityLabel="Browse vouchers"
            testID="savings-hero-browse-cta"
          >
            <Text variant="heading.sm" style={styles.ctaText}>
              Browse vouchers
            </Text>
          </Pressable>
        </View>
      )}

      {state === 'populated' && (
        <View style={styles.populatedContent} testID="savings-hero-populated">
          <Text style={styles.eyebrow}>Total saved</Text>
          <AnimatedPounds value={lifetimeSaving} duration={900} />
          <View style={styles.chipRow}>
            <View style={styles.statChip}>
              <Text style={styles.chipLabel}>This month</Text>
              <Text style={styles.chipValue}>{formatPounds(thisMonthSaving)}</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.chipLabel}>Redemptions</Text>
              <Text style={styles.chipValue}>{thisMonthRedemptionCount}</Text>
            </View>
          </View>
        </View>
      )}
    </SavingsHeroGradient>
  )
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  appBar: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[3],
  },
  appBarTitle: {
    color: '#FFFFFF',
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 26,
  },
  emptyContent: {
    alignItems: 'center',
    paddingHorizontal: spacing[6],
    paddingTop: spacing[4],
    paddingBottom: spacing[7],
    gap: spacing[3],
  },
  iconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 24,
    textAlign: 'center',
  },
  emptyBody: {
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 21,
  },
  ctaButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: radius.pill,
    marginTop: spacing[2],
  },
  ctaText: {
    color: '#E20C04',
    fontFamily: 'Lato-SemiBold',
  },
  populatedContent: {
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    paddingBottom: spacing[6],
  },
  eyebrow: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.65)',
    marginBottom: spacing[1],
  },
  lifetimeTotal: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 48,
    lineHeight: 52,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
  },
  statChip: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.lg,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    alignItems: 'center',
    gap: 2,
  },
  chipLabel: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.6)',
  },
  chipValue: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 22,
    lineHeight: 26,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
})
