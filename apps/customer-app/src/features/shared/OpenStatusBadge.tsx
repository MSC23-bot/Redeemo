import React from 'react'
import { View } from 'react-native'
import { Text, spacing } from '@/design-system'

export function OpenStatusBadge({ isOpen }: { isOpen: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isOpen ? '#10B981' : '#EF4444' }} />
      <Text variant="label.md" style={{ fontSize: 10, color: isOpen ? '#047857' : '#DC2626' }}>
        {isOpen ? 'Open' : 'Closed'}
      </Text>
    </View>
  )
}
