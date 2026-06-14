/**
 * ActivityTimeline — the read-only merchant communication + activity feed.
 *
 * useTimeline is mocked at the module level so every render is deterministic and
 * offline (mirrors how the /queue/[id] page test mocks useReview). formatRelativeTime
 * is mocked so timestamps are stable. Covers:
 *   - interleave order (action / email / action / email, not grouped, not re-sorted)
 *   - delivery badges for all four statuses
 *   - actor display fallbacks
 *   - owner-resolved label present/absent
 *   - sensitive-content absence (only the safe shape renders)
 *   - loading / error / empty states
 *   - known + unknown event label mapping
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActivityTimeline } from '../ActivityTimeline'
import type {
  MerchantTimeline,
  TimelineActionItem,
  TimelineEmailItem,
} from '@/lib/api/timeline'

// formatRelativeTime is unit-tested independently; mock it for stable output.
jest.mock('@/lib/notifications/relativeTime', () => ({
  formatRelativeTime: jest.fn(() => '2h ago'),
}))

// Mock the hook so the component renders synchronously without a network call.
jest.mock('@/lib/timeline/useTimeline', () => ({
  useTimeline: jest.fn(),
}))

import { useTimeline } from '@/lib/timeline/useTimeline'
import type { UseTimelineResult } from '@/lib/timeline/useTimeline'

const mockedUseTimeline = useTimeline as jest.MockedFunction<typeof useTimeline>

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAction(overrides: Partial<TimelineActionItem> = {}): TimelineActionItem {
  return {
    kind: 'action',
    id: 'act-1',
    at: '2026-06-10T12:00:00.000Z',
    event: 'MERCHANT_SUBMITTED_FOR_APPROVAL',
    actorType: 'MERCHANT',
    actorName: null,
    reason: null,
    ...overrides,
  }
}

function makeEmail(overrides: Partial<TimelineEmailItem> = {}): TimelineEmailItem {
  return {
    kind: 'email',
    id: 'em-1',
    at: '2026-06-10T11:00:00.000Z',
    type: 'merchant_claim',
    subject: 'Set up your Redeemo account',
    status: 'SENT',
    channel: 'EMAIL',
    ...overrides,
  }
}

function mockTimeline(
  data: MerchantTimeline | undefined,
  overrides: Partial<UseTimelineResult> = {}
) {
  mockedUseTimeline.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  })
}

function renderTimeline() {
  return render(<ActivityTimeline merchantId="m-1" />)
}

// ── enabled threading ────────────────────────────────────────────────────────

describe('ActivityTimeline hook wiring', () => {
  it('calls useTimeline with the merchant id and enabled:true by default', () => {
    mockTimeline({ items: [], state: null, emailsResolvedViaOwner: false })
    renderTimeline()
    expect(mockedUseTimeline).toHaveBeenCalledWith('m-1', true)
  })

  it('passes enabled:false through when explicitly disabled', () => {
    mockTimeline({ items: [], state: null, emailsResolvedViaOwner: false })
    render(<ActivityTimeline merchantId="m-2" enabled={false} />)
    expect(mockedUseTimeline).toHaveBeenCalledWith('m-2', false)
  })
})

// ── Loading / error / empty ──────────────────────────────────────────────────

describe('ActivityTimeline states', () => {
  it('renders the loading state while isLoading is true', () => {
    mockTimeline(undefined, { isLoading: true })
    renderTimeline()
    expect(screen.getByTestId('timeline-loading')).toBeInTheDocument()
  })

  it('renders the error state when isError is true', () => {
    mockTimeline(undefined, { isError: true })
    renderTimeline()
    expect(screen.getByTestId('timeline-error')).toBeInTheDocument()
  })

  it('renders the error state when data is undefined and not loading', () => {
    mockTimeline(undefined)
    renderTimeline()
    expect(screen.getByTestId('timeline-error')).toBeInTheDocument()
  })

  it('calls refetch when the retry button is clicked', () => {
    const refetch = jest.fn()
    mockTimeline(undefined, { isError: true, refetch })
    renderTimeline()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('renders the empty state when items is empty', () => {
    mockTimeline({ items: [], state: null, emailsResolvedViaOwner: false })
    renderTimeline()
    expect(screen.getByTestId('timeline-empty')).toBeInTheDocument()
    expect(screen.getByText('No activity recorded yet.')).toBeInTheDocument()
  })
})

// ── Interleave order ─────────────────────────────────────────────────────────

describe('ActivityTimeline interleave', () => {
  it('renders mixed action/email items in the given order (not grouped, not re-sorted)', () => {
    const items = [
      makeAction({ id: 'a1' }),
      makeEmail({ id: 'e1' }),
      makeAction({ id: 'a2' }),
      makeEmail({ id: 'e2' }),
    ]
    mockTimeline({ items, state: null, emailsResolvedViaOwner: true })
    renderTimeline()

    // Both kinds render.
    expect(screen.getByTestId('timeline-action-a1')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-email-e1')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-action-a2')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-email-e2')).toBeInTheDocument()

    // The DOM order matches the given order exactly.
    const rendered = screen.getAllByTestId(/^timeline-(action|email)-/)
    expect(rendered.map((el) => el.getAttribute('data-testid'))).toEqual([
      'timeline-action-a1',
      'timeline-email-e1',
      'timeline-action-a2',
      'timeline-email-e2',
    ])
  })
})

// ── Actor display ────────────────────────────────────────────────────────────

describe('ActivityTimeline actor display', () => {
  it('shows the resolved admin name for an ADMIN action', () => {
    mockTimeline({
      items: [makeAction({ id: 'a1', actorType: 'ADMIN', actorName: 'Jane Doe' })],
      state: null,
      emailsResolvedViaOwner: false,
    })
    renderTimeline()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  it('falls back to "Admin" for an ADMIN action with a null actorName', () => {
    mockTimeline({
      items: [makeAction({ id: 'a1', actorType: 'ADMIN', actorName: null })],
      state: null,
      emailsResolvedViaOwner: false,
    })
    renderTimeline()
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('shows "System" for a SYSTEM action and "Merchant" for a MERCHANT action', () => {
    mockTimeline({
      items: [
        makeAction({ id: 'a1', actorType: 'SYSTEM' }),
        makeAction({ id: 'a2', actorType: 'MERCHANT' }),
      ],
      state: null,
      emailsResolvedViaOwner: false,
    })
    renderTimeline()
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByText('Merchant')).toBeInTheDocument()
  })

  it('shows "Unknown" when actorType is null', () => {
    mockTimeline({
      items: [makeAction({ id: 'a1', actorType: null, actorName: null })],
      state: null,
      emailsResolvedViaOwner: false,
    })
    renderTimeline()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('shows the action reason when present', () => {
    mockTimeline({
      items: [makeAction({ id: 'a1', actorType: 'ADMIN', actorName: 'Jane Doe', reason: 'Duplicate account detected' })],
      state: null,
      emailsResolvedViaOwner: false,
    })
    renderTimeline()
    expect(screen.getByText('Duplicate account detected')).toBeInTheDocument()
  })
})

// ── Event label mapping ──────────────────────────────────────────────────────

describe('ActivityTimeline event labels', () => {
  it('maps a known event to its friendly label', () => {
    mockTimeline({
      items: [makeAction({ id: 'a1', event: 'MERCHANT_GO_LIVE', actorType: 'SYSTEM' })],
      state: null,
      emailsResolvedViaOwner: false,
    })
    renderTimeline()
    expect(screen.getByText('Merchant went live')).toBeInTheDocument()
  })

  it('falls back to the raw event string for an unknown event', () => {
    mockTimeline({
      items: [makeAction({ id: 'a1', event: 'SOME_FUTURE_EVENT' })],
      state: null,
      emailsResolvedViaOwner: false,
    })
    renderTimeline()
    expect(screen.getByText('SOME_FUTURE_EVENT')).toBeInTheDocument()
  })
})

// ── Delivery badges ──────────────────────────────────────────────────────────

describe('ActivityTimeline delivery badges', () => {
  it('renders all four delivery statuses with the right label', () => {
    mockTimeline({
      items: [
        makeEmail({ id: 'q', status: 'QUEUED' }),
        makeEmail({ id: 's', status: 'SENT' }),
        makeEmail({ id: 'f', status: 'FAILED' }),
        makeEmail({ id: 'b', status: 'BOUNCED' }),
      ],
      state: null,
      emailsResolvedViaOwner: true,
    })
    renderTimeline()
    expect(screen.getByTestId('delivery-badge-QUEUED')).toHaveTextContent('Queued')
    expect(screen.getByTestId('delivery-badge-SENT')).toHaveTextContent('Sent')
    expect(screen.getByTestId('delivery-badge-FAILED')).toHaveTextContent('Failed')
    expect(screen.getByTestId('delivery-badge-BOUNCED')).toHaveTextContent('Bounced')
  })
})

// ── Email type labels ────────────────────────────────────────────────────────

describe('ActivityTimeline email type labels', () => {
  it('maps a known email type to its friendly label', () => {
    mockTimeline({
      items: [makeEmail({ id: 'e1', type: 'merchant_live' })],
      state: null,
      emailsResolvedViaOwner: true,
    })
    renderTimeline()
    expect(screen.getByText('Went live confirmation')).toBeInTheDocument()
  })

  it('humanizes an unknown email type (underscores -> spaces, sentence case)', () => {
    mockTimeline({
      items: [makeEmail({ id: 'e1', type: 'merchant_password_reset' })],
      state: null,
      emailsResolvedViaOwner: true,
    })
    renderTimeline()
    expect(screen.getByText('Merchant password reset')).toBeInTheDocument()
  })
})

// ── Owner-resolved disclosure label (locked D1) ──────────────────────────────

describe('ActivityTimeline owner-resolved label', () => {
  it('shows the "resolved via the owner account" label when emailsResolvedViaOwner is true', () => {
    mockTimeline({
      items: [makeAction({ id: 'a1' })],
      state: null,
      emailsResolvedViaOwner: true,
    })
    renderTimeline()
    const label = screen.getByTestId('timeline-owner-resolved-label')
    expect(label).toBeInTheDocument()
    expect(label).toHaveTextContent(/resolved via the owner account/i)
  })

  it('does NOT show the owner-resolved label when emailsResolvedViaOwner is false', () => {
    mockTimeline({
      items: [makeAction({ id: 'a1' })],
      state: null,
      emailsResolvedViaOwner: false,
    })
    renderTimeline()
    expect(screen.queryByTestId('timeline-owner-resolved-label')).not.toBeInTheDocument()
    // The no-owner variant is shown instead: it discloses that no owner
    // resolved, not that the owner sent nothing.
    const noOwner = screen.getByTestId('timeline-no-owner-emails')
    expect(noOwner).toHaveTextContent(/no owner account resolved/i)
  })
})

// ── Sensitive-content absence ────────────────────────────────────────────────

describe('ActivityTimeline sensitive-content absence', () => {
  it('renders only the safe email fields and never dumps the raw item', () => {
    // The component is given ONLY the safe shape; this asserts it surfaces the
    // type label + subject + delivery badge and nothing more.
    const email = makeEmail({
      id: 'e1',
      type: 'merchant_claim',
      subject: 'Set up your Redeemo account',
      status: 'SENT',
    })
    mockTimeline({ items: [email], state: null, emailsResolvedViaOwner: true })
    const { container } = renderTimeline()

    // Safe fields render.
    expect(screen.getByText('Account setup email')).toBeInTheDocument()
    expect(screen.getByText('Set up your Redeemo account')).toBeInTheDocument()
    expect(screen.getByTestId('delivery-badge-SENT')).toBeInTheDocument()

    // No accidental dump of the whole item (e.g. via JSON.stringify) and no
    // PIN / payload / recipient-routing leakage. (The backend never returns
    // these fields; this guards against a future component change that prints
    // the raw object.)
    const text = container.textContent ?? ''
    expect(text).not.toContain('payload')
    expect(text).not.toContain('recipientId')
    expect(text).not.toContain('recipientType')
    expect(text).not.toContain(JSON.stringify(email))
  })
})
