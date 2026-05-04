import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

type Props = {
  avgRating:   number | null
  reviewCount: number
}

export function RatingBlock({ avgRating, reviewCount }: Props) {
  if (avgRating === null || reviewCount === 0) {
    return (
      <Text variant="label.md" style={styles.placeholder} accessibilityLabel="No reviews yet">
        No reviews yet
      </Text>
    )
  }
  const rounded = Math.round(avgRating * 10) / 10
  return (
    <View style={styles.block} accessibilityLabel={`Rating ${rounded} from ${reviewCount} review${reviewCount === 1 ? '' : 's'}`}>
      <Text variant="label.lg" style={styles.star}>★</Text>
      <Text variant="label.lg" style={styles.avg}>{rounded.toFixed(1)}</Text>
      <Text variant="label.md" style={styles.count}>({reviewCount})</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  block:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF8E1', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  star:        { color: '#F59E0B', fontSize: 12 },
  avg:         { fontSize: 13, fontWeight: '800', color: '#010C35' },
  count:       { fontSize: 11, color: '#666' },
  placeholder: { fontSize: 11, color: '#aaa' },
})
