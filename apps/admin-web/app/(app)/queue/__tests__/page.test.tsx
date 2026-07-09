/**
 * /queue page — capability gate, role-based render, refresh button, last-updated.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import QueuePage from '../page'

// ── Mock next/link ────────────────────────────────────────────────────────────

jest.mock('next/link', () => {
  return function MockLink({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  }
})

// ── Mock useSession ───────────────────────────────────────────────────────────

jest.mock('@/lib/auth/useSession', () => ({
  useSession: jest.fn(),
}))

// ── Mock useQueue ─────────────────────────────────────────────────────────────

jest.mock('@/lib/queue/useQueue', () => ({
  useQueue: jest.fn(),
}))

import { useSession } from '@/lib/auth/useSession'
import { useQueue } from '@/lib/queue/useQueue'

const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockedUseQueue = useQueue as jest.MockedFunction<typeof useQueue>

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSession(overrides: {
  can?: (cap: string) => boolean
  adminId?: string | null
}) {
  mockedUseSession.mockReturnValue({
    accessToken: 'test-access-token',
    ready: true,
    isAuthenticated: true,
    role: 'OPERATIONS',
    email: 'ops@redeemo.co.uk',
    adminId: overrides.adminId ?? 'admin-me',
    can: overrides.can ?? (() => true),
    setSession: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
  })
}

function mockQueue(overrides: Partial<ReturnType<typeof useQueue>> = {}) {
  mockedUseQueue.mockReturnValue({
    items: [],
    counts: { all: 0, submitted: 0, underReview: 0, changesRequested: 0 },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
    dataUpdatedAt: new Date('2026-06-14T10:30:00.000Z').getTime(),
    ...overrides,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('QueuePage capability gate', () => {
  it('shows forbidden state when role lacks approval:read', () => {
    mockSession({ can: () => false })
    mockQueue()

    render(<QueuePage />)

    expect(screen.getByText(/access denied/i)).toBeInTheDocument()
    // The page heading "Approval queue" only renders when the capability is granted.
    expect(screen.queryByRole('heading', { name: /approval queue/i })).not.toBeInTheDocument()
  })

  it('calls useQueue with enabled:false when the admin lacks approval:read', () => {
    mockSession({ can: () => false })
    mockQueue()

    render(<QueuePage />)

    expect(mockedUseQueue).toHaveBeenCalledWith({ enabled: false })
  })

  it('authorised admin does NOT see the forbidden state', () => {
    mockSession({ can: () => true })
    mockQueue()

    render(<QueuePage />)

    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument()
    expect(screen.getByText('Approval queue')).toBeInTheDocument()
  })

  it('calls useQueue with enabled:true when the admin has approval:read', () => {
    mockSession({ can: () => true })
    mockQueue()

    render(<QueuePage />)

    expect(mockedUseQueue).toHaveBeenCalledWith({ enabled: true })
  })

  it('shows the loader (not forbidden) while session is not yet ready', () => {
    mockedUseSession.mockReturnValue({
      accessToken: null,
      ready: false,
      isAuthenticated: false,
      role: null,
      email: null,
      adminId: null,
      can: () => false,
      setSession: jest.fn(),
      refresh: jest.fn(),
      signOut: jest.fn(),
    })
    mockQueue()

    render(<QueuePage />)

    // Lucide SVGs render as inaccessible in JSDOM; query by label text directly.
    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument()
  })

  it('calls useQueue with enabled:false when the session is not yet ready', () => {
    mockedUseSession.mockReturnValue({
      accessToken: null,
      ready: false,
      isAuthenticated: false,
      role: null,
      email: null,
      adminId: null,
      can: () => false,
      setSession: jest.fn(),
      refresh: jest.fn(),
      signOut: jest.fn(),
    })
    mockQueue()

    render(<QueuePage />)

    expect(mockedUseQueue).toHaveBeenCalledWith({ enabled: false })
  })
})

describe('QueuePage OPERATIONS role (has approval:read)', () => {
  beforeEach(() => {
    mockSession({ can: () => true })
  })

  it('renders the queue heading when capability is granted', () => {
    mockQueue()
    render(<QueuePage />)
    expect(screen.getByText('Approval queue')).toBeInTheDocument()
  })

  it('shows loading state while isLoading is true', () => {
    mockQueue({ isLoading: true })
    render(<QueuePage />)
    // No table rendered during load.
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('does not flash 0/0/0/0 chip counts while the first fetch is loading', () => {
    // Default mockQueue counts are all 0; with isLoading true the page must pass
    // undefined to StatusFilter so the zeros are never shown.
    mockQueue({ isLoading: true })
    render(<QueuePage />)
    // Chips still render...
    expect(screen.getByRole('tab', { name: /^all/i })).toBeInTheDocument()
    // ...but with no numeric count labels.
    expect(screen.queryByText('0')).toBeNull()
  })

  it('shows error state when isError is true', () => {
    mockQueue({ isError: true, isLoading: false })
    render(<QueuePage />)
    expect(screen.getByText(/could not load the approval queue/i)).toBeInTheDocument()
  })

  it('shows empty table state when items is empty', () => {
    mockQueue({ isLoading: false, isError: false, items: [] })
    render(<QueuePage />)
    expect(screen.getByText(/no items match/i)).toBeInTheDocument()
  })

  it('calls refetch when the Refresh button is clicked', () => {
    const refetch = jest.fn()
    mockQueue({ refetch })
    render(<QueuePage />)

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('renders LastUpdated with the dataUpdatedAt time', () => {
    const dataUpdatedAt = new Date('2026-06-14T10:30:45.000Z').getTime()
    mockQueue({ dataUpdatedAt })
    render(<QueuePage />)
    // "Last updated 10:30:45" — exact hour depends on local tz in test env;
    // we just check the prefix exists.
    expect(screen.getByText(/last updated/i)).toBeInTheDocument()
  })

  it('shows the StatusFilter chips', () => {
    mockQueue()
    render(<QueuePage />)
    expect(screen.getByRole('tab', { name: /^all/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /submitted/i })).toBeInTheDocument()
  })
})

// ── Day-2 Vouchers PR-C: VOUCHER row renders with enriched context ────────────

describe('QueuePage VOUCHER row (PR-C)', () => {
  function voucherItem() {
    return {
      id: 'a-voucher-1',
      type: 'VOUCHER' as const,
      referenceId: 'voucher-1',
      referenceType: 'voucher',
      status: 'PENDING' as const,
      adminUserId: null,
      comment: null,
      submittedAt: new Date(Date.now() - 3_600_000).toISOString(),
      actionedAt: null,
      claimedById: null,
      claimedAt: null,
      claimedBy: null,
      merchant: { id: 'm-1', businessName: 'Acme Coffee', status: 'ACTIVE' },
      voucher: { title: '20% off all mains', type: 'DISCOUNT', status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' },
      goLiveHint: 'live-now' as const,
    }
  }

  it('renders a VOUCHER row (voucher title + business name + type) and links to its review screen', () => {
    mockSession({ can: () => true })
    mockQueue({ items: [voucherItem()] })
    render(<QueuePage />)
    const row = screen.getByTestId('queue-row-a-voucher-1')
    expect(row).toHaveTextContent('20% off all mains')
    expect(row).toHaveTextContent('Acme Coffee')
    expect(row).toHaveTextContent('Voucher')
    // queue -> detail: the row links to the VOUCHER review screen.
    const link = screen.getByRole('link', { name: /20% off all mains/i })
    expect(link).toHaveAttribute('href', '/queue/a-voucher-1')
  })
})

// ── M6: Create merchant draft topbar entry ────────────────────────────────────

describe('QueuePage create-draft topbar entry', () => {
  it('shows the "Create merchant draft" button when the admin has merchant:create-draft', () => {
    mockSession({ can: (cap) => cap === 'approval:read' || cap === 'merchant:create-draft' })
    mockQueue()
    render(<QueuePage />)
    const entry = screen.getByTestId('create-draft-entry')
    expect(entry).toBeInTheDocument()
    expect(entry).toHaveAttribute('href', '/merchants/new')
    expect(screen.getByText(/create merchant draft/i)).toBeInTheDocument()
  })

  it('hides the "Create merchant draft" button without merchant:create-draft', () => {
    // Has approval:read (so the queue renders) but NOT merchant:create-draft.
    mockSession({ can: (cap) => cap === 'approval:read' })
    mockQueue()
    render(<QueuePage />)
    expect(screen.queryByTestId('create-draft-entry')).not.toBeInTheDocument()
  })
})
