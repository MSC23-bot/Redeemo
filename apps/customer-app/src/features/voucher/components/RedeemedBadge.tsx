import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Check } from 'lucide-react-native'
import { Text } from '@/design-system/Text'

/**
 * "Already redeemed this cycle" badge — sits OUTSIDE the coupon (above
 * or beside it). Branch-independent per the locked contract (plan §11
 * C4) — eligibility is per (userId, voucherId) across ALL branches.
 */
export function RedeemedBadge() {
  return (
    <View style={styles.root} testID="redeemed-badge">
      <View style={styles.iconBox}>
        <Check size={14} color="#FFFFFF" strokeWidth={3} />
      </View>
      <Text variant="label.md" style={styles.text}>
        Redeemed this cycle
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    backgroundColor: '#DCFCE7',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    marginHorizontal: 16,
    marginTop: 8,
  },
  iconBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
    letterSpacing: 0.2,
  },
})
