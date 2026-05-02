import React from 'react'
import { render } from '@testing-library/react-native'
import { ReviewCard } from '@/features/merchant/components/ReviewCard'
import type { ReviewItem } from '@/lib/api/reviews'

// Regression for PR A bug 3 — second-pass on-device QA found that editing
// an existing review still showed the original "X hours ago", because the
// backend upserts on `@@unique([userId, branchId])`. Editing updates the
// same row → `createdAt` stays old; `updatedAt` is fresh. The card must
// display `updatedAt` so a freshly-edited review reads "Just now" / "1m ago"
// rather than "16h ago" (the original post time).

const baseReview: ReviewItem = {
  id:          'r1',
  branchId:    'b1',
  branchName:  'Brightlingsea',
  displayName: 'Ada L.',
  rating:      5,
  comment:     'Great',
  isVerified:  true,
  isOwnReview: false,
  createdAt:   '2026-04-01T00:00:00.000Z',  // original post — long ago
  updatedAt:   '2026-04-01T00:00:00.000Z',
  helpfulCount:      0,
  userMarkedHelpful: false,
}

describe('ReviewCard timestamp source', () => {
  it('uses updatedAt for the relative time, not createdAt', () => {
    // Pin "now" deterministically so timeAgo math is testable.
    jest.useFakeTimers({
      now: new Date('2026-05-02T12:00:00Z'),
      doNotFake: ['setInterval', 'clearInterval'],
    })

    // Posted long ago, edited 5 minutes before "now".
    const editedJustNow: ReviewItem = {
      ...baseReview,
      createdAt: '2026-04-01T00:00:00.000Z',  // 1 month ago
      updatedAt: '2026-05-02T11:55:00.000Z',  // 5 minutes ago
    }

    const { getByText } = render(<ReviewCard review={editedJustNow} showBranchLabel={false} />)

    // Card should show "5m ago" (from updatedAt). If it were reading
    // createdAt, it would say "30d ago" or similar.
    expect(getByText(/5m ago/)).toBeTruthy()

    jest.useRealTimers()
  })

  it('renders correctly for a never-edited review (createdAt === updatedAt)', () => {
    jest.useFakeTimers({
      now: new Date('2026-05-02T12:00:00Z'),
      doNotFake: ['setInterval', 'clearInterval'],
    })

    // Brand-new review: Prisma sets updatedAt = createdAt on initial create.
    const fresh: ReviewItem = {
      ...baseReview,
      createdAt: '2026-05-02T11:59:00.000Z',  // 1 min ago
      updatedAt: '2026-05-02T11:59:00.000Z',
    }

    const { getByText } = render(<ReviewCard review={fresh} showBranchLabel={false} />)
    expect(getByText(/1m ago/)).toBeTruthy()

    jest.useRealTimers()
  })
})
