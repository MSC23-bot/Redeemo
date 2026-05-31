import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text, color, radius, spacing } from '@/design-system'

export function VoucherCountPill({ count }: { count: number }) {
  if (count <= 0) return null
  const label = count === 1 ? '1 voucher' : `${count} vouchers`
  return (
    <View style={styles.pill}>
      <Text variant="label.md" style={styles.text}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: color.surface.subtle,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 11,
    color: color.text.primary,
  },
})
