import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReviewsTab } from '@/features/merchant/components/ReviewsTab'

const mockUseMerchantReviews = jest.fn()
const mockUseReviewSummary   = jest.fn()
jest.mock('@/features/merchant/hooks/useMerchantReviews', () => ({
  useReviewSummary:   (mid: string, opts: { branchId?: string }) => {
    mockUseReviewSummary(mid, opts)
    return { data: { averageRating: 4.5, totalReviews: 3, distribution: { 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 } }, isLoading: false }
  },
  useMerchantReviews: (mid: string, opts: { limit?: number; offset?: number; branchId?: string }) => {
    mockUseMerchantReviews(mid, opts)
    return { data: { reviews: [], total: 0 }, isLoading: false }
  },
}))
jest.mock('@/features/merchant/hooks/useWriteReview', () => ({
  useCreateReview:  () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteReview:  () => ({ mutateAsync: jest.fn() }),
  useToggleHelpful: () => ({ mutate: jest.fn() }),
}))
jest.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ status: 'authed', user: { id: 'u1' } }),
}))

const renderTab = (props = {}) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ReviewsTab merchantId="m1" currentBranchId="b1" currentBranchName="Brightlingsea" myReview={null} {...props} />
    </QueryClientProvider>,
  )
}

describe('ReviewsTab branch-filter toggle', () => {
  beforeEach(() => {
    mockUseMerchantReviews.mockClear()
    mockUseReviewSummary.mockClear()
  })

  it('default state queries the LIST with branchId=current', () => {
    renderTab()
    expect(mockUseMerchantReviews).toHaveBeenLastCalledWith('m1', expect.objectContaining({ branchId: 'b1' }))
  })

  // PR #33 fix-up: the SUMMARY query (rating + breakdown header) must scope
  // to the same branch as the list, otherwise the user sees branch reviews
  // under a merchant-wide rating histogram. Caught in 2026-05-03 on-device QA.
  it('default state queries the SUMMARY with branchId=current', () => {
    renderTab()
    expect(mockUseReviewSummary).toHaveBeenLastCalledWith('m1', expect.objectContaining({ branchId: 'b1' }))
  })

  it('toggle to All branches removes the branchId from BOTH queries', () => {
    const { getByLabelText } = renderTab()
    fireEvent.press(getByLabelText(/All branches/i))
    expect(mockUseMerchantReviews).toHaveBeenLastCalledWith('m1', expect.not.objectContaining({ branchId: expect.anything() }))
    expect(mockUseReviewSummary).toHaveBeenLastCalledWith('m1', expect.not.objectContaining({ branchId: expect.anything() }))
  })

  it('toggle persists across chip-driven branch switch', () => {
    const { rerender, getByLabelText } = renderTab()
    fireEvent.press(getByLabelText(/All branches/i))
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ReviewsTab merchantId="m1" currentBranchId="b2" currentBranchName="Frinton" myReview={null} />
      </QueryClientProvider>,
    )
    expect(mockUseMerchantReviews).toHaveBeenLastCalledWith('m1', expect.not.objectContaining({ branchId: expect.anything() }))
    expect(mockUseReviewSummary).toHaveBeenLastCalledWith('m1', expect.not.objectContaining({ branchId: expect.anything() }))
  })
})
