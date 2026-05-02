import React, { useState, useCallback } from 'react'
import { View, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { ReviewSummary } from './ReviewSummary'
import { ReviewCard } from './ReviewCard'
import { ReviewSortControl, type SortOption } from './ReviewSortControl'
import { WriteReviewSheet } from './WriteReviewSheet'
import { useReviewSummary, useMerchantReviews } from '../hooks/useMerchantReviews'
import { useCreateReview, useDeleteReview, useToggleHelpful } from '../hooks/useWriteReview'
import { useAuthStore } from '@/stores/auth'

type Props = {
  merchantId: string
  defaultBranchId: string | null
}

export function ReviewsTab({ merchantId, defaultBranchId }: Props) {
  const { status } = useAuthStore()
  const isAuthed = status === 'authed'
  const { data: summary, isLoading: summaryLoading } = useReviewSummary(merchantId)
  const { data: reviewData, isLoading: reviewsLoading } = useMerchantReviews(merchantId, { limit: 50 })
  const createReview = useCreateReview(merchantId)
  const deleteReview = useDeleteReview(merchantId)
  const toggleHelpful = useToggleHelpful()

  const [sort, setSort] = useState<SortOption>('recent')
  const [showWriteSheet, setShowWriteSheet] = useState(false)

  const reviews = reviewData?.reviews ?? []

  // Sort respects the user's selection across ALL reviews. Own review is NOT
  // hoisted to the top — the "YOUR REVIEW" badge on the card already
  // differentiates it visually, and pinning silently overrode the user's
  // selected sort (a "highest first" view would still show the user's review
  // first even if it had the lowest rating). If a "Your review" pinned
  // section is wanted later, that's an explicit UX decision — see
  // deferred-followups index §H.
  const orderedReviews = [...reviews].sort((a, b) => {
    if (sort === 'recent')  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    if (sort === 'highest') return b.rating - a.rating
    if (sort === 'lowest')  return a.rating - b.rating
    return 0
  })

  // Lookup-only — used by `WriteReviewSheet` to pre-fill the user's existing
  // rating + comment when they tap "Write a review" on a branch they've
  // already reviewed. NOT used to reorder the list (see comment above).
  const ownReview = reviews.find(r => r.isOwnReview)

  const handleWriteSubmit = useCallback(async (data: { rating: number; comment?: string }) => {
    if (!defaultBranchId) return
    await createReview.mutateAsync({ branchId: defaultBranchId, ...data })
    setShowWriteSheet(false)
  }, [defaultBranchId, createReview])

  const handleDelete = useCallback((branchId: string, reviewId: string) => {
    // Native two-button confirm before destructive action — review delete is
    // not reversible (backend sets isHidden=true; user can't recover the row
    // from the customer app). Reported as a real risk during 2026-05-02 QA.
    Alert.alert(
      'Delete review?',
      "This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Global MutationCache onError surfaces failure as a toast (project
            // convention). The local catch is just to mark the rejection as
            // handled and silence the unhandled-promise-rejection warning.
            deleteReview.mutateAsync({ branchId, reviewId }).catch(() => {})
          },
        },
      ],
    )
  }, [deleteReview])

  if (summaryLoading || reviewsLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={color.brandRose} />
      </View>
    )
  }

  if (!summary || summary.totalReviews === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyText}>
          <Text variant="heading.md" color="secondary" align="center">No reviews yet</Text>
          <Text variant="body.sm" color="tertiary" meta align="center" style={{ marginTop: 8 }}>
            Be the first to review this merchant
          </Text>
        </View>
        {isAuthed && summary && (
          <ReviewSummary
            averageRating={0}
            totalReviews={0}
            distribution={{ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }}
            onWriteReview={() => setShowWriteSheet(true)}
          />
        )}
        <WriteReviewSheet
          visible={showWriteSheet}
          onDismiss={() => setShowWriteSheet(false)}
          onSubmit={handleWriteSubmit}
          isLoading={createReview.isPending}
          branchName="Main Branch"
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ReviewSummary
        averageRating={summary.averageRating}
        totalReviews={summary.totalReviews}
        distribution={summary.distribution}
        onWriteReview={() => setShowWriteSheet(true)}
      />

      <ReviewSortControl
        totalReviews={summary.totalReviews}
        sort={sort}
        onSortChange={setSort}
      />

      <View style={styles.reviewList}>
        {orderedReviews.map(review => (
          <ReviewCard
            key={review.id}
            review={review}
            {...(isAuthed         ? { onHelpful: () => toggleHelpful.mutate(review.id) } : {})}
            {...(review.isOwnReview ? { onEdit:    () => setShowWriteSheet(true) } : {})}
            {...(review.isOwnReview ? { onDelete:  () => handleDelete(review.branchId, review.id) } : {})}
          />
        ))}
      </View>

      <WriteReviewSheet
        visible={showWriteSheet}
        onDismiss={() => setShowWriteSheet(false)}
        onSubmit={handleWriteSubmit}
        isLoading={createReview.isPending}
        branchName={defaultBranchId ? 'Branch' : 'Main Branch'}
        initialRating={ownReview?.rating ?? 0}
        initialComment={ownReview?.comment ?? ''}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  loading: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  reviewList: {
    gap: 12,
  },
})
