import React from 'react'
import { View } from 'react-native'
import { Star } from 'lucide-react-native'
import { Text, spacing } from '@/design-system'

export function StarRating({ rating, count }: { rating: number | null; count: number }) {
  if (rating === null) return null
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Star size={12} fill="#F59E0B" color="#F59E0B" />
      <Text variant="label.md" style={{ fontSize: 11, fontFamily: 'Lato-Bold', color: '#010C35' }}>
        {rating.toFixed(1)}
      </Text>
      <Text variant="label.md" style={{ fontSize: 10, color: '#9CA3AF' }}>
        ({count})
      </Text>
    </View>
  )
}
