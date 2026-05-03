import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Regression for PR A round-3 QA — own review used to be hoisted to the top
// regardless of the selected sort. That made "highest" / "lowest" / "recent"
// silently produce the same first card if the current user had a review.
// Behaviour now: sort applies to ALL reviews including own. Own review is
// still differentiated by the YOUR-REVIEW badge on the card; pinning is an
// explicit UX decision deferred to a future "pinned own review" pattern.

jest.mock('@/features/merchant/hooks/useWriteReview', () => ({
  useCreateReview:  () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteReview:  () => ({ mutateAsync: jest.fn(), isPending: false }),
  useToggleHelpful: () => ({ mutate: jest.fn() }),
}))

jest.mock('@/features/merchant/components/ReviewSummary', () => ({
  ReviewSummary: () => null,
}))
jest.mock('@/features/merchant/components/WriteReviewSheet', () => ({
  WriteReviewSheet: () => null,
}))
// Minimal sort-control mock — surfaces buttons we can press.
jest.mock('@/features/merchant/components/ReviewSortControl', () => {
  const React = require('react')
  const { Pressable, Text } = require('react-native')
  return {
    ReviewSortControl: ({ onSortChange }: { onSortChange: (s: 'recent' | 'highest' | 'lowest' | 'helpful') => void }) => (
      <>
        <Pressable accessibilityLabel="sort-recent"  onPress={() => onSortChange('recent')}><Text>recent</Text></Pressable>
        <Pressable accessibilityLabel="sort-highest" onPress={() => onSortChange('highest')}><Text>highest</Text></Pressable>
        <Pressable accessibilityLabel="sort-lowest"  onPress={() => onSortChange('lowest')}><Text>lowest</Text></Pressable>
        <Pressable accessibilityLabel="sort-helpful" onPress={() => onSortChange('helpful')}><Text>helpful</Text></Pressable>
      </>
    ),
  }
})
// Render each card as a Text node tagged with its id + own-flag, in DOM order.
jest.mock('@/features/merchant/components/ReviewCard', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    ReviewCard: ({ review }: { review: { id: string; isOwnReview: boolean } }) => (
      <Text accessibilityLabel={`card-${review.id}`}>
        {review.id}{review.isOwnReview ? '*' : ''}
      </Text>
    ),
  }
})

jest.mock('@/features/merchant/hooks/useMerchantReviews', () => ({
  useReviewSummary:   () => ({
    data: { averageRating: 3.5, totalReviews: 4, distribution: { '1': 0, '2': 1, '3': 1, '4': 1, '5': 1 } },
    isLoading: false,
  }),
  useMerchantReviews: () => ({
    data: {
      reviews: [
        // r1 = own review with the LOWEST rating + an OLD update time.
        // If pinning were still in place, this would always be first regardless of sort.
        { id: 'r1', branchId: 'b1', branchName: 'Main', displayName: 'Me', rating: 2, comment: null,
          isVerified: false, isOwnReview: true,
          createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z',
          helpfulCount: 0, userMarkedHelpful: false },
        { id: 'r2', branchId: 'b1', branchName: 'Main', displayName: 'A',  rating: 5, comment: null,
          isVerified: false, isOwnReview: false,
          createdAt: '2026-04-15T00:00:00.000Z', updatedAt: '2026-04-15T00:00:00.000Z',
          helpfulCount: 1, userMarkedHelpful: false },
        { id: 'r3', branchId: 'b1', branchName: 'Main', displayName: 'B',  rating: 4, comment: null,
          isVerified: false, isOwnReview: false,
          createdAt: '2026-04-20T00:00:00.000Z', updatedAt: '2026-04-20T00:00:00.000Z',
          helpfulCount: 8, userMarkedHelpful: false },
        { id: 'r4', branchId: 'b1', branchName: 'Main', displayName: 'C',  rating: 3, comment: null,
          isVerified: false, isOwnReview: false,
          createdAt: '2026-04-30T00:00:00.000Z', updatedAt: '2026-04-30T00:00:00.000Z',
          helpfulCount: 3, userMarkedHelpful: false },
      ],
      total: 4,
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
    useAuthStore: jest.fn((sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state)),
  }
})

import { ReviewsTab } from '@/features/merchant/components/ReviewsTab'

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ReviewsTab merchantId="m1" currentBranchId="b1" currentBranchName="Test Branch" myReview={null} isMultiBranch={true} />
    </QueryClientProvider>,
  )
}

function readOrder(api: ReturnType<typeof renderTab>): string[] {
  return api.getAllByLabelText(/^card-/).map(n => (n.props.accessibilityLabel as string).replace('card-', ''))
}

describe('ReviewsTab sort respects user selection (no own-review pin)', () => {
  it('default = recent: most-recently-updated first; own review NOT pinned', () => {
    const api = renderTab()
    // r4 (Apr 30) > r3 (Apr 20) > r2 (Apr 15) > r1 (Apr 1, own).
    expect(readOrder(api)).toEqual(['r4', 'r3', 'r2', 'r1'])
  })

  it('highest: 5★ > 4★ > 3★ > 2★ — own review (2★) goes LAST, not first', () => {
    const api = renderTab()
    fireEvent.press(api.getByLabelText('sort-highest'))
    expect(readOrder(api)).toEqual(['r2', 'r3', 'r4', 'r1'])
  })

  it('lowest: 2★ > 3★ > 4★ > 5★ — own review at top here is INCIDENTAL, not pinned', () => {
    const api = renderTab()
    fireEvent.press(api.getByLabelText('sort-lowest'))
    // r1 (own, 2★) IS first here — because its rating is lowest, not because it's pinned.
    expect(readOrder(api)).toEqual(['r1', 'r4', 'r3', 'r2'])
  })

  // Regression for PR A round-5 QA — sort UI offered "Most helpful" but the
  // sort logic in ReviewsTab had no case for it, so the comparator returned
  // 0 (no reorder). Tapping "Most helpful" silently did nothing. Fix: sort
  // by helpfulCount desc with a recent-update tiebreaker for ties.
  it('helpful: helpfulCount desc — most-helpful first, ties broken by most-recent', () => {
    const api = renderTab()
    fireEvent.press(api.getByLabelText('sort-helpful'))
    // r3 (8 helpful) > r4 (3) > r2 (1) > r1 (0). Own review r1 lands LAST
    // because its helpfulCount is lowest, not because of any pinning logic.
    expect(readOrder(api)).toEqual(['r3', 'r4', 'r2', 'r1'])
  })
})
