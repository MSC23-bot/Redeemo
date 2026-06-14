/**
 * ActivityList — empty state, event label map, actor fallbacks, relative time.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { ActivityList } from '../ActivityList'
import type { ReviewActivity } from '@/lib/api/review'

// formatRelativeTime is tested independently; mock it to control output.
jest.mock('@/lib/notifications/relativeTime', () => ({
  formatRelativeTime: jest.fn(() => '2h ago'),
}))

function makeActivity(overrides: Partial<ReviewActivity> = {}): ReviewActivity {
  return {
    id: 'act-1',
    event: 'MERCHANT_SUBMITTED_FOR_APPROVAL',
    createdAt: '2026-06-10T09:00:00.000Z',
    actorType: 'MERCHANT',
    reason: null,
    actor: null,
    ...overrides,
  }
}

describe('ActivityList', () => {
  it('renders empty state when no activity', () => {
    render(<ActivityList activity={[]} />)
    expect(screen.getByText('No activity recorded yet.')).toBeInTheDocument()
  })

  it('renders a row per activity entry', () => {
    const rows = [
      makeActivity({ id: 'act-1' }),
      makeActivity({ id: 'act-2', event: 'MERCHANT_APPROVAL_CLAIMED', actorType: 'ADMIN' }),
    ]
    render(<ActivityList activity={rows} />)
    expect(screen.getByTestId('activity-row-act-1')).toBeInTheDocument()
    expect(screen.getByTestId('activity-row-act-2')).toBeInTheDocument()
  })

  it('maps known events to human-readable labels', () => {
    const rows = [
      makeActivity({ id: 'a1', event: 'MERCHANT_SUBMITTED_FOR_APPROVAL' }),
      makeActivity({ id: 'a2', event: 'MERCHANT_APPROVAL_APPROVED', actorType: 'ADMIN' }),
      makeActivity({ id: 'a3', event: 'MERCHANT_GO_LIVE', actorType: 'SYSTEM' }),
    ]
    render(<ActivityList activity={rows} />)
    expect(screen.getByText('Submitted for review')).toBeInTheDocument()
    expect(screen.getByText('Approval approved')).toBeInTheDocument()
    expect(screen.getByText('Merchant went live')).toBeInTheDocument()
  })

  it('falls back to the raw event name for unknown events', () => {
    render(<ActivityList activity={[makeActivity({ event: 'SOME_FUTURE_EVENT' })]} />)
    expect(screen.getByText('SOME_FUTURE_EVENT')).toBeInTheDocument()
  })

  it('shows "Merchant" actor label when actorType is MERCHANT', () => {
    render(<ActivityList activity={[makeActivity({ actorType: 'MERCHANT' })]} />)
    expect(screen.getByText('Merchant')).toBeInTheDocument()
  })

  it('shows "System" actor label when actorType is SYSTEM', () => {
    render(<ActivityList activity={[makeActivity({ actorType: 'SYSTEM' })]} />)
    expect(screen.getByText('System')).toBeInTheDocument()
  })

  it('shows admin name when actorType is ADMIN with actor name', () => {
    render(
      <ActivityList
        activity={[
          makeActivity({
            actorType: 'ADMIN',
            actor: { id: 'adm-1', name: 'Sarah Jones' },
          }),
        ]}
      />
    )
    expect(screen.getByText('Sarah Jones')).toBeInTheDocument()
  })

  it('falls back to "Admin" when actorType is ADMIN but actor name is null', () => {
    render(
      <ActivityList
        activity={[
          makeActivity({
            actorType: 'ADMIN',
            actor: { id: 'adm-1', name: null },
          }),
        ]}
      />
    )
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('shows "Unknown" actor label when actorType is null', () => {
    render(<ActivityList activity={[makeActivity({ actorType: null, actor: null })]} />)
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('shows the reason when present', () => {
    render(
      <ActivityList
        activity={[makeActivity({ reason: 'Duplicate account detected' })]}
      />
    )
    expect(screen.getByText(/duplicate account detected/i)).toBeInTheDocument()
  })

  it('shows the relative time from formatRelativeTime', () => {
    render(<ActivityList activity={[makeActivity()]} />)
    expect(screen.getByText('2h ago')).toBeInTheDocument()
  })
})
