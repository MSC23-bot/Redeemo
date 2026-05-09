// PR-C T16 device-QA fix (LOCKED 2026-05-09 §AI Option A) —
// WriteReviewSheet reframes its copy as an UPDATE surface when the
// user already has a review for this branch (parent pre-fills via
// `myReview` ⇒ initialRating > 0 OR initialComment non-empty).
//
// Locked rule (Option A): the current schema enforces one review
// per (userId, branchId) via @@unique.  Editing is the only path.
// The sheet copy must reflect that truthfully — not pretend this is
// a fresh review.  Multi-review / one-review-per-redemption stays
// deferred under memory §AI as Tier 3 review-system v2 work.
//
// Copy variants:
//   New:     "Write a review"  → "Submit review"
//   Update:  "Update your review" → "Update review"

import React from 'react'
import { render } from '@testing-library/react-native'

jest.mock('@/design-system/motion/BottomSheet', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    BottomSheet: ({ visible, children, accessibilityLabel }: any) =>
      visible ? React.createElement(View, { testID: 'bottom-sheet', accessibilityLabel }, children) : null,
  }
})
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children ?? null,
}))
jest.mock('@/design-system/haptics', () => ({
  lightHaptic: jest.fn(),
}))

import { WriteReviewSheet } from '@/features/merchant/components/WriteReviewSheet'

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

describe('WriteReviewSheet — Update vs new copy (PR-C T16 §AI Option A)', () => {
  describe('NEW review (no initialRating, no initialComment)', () => {
    it('title reads "Write a review"', () => {
      const { getByTestId } = render(<WriteReviewSheet {...defaults()} />)
      expect(getByTestId('write-review-title').props.children).toBe('Write a review')
    })

    it('submit CTA reads "Submit review"', () => {
      const { getByTestId } = render(<WriteReviewSheet {...defaults()} />)
      expect(getByTestId('write-review-submit-text').props.children).toBe('Submit review')
    })

    it('BottomSheet accessibilityLabel reads "Write a review"', () => {
      const { getByTestId } = render(<WriteReviewSheet {...defaults()} />)
      expect(getByTestId('bottom-sheet').props.accessibilityLabel).toBe('Write a review')
    })

    it('isLoading state reads "Submitting…"', () => {
      const { getByTestId } = render(<WriteReviewSheet {...defaults({ isLoading: true })} />)
      expect(getByTestId('write-review-submit-text').props.children).toBe('Submitting…')
    })
  })

  describe('UPDATE review (initialRating > 0)', () => {
    it('title reads "Update your review" when initialRating > 0', () => {
      const { getByTestId } = render(<WriteReviewSheet {...defaults({ initialRating: 4 })} />)
      expect(getByTestId('write-review-title').props.children).toBe('Update your review')
    })

    it('submit CTA reads "Update review" when initialRating > 0', () => {
      const { getByTestId } = render(<WriteReviewSheet {...defaults({ initialRating: 4 })} />)
      expect(getByTestId('write-review-submit-text').props.children).toBe('Update review')
    })

    it('BottomSheet accessibilityLabel reads "Update your review"', () => {
      const { getByTestId } = render(<WriteReviewSheet {...defaults({ initialRating: 4 })} />)
      expect(getByTestId('bottom-sheet').props.accessibilityLabel).toBe('Update your review')
    })

    it('isLoading state reads "Updating…"', () => {
      const { getByTestId } = render(
        <WriteReviewSheet {...defaults({ initialRating: 4, isLoading: true })} />,
      )
      expect(getByTestId('write-review-submit-text').props.children).toBe('Updating…')
    })
  })

  describe('UPDATE review (initialComment non-empty even if initialRating omitted)', () => {
    it('treats a non-empty existing comment as an existing review (defensive)', () => {
      // The parent typically supplies BOTH rating + comment from
      // `myReview`, but if rating happened to be 0 (impossible per
      // schema, but defensive) and comment was non-empty, we should
      // still treat it as an UPDATE.  The check is "has any
      // existing user-supplied content".
      const { getByTestId } = render(
        <WriteReviewSheet {...defaults({ initialComment: 'Old comment' })} />,
      )
      expect(getByTestId('write-review-title').props.children).toBe('Update your review')
    })

    it('whitespace-only initialComment is NOT treated as existing review', () => {
      // Pinned: `   ` should not flip the surface to UPDATE.
      const { getByTestId } = render(
        <WriteReviewSheet {...defaults({ initialComment: '   ' })} />,
      )
      expect(getByTestId('write-review-title').props.children).toBe('Write a review')
    })
  })

  describe('Verified banner stays compatible with both copy variants', () => {
    it('NEW review with verified banner shows both', () => {
      const { getByTestId, queryByTestId } = render(
        <WriteReviewSheet {...defaults({ fromRedemptionId: 'red-1' })} />,
      )
      expect(queryByTestId('write-review-verified-banner')).toBeTruthy()
      expect(getByTestId('write-review-title').props.children).toBe('Write a review')
    })

    it('UPDATE with verified banner shows both (an update can still verify)', () => {
      // Verified-review can still be earned on an UPDATE — Path A
      // (explicit redemptionId) or Path B (auto-link) on a fresh
      // current-cycle redemption — even when the row already exists.
      const { getByTestId, queryByTestId } = render(
        <WriteReviewSheet {...defaults({ initialRating: 4, fromRedemptionId: 'red-1' })} />,
      )
      expect(queryByTestId('write-review-verified-banner')).toBeTruthy()
      expect(getByTestId('write-review-title').props.children).toBe('Update your review')
    })
  })
})
