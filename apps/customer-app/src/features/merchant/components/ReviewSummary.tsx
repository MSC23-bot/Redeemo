import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Star, PenLine } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  averageRating: number
  totalReviews: number
  distribution: Record<number, number>
  onWriteReview: () => void
}

export function ReviewSummary({ averageRating, totalReviews, distribution, onWriteReview }: Props) {
  const maxCount = Math.max(...Object.values(distribution), 1)

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        {/* Left: score + stars + count */}
        <View style={styles.scoreCol}>
          <Text variant="display.xl" style={styles.bigScore}>
            {averageRating.toFixed(1)}
          </Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <Star
                key={n}
                size={16}
                color="#F59E0B"
                fill={n <= Math.round(averageRating) ? '#F59E0B' : 'none'}
              />
            ))}
          </View>
          <Text variant="label.md" color="tertiary" meta style={styles.totalText}>
            {totalReviews} reviews
          </Text>
        </View>

        {/* Right: star bars */}
        <View style={styles.barsCol}>
          {[5, 4, 3, 2, 1].map(n => (
            <View key={n} style={styles.barRow}>
              <Text variant="label.md" style={styles.barNum}>{n}</Text>
              <View style={styles.barTrack}>
                <LinearGradient
                  colors={['#F59E0B', '#FBBF24']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.barFill, { width: `${((distribution[n] ?? 0) / maxCount) * 100}%` }]}
                />
              </View>
              <Text variant="label.md" color="tertiary" meta style={styles.barCount}>
                {distribution[n] ?? 0}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Write review CTA */}
      <Pressable
        onPress={() => { lightHaptic(); onWriteReview() }}
        style={styles.writeBtn}
        accessibilityRole="button"
        accessibilityLabel="Write a review"
      >
        <LinearGradient
          colors={color.brandGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.writeBtnGradient}
        >
          <PenLine size={16} color="#FFF" />
          <Text variant="label.lg" style={styles.writeBtnText}>Write a Review</Text>
        </LinearGradient>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  top: {
    flexDirection: 'row',
    gap: 20,
  },
  scoreCol: {
    alignItems: 'center',
    flexShrink: 0,
  },
  bigScore: {
    fontSize: 46,
    fontWeight: '800',
    color: '#010C35',
    lineHeight: 46,
    letterSpacing: -1,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 4,
  },
  totalText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  barsCol: {
    flex: 1,
    gap: 5,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barNum: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
    width: 10,
    textAlign: 'right',
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#F3F0EB',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  barCount: {
    fontSize: 10,
    fontWeight: '500',
    width: 20,
  },
  writeBtn: {
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: color.brandRose,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  writeBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
  },
  writeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
})
