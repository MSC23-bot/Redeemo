import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { ReviewCard } from '@/features/merchant/components/ReviewCard'
import type { ReviewItem } from '@/lib/api/reviews'

// Regression for PR A round-4 QA — Helpful button looked tappable but did
// nothing visible. Root cause was the list payload didn't carry helpful
// state; backend now returns helpfulCount + userMarkedHelpful on every
// review. Pin: ReviewCard renders count + active-state, and tapping fires
// the parent's `onHelpful` callback.

const baseReview: ReviewItem = {
  id:                'r1',
  branchId:          'b1',
  branchName:        'Main',
  displayName:       'Ada L.',
  rating:            4,
  comment:           'Solid pick',
  isVerified:        false,
  isOwnReview:       false,
  createdAt:         '2026-04-01T00:00:00.000Z',
  updatedAt:         '2026-04-01T00:00:00.000Z',
  helpfulCount:      0,
  userMarkedHelpful: false,
}

describe('ReviewCard helpful display', () => {
  it('renders just "Helpful" when count is 0 (no number suffix)', () => {
    const { getByText } = render(<ReviewCard review={baseReview} onHelpful={() => {}} />)
    expect(getByText('Helpful')).toBeTruthy()
  })

  it('appends the count when there is at least one helpful vote', () => {
    const { getByText } = render(
      <ReviewCard review={{ ...baseReview, helpfulCount: 7 }} onHelpful={() => {}} />,
    )
    expect(getByText(/Helpful · 7/)).toBeTruthy()
  })

  it('exposes a different accessibility label when the user has marked it', () => {
    const marked = { ...baseReview, userMarkedHelpful: true, helpfulCount: 1 }
    const { getByLabelText: byMarked } = render(<ReviewCard review={marked} onHelpful={() => {}} />)
    expect(byMarked(/Marked helpful/)).toBeTruthy()

    const { getByLabelText: byUnmarked } = render(<ReviewCard review={baseReview} onHelpful={() => {}} />)
    expect(byUnmarked('Mark as helpful')).toBeTruthy()
  })

  it('fires the onHelpful callback on tap', () => {
    const onHelpful = jest.fn()
    const { getByLabelText } = render(<ReviewCard review={baseReview} onHelpful={onHelpful} />)
    fireEvent.press(getByLabelText('Mark as helpful'))
    expect(onHelpful).toHaveBeenCalledTimes(1)
  })

  it('does NOT render Helpful for the user\'s own review', () => {
    const own = { ...baseReview, isOwnReview: true }
    const { queryByText } = render(<ReviewCard review={own} onHelpful={() => {}} />)
    expect(queryByText(/Helpful/)).toBeNull()
  })
})
