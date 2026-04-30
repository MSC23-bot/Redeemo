import React from 'react'
import { View } from 'react-native'
import { Text, color, radius, spacing } from '@/design-system'

export function VoucherCountPill({ count }: { count: number }) {
  return (
    <View style={{ backgroundColor: 'rgba(226,12,4,0.08)', borderRadius: radius.pill, paddingHorizontal: spacing[2], paddingVertical: 2 }}>
      <Text variant="label.md" style={{ color: color.brandRose, fontFamily: 'Lato-Bold', fontSize: 10 }}>
        {count} {count === 1 ? 'voucher' : 'vouchers'}
      </Text>
    </View>
  )
}
