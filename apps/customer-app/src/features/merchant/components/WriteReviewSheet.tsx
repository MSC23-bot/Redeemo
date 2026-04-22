import React, { useState, useCallback, useEffect } from 'react'
import { View, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { Star, X } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { color, spacing } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  visible: boolean
  onDismiss: () => void
  onSubmit: (data: { rating: number; comment?: string }) => void
  isLoading: boolean
  initialRating?: number
  initialComment?: string
  branchName: string
}

export function WriteReviewSheet({
  visible, onDismiss, onSubmit, isLoading,
  initialRating = 0, initialComment = '', branchName,
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
    onSubmit({ rating, comment: comment.trim() || undefined })
  }, [rating, comment, onSubmit])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={onDismiss} />
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />

          <View style={styles.headerRow}>
            <Text variant="heading.lg" style={styles.title}>Write a Review</Text>
            <Pressable onPress={onDismiss} style={styles.closeBtn} accessibilityLabel="Close">
              <X size={20} color="#9CA3AF" />
            </Pressable>
          </View>

          <Text variant="label.md" color="tertiary" meta style={styles.subtitle}>
            {branchName}
          </Text>

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
              colors={color.brandGradient as unknown as string[]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.submitGradient}
            >
              <Text variant="label.lg" style={styles.submitText}>
                {isLoading ? 'Submitting...' : 'Submit Review'}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(1,12,53,0.5)',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
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
