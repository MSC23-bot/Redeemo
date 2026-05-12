import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Info } from 'lucide-react-native'
import { Text } from '@/design-system/Text'

/**
 * ReusableGuidanceCard — explains the two-clock independence (2h
 * presentation window vs cooldown) for REUSABLE vouchers. Sits
 * between USAGE RULE and ABOUT THIS OFFER on Voucher Detail, parallel
 * placement to the PR #70 TL guidance card.
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
    'Your code stays available. After you redeem, your code stays available to show staff for up to 2 hours. This voucher becomes available again after the time shown above.'

  return (
    <View
      testID="voucher-detail-reusable-guidance"
      accessibilityLabel={a11yLabel}
      style={styles.card}
    >
      <View style={styles.heading}>
        <Info size={16} color={ROSE} strokeWidth={2} />
        <Text variant="label.md" style={styles.title}>Your code stays available</Text>
      </View>
      <Text variant="body.sm" style={styles.body}>
        After you redeem, your code stays available to show staff for up to 2 hours. This voucher becomes available again after the time shown above.
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
