import React, { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, { useAnimatedReaction, runOnJS } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Lock, PiggyBank } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { color, elevation, radius, spacing } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'
import { SavingsHeroGradient } from './SavingsHeroGradient'
import { useCountUp } from '../hooks/useCountUp'

// §Savings impeccable 6/6 2026-05-17 — hero rework per DESIGN.md.
//
// Three states, two tones (locked owner direction):
//
//   State 1 — Free user (conversion surface)
//     Brand-rose drench KEPT.  Brand-rose IS the call to action here;
//     the whole hero exists to convert the user to a subscription.
//     The white-pill CTA on the rose ground reads as the brand
//     inversion — same pattern used on auth chrome.  Em-dash removed
//     from the CTA copy (impeccable 1/6).
//
//   State 2 — Subscriber, no redemptions yet
//     MOVED to cream identity zone (FFF9F5 → FCF0E5 gradient).
//     PiggyBank icon ring tints navy on cream.  Title in navy
//     Mustica Pro.  Body in navy secondary.  CTA: brand-gradient
//     button (Rose → Coral) with elevation.glow — the primary action
//     pattern from DESIGN.md card-button-primary.  This state isn't
//     a SaaS metric card; it's a calm "you're set, go redeem" moment.
//
//   State 3 — Populated dashboard
//     MOVED to cream identity zone.  The "hero metric template"
//     (eyebrow + big number + supporting stat chips + gradient
//     accent) is the SaaS cliché that PRODUCT.md + DESIGN.md both
//     explicitly ban.  Rework:
//       - eyebrow chip dropped
//       - frosted stat chips dropped
//       - £247.50 in display.xl navy on cream — the savings amount
//         is still the data, but it lands as editorial type, not as
//         a dashboard metric tile
//       - single inline caption beneath: "£32 this month · 5
//         redemptions" in body.sm tertiary — a sentence, not metrics
//
// One-Voice Brand-Rose Rule: rose now appears only on State 1 hero
// + the State 2 CTA, never as ambient ground on subscriber surfaces.
// Cream-for-Identity Rule: cream frames the savings moment;
// surfaces stay white elsewhere (page bg unchanged).

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

