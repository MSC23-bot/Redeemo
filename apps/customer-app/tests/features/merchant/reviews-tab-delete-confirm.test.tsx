import React from 'react'
import { Alert } from 'react-native'
import { render, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Regression for PR A bug 4 — review delete used to fire instantly with no
// confirmation. Native two-button confirm now wraps the mutation. This test
// pins the contract: the mutation must NOT be invoked unless the user
// confirms via Alert. We mock the mutation hooks so we can observe whether
// `mockMutateAsync` is called.

const mockMutateAsync = jest.fn().mockResolvedValue({ success: true })

jest.mock('@/features/merchant/hooks/useWriteReview', () => ({
  useCreateReview:  () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteReview:  () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useToggleHelpful: () => ({ mutate: jest.fn() }),
}))

// Stub heavy children so we can isolate the delete-confirm behaviour.
jest.mock('@/features/merchant/components/ReviewSummary', () => ({
  ReviewSummary: () => null,
}))
jest.mock('@/features/merchant/components/ReviewSortControl', () => ({
  ReviewSortControl: () => null,
}))
jest.mock('@/features/merchant/components/WriteReviewSheet', () => ({
  WriteReviewSheet: () => null,
}))
// ReviewCard exposes a Pressable that fires the parent's onDelete prop.
jest.mock('@/features/merchant/components/ReviewCard', () => {
  const React = require('react')
  const { Pressable, Text } = require('react-native')
  return {
    ReviewCard: ({ review, onDelete }: { review: { id: string }; onDelete?: () => void }) => (
      <Pressable accessibilityLabel={`delete-${review.id}`} onPress={onDelete}>
        <Text>{review.id}</Text>
      </Pressable>
    ),
  }
})

jest.mock('@/features/merchant/hooks/useMerchantReviews', () => ({
  useReviewSummary:   () => ({
    data: { averageRating: 5, totalReviews: 1, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 1 } },
    isLoading: false,
  }),
  useMerchantReviews: () => ({
    data: {
      reviews: [{
        id:          'r1',
        branchId:    'b1',
        branchName:  'Main',
        displayName: 'Ada L.',
        rating:      5,
        comment:     'Great',
        isVerified:  true,
        isOwnReview: true,
        createdAt:   '2026-04-01T00:00:00.000Z',
        updatedAt:   '2026-04-01T00:00:00.000Z',
      }],
      total: 1,
    },
    isLoading: false,
  }),
}))

jest.mock('@/stores/auth', () => {
  const state: { status: 'authed' | 'guest'; user: { id: string } | null } = {
    status: 'authed',
    user: { id: 'u1' },
  }
  return {
    // ReviewsTab calls `useAuthStore()` with no args; other callers may use
    // a selector. Support both.
    useAuthStore: jest.fn((sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state)),
  }
})

import { ReviewsTab } from '@/features/merchant/components/ReviewsTab'

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ReviewsTab merchantId="m1" currentBranchId="b1" currentBranchName="Test Branch" myReview={null} isMultiBranch={true} currentBranchCount={1} allBranchesCount={1} />
    </QueryClientProvider>,
  )
}

describe('ReviewsTab delete-confirm (PR A bug 4 fix)', () => {
  beforeEach(() => { mockMutateAsync.mockClear() })

  it('does NOT fire the delete mutation until the user taps Delete in the Alert', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const { getByLabelText } = renderTab()

    fireEvent.press(getByLabelText('delete-r1'))

    // Alert was raised, mutation NOT yet fired.
    expect(alertSpy).toHaveBeenCalledTimes(1)
    expect(mockMutateAsync).not.toHaveBeenCalled()

    alertSpy.mockRestore()
  })

  it('fires the mutation when the user confirms via the Alert Delete button', () => {
    // Capture the buttons array so we can simulate the Delete tap.
    let capturedButtons: readonly { text?: string | undefined; onPress?: (() => void) | undefined }[] | undefined
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, btns) => {
      capturedButtons = btns
    })

    const { getByLabelText } = renderTab()
    fireEvent.press(getByLabelText('delete-r1'))

    const deleteBtn = capturedButtons?.find(b => b.text === 'Delete')
    expect(deleteBtn).toBeDefined()
    deleteBtn!.onPress!()

    expect(mockMutateAsync).toHaveBeenCalledWith({ branchId: 'b1', reviewId: 'r1' })
    alertSpy.mockRestore()
  })
})
