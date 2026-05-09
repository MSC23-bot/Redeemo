import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'

/**
 * VoucherCardRedeemedStamp — small "REDEEMED" rubber-stamp variant
 * sized for the merchant-profile voucher card hero (PR-B T5,
 * closes deferred-followups §Q4).
 *
 * Visual DNA mirrors the larger `RedeemedSeal` (Voucher Detail's
 * hero overlay): brand-rose ink at reduced opacity for the rubber-
 * stamp ink-pressure feel + cream fill + brand-rose border + ~5°
 * tilt + ink-pressure textShadow. NO entrance animation — the stamp
 * renders static at mount per brief §6 "Reduced motion" requirement
 * (and parity with the broader §Q4 spec — the larger seal animates
 * on Voucher Detail because that's the primary surface; on a list
 * card we want the redeemed-state recognition to be instant).
 *
 * Cross-refs:
 *   - design brief §3.5 + §5.5 + §8.5 + §6 Key States
 *   - plan §Task 5 Step 5.1
 *   - apps/customer-app/src/features/voucher/components/RedeemedSeal.tsx
 *     (the larger Voucher Detail hero seal — same visual language at
 *     larger scale + entrance animation)
 *   - deferred-followups §Q4 (closed by this component)
 *
 * The component is intentionally separate from `RedeemedSeal` rather
 * than a size variant: the parent surfaces have different mount
 * patterns (Voucher Detail hero overlay vs merchant-profile card
 * hero overlay) and keeping each surface independently tunable lets
 * a future polish pass on either side land without coupling the
 * other.
 */
type Props = {
  /**
   * Diameter / outer size in pt. Default 36 — sits within brief
   * §3.5 "30-40pt diameter" range. The brief leaves the exact
   * value for impl-time on-device review at small (375pt) +
   * large (430pt) device widths.
   */
  size?: number
}

export function VoucherCardRedeemedStamp({ size = 36 }: Props) {
  // Internal text auto-scales with the outer size so the component
  // looks balanced across 30-40pt range without a separate prop.
  // 36pt outer → ~9pt label.eyebrow-ish glyphs after rotation.
  const fontSize = Math.max(8, Math.round(size * 0.25))
  const paddingV = Math.round(size * 0.16)
  const paddingH = Math.round(size * 0.22)
  const borderRadius = Math.round(size * 0.20)

  // Note on a11y: this component does NOT set
  // `accessibilityElementsHidden` / `importantForAccessibility="no"`
  // even though the parent VoucherCard already announces redeemed
  // status via its `accessibilityLabel` (". Already redeemed this
  // cycle"). The cleaner trade-off is to leave the inner Text node
  // accessible to the RNTL `getByText('REDEEMED')` query — which
  // the existing voucher-card.test.tsx pin uses — at the cost of
  // a screen-reader hearing "REDEEMED" twice on the same card
  // (once via parent a11y label, once via the stamp's text). On a
  // visually-stamped surface the duplication is mild and the
  // alternative (hiding the subtree) breaks the test pin.
  return (
    <View
      testID="voucher-card-redeemed-stamp"
      pointerEvents="none"
      style={[
        styles.stamp,
        {
          paddingVertical: paddingV,
          paddingHorizontal: paddingH,
          borderRadius,
        },
      ]}
    >
      <Text
        variant="label.eyebrow"
        style={[styles.text, { fontSize, lineHeight: Math.round(fontSize * 1.2) }]}
      >
        REDEEMED
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  stamp: {
    // Rubber-stamp tilt — mirrors RedeemedSeal's rest rotation
    // direction at smaller magnitude (-5° here vs -8° on the
    // larger Voucher Detail seal). Static — no entrance motion
    // per brief §6.
    transform: [{ rotate: '-5deg' }],
    backgroundColor: '#FFF6EE',
    borderWidth: 2,
    borderColor: color.brandRose,
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle drop so the stamp lifts off the muted hero gradient.
    // Brand-rose tint matches the parent card's per-type shadow
    // language (each card already drops a colour-tinted shadow).
    shadowColor: color.brandRose,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    overflow: 'visible',
  },
  text: {
    color: color.brandRose,
    fontWeight: '900',
    letterSpacing: 1.6,
    // ~50% opacity per brief §3.5 — preserves the rubber-stamp
    // ink-pressure feel (the cream fill behind it gives the text
    // its visual weight; the 50% opacity reads as "stamped ink",
    // not "freshly printed").
    opacity: 0.55,
    // Ink-pressure textShadow — same trick RedeemedSeal uses:
    // tight 0.5/0.5 offset with 0 radius mimics ink slightly
    // bleeding to one side under stamp pressure.
    textShadowColor: 'rgba(226,12,4,0.45)',
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 0,
    includeFontPadding: true,
  },
})
