import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Star } from 'lucide-react-native'
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
      {/* Round 5 §13: switched from Unicode ★ glyph to Lucide Star
          icon with fill. Unicode glyph renders thin via Lato (no
          fontWeight reliability for special chars); SVG icon with
          fill is consistently bold + controllable. */}
      <Star size={12} color="#F59E0B" fill="#F59E0B" strokeWidth={1.6} />
      <Text variant="label.lg" style={styles.avg}>{rounded.toFixed(1)}</Text>
      <Text variant="label.md" style={styles.count}>({reviewCount})</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  // Round 6 §5: rating chip rebalanced. Owner flagged it as
  // visually too large compared with the BranchCard's other
  // pill buttons (action btns at 12/600, status pill, etc.).
  //   - star 14 → 12pt
  //   - avg numeral 15/900 → 13/800
  //   - count 12/600 → 11/600
  //   - paddingVertical 7 → 5 / paddingHorizontal 13 → 10
  //   - borderRadius 10 → 8 (tighter chip)
  //   - kept the cream surface + amber border (already on-brand)
  block: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF4D6',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
  },
  avg:         { fontSize: 13, fontWeight: '800', color: '#010C35', letterSpacing: -0.1 },
  count:       { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  placeholder: { fontSize: 12, color: '#aaa' },
})
