import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Tag } from '@/design-system/icons'
import { Text, color, radius } from '@/design-system'

// Quiet neutral chip with a small tag glyph — the count is supporting metadata;
// the Save pill (savings-green) carries the value weight (DESIGN.md: the saving
// is the data, the data is the hero).
export function VoucherCountPill({ count }: { count: number }) {
  if (count <= 0) return null
  const label = count === 1 ? '1 voucher' : `${count} vouchers`
  return (
    <View style={styles.pill}>
      <Tag size={11} color={color.text.secondary} strokeWidth={2} />
      <Text variant="label.md" style={styles.text}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: color.surface.subtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 11,
    color: color.text.secondary,
  },
})
