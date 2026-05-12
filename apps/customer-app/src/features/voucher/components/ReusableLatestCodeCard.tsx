import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Info } from 'lucide-react-native'
import { Text } from '@/design-system/Text'

/**
 * ReusableLatestCodeCard — POST-REDEMPTION explainer of what the
 * surfaced redemption code actually represents on Voucher Detail.
 *
 * Mounts directly after <RedemptionDetailsCard> when:
 *   • voucher.type === 'REUSABLE'
 *   • lastRedemption (in-memory) OR voucher.lastRedemption (persisted)
 *     is non-null (i.e. we are inside the 2h presentation window
 *     after a redemption).
 *
 * Copy contract (locked 2026-05-12, contextual placement fix):
 *   • Title: "Your latest code is shown here"
 *   • Body:  "After you redeem, your latest code is available to show
 *            staff for up to 2 hours. Redeeming again creates a new
 *            code and replaces the one shown here."
 *
 * Why this card exists separately from <ReusableGuidanceCard>:
 *   The pre-redemption guidance card explains the REUSABLE model in
 *   the abstract ("Use it again after each redemption"). This card
 *   explains the CONCRETE behaviour of the code being shown ABOVE it
 *   ("Your latest code is shown here … redeeming again replaces it").
 *   The two read as one thought when both surface; but each is
 *   independently truthful for its own state.
 *
 * Surface treatment mirrors <ReusableGuidanceCard> exactly — pale
 * amber inner card (#FEF7E6), 1px hairline border
 * (rgba(217,119,6,0.18)), brand-rose 16pt Info glyph. Visual parity
 * keeps both advisory surfaces in the same register.
 *
 * Q8 D42 / D43 lock — no "cooldown" or "wait" in customer copy.
 *
 * Spec §7.3, §9 copy ledger.
 */

const NAVY     = '#010C35'
const TEXT_2ND = '#4B5563'
const ROSE     = '#E20C04'

export function ReusableLatestCodeCard() {
  const a11yLabel =
    'Your latest code is shown here. After you redeem, your latest code is available to show staff for up to 2 hours. Redeeming again creates a new code and replaces the one shown here.'

  return (
    <View
      testID="voucher-detail-reusable-latest-code"
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
