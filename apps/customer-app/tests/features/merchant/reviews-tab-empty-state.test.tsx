// PR #33 medium-priority fix-up: branch-scoped empty state must be branch-
// aware (use the branch name, NOT "this merchant") and must surface a subtle
// cross-link so users discover the toggle to view other branches' reviews.
// 'All branches' empty state stays generic with no cross-link.

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockUseReviewSummary = jest.fn()
jest.mock('@/features/merchant/hooks/useMerchantReviews', () => ({
  useReviewSummary: (mid: string, opts: { branchId?: string }) => {
    mockUseReviewSummary(mid, opts)
    // Empty summary regardless of scope — drives the empty-state branch.
    return { data: { averageRating: 0, totalReviews: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }, isLoading: false }
  },
  useMerchantReviews: () => ({ data: { reviews: [], total: 0 }, isLoading: false }),
}))
jest.mock('@/features/merchant/hooks/useWriteReview', () => ({
  useCreateReview:  () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteReview:  () => ({ mutateAsync: jest.fn() }),
  useToggleHelpful: () => ({ mutate: jest.fn() }),
}))
jest.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ status: 'authed', user: { id: 'u1' } }),
}))
jest.mock('@/features/merchant/components/ReviewSummary',     () => ({ ReviewSummary: () => null }))
jest.mock('@/features/merchant/components/ReviewSortControl', () => ({ ReviewSortControl: () => null }))
jest.mock('@/features/merchant/components/ReviewCard',        () => ({ ReviewCard: () => null }))
jest.mock('@/features/merchant/components/WriteReviewSheet',  () => ({ WriteReviewSheet: () => null }))

import { ReviewsTab } from '@/features/merchant/components/ReviewsTab'

function renderTab(props: Partial<{ isMultiBranch: boolean }> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ReviewsTab
        merchantId="m1"
        currentBranchId="b1"
        currentBranchName="Brightlingsea"
        myReview={null}
        isMultiBranch={props.isMultiBranch ?? true}
      />
    </QueryClientProvider>,
  )
}

describe('ReviewsTab empty state — branch-aware copy + cross-link (PR #33 fix-up)', () => {
  it('branch-scoped empty: shows "Be the first to review {branchName}" + cross-link', () => {
    const { getByText, getByLabelText } = renderTab()
    expect(getByText('Be the first to review Brightlingsea')).toBeTruthy()
    // Subtle cross-link surfaces the toggle path per spec Q5 lock.
    expect(getByLabelText('See reviews from other branches')).toBeTruthy()
  })

  it('cross-link tap flips toggle to "all" — also updates the summary scope', () => {
    const { getByLabelText } = renderTab()
    mockUseReviewSummary.mockClear()
    fireEvent.press(getByLabelText('See reviews from other branches'))
    // After flipping to all, the summary hook is called WITHOUT branchId.
    expect(mockUseReviewSummary).toHaveBeenLastCalledWith('m1', expect.not.objectContaining({ branchId: expect.anything() }))
  })

  it('"all branches" empty: shows generic "No reviews yet" + NO cross-link', () => {
    const { getByText, getByLabelText, queryByLabelText } = renderTab()
    fireEvent.press(getByLabelText('All branches'))
    expect(getByText('No reviews yet')).toBeTruthy()
    expect(queryByLabelText('See reviews from other branches')).toBeNull()
  })

  it('toggle is rendered in empty state (user is never stuck — can flip to all)', () => {
    const { getByLabelText } = renderTab()
    expect(getByLabelText('Brightlingsea')).toBeTruthy()
    expect(getByLabelText('All branches')).toBeTruthy()
  })

  // PR #33 fix-up #3: single-branch merchants must NOT render the toggle or
  // the cross-link. The toggle's two states are equivalent and the cross-link
  // points nowhere. Locked correctness fix (2026-05-03).
  describe('single-branch merchant — branch-multiplicity UI suppressed', () => {
    it('does not render the branch/all toggle', () => {
      const { queryByLabelText } = renderTab({ isMultiBranch: false })
      expect(queryByLabelText('Brightlingsea')).toBeNull()
      expect(queryByLabelText('All branches')).toBeNull()
    })

    it('does not render the "See reviews from other branches" cross-link', () => {
      const { queryByLabelText } = renderTab({ isMultiBranch: false })
      expect(queryByLabelText('See reviews from other branches')).toBeNull()
    })

    it('still shows the branch-aware empty copy ("Be the first to review {branchName}")', () => {
      const { getByText } = renderTab({ isMultiBranch: false })
      expect(getByText('Be the first to review Brightlingsea')).toBeTruthy()
    })
  })
})
