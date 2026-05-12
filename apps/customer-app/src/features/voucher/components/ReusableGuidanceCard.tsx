import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Info } from 'lucide-react-native'
import { Text } from '@/design-system/Text'

/**
 * ReusableGuidanceCard — truthful explainer for what the Voucher
 * Detail surface actually shows about REUSABLE codes. Sits between
 * USAGE RULE and ABOUT THIS OFFER on Voucher Detail, parallel
 * placement to the PR #70 TL guidance card.
 *
 * Copy contract (Gate E follow-up 2026-05-12, Option B):
 *   • Title: "Your latest code is shown here"
 *   • Body:  "After you redeem, your latest code is available to show
 *            staff for up to 2 hours. Redeeming again creates a new
 *            code and replaces the one shown here."
 *
 * Previous copy ("Your code stays available") was technically untrue
 * from the user's perspective — Voucher Detail surfaces only the
 * LATEST redemption code; redeeming again replaces the prior code in
 * the UI. The new copy is honest about THIS behaviour.
 *
 * Surface treatment matches the TL guidance card in
 * <CouponBody> (`tlGuidance` style block) exactly — pale amber inner
 * card (#FEF7E6), 1px hairline border (rgba(217,119,6,0.18)), and a
 * brand-rose 16pt Info glyph. Mirroring the TL card keeps both
 * advisory surfaces visually consistent across voucher types.
 *
 * Spec §7.3, §9 copy ledger, D24.
 */

const NAVY     = '#010C35'
const TEXT_2ND = '#4B5563'
const ROSE     = '#E20C04'

export function ReusableGuidanceCard() {
  const a11yLabel =
    'Your latest code is shown here. After you redeem, your latest code is available to show staff for up to 2 hours. Redeeming again creates a new code and replaces the one shown here.'

  return (
    <View
      testID="voucher-detail-reusable-guidance"
      accessibilityLabel={a11yLabel}
      style={styles.card}
    >
      <View style={styles.heading}>
        <Info size={16} color={ROSE} strokeWidth={2} />
        <Text variant="label.md" style={styles.title}>Your latest code is shown here</Text>
      </View>
      <Text variant="body.sm" style={styles.body}>
        After you redeem, your latest code is available to show staff for up to 2 hours. Redeeming again creates a new code and replaces the one shown here.
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
