import React from 'react'
import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'

/**
 * VoucherCardRedeemedStamp — refined "Voucher Redeemed" mark for the
 * merchant-profile voucher card hero (PR-B T8i, owner-locked
 * 2026-05-10).
 *
 * **Owner direction trail:**
 *   • T8h (REVERTED at T8i): tried a refined hairline-accent treatment
 *     on the LARGER Voucher Detail hero seal — wrong surface; reverted.
 *   • T8i revert: the Voucher Detail hero seal stays on the original
 *     rubber-stamp design.  The refined treatment lives ONLY here.
 *   • T8i refinement (this round): owner direction "now it reads
 *     redeemed, but it should read voucher redeemed.  And it does
 *     not need to be top right corner.  It could be in the center,
 *     slightly bigger, but please change the style".
 *
 * Visual contract (T8i refinement):
 *   • Copy:    "Voucher Redeemed" — two words, level, all-caps.  Was
 *              "REDEEMED" single word.
 *   • Backdrop: soft cream → pale-rose vertical gradient.
 *   • Border:  1.5px brand-rose @ 55%.
 *   • Layout:  level (no tilt).  Position is owned by the parent
 *              VoucherCard — T8i moves the wrap from the top-right
 *              corner to a centered overlay across the hero.
 *   • Title:   letter-spaced wide, brand-rose colour, full opacity.
 *              No textShadow, no ink-pressure cues.
 *   • Lift:    subtle brand-rose drop shadow for depth.
 *   • Sizing:  default 52pt outer (was 36pt) — bumped per T8i
 *              "slightly bigger".  Text + paddings derive from the
 *              outer size.
 *   • No entrance animation per brief §6 — instant recognition on a
 *              list card.
 *
 * Cross-refs:
 *   - apps/customer-app/src/features/voucher/components/RedeemedSeal.tsx
 *     (Voucher Detail hero — rubber-stamp DNA, intentionally separate).
 *   - deferred-followups §Q4 — stays closed.
 */
type Props = {
  /**
   * Outer height in pt. Default 52 — T8i "slightly bigger" bump from
   * the previous 36 to give the centered mark visual weight on a
   * card-scale hero.  Override at call site if a tighter fit is
   * required for narrower devices.
   */
  size?: number
}

export function VoucherCardRedeemedStamp({ size = 52 }: Props) {
  const fontSize     = Math.max(11, Math.round(size * 0.27))
  const paddingV     = Math.round(size * 0.20)
  const paddingH     = Math.round(size * 0.42)
  const borderRadius = Math.round(size * 0.24)

  return (
    <View
      testID="voucher-card-redeemed-stamp"
      pointerEvents="none"
      style={[
        styles.stamp,
        {
          paddingVertical:   paddingV,
          paddingHorizontal: paddingH,
          borderRadius,
        },
      ]}
    >
      {/* Soft cream → pale-rose gradient backdrop. */}
      <LinearGradient
        colors={['#FFFBF5', '#FFEFE8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <Text
        variant="label.eyebrow"
        style={[styles.text, { fontSize, lineHeight: Math.round(fontSize * 1.3) }]}
      >
        Voucher Redeemed
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  stamp: {
    // Level — no tilt.  T8i premium / editorial direction.
    borderWidth: 1.5,
    borderColor: 'rgba(226, 12, 4, 0.55)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.brandRose,
    shadowOpacity: 0.20,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  text: {
    color: color.brandRose,
    fontWeight: '700',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    includeFontPadding: true,
  },
})
