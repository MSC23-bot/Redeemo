// PR #33 high-priority fix-up: editing an own-review CARD must always target
// that card's branchId, not the chip-selected branch. The bug: in 'all'
// branches view, the user might tap Edit on a review for a branch other than
// the chip's selected one — without per-card targeting, the submit silently
// overwrote the chip branch's review with the form data.

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockMutateAsync = jest.fn().mockResolvedValue({ id: 'r-new' })
jest.mock('@/features/merchant/hooks/useWriteReview', () => ({
  useCreateReview:  () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useDeleteReview:  () => ({ mutateAsync: jest.fn() }),
  useToggleHelpful: () => ({ mutate: jest.fn() }),
}))

// Two own reviews on different branches — fixture matches the situation the
// bug surfaces in (user has reviewed both Brightlingsea and Colchester).
const ownReviewBrightlingsea = {
  id: 'r-bl', branchId: 'b-brightlingsea', branchName: 'Brightlingsea',
  displayName: 'Me', rating: 5, comment: 'Loved it',
  isVerified: false, isOwnReview: true,
  createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z',
  helpfulCount: 0, userMarkedHelpful: false,
}
const ownReviewColchester = {
  id: 'r-col', branchId: 'b-colchester', branchName: 'Colchester',
  displayName: 'Me', rating: 3, comment: 'Was OK',
  isVerified: false, isOwnReview: true,
  createdAt: '2026-04-15T00:00:00.000Z', updatedAt: '2026-04-15T00:00:00.000Z',
  helpfulCount: 0, userMarkedHelpful: false,
}

jest.mock('@/features/merchant/hooks/useMerchantReviews', () => ({
  useReviewSummary:   () => ({
    data: { averageRating: 4.0, totalReviews: 2, distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 } },
    isLoading: false,
  }),
  useMerchantReviews: () => ({
    data: { reviews: [ownReviewBrightlingsea, ownReviewColchester], total: 2 },
    isLoading: false,
  }),
}))

jest.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ status: 'authed', user: { id: 'u1' } }),
}))

// Real-shape ReviewCard mock — surfaces an Edit pressable per card so the test
// can target a specific card's onEdit. accessibilityLabel encodes the card id
// so the assertion is unambiguous about which card was tapped.
jest.mock('@/features/merchant/components/ReviewCard', () => {
  const React = require('react')
  const { Pressable, Text, View } = require('react-native')
  return {
    ReviewCard: ({ review, onEdit }: { review: { id: string; branchName: string; rating: number }, onEdit?: () => void }) => (
      <View accessibilityLabel={`card-${review.id}`}>
        <Text>{review.id}|{review.branchName}|{review.rating}</Text>
        {onEdit && (
          <Pressable accessibilityLabel={`edit-${review.id}`} onPress={onEdit}>
            <Text>EDIT_{review.id}</Text>
          </Pressable>
        )}
      </View>
    ),
  }
})

// WriteReviewSheet mock — surfaces initialRating + branchName + a Submit
// pressable so the test can assert pre-fill AND trigger submit.
type SheetMockProps = {
  visible:        boolean
  branchName:     string
  initialRating:  number
  initialComment: string
  onSubmit:       (data: { rating: number; comment?: string }) => void
}
jest.mock('@/features/merchant/components/WriteReviewSheet', () => {
  const React = require('react')
  const { Pressable, Text, View } = require('react-native')
  return {
    WriteReviewSheet: ({ visible, branchName, initialRating, initialComment, onSubmit }: SheetMockProps) => (
      visible ? (
        <View accessibilityLabel="sheet">
          <Text>SHEET_BRANCH={branchName}</Text>
          <Text>SHEET_RATING={initialRating}</Text>
          <Text>SHEET_COMMENT={initialComment}</Text>
          <Pressable
            accessibilityLabel="submit-from-sheet"
            onPress={() => onSubmit({ rating: initialRating, comment: initialComment })}
          >
            <Text>SUBMIT</Text>
          </Pressable>
        </View>
      ) : null
    ),
  }
})
jest.mock('@/features/merchant/components/ReviewSummary',     () => ({ ReviewSummary:     () => null }))
jest.mock('@/features/merchant/components/ReviewSortControl', () => ({ ReviewSortControl: () => null }))

import { ReviewsTab } from '@/features/merchant/components/ReviewsTab'

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  // Chip is on Brightlingsea (b-brightlingsea). The test confirms that
  // tapping Edit on the COLCHESTER card targets Colchester, not the chip.
  return render(
    <QueryClientProvider client={qc}>
      <ReviewsTab
        merchantId="m1"
        currentBranchId="b-brightlingsea"
        currentBranchName="Brightlingsea"
        myReview={ownReviewBrightlingsea}
        isMultiBranch={true}
      />
    </QueryClientProvider>,
  )
}

describe('ReviewsTab edit routing — per-card branch targeting (PR #33 fix-up)', () => {
  beforeEach(() => mockMutateAsync.mockClear())

  it('editing an own-review for the OTHER branch pre-fills + submits to THAT branch', async () => {
    const { getByLabelText, findByText } = renderTab()
    fireEvent.press(getByLabelText('edit-r-col'))

    // Sheet opens pre-filled with Colchester's data, NOT Brightlingsea's.
    expect(await findByText('SHEET_BRANCH=Colchester')).toBeTruthy()
    expect(await findByText('SHEET_RATING=3')).toBeTruthy()
    expect(await findByText('SHEET_COMMENT=Was OK')).toBeTruthy()

    fireEvent.press(getByLabelText('submit-from-sheet'))

    // Submit must hit Colchester's branchId, NOT the chip's.
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        branchId: 'b-colchester',
        rating: 3,
        comment: 'Was OK',
      })
    })
  })

  it('editing an own-review for the chip-selected branch still works (regression)', async () => {
    const { getByLabelText, findByText } = renderTab()
    fireEvent.press(getByLabelText('edit-r-bl'))

    expect(await findByText('SHEET_BRANCH=Brightlingsea')).toBeTruthy()
    expect(await findByText('SHEET_RATING=5')).toBeTruthy()

    fireEvent.press(getByLabelText('submit-from-sheet'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        branchId: 'b-brightlingsea',
        rating: 5,
        comment: 'Loved it',
      })
    })
  })
})
