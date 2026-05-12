import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Info } from 'lucide-react-native'
import { Text } from '@/design-system/Text'

/**
 * ReusableGuidanceCard — PRE-REDEMPTION explainer of the REUSABLE
 * model. Sits between USAGE RULE and ABOUT THIS OFFER inside the
 * Voucher Detail coupon body, parallel placement to the PR #70 TL
 * guidance card.
 *
 * Copy contract (contextual placement fix 2026-05-12):
 *   • Title: "Use it again after each redemption"
 *   • Body:  "Redeem this voucher when you're ready to use it. After
 *            each redemption, it becomes available again after the
 *            offer's reusable time."
 *
 * Why pre-redemption framing: this card lives in the body of the
 * voucher BEFORE the user has redeemed. The earlier copy ("Your
 * latest code is shown here …") described the post-redemption code
 * lifecycle and now lives on a separate <ReusableLatestCodeCard>
 * mounted next to <RedemptionDetailsCard>.
 *
 * "The offer's reusable time" is intentionally vague to avoid
 * conflicting with the <ReusableRulesCard> above the coupon (which
 * says "Available again every 30 minutes") and the USAGE RULE block
 * directly above this card ("This voucher becomes available again
 * after each use.").
 *
 * Surface treatment unchanged — pale amber inner card (#FEF7E6),
 * 1px hairline border (rgba(217,119,6,0.18)), brand-rose 16pt Info
 * glyph. Mirrors the TL guidance card visually so both advisory
 * surfaces read as the same class.
 *
 * Q8 D42 / D43 lock — no "cooldown" or "wait" in customer copy.
 *
 * Spec §7.3, §9 copy ledger, D24.
 */

const NAVY     = '#010C35'
const TEXT_2ND = '#4B5563'
const ROSE     = '#E20C04'

export function ReusableGuidanceCard() {
  const a11yLabel =
    "Use it again after each redemption. Redeem this voucher when you're ready to use it. After each redemption, it becomes available again after the offer's reusable time."

  return (
    <View
      testID="voucher-detail-reusable-guidance"
      accessibilityLabel={a11yLabel}
      style={styles.card}
    >
      <View style={styles.heading}>
        <Info size={16} color={ROSE} strokeWidth={2} />
        <Text variant="label.md" style={styles.title}>Use it again after each redemption</Text>
      </View>
      <Text variant="body.sm" style={styles.body}>
        Redeem this voucher when you&rsquo;re ready to use it. After each redemption, it becomes available again after the offer&rsquo;s reusable time.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    backgroundColor: '#FEF7E6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.18)',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: NAVY,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    color: TEXT_2ND,
  },
})
