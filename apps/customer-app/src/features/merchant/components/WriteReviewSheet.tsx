import React, { useState, useCallback, useEffect } from 'react'
import { View, Pressable, TextInput, StyleSheet } from 'react-native'
import { Star, X } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  visible: boolean
  onDismiss: () => void
  onSubmit: (data: { rating: number; comment?: string; redemptionId?: string }) => void
  isLoading: boolean
  initialRating?: number
  initialComment?: string
  branchName: string
  /**
   * PR-C T8 (LOCKED 2026-05-09 §0.3): when the sheet is opened from a
   * voucher redemption flow, this prop carries the redemption id.
   * The sheet renders a "Verified review" banner and forwards the id
   * in the onSubmit payload so the backend can link the review row
   * (drives row-level `isVerified` per Path A).  Null/undefined →
   * regular review path, no banner.
   */
  fromRedemptionId?: string | null
}

// Round 3 §A4: migrated onto the shared `<BottomSheet>` primitive.
// Keyboard-aware lift is built into the primitive; the local
// KeyboardAvoidingView wrapper is no longer needed.
export function WriteReviewSheet({
  visible, onDismiss, onSubmit, isLoading,
  initialRating = 0, initialComment = '', branchName, fromRedemptionId,
}: Props) {
  const [rating, setRating] = useState(initialRating)
  const [comment, setComment] = useState(initialComment)

  useEffect(() => {
    if (visible) {
      setRating(initialRating)
      setComment(initialComment)
    }
  }, [visible, initialRating, initialComment])

  const handleSubmit = useCallback(() => {
    if (rating === 0) return
    lightHaptic()
    // exactOptionalPropertyTypes: omit each optional key rather than
    // passing undefined.  Same pattern as useCreateReview (T7).
    const trimmed = comment.trim()
    const payload: { rating: number; comment?: string; redemptionId?: string } = { rating }
    if (trimmed)               payload.comment      = trimmed
    if (fromRedemptionId != null) payload.redemptionId = fromRedemptionId
    onSubmit(payload)
  }, [rating, comment, fromRedemptionId, onSubmit])

  // PR-C T16 device-QA fix (LOCKED 2026-05-09 §AI Option A) — when
  // the user already has a review for this branch (signalled by a
  // non-zero initialRating OR a non-empty initialComment from the
  // parent's `myReview` pre-fill), reframe the sheet as an UPDATE
  // surface rather than a fresh-write surface.  The current schema
  // enforces one review per (userId, branchId) via @@unique, so
  // editing the existing row is the only path; the copy must
  // reflect that truthfully instead of pretending this is a new
  // review.  Multi-review / one-per-redemption stays deferred under
  // memory §AI as Tier 3 review-system v2 work.
  const hasExistingReview = initialRating > 0 || initialComment.trim().length > 0
  const titleCopy        = hasExistingReview ? 'Update your review' : 'Write a review'
  const submitIdleCopy   = hasExistingReview ? 'Update review'      : 'Submit review'
  const submitLoadingCopy = hasExistingReview ? 'Updating…'         : 'Submitting…'
  const a11yLabel        = hasExistingReview ? 'Update your review' : 'Write a review'

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel={a11yLabel}>
      <View style={styles.headerRow}>
        <Text variant="heading.lg" style={styles.title} testID="write-review-title">{titleCopy}</Text>
        <Pressable onPress={onDismiss} style={styles.closeBtn} accessibilityLabel="Close">
          <X size={20} color="#9CA3AF" />
        </Pressable>
      </View>

      <Text variant="label.md" color="tertiary" meta style={styles.subtitle}>
        {branchName}
      </Text>

      {/* Verified-review banner — T8 §0.3 LOCKED 2026-05-09.
          Renders when the sheet is opened from a voucher redemption
          flow.  Two-line treatment per locked owner copy: noun-phrase
          heading + present-tense supporting line that names the
          mechanic precisely (linked to redemption AT THIS BRANCH —
          tells the customer this badge is branch-specific). */}
      {fromRedemptionId != null ? (
        <View style={styles.verifiedBanner} testID="write-review-verified-banner">
          <Text variant="label.lg" style={styles.verifiedBannerHeading}>
            Verified review
          </Text>
          <Text variant="body.sm" style={styles.verifiedBannerBody}>
            Linked to your voucher redemption at this branch.
          </Text>
        </View>
      ) : null}

      {/* Star rating */}
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map(n => (
          <Pressable
            key={n}
            onPress={() => { lightHaptic(); setRating(n) }}
            style={styles.starBtn}
            accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
          >
            <Star size={36} color="#F59E0B" fill={n <= rating ? '#F59E0B' : 'none'} />
          </Pressable>
        ))}
      </View>

      {/* Comment */}
      <TextInput
        style={styles.input}
        placeholder="Share your experience (optional)"
        placeholderTextColor="#9CA3AF"
        value={comment}
        onChangeText={setComment}
        multiline
        maxLength={500}
        textAlignVertical="top"
      />
      <Text variant="label.md" color="tertiary" meta style={styles.charCount}>
        {comment.length}/500
      </Text>

      {/* Submit */}
      <Pressable
        onPress={handleSubmit}
        disabled={rating === 0 || isLoading}
        style={[styles.submitBtn, (rating === 0 || isLoading) && { opacity: 0.5 }]}
      >
        <LinearGradient
          colors={color.brandGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.submitGradient}
        >
          <Text variant="label.lg" style={styles.submitText} testID="write-review-submit-text">
            {isLoading ? submitLoadingCopy : submitIdleCopy}
          </Text>
        </LinearGradient>
      </Pressable>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#010C35',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 20,
  },
  // PR-C T8 §0.3 LOCKED 2026-05-09 — verified-review banner.
  // savings-green tint (8% alpha bg, 14% alpha border) — same
  // semantic colour family as ReviewCard's verified badge (T9).
  verifiedBanner: {
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    borderColor: 'rgba(22, 163, 74, 0.14)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  verifiedBannerHeading: {
    color: color.savingsGreen,
    fontWeight: '700',
    marginBottom: 2,
  },
  verifiedBannerBody: {
    color: color.savingsGreen,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  starBtn: {
    padding: 4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 16,
    fontSize: 14,
    fontFamily: 'Lato-Regular',
    color: '#010C35',
    minHeight: 100,
    marginBottom: 4,
  },
  charCount: {
    textAlign: 'right',
    marginBottom: 20,
  },
  submitBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
  },
  submitGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
})
