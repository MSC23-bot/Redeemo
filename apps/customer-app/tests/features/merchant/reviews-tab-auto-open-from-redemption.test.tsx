// PR-C T10 (LOCKED 2026-05-09 §0.3): ReviewsTab accepts an
// `initialOpenWriteFor` prop describing which branch to open the
// WriteReviewSheet for AND the redemptionId to attach.  When set,
// the sheet auto-opens on mount with the verified-banner showing.
// Submit fires createReview with that redemptionId — closing the
// loop from URL params (T11) → ReviewsTab → WriteReviewSheet (T8)
// → useCreateReview (T7) → reviewsApi (T6) → backend (T1–T5).

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockMutateAsync = jest.fn().mockResolvedValue({ id: 'r-new' })
jest.mock('@/features/merchant/hooks/useWriteReview', () => ({
  useCreateReview:  () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useDeleteReview:  () => ({ mutateAsync: jest.fn() }),
  useToggleHelpful: () => ({ mutate: jest.fn() }),
}))

jest.mock('@/features/merchant/hooks/useMerchantReviews', () => ({
  useReviewSummary:   () => ({
    data: { averageRating: 0, totalReviews: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
    isLoading: false,
  }),
  useMerchantReviews: () => ({
    data: { reviews: [], total: 0 },
    isLoading: false,
  }),
}))

jest.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ status: 'authed', user: { id: 'u1' } }),
}))

// Surface the WriteReviewSheet open-state via a probe element.
// Captures the resolved `visible` flag + branchName + the new
// `fromRedemptionId` prop so tests can assert the contract.
jest.mock('@/features/merchant/components/WriteReviewSheet', () => {
  const React = require('react')
  const { Pressable, Text, View } = require('react-native')
  return {
    WriteReviewSheet: ({ visible, branchName, fromRedemptionId, onSubmit }: any) =>
      visible ? (
        <View accessibilityLabel="write-review-sheet">
          <Text testID="probe-branch-name">{branchName}</Text>
          <Text testID="probe-from-redemption-id">{fromRedemptionId ?? 'null'}</Text>
          <Pressable
            accessibilityLabel="probe-submit"
            onPress={() => onSubmit({ rating: 5, comment: 'Auto', redemptionId: fromRedemptionId ?? undefined })}
          >
            <Text>probe-submit</Text>
          </Pressable>
        </View>
      ) : null,
  }
})

import { ReviewsTab } from '@/features/merchant/components/ReviewsTab'

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

const baseProps = {
  merchantId:         'm1',
  merchantName:       'Covelum',
  currentBranchId:    'b1',
  currentBranchName:  'Brightlingsea',
  myReview:           null,
  isMultiBranch:      false,
  currentBranchCount: 0,
  allBranchesCount:   0,
}

describe('ReviewsTab — D10/T10 initialOpenWriteFor auto-open', () => {
  beforeEach(() => { mockMutateAsync.mockClear() })

  it('auto-opens WriteReviewSheet when initialOpenWriteFor is set on mount', () => {
    const { getByLabelText, getByTestId } = render(
      <ReviewsTab
        {...baseProps}
        initialOpenWriteFor={{ branchId: 'b1', redemptionId: 'red-1' }}
      />,
      { wrapper: makeWrapper() },
    )
    expect(getByLabelText('write-review-sheet')).toBeTruthy()
    expect(getByTestId('probe-from-redemption-id').props.children).toBe('red-1')
  })

  it('does NOT auto-open when initialOpenWriteFor is null', () => {
    const { queryByLabelText } = render(
      <ReviewsTab {...baseProps} initialOpenWriteFor={null} />,
      { wrapper: makeWrapper() },
    )
    expect(queryByLabelText('write-review-sheet')).toBeNull()
  })

  it('does NOT auto-open when initialOpenWriteFor is undefined', () => {
    const { queryByLabelText } = render(
      <ReviewsTab {...baseProps} />,
      { wrapper: makeWrapper() },
    )
    expect(queryByLabelText('write-review-sheet')).toBeNull()
  })

  it('passes the correct branchId target to createReview when submitted', async () => {
    const { getByLabelText } = render(
      <ReviewsTab
        {...baseProps}
        initialOpenWriteFor={{ branchId: 'b-other', redemptionId: 'red-1' }}
      />,
      { wrapper: makeWrapper() },
    )
    fireEvent.press(getByLabelText('probe-submit'))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      branchId:     'b-other',
      redemptionId: 'red-1',
      rating:       5,
    }))
  })

  it('redemptionId is OPTIONAL on initialOpenWriteFor — auto-opens with null fromRedemptionId', () => {
    const { getByLabelText, getByTestId } = render(
      <ReviewsTab
        {...baseProps}
        initialOpenWriteFor={{ branchId: 'b1' }}
      />,
      { wrapper: makeWrapper() },
    )
    expect(getByLabelText('write-review-sheet')).toBeTruthy()
    // Probe renders 'null' literal when fromRedemptionId is not set.
    expect(getByTestId('probe-from-redemption-id').props.children).toBe('null')
  })

  // PR-C T16 device-QA fix (LOCKED 2026-05-09): ReviewsTab now fires
  // `onAutoOpenConsumed` AFTER the auto-open useEffect successfully
  // requests the sheet open.  The parent uses this to defer URL
  // scrub until consumption — without it the scrub races ahead and
  // strips openWriteReview/fromRedemption before this effect ever
  // runs.
  describe('onAutoOpenConsumed callback (Codex device-QA fix)', () => {
    it('fires onAutoOpenConsumed when initialOpenWriteFor triggers auto-open', () => {
      const onAutoOpenConsumed = jest.fn()
      render(
        <ReviewsTab
          {...baseProps}
          initialOpenWriteFor={{ branchId: 'b1', redemptionId: 'red-1' }}
          onAutoOpenConsumed={onAutoOpenConsumed}
        />,
        { wrapper: makeWrapper() },
      )
      expect(onAutoOpenConsumed).toHaveBeenCalledTimes(1)
    })

    it('does NOT fire onAutoOpenConsumed when initialOpenWriteFor is null', () => {
      const onAutoOpenConsumed = jest.fn()
      render(
        <ReviewsTab
          {...baseProps}
          initialOpenWriteFor={null}
          onAutoOpenConsumed={onAutoOpenConsumed}
        />,
        { wrapper: makeWrapper() },
      )
      expect(onAutoOpenConsumed).not.toHaveBeenCalled()
    })

    it('does NOT throw when onAutoOpenConsumed is omitted (optional prop)', () => {
      // No onAutoOpenConsumed provided.  Auto-open still fires, no
      // error.
      expect(() => render(
        <ReviewsTab
          {...baseProps}
          initialOpenWriteFor={{ branchId: 'b1', redemptionId: 'red-1' }}
        />,
        { wrapper: makeWrapper() },
      )).not.toThrow()
    })
  })
})
