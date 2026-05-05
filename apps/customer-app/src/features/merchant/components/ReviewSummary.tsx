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
  // When the user already has a review for the chip-selected branch, the
  // "Write a review" CTA opens it in edit mode (backend upserts on the
  // unique `(userId, branchId)` constraint). The label should match the
  // action so the user isn't surprised by seeing their existing review
  // pre-filled. Pure copy change — no behavioural change.
  hasExistingReview?: boolean
}

export function ReviewSummary({ averageRating, totalReviews, distribution, onWriteReview, hasExistingReview = false }: Props) {
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

      {/* Write / Edit review CTA */}
      <Pressable
        onPress={() => { lightHaptic(); onWriteReview() }}
        style={styles.writeBtn}
        accessibilityRole="button"
        accessibilityLabel={hasExistingReview ? 'Edit your review' : 'Write a review'}
      >
        <LinearGradient
          colors={color.brandGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.writeBtnGradient}
        >
          <PenLine size={16} color="#FFF" />
          <Text variant="label.lg" style={styles.writeBtnText}>
            {hasExistingReview ? 'Edit Your Review' : 'Write a Review'}
          </Text>
        </LinearGradient>
      </Pressable>
    </View>
  )
}

// Round 5 §6 (impeccable polish): card chrome joins the system
// (radius 18 + system shadow opacity 0.08 / radius 16 / offset 4 /
// elevation 4 — same as About cards from §5).
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  top: {
    flexDirection: 'row',
    gap: 20,
  },
  scoreCol: {
    alignItems: 'center',
    flexShrink: 0,
  },
  // Round 5 §6: weight 800 → 700 (less shouty for the hero number),
  // tabular-nums via fontVariant so 4.0 / 4.5 / 5.0 align if shown
  // alongside other ratings.
  bigScore: {
    fontSize: 46,
    fontWeight: '700',
    color: '#010C35',
    lineHeight: 46,
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 4,
  },
  // Round 5 §19: bumped 12 → 13pt as part of the typography pass.
  totalText: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  // Round 5 §18: bar rhythm bumped per user direction "spacing
  // improvements on reviews". gap 5 → 7 between distribution
  // bars; barRow gap 8 → 10 between number / track / count.
  barsCol: {
    flex: 1,
    gap: 7,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // Round 5 §19: bar number 11 → 12pt for the rating-distribution
  // bars (5/4/3/2/1). Width bumped 10 → 12 to fit.
  barNum: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    width: 12,
    textAlign: 'right',
  },
  // Round 5 §6: bar track bg shifted from `#F3F0EB` (warm-cream
  // era) to `#F3F4F6` (neutral pale) so the bars sit cleanly on
  // the white card.
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  // Round 6 §4: distribution count 11 → 12pt to match the bar
  // numerals (1–5). Tabular-nums kept for column alignment.
  barCount: {
    fontSize: 12,
    fontWeight: '500',
    width: 22,
    fontVariant: ['tabular-nums'],
  },
  writeBtn: {
    marginTop: 22,
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
  // Round 6 §4: Write Review CTA 13 → 14pt for action prominence.
  writeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.1,
  },
})
