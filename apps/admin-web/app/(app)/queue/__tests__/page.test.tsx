/**
 * /queue page — capability gate, role-based render, refresh button, last-updated.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import QueuePage from '../page'

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
    ready: true,
    isAuthenticated: true,
    role: 'OPERATIONS',
    email: 'ops@redeemo.co.uk',
    adminId: overrides.adminId ?? 'admin-me',
    can: overrides.can ?? (() => true),
    refresh: jest.fn(),
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

  it('authorised admin does NOT see the forbidden state', () => {
    mockSession({ can: () => true })
    mockQueue()

    render(<QueuePage />)

    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument()
    expect(screen.getByText('Approval queue')).toBeInTheDocument()
  })

  it('shows the loader (not forbidden) while session is not yet ready', () => {
    mockedUseSession.mockReturnValue({
      ready: false,
      isAuthenticated: false,
      role: null,
      email: null,
      adminId: null,
      can: () => false,
      refresh: jest.fn(),
    })
    mockQueue()

    render(<QueuePage />)

    // Lucide SVGs render as inaccessible in JSDOM; query by label text directly.
    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByText(/access denied/i)).not.toBeInTheDocument()
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
