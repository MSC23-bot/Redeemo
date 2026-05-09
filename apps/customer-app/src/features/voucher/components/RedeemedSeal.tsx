import React, { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'

type Props = {
  /**
   * ISO string for the cycle renewal date — voucher.availableAgainAt.
   * Optional: when null/undefined, the seal still renders ("Voucher
   * Redeemed") but the renewal subline is suppressed. The seal is
   * cycle-aware on the happy path; on partial-payload edge cases it
   * degrades gracefully rather than crashing.
   */
  availableAgainAt?: string | null
}

/**
 * RedeemedSeal — premium "redeemed" overlay (PR-B T8h redesign).
 *
 * **Owner direction (locked 2026-05-10 from device QA):** the previous
 * tilted rubber-stamp aesthetic with ink-fade bands + cream speckles
 * read as "cheap". The new treatment is calm, refined, premium —
 * level (no tilt), thin 1.5px border, soft cream gradient backdrop,
 * letter-spaced wide typography, and a gentle fade-in entrance with
 * NO impact overshoot. The voucher hero behind it carries the cream
 * gradient wash that gives the surface its "redeemed" weight; the
 * seal itself reads as a small, high-end product label rather than
 * a heavy rubber stamp.
 *
 * Replaces the wave 7-14 rubber-stamp design (tilt -8°, ink-fade band,
 * ink-mid band, 4 cream speckles, ink-pressure textShadow, impact
 * compression at the end of the entrance). All of that is gone.
 *
 * Visual contract:
 *   • Backdrop: soft cream → pale-rose vertical gradient, 1.5px brand-
 *     rose border. Subtle drop shadow for depth.
 *   • Title: "REDEEMED" — 16pt 700, letter-spacing 5 (was 22pt 900,
 *     letter-spacing 1.8). Brand-rose colour preserved as the
 *     identity signal.
 *   • Subtitle: "Renews 9 June 2026" — 11pt 600, letter-spacing 0.6,
 *     navy ink rather than brand-rose. Reads as receipt detail.
 *   • Hairline accents: thin 1px brand-rose@30% lines flank the
 *     title left + right, breaking the seal into a centered editorial
 *     mark rather than a pure label.
 *   • Entrance: fade-in (0 → 1) + gentle scale (0.96 → 1.0) over
 *     280ms ease-out-quad. No translateY drop, no impact overshoot.
 *   • Reduced-motion: skips the entrance entirely.
 *
 * Cross-refs:
 *   - deferred-followups §Q1 — full redeemed-state visual redesign
 *     (washed-out coupon + merchant-profile redeemed card) remains
 *     deferred. T8h closes the immediate "looks cheap" feedback.
 *   - deferred-followups §AE — presentation-window contract.
 *   - utils/presentationWindow.ts — drives WHEN this surfaces.
 */

const ENTRANCE_DURATION_MS = 280
const INITIAL_SCALE        = 0.96

export function RedeemedSeal({ availableAgainAt }: Props) {
  const renewalLabel = availableAgainAt
    ? new Date(availableAgainAt).toLocaleDateString('en-GB', {
        day:   'numeric',
        month: 'long',
        year:  'numeric',
      })
    : null

  const reducedMotion = useReducedMotion()
  const scale   = useSharedValue(reducedMotion ? 1 : INITIAL_SCALE)
  const opacity = useSharedValue(reducedMotion ? 1 : 0)

  useEffect(() => {
    if (reducedMotion) return
    scale.value = withTiming(1, {
      duration: ENTRANCE_DURATION_MS,
      easing:   Easing.out(Easing.quad),
    })
    opacity.value = withTiming(1, {
      duration: ENTRANCE_DURATION_MS,
      easing:   Easing.out(Easing.quad),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ scale: scale.value }],
  }))

  return (
    <View style={styles.wrap} testID="redeemed-seal">
      <Animated.View style={[styles.seal, animatedStyle]}>
        {/* Soft cream → pale-rose gradient backdrop fills the seal.
            Replaces the previous solid `#FFF6EE` fill — gradient gives
            the seal a quiet sheen that reads as a refined product mark
            rather than a printed sticker. */}
        <LinearGradient
          colors={['#FFFBF5', '#FFEFE8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={styles.titleRow}>
          {/* Hairline accents flank the title — thin brand-rose lines
              that frame the editorial mark without competing with it. */}
          <View style={styles.hairline} />
          <Text style={styles.title}>Redeemed</Text>
          <View style={styles.hairline} />
        </View>
        {renewalLabel ? (
          <Text style={styles.subtitle}>Renews {renewalLabel}</Text>
        ) : null}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  seal: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(226, 12, 4, 0.55)',
    overflow: 'hidden',
    alignItems: 'center',
    // Soft brand-rose lift so the seal hovers gently above the
    // washed-out hero without competing with the voucher's gradient.
    shadowColor: color.brandRose,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    gap: 6,
    // Min width keeps the seal from collapsing on short renewal labels
    // and gives the title room to breathe with the wide letter-spacing.
    minWidth: 220,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hairline: {
    width: 22,
    height: 1,
    backgroundColor: 'rgba(226, 12, 4, 0.45)',
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: color.brandRose,
    letterSpacing: 5,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: color.navy,
    letterSpacing: 0.6,
    opacity: 0.78,
  },
})