// Hero count-up — see emil-pass 7/7 for the sub-pence dedup rationale.
function AnimatedPounds({
  value,
  duration,
  textStyle,
}: {
  value: number
  duration: number
  textStyle: object
}) {
  const motion = useMotionScale()
  const sharedValue = useCountUp(value, duration)
  const [displayed, setDisplayed] = useState(motion === 0 ? value : 0)

  useAnimatedReaction(
    () => Math.round(sharedValue.value * 100) / 100,
    (currentRounded, previousRounded) => {
      if (currentRounded !== previousRounded) {
        runOnJS(setDisplayed)(currentRounded)
      }
    },
    [sharedValue],
  )

  return (
    <Animated.Text
      style={textStyle}
      accessibilityLabel={`${formatPounds(value)} total saved`}
      testID="savings-hero-lifetime"
    >
      {formatPounds(displayed)}
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
  const tone: 'brand' | 'cream' = state === 'free' ? 'brand' : 'cream'

  // Caption beneath the populated amount.  Singular vs plural on the
  // redemption count — small thing, reads correct on real data.
  const redemptionWord = thisMonthRedemptionCount === 1 ? 'redemption' : 'redemptions'
  const populatedCaption = `${formatPounds(thisMonthSaving)} this month · ${thisMonthRedemptionCount} ${redemptionWord}`

  return (
    <SavingsHeroGradient style={styles.container} tone={tone}>
      <View
        style={[styles.appBar, { paddingTop: insets.top + 10 }]}
        testID="savings-hero-appbar"
      >
        <Text
          variant="display.md"
          style={tone === 'cream' ? styles.appBarTitleCream : styles.appBarTitleBrand}
        >
          Savings
        </Text>
      </View>

      {state === 'free' && (
        <View style={styles.emptyContentBrand} testID="savings-hero-free">
          <View style={styles.iconRingBrand}>
            <Lock size={28} color="#FFFFFF" />
          </View>
          <Text variant="display.sm" style={styles.emptyTitleBrand}>
            Unlock your savings
          </Text>
          <Text variant="body.sm" style={styles.emptyBodyBrand}>
            Subscribe to start redeeming vouchers at local businesses and tracking every penny saved.
          </Text>
          <PressableScale
            onPress={onSubscribe}
            style={styles.ctaButtonBrand}
            accessibilityRole="button"
            accessibilityLabel="Subscribe from 6 pounds 99 per month"
            testID="savings-hero-subscribe-cta"
          >
            <Text variant="heading.sm" style={styles.ctaTextBrand}>
              Subscribe from £6.99/mo
            </Text>
          </PressableScale>
        </View>
      )}

      {state === 'subscriber-empty' && (
        <View style={styles.emptyContentCream} testID="savings-hero-subscriber-empty">
          <View style={styles.iconRingCream}>
            <PiggyBank size={28} color={color.navy} />
          </View>
          <Text variant="display.sm" style={styles.emptyTitleCream}>
            Start saving today
          </Text>
          <Text variant="body.sm" style={styles.emptyBodyCream}>
            You&apos;re all set. Redeem a voucher at any local business and your savings will appear here.
          </Text>
          <PressableScale
            onPress={onBrowse}
            style={styles.ctaButtonGradient}
            accessibilityRole="button"
            accessibilityLabel="Browse vouchers"
            testID="savings-hero-browse-cta"
          >
            <LinearGradient
              colors={['#E20C04', '#E84A00']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Text variant="heading.sm" style={styles.ctaTextGradient}>
              Browse vouchers
            </Text>
          </PressableScale>
        </View>
      )}

      {state === 'populated' && (
        <View style={styles.populatedContentCream} testID="savings-hero-populated">
          <AnimatedPounds
            value={lifetimeSaving}
            duration={900}
            textStyle={styles.lifetimeTotalCream}
          />
          <Text
            variant="body.sm"
            style={styles.populatedCaption}
            testID="savings-hero-populated-caption"
          >
            {populatedCaption}
          </Text>
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
  appBarTitleBrand: {
    color: '#FFFFFF',
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 26,
  },
  appBarTitleCream: {
    color: color.navy,
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 26,
  },

  // ── State 1 (brand) ──────────────────────────────────────────────
  emptyContentBrand: {
    alignItems: 'center',
    paddingHorizontal: spacing[6],
    paddingTop: spacing[4],
    paddingBottom: spacing[7],
    gap: spacing[3],
  },
  iconRingBrand: {
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
  emptyTitleBrand: {
    color: '#FFFFFF',
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 24,
    textAlign: 'center',
  },
  emptyBodyBrand: {
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 21,
  },
  ctaButtonBrand: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: radius.pill,
    marginTop: spacing[2],
  },
  ctaTextBrand: {
    color: '#E20C04',
    fontFamily: 'Lato-SemiBold',
  },

  // ── State 2 (cream) ──────────────────────────────────────────────
  emptyContentCream: {
    alignItems: 'center',
    paddingHorizontal: spacing[6],
    paddingTop: spacing[4],
    paddingBottom: spacing[7],
    gap: spacing[3],
  },
  iconRingCream: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(1,12,53,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(1,12,53,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  emptyTitleCream: {
    color: color.navy,
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 24,
    textAlign: 'center',
  },
  emptyBodyCream: {
    color: color.text.secondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  // Brand-gradient CTA on cream — DESIGN.md primary-button pattern:
  // Rose → Coral, white text, elevation.glow.  `overflow: 'hidden'`
  // clips the LinearGradient layer to the pill silhouette.
  ctaButtonGradient: {
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: radius.pill,
    marginTop: spacing[2],
    overflow: 'hidden',
    ...elevation.glow,
  },
  ctaTextGradient: {
    color: '#FFFFFF',
    fontFamily: 'Lato-SemiBold',
  },

  // ── State 3 (cream populated) ────────────────────────────────────
  // Editorial layout: amount left-aligned at display.xl, single
  // sentence caption beneath in body.sm tertiary.  No eyebrow.  No
  // frosted chips.  No gradient accent.  Cream identity zone frames
  // the savings amount as product narrative — exactly what
  // DESIGN.md "Display XL: savings amounts on hero surfaces"
  // prescribes, without the SaaS metric-tile composition around it.
  populatedContentCream: {
    alignItems: 'flex-start',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    paddingBottom: spacing[6],
    gap: spacing[2],
  },
  lifetimeTotalCream: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -0.5,
    color: color.navy,
    fontVariant: ['tabular-nums'],
  },
  populatedCaption: {
    color: color.text.tertiary,
    fontVariant: ['tabular-nums'],
  },
})
