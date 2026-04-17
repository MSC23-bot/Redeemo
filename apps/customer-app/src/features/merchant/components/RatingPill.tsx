import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Star } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'

type Props = {
  rating: number | null
  count: number
}

export function RatingPill({ rating, count }: Props) {
  if (rating === null || count === 0) return null

  return (
    <View style={styles.container} accessibilityLabel={`Rating ${rating} out of 5 from ${count} reviews`}>
      <Star size={15} color="#F59E0B" fill="#F59E0B" />
      <Text variant="label.lg" style={styles.score}>{rating.toFixed(1)}</Text>
      <Text variant="label.md" color="tertiary" meta style={styles.count}>({count})</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  score: {
    fontSize: 15,
    fontWeight: '800',
    color: color.navy,
  },
  count: {
    fontSize: 11,
    fontWeight: '500',
  },
})
