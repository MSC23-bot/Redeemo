import React from 'react'
import { render } from '@testing-library/react-native'
import { ReviewSummary } from '@/features/merchant/components/ReviewSummary'

// Regression for PR A round-4 QA — owner pushback on the "Write a review"
// CTA opening an existing review in edit mode (the schema enforces one
// review per (user, branch), so the backend upserts). Wording now matches
// the action: "Write a Review" when the user has none, "Edit Your Review"
// when they have one. Pure copy change; no behavioural change.

const dist = { 1: 0, 2: 0, 3: 1, 4: 2, 5: 3 }

describe('ReviewSummary CTA wording', () => {
  it('shows "Write a Review" when the user has no existing review', () => {
    const { getByText, getByLabelText } = render(
      <ReviewSummary averageRating={4.3} totalReviews={6} distribution={dist} onWriteReview={() => {}} />,
    )
    expect(getByText('Write a Review')).toBeTruthy()
    expect(getByLabelText('Write a review')).toBeTruthy()
  })

  it('shows "Edit Your Review" when hasExistingReview is true', () => {
    const { getByText, getByLabelText } = render(
      <ReviewSummary
        averageRating={4.3}
        totalReviews={6}
        distribution={dist}
        onWriteReview={() => {}}
        hasExistingReview
      />,
    )
    expect(getByText('Edit Your Review')).toBeTruthy()
    expect(getByLabelText('Edit your review')).toBeTruthy()
  })
})
