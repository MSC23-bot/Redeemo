import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Check } from 'lucide-react-native'
import { Text } from '@/design-system/Text'

type Props = {
  /** Optional ISO date — when provided, formats as "Redeemed on 14 April 2026". */
  redeemedAt?: string | null
}

const SAVING_GRN_BG = 'rgba(22,163,74,0.08)'
const SAVING_GRN    = '#16A34A'
const SAVING_GRN_DK = '#15803D'

/**
 * "Already redeemed this cycle" pill — green badge with check icon.
 * Sits OUTSIDE the coupon (above it) on the redeemed-this-cycle state.
 * Branch-independent per the locked contract (plan §11 C4) —
 * eligibility is per (userId, voucherId) across ALL branches.
 */
export function RedeemedBadge({ redeemedAt }: Props) {
  const dateLabel = redeemedAt
    ? new Date(redeemedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <View style={styles.wrap} testID="redeemed-badge">
      <View style={styles.pill}>
        <Check size={14} color={SAVING_GRN} strokeWidth={2.4} />
        <Text variant="label.md" style={styles.text}>
          {dateLabel ? `Redeemed on ${dateLabel}` : 'Redeemed this cycle'}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginTop: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: SAVING_GRN_BG,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    color: SAVING_GRN_DK,
    letterSpacing: 0.2,
  },
})
