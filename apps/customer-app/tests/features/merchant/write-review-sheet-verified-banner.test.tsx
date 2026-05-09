import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'

// BottomSheet uses a Modal that conditionally mounts; the project's
// shared mock unwraps it.  Same pattern as pin-entry-sheet.test.tsx.
jest.mock('@/design-system/motion/BottomSheet', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    BottomSheet: ({ visible, children }: any) =>
      visible ? React.createElement(View, { testID: 'bottom-sheet' }, children) : null,
  }
})
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children ?? null,
}))
jest.mock('@/design-system/haptics', () => ({
  lightHaptic: jest.fn(),
}))

import { WriteReviewSheet } from '@/features/merchant/components/WriteReviewSheet'

// PR-C T8 (LOCKED 2026-05-09 §0.3): WriteReviewSheet accepts a
// `fromRedemptionId` prop.  When non-null the sheet renders a
// "Verified review" banner above the form and forwards the
// redemptionId in the onSubmit payload so the backend can link
// the review to the redemption (drives row-level isVerified).
//
// Banner copy (locked owner approval 2026-05-09):
//   heading: "Verified review"
//   body:    "Linked to your voucher redemption at this branch."

function defaults(overrides: Partial<React.ComponentProps<typeof WriteReviewSheet>> = {}) {
  return {
    visible: true,
    onDismiss: jest.fn(),
    onSubmit: jest.fn(),
    isLoading: false,
    branchName: 'Brightlingsea',
    ...overrides,
  } satisfies React.ComponentProps<typeof WriteReviewSheet>
}

describe('WriteReviewSheet — D23 verified-review banner (PR-C T8)', () => {
  it('renders the banner when fromRedemptionId is provided', () => {
    const { getByTestId, getByText } = render(
      <WriteReviewSheet {...defaults({ fromRedemptionId: 'red-1' })} />,
    )
    expect(getByTestId('write-review-verified-banner')).toBeTruthy()
    expect(getByText('Verified review')).toBeTruthy()
    expect(getByText('Linked to your voucher redemption at this branch.')).toBeTruthy()
  })

  it('does NOT render the banner when fromRedemptionId is null', () => {
    const { queryByTestId, queryByText } = render(
      <WriteReviewSheet {...defaults({ fromRedemptionId: null })} />,
    )
    expect(queryByTestId('write-review-verified-banner')).toBeNull()
    expect(queryByText('Verified review')).toBeNull()
  })

  it('does NOT render the banner when fromRedemptionId is undefined (omitted prop)', () => {
    const { queryByTestId } = render(<WriteReviewSheet {...defaults()} />)
    expect(queryByTestId('write-review-verified-banner')).toBeNull()
  })

  it('forwards redemptionId in the onSubmit payload when set', () => {
    const onSubmit = jest.fn()
    const { getByLabelText, getByText } = render(
      <WriteReviewSheet
        {...defaults({ onSubmit, fromRedemptionId: 'red-1', initialRating: 5 })}
      />,
    )
    // Re-tap the 5-star button to ensure rating commits.
    fireEvent.press(getByLabelText('5 stars'))
    fireEvent.press(getByText('Submit Review'))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      rating: 5,
      redemptionId: 'red-1',
    }))
  })

  it('omits redemptionId from the onSubmit payload when not set', () => {
    const onSubmit = jest.fn()
    const { getByLabelText, getByText } = render(
      <WriteReviewSheet {...defaults({ onSubmit, initialRating: 4 })} />,
    )
    fireEvent.press(getByLabelText('4 stars'))
    fireEvent.press(getByText('Submit Review'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0][0]
    expect(payload).toEqual({ rating: 4 })
    expect(payload).not.toHaveProperty('redemptionId')
  })

  it('forwards redemptionId WITH comment when both are present', () => {
    const onSubmit = jest.fn()
    const { getByLabelText, getByText, getByPlaceholderText } = render(
      <WriteReviewSheet
        {...defaults({ onSubmit, fromRedemptionId: 'red-1', initialRating: 5 })}
      />,
    )
    fireEvent.changeText(getByPlaceholderText('Share your experience (optional)'), 'Great place')
    fireEvent.press(getByLabelText('5 stars'))
    fireEvent.press(getByText('Submit Review'))
    expect(onSubmit).toHaveBeenCalledWith({
      rating: 5,
      comment: 'Great place',
      redemptionId: 'red-1',
    })
  })
})
