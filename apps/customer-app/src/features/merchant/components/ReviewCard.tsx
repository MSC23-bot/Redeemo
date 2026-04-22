import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Star, CheckCircle, ThumbsUp, Pencil, Trash2 } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import type { ReviewItem } from '@/lib/api/reviews'

type Props = {
  review: ReviewItem
  onHelpful?: () => void
  onEdit?: () => void
  onDelete?: () => void
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function getInitials(name: string): string {
  const parts = name.split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function ReviewCard({ review, onHelpful, onEdit, onDelete }: Props) {
  const initials = getInitials(review.displayName)
  const isOwn = review.isOwnReview

  return (
    <View style={[styles.card, isOwn && styles.cardOwn]}>
      {/* Own review label */}
      {isOwn && (
        <Text variant="label.md" style={styles.ownLabel}>YOUR REVIEW</Text>
      )}

      {/* Own review action buttons */}
      {isOwn && (
        <View style={styles.ownActions}>
          <Pressable onPress={() => { lightHaptic(); onEdit?.() }} style={styles.ownBtn} accessibilityLabel="Edit review">
            <Pencil size={14} color="#9CA3AF" />
          </Pressable>
          <Pressable onPress={() => { lightHaptic(); onDelete?.() }} style={[styles.ownBtn, styles.ownBtnDel]} accessibilityLabel="Delete review">
            <Trash2 size={14} color="#B91C1C" />
          </Pressable>
        </View>
      )}

      {/* Header: avatar + name + verified + date */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          {isOwn ? (
            <LinearGradient colors={color.brandGradient as unknown as string[]} style={styles.avatarGradient}>
              <Text variant="label.lg" style={styles.avatarText}>{initials}</Text>
            </LinearGradient>
          ) : (
            <View style={styles.avatarNavy}>
              <Text variant="label.lg" style={styles.avatarText}>{initials}</Text>
            </View>
          )}
        </View>
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text variant="label.lg" style={styles.name}>{review.displayName}</Text>
            {review.isVerified && (
              <View style={styles.verifiedBadge}>
                <CheckCircle size={11} color="#16A34A" />
                <Text variant="label.md" style={styles.verifiedText}>VERIFIED</Text>
              </View>
            )}
          </View>
          <Text variant="label.md" color="tertiary" meta style={styles.date}>
            {timeAgo(review.createdAt)} · {review.branchName}
          </Text>
        </View>
      </View>

      {/* Stars */}
      <View style={styles.miniStars}>
        {[1, 2, 3, 4, 5].map(n => (
          <Star key={n} size={12} color="#F59E0B" fill={n <= review.rating ? '#F59E0B' : 'none'} />
        ))}
      </View>

      {/* Review text */}
      {review.comment && (
        <Text variant="body.sm" color="secondary" style={styles.text}>{review.comment}</Text>
      )}

      {/* Helpful */}
      {!isOwn && onHelpful && (
        <Pressable onPress={() => { lightHaptic(); onHelpful() }} style={styles.helpful} accessibilityLabel="Mark as helpful">
          <ThumbsUp size={12} color="#9CA3AF" />
          <Text variant="label.md" color="tertiary" meta style={styles.helpfulText}>Helpful</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
    position: 'relative',
  },
  cardOwn: {
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
  },
  ownLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E20C04',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  ownActions: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    gap: 4,
  },
  ownBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownBtnDel: {},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  avatarGradient: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarNavy: {
    width: 40,
    height: 40,
    backgroundColor: '#010C35',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 13,
    fontWeight: '800',
    color: '#010C35',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  verifiedText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#16A34A',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  date: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  miniStars: {
    flexDirection: 'row',
    gap: 1,
    marginTop: 8,
  },
  text: {
    fontSize: 13,
    lineHeight: 21,
    marginTop: 8,
  },
  helpful: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
  },
  helpfulText: {
    fontSize: 11,
    fontWeight: '600',
  },
})
