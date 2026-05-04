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
  // Round 4 §2: rating block re-styled per direction "could be a
  // little bit more bolder and maybe a little bit bigger as well,
  // maybe use a better style".
  //   - Block bumps 14/12 → 15/12 with a softer cream surface
  //     `#FFF4D6` (warmer than `#FFF8E1`, reads as a curated
  //     editorial chip rather than a generic yellow tint).
  //   - 1pt warm-amber border at 25% opacity defines the chip without
  //     competing with the cream identity-zone background.
  //   - Slight tabular spacing on the rating numeral so 4.0 / 4.5 /
  //     5.0 line up if rendered side-by-side anywhere.
  block: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF4D6',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
  },
  star:        { color: '#F59E0B', fontSize: 14 },
  avg:         { fontSize: 15, fontWeight: '900', color: '#010C35', letterSpacing: -0.1 },
  count:       { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  placeholder: { fontSize: 12, color: '#aaa' },
})
