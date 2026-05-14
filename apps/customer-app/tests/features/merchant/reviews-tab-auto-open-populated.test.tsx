// PR-C T15 follow-up — Codex review F2 (locked 2026-05-09).
//
// `ReviewsTab` renders TWO different DOM trees depending on whether
// `summary.totalReviews === 0` (empty state) or > 0 (populated
// state).  Each tree mounts its own `<WriteReviewSheet>` instance.
// The empty-state path forwards `fromRedemptionId` correctly, but
// the populated-state path was missing the prop, so a SuccessPopup
// → Rate & Review user landing on a populated branch saw the sheet
// open without the verified-review banner — UX promise broken even
// though the backend would still verify on submit (handleWriteSubmit
// reads from redemptionWriteTarget regardless of which sheet
// instance fired it).
//
// This file mocks the merchant-reviews hooks to return NON-EMPTY
// data so we exercise the populated-state render path specifically.

import React from 'react'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockMutateAsync = jest.fn().mockResolvedValue({ id: 'r-new' })
jest.mock('@/features/merchant/hooks/useWriteReview', () => ({
  useCreateReview:  () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useDeleteReview:  () => ({ mutateAsync: jest.fn() }),
  useToggleHelpful: () => ({ mutate: jest.fn() }),
}))

// POPULATED STATE: at least one existing review at the target
// branch — drives the non-empty render path that previously missed
// the `fromRedemptionId` prop.
jest.mock('@/features/merchant/hooks/useMerchantReviews', () => ({
  useReviewSummary: () => ({
    data: {
      averageRating: 4.5,
      totalReviews: 3,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 },
    },
    isLoading: false,
  }),
  useMerchantReviews: () => ({
    data: {
      reviews: [
        {
          id:          'rev-1',
          userId:      'u-other',
          branchId:    'b1',
          branchName:  'Brightlingsea',
          displayName: 'Sam P.',
          rating:      5,
          comment:     'Amazing thali',
          isVerified:  true,
          isOwnReview: false,
          createdAt:   '2026-05-01T12:00:00Z',
          updatedAt:   '2026-05-01T12:00:00Z',
          helpfulCount: 0,
          userMarkedHelpful: false,
        },
      ],
      total: 3,
    },
    isLoading: false,
  }),
}))

jest.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ status: 'authed', user: { id: 'u1' } }),
}))

// Probe the `fromRedemptionId` prop on the WriteReviewSheet — same
// pattern as the empty-state companion test file.
jest.mock('@/features/merchant/components/WriteReviewSheet', () => {
  const React = require('react')
  const { Text, View } = require('react-native')
  return {
    WriteReviewSheet: ({ visible, branchName, fromRedemptionId }: any) =>
      visible ? (
        <View accessibilityLabel="write-review-sheet">
          <Text testID="probe-branch-name">{branchName}</Text>
          <Text testID="probe-from-redemption-id">{fromRedemptionId ?? 'null'}</Text>
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
  currentBranchCount: 3,
  allBranchesCount:   3,
}

describe('ReviewsTab — populated-state path (Codex F2)', () => {
  beforeEach(() => { mockMutateAsync.mockClear() })

  it('forwards fromRedemptionId to WriteReviewSheet on the POPULATED render path', () => {
    const { getByLabelText, getByTestId } = render(
      <ReviewsTab
        {...baseProps}
        initialOpenWriteFor={{ branchId: 'b1', redemptionId: 'red-from-popup' }}
      />,
      { wrapper: makeWrapper() },
    )
    // Sheet auto-opens — populated branch render path.
    expect(getByLabelText('write-review-sheet')).toBeTruthy()
    // Verified banner depends on this prop being threaded through.
    expect(getByTestId('probe-from-redemption-id').props.children).toBe('red-from-popup')
  })

  it('passes null when initialOpenWriteFor has no redemptionId (populated path)', () => {
    const { getByLabelText, getByTestId } = render(
      <ReviewsTab
        {...baseProps}
        initialOpenWriteFor={{ branchId: 'b1' }}
      />,
      { wrapper: makeWrapper() },
    )
    expect(getByLabelText('write-review-sheet')).toBeTruthy()
    expect(getByTestId('probe-from-redemption-id').props.children).toBe('null')
  })
})
