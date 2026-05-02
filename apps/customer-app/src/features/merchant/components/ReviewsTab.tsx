import React, { useState, useCallback, useEffect } from 'react'
import { View, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { ReviewSummary } from './ReviewSummary'
import { ReviewCard } from './ReviewCard'
import { ReviewSortControl, type SortOption } from './ReviewSortControl'
import { WriteReviewSheet } from './WriteReviewSheet'
import { useReviewSummary, useMerchantReviews } from '../hooks/useMerchantReviews'
import { useCreateReview, useDeleteReview, useToggleHelpful } from '../hooks/useWriteReview'
import { useAuthStore } from '@/stores/auth'
import type { Review } from '@/lib/api/reviews'

type Props = {
  merchantId:        string
  currentBranchId:   string
  currentBranchName: string
  myReview:          Review | null
}

export function ReviewsTab({ merchantId, currentBranchId, currentBranchName, myReview }: Props) {
  const { status } = useAuthStore()
  const isAuthed = status === 'authed'

  // Branch filter — defaults to the chip-selected branch. Spec §4.5.
  // Persists across chip-driven branch switches; only flips when the user
  // taps the toggle. Locked rule (Q5 in the branch-aware brainstorm): the
  // user's filter intent should not be reset by an unrelated chip change.
  const [filter, setFilter] = useState<'branch' | 'all'>('branch')

  // Summary + list share the same branch-scoping rule: when the toggle is
  // 'branch', both queries pin to currentBranchId; when 'all', both omit
  // the key. Without this, the rating/breakdown header showed the merchant
  // aggregate while the list showed branch reviews — the bug surfaced in
  // 2026-05-03 on-device QA.
  const branchScope = filter === 'branch' ? { branchId: currentBranchId } : {}
  const { data: summary, isLoading: summaryLoading } = useReviewSummary(merchantId, branchScope)
  const { data: reviewData, isLoading: reviewsLoading } = useMerchantReviews(
    merchantId,
    {
      limit: 50,
      // Spread-with-conditional intentionally: when filter='all' the key
      // must be ABSENT from the opts object (not present with value
      // `undefined`) so the query key + URL builder both omit it. The
      // branch-filter test pins this contract.
      ...branchScope,
    },
  )
  const createReview = useCreateReview(merchantId)
  const deleteReview = useDeleteReview(merchantId)
  const toggleHelpful = useToggleHelpful(merchantId)

  const [sort, setSort] = useState<SortOption>('recent')
  const [showWriteSheet, setShowWriteSheet] = useState(false)

  // Reset sort on toggle flip (spec §4.5; brainstorm Q5: "Pagination + sort:
  // reset on toggle flip"). Pagination state isn't in this component yet —
  // the limit-50 single fetch is a TODO for a later phase — so only `sort`
  // resets here. When pagination lands, add its reset to this effect.
  useEffect(() => {
    setSort('recent')
  }, [filter])

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
    if (sort === 'helpful') {
      // Primary: helpfulCount desc. Tiebreak by most-recently-updated so
      // ties (especially zero-vs-zero) feel intentional rather than random.
      if (b.helpfulCount !== a.helpfulCount) return b.helpfulCount - a.helpfulCount
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    }
    return 0
  })

  const handleWriteSubmit = useCallback(async (data: { rating: number; comment?: string }) => {
    await createReview.mutateAsync({ branchId: currentBranchId, ...data })
    setShowWriteSheet(false)
  }, [currentBranchId, createReview])

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

  const renderToggle = () => (
    <View style={styles.toggle}>
      <Pressable
        accessibilityLabel={currentBranchName}
        accessibilityRole="button"
        accessibilityState={{ selected: filter === 'branch' }}
        onPress={() => setFilter('branch')}
        style={[styles.toggleBtn, filter === 'branch' && styles.toggleBtnActive]}
      >
        <Text variant="label.md" style={[styles.toggleText, filter === 'branch' && styles.toggleTextActive]}>
          {currentBranchName}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel="All branches"
        accessibilityRole="button"
        accessibilityState={{ selected: filter === 'all' }}
        onPress={() => setFilter('all')}
        style={[styles.toggleBtn, filter === 'all' && styles.toggleBtnActive]}
      >
        <Text variant="label.md" style={[styles.toggleText, filter === 'all' && styles.toggleTextActive]}>
          All branches
        </Text>
      </Pressable>
    </View>
  )

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
            hasExistingReview={myReview !== null}
          />
        )}
        <WriteReviewSheet
          visible={showWriteSheet}
          onDismiss={() => setShowWriteSheet(false)}
          onSubmit={handleWriteSubmit}
          isLoading={createReview.isPending}
          branchName={currentBranchName}
          initialRating={myReview?.rating ?? 0}
          initialComment={myReview?.comment ?? ''}
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
        hasExistingReview={myReview !== null}
      />

      {renderToggle()}

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
            showBranchLabel={filter === 'all'}
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
        branchName={currentBranchName}
        initialRating={myReview?.rating ?? 0}
        initialComment={myReview?.comment ?? ''}
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
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#F3F0EB',
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  toggleTextActive: {
    color: '#010C35',
    fontWeight: '700',
  },
})
