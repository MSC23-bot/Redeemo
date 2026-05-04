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
  // Round 4 §1: slightly bigger block + text per user direction "in
  // the right ratio of everything else". The block now reads at
  // 14/12pt rather than 13/11pt — proportionate to the bumped
  // descriptor (14pt) and meta row (13pt).
  block:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFF8E1', borderRadius: 9, paddingVertical: 5, paddingHorizontal: 11 },
  star:        { color: '#F59E0B', fontSize: 13 },
  avg:         { fontSize: 14, fontWeight: '800', color: '#010C35' },
  count:       { fontSize: 12, color: '#666' },
  placeholder: { fontSize: 12, color: '#aaa' },
})
