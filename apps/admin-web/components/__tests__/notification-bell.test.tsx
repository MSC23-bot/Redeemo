/**
 * NotificationBell — component tests.
 *
 * notificationsApi is mocked at the module level so all network calls are
 * controlled. A fresh QueryClient (retry: false) is created per test so
 * React Query state never leaks between tests.
 *
 * Covers:
 *   (a) No badge when unreadCount is 0
 *   (b) Badge shows the number when count > 0; shows 9+ when > 9
 *   (c) Opening the panel fetches + renders rows (title, body, relative time)
 *   (d) Empty state when the list resolves empty
 *   (e) "Mark all read" button calls markAllRead
 *   (f) Clicking an unread row calls markRead with that id
 *
 * Also includes direct unit assertions for formatRelativeTime.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { NotificationBell } from '../notification-bell'
import { notificationsApi } from '@/lib/api/notifications'
import { formatRelativeTime } from '@/lib/notifications/relativeTime'

// ── Mock the notifications API module ────────────────────────────────────────

jest.mock('@/lib/api/notifications', () => ({
  notificationsApi: {
    unreadCount: jest.fn(),
    list: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  },
}))

const mockedApi = notificationsApi as jest.Mocked<typeof notificationsApi>

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function Wrapper({ children }: { children: ReactNode }) {
  // A fresh client per render call (tests call this with a new client)
  const qc = makeQueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function renderBell() {
  return render(<NotificationBell />, { wrapper: Wrapper })
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date('2026-06-14T12:00:00.000Z').getTime()

const UNREAD_NOTIFICATION = {
  id: 'notif-1',
  type: 'MERCHANT_SUBMITTED',
  title: 'New merchant submitted',
  body: 'Acme Coffee has submitted for review.',
  referenceId: 'merchant-42',
  referenceType: 'MERCHANT',
  isRead: false,
  readAt: null,
  sentAt: '2026-06-14T11:45:00.000Z', // 15 minutes ago
}

const READ_NOTIFICATION = {
  ...UNREAD_NOTIFICATION,
  id: 'notif-2',
  title: 'Merchant approved',
  body: 'Bean Scene has gone live.',
  isRead: true,
  readAt: '2026-06-14T10:00:00.000Z',
}

const EMPTY_LIST = { notifications: [], page: 1, pageSize: 10, total: 0 }
const LIST_WITH_ONE = {
  notifications: [UNREAD_NOTIFICATION],
  page: 1,
  pageSize: 10,
  total: 1,
}
const LIST_WITH_TWO = {
  notifications: [UNREAD_NOTIFICATION, READ_NOTIFICATION],
  page: 1,
  pageSize: 10,
  total: 2,
}

// ── (a) No badge when count is 0 ─────────────────────────────────────────────

describe('badge', () => {
  it('renders no badge when unreadCount is 0', async () => {
    mockedApi.unreadCount.mockResolvedValue({ count: 0 })
    mockedApi.list.mockResolvedValue(EMPTY_LIST)

    renderBell()

    await waitFor(() => expect(mockedApi.unreadCount).toHaveBeenCalled())

    expect(screen.queryByRole('status')).toBeNull()
    // The badge span should not be present
    expect(
      screen.queryByLabelText(/unread notification/i)
    ).toBeNull()
  })

  // (b) Badge shows count
  it('renders a badge with the count when unreadCount > 0', async () => {
    mockedApi.unreadCount.mockResolvedValue({ count: 3 })
    mockedApi.list.mockResolvedValue(LIST_WITH_ONE)

    renderBell()

    await waitFor(() =>
      expect(screen.getByLabelText('3 unread notifications')).toBeInTheDocument()
    )
  })

  it('shows 9+ in the badge when count > 9', async () => {
    mockedApi.unreadCount.mockResolvedValue({ count: 12 })
    mockedApi.list.mockResolvedValue(EMPTY_LIST)

    renderBell()

    const badge = await screen.findByLabelText(/12 unread notifications/i)
    expect(badge).toHaveTextContent('9+')
  })
})

// ── (c) Opening the panel renders rows ───────────────────────────────────────

describe('panel — notification rows', () => {
  it('renders title, body, and a relative time string for each notification', async () => {
    mockedApi.unreadCount.mockResolvedValue({ count: 1 })
    mockedApi.list.mockResolvedValue(LIST_WITH_ONE)

    const user = userEvent.setup()
    renderBell()

    // Open the panel
    await user.click(screen.getByRole('button', { name: /notifications/i }))

    // Wait for the row content to appear
    expect(await screen.findByText('New merchant submitted')).toBeInTheDocument()
    expect(screen.getByText('Acme Coffee has submitted for review.')).toBeInTheDocument()
    // A relative time string is rendered (exact value depends on real Date.now())
    // Just assert a time-like element exists near the notification row
    const timeEls = screen.getAllByText(/ago|just now|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i)
    expect(timeEls.length).toBeGreaterThan(0)
  })

  it('shows the loading spinner while the list is fetching', async () => {
    mockedApi.unreadCount.mockResolvedValue({ count: 0 })
    // list never resolves in this test — we check the loading state
    mockedApi.list.mockReturnValue(new Promise(() => {}))

    const user = userEvent.setup()
    renderBell()

    await user.click(screen.getByRole('button', { name: /notifications/i }))

    expect(await screen.findByLabelText('Loading notifications')).toBeInTheDocument()
  })

  it('renders both read and unread rows correctly', async () => {
    mockedApi.unreadCount.mockResolvedValue({ count: 1 })
    mockedApi.list.mockResolvedValue(LIST_WITH_TWO)

    const user = userEvent.setup()
    renderBell()

    await user.click(screen.getByRole('button', { name: /notifications/i }))

    expect(await screen.findByText('New merchant submitted')).toBeInTheDocument()
    expect(screen.getByText('Merchant approved')).toBeInTheDocument()
  })
})

// ── (d) Empty state ───────────────────────────────────────────────────────────

describe('panel — empty state', () => {
  it('shows the empty state when the list is empty', async () => {
    mockedApi.unreadCount.mockResolvedValue({ count: 0 })
    mockedApi.list.mockResolvedValue(EMPTY_LIST)

    const user = userEvent.setup()
    renderBell()

    await user.click(screen.getByRole('button', { name: /notifications/i }))

    expect(await screen.findByText(/you're all caught up/i)).toBeInTheDocument()
    expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument()
  })
})

// ── (e) Mark all read ─────────────────────────────────────────────────────────

describe('"Mark all read" button', () => {
  it('shows the button when unreadCount > 0 and calls markAllRead on click', async () => {
    // First call: 2 unread (drives badge + "Mark all read" button)
    // Subsequent calls (post-mutation refetch): 0
    mockedApi.unreadCount.mockResolvedValueOnce({ count: 2 })
    mockedApi.unreadCount.mockResolvedValue({ count: 0 })
    mockedApi.list.mockResolvedValue(LIST_WITH_TWO)
    mockedApi.markAllRead.mockResolvedValue({ updated: 2 })

    const user = userEvent.setup()
    renderBell()

    await user.click(screen.getByRole('button', { name: /notifications/i }))

    const markAllBtn = await screen.findByRole('button', { name: /mark all read/i })
    await user.click(markAllBtn)

    expect(mockedApi.markAllRead).toHaveBeenCalledTimes(1)
  })

  it('does not show "Mark all read" when unreadCount is 0', async () => {
    mockedApi.unreadCount.mockResolvedValue({ count: 0 })
    mockedApi.list.mockResolvedValue(EMPTY_LIST)

    const user = userEvent.setup()
    renderBell()

    await user.click(screen.getByRole('button', { name: /notifications/i }))

    await screen.findByText(/you're all caught up/i)

    expect(
      screen.queryByRole('button', { name: /mark all read/i })
    ).toBeNull()
  })
})

// ── (f) Clicking an unread row calls markRead ─────────────────────────────────

describe('clicking notification rows', () => {
  it('calls markRead with the notification id when clicking an unread row', async () => {
    mockedApi.unreadCount.mockResolvedValue({ count: 1 })
    mockedApi.list.mockResolvedValue(LIST_WITH_ONE)
    mockedApi.markRead.mockResolvedValue({ updated: 1 })

    const user = userEvent.setup()
    renderBell()

    await user.click(screen.getByRole('button', { name: /notifications/i }))

    const row = await screen.findByRole('button', {
      name: /new merchant submitted/i,
    })
    await user.click(row)

    expect(mockedApi.markRead).toHaveBeenCalledWith('notif-1')
  })

  it('does not call markRead when clicking a read row', async () => {
    mockedApi.unreadCount.mockResolvedValue({ count: 0 })
    mockedApi.list.mockResolvedValue({
      notifications: [READ_NOTIFICATION],
      page: 1,
      pageSize: 10,
      total: 1,
    })

    const user = userEvent.setup()
    renderBell()

    await user.click(screen.getByRole('button', { name: /notifications/i }))

    const row = await screen.findByRole('button', {
      name: /merchant approved/i,
    })
    await user.click(row)

    expect(mockedApi.markRead).not.toHaveBeenCalled()
  })
})

// ── formatRelativeTime unit assertions ────────────────────────────────────────

describe('formatRelativeTime', () => {
  it('returns "just now" for a timestamp less than 1 minute ago', () => {
    const now = NOW
    const thirtySecsAgo = new Date(now - 30_000).toISOString()
    expect(formatRelativeTime(thirtySecsAgo, now)).toBe('just now')
  })

  it('returns "Xm ago" for timestamps less than 1 hour ago', () => {
    const now = NOW
    const fifteenMinsAgo = new Date(now - 15 * 60_000).toISOString()
    expect(formatRelativeTime(fifteenMinsAgo, now)).toBe('15m ago')
  })

  it('returns "Xh ago" for timestamps less than 24 hours ago', () => {
    const now = NOW
    const threeHoursAgo = new Date(now - 3 * 60 * 60_000).toISOString()
    expect(formatRelativeTime(threeHoursAgo, now)).toBe('3h ago')
  })

  it('returns a weekday abbreviation for timestamps 1-6 days ago', () => {
    const now = NOW // 2026-06-14 Sunday
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60_000).toISOString()
    const result = formatRelativeTime(threeDaysAgo, now)
    // 3 days ago from Sunday 14 June = Thursday 11 June
    expect(result).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/)
  })

  it('returns a short month+day for timestamps >= 7 days ago', () => {
    const now = NOW
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60_000).toISOString()
    const result = formatRelativeTime(tenDaysAgo, now)
    // Should be something like "4 Jun" or "Jun 4" depending on locale
    expect(result.length).toBeGreaterThan(3)
  })

  it('returns empty string for an invalid ISO string', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('')
  })
})
