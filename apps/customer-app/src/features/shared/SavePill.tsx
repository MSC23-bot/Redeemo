import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text, radius } from '@/design-system'

// The value pill. DESIGN.md: "the saving is the data; the data is the hero" —
// so Save reads stronger than the neutral voucher-count chip: savings-green
// tint + Lato Bold amount.
export function SavePill({ amount }: { amount: number | null }) {
  if (amount === null || amount <= 0) return null
  return (
    <View style={styles.pill}>
      <Text style={styles.text}>Save up to £{Math.round(amount)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: '#E7F7EE',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: {
    color: '#15803D',
    fontFamily: 'Lato-Bold',
    fontSize: 12,
    letterSpacing: 0.1,
  },
})
