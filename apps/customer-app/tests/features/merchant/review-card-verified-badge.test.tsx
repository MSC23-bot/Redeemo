import React from 'react'
import { render } from '@testing-library/react-native'

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children ?? null,
}))
jest.mock('@/design-system/haptics', () => ({
  lightHaptic: jest.fn(),
}))

import { ReviewCard } from '@/features/merchant/components/ReviewCard'
import type { ReviewItem } from '@/lib/api/reviews'

// PR-C T9 (LOCKED 2026-05-09 §0.3): the verified-redemption badge
// renders when review.isVerified === true.  Path A row-level
// derivation (§0.3): backend computes isVerified from
// Review.redemptionId !== null.  This test pins the FRONTEND
// contract — the badge appears when the boolean is true and is
// hidden when false — independent of backend's derivation rule.
//
// Visible label + accessibilityLabel both read "Verified
// redemption" (D9 LOCKED).  testID `review-card-verified-badge`
// for query stability.

const baseReview: ReviewItem = {
  id:                'r1',
  branchId:          'b1',
  branchName:        'Brightlingsea',
  displayName:       'Ada L.',
  rating:            5,
  comment:           'Great place',
  isVerified:        false,
  isOwnReview:       false,
  createdAt:         '2026-04-01T00:00:00.000Z',
  updatedAt:         '2026-04-01T00:00:00.000Z',
  helpfulCount:      0,
  userMarkedHelpful: false,
}

describe('ReviewCard — D9 verified-redemption badge (PR-C T9)', () => {
  it('renders the verified badge when review.isVerified === true', () => {
    const { getByTestId, getByText } = render(
      <ReviewCard review={{ ...baseReview, isVerified: true }} showBranchLabel={false} />,
    )
    expect(getByTestId('review-card-verified-badge')).toBeTruthy()
    expect(getByText('Verified redemption')).toBeTruthy()
  })

  it('does NOT render the verified badge when review.isVerified === false', () => {
    const { queryByTestId, queryByText } = render(
      <ReviewCard review={{ ...baseReview, isVerified: false }} showBranchLabel={false} />,
    )
    expect(queryByTestId('review-card-verified-badge')).toBeNull()
    expect(queryByText('Verified redemption')).toBeNull()
  })

  it('badge accessibilityLabel reads "Verified redemption"', () => {
    const { getByTestId } = render(
      <ReviewCard review={{ ...baseReview, isVerified: true }} showBranchLabel={false} />,
    )
    expect(getByTestId('review-card-verified-badge').props.accessibilityLabel).toBe(
      'Verified redemption',
    )
  })
})
