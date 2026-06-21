/**
 * F3 tests for the /notifications "see all" view.
 *
 * Wraps in a QueryClientProvider; mocks @/lib/api/notifications + next/navigation.
 * Pins: list render + loading/empty/error; the unread-only toggle changes the
 * query key (re-queries with unreadOnly:true); "Mark all as read"; a row click
 * marks read + router.push to the resolved destination; pagination drives page;
 * navItems.ts is NOT changed (the bell is the only entry point).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NotificationsPage from '@/app/(app)/notifications/page'
import { NAV_GROUPS, PINNED_ITEMS, HOME_ITEM } from '@/components/shell/navItems'

// --- next/navigation ---------------------------------------------------------
const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

// --- API client mock ---------------------------------------------------------
const listNotifications = jest.fn()
const markNotificationRead = jest.fn()
const markAllNotificationsRead = jest.fn()
jest.mock('@/lib/api/notifications', () => ({
  listNotifications: (opts: unknown) => listNotifications(opts),
  markNotificationRead: (id: string) => markNotificationRead(id),
  markAllNotificationsRead: () => markAllNotificationsRead(),
}))

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'n1',
    type: 'MERCHANT_VERIFICATION_UPDATE',
    title: 'Application update',
    body: 'Your application is being reviewed.',
    referenceId: 'm1',
    referenceType: 'merchant',
    isRead: false,
    readAt: null,
    sentAt: '2026-06-21T10:00:00.000Z',
    ...over,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <NotificationsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  push.mockReset()
  listNotifications.mockReset().mockResolvedValue({ notifications: [row()], page: 1, pageSize: 20, total: 1 })
  markNotificationRead.mockReset().mockResolvedValue({ updated: 1 })
  markAllNotificationsRead.mockReset().mockResolvedValue({ updated: 1 })
})

describe('NotificationsPage', () => {
  it('renders a loading state while the list is in flight', () => {
    listNotifications.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders the list of notifications', async () => {
    listNotifications.mockResolvedValue({
      notifications: [row(), row({ id: 'n2', title: 'Voucher update', type: 'VOUCHER_APPROVAL_UPDATE', isRead: true })],
      page: 1,
      pageSize: 20,
      total: 2,
    })
    renderPage()
    expect(await screen.findByText('Application update')).toBeInTheDocument()
    expect(screen.getByText('Voucher update')).toBeInTheDocument()
    expect(screen.getByTestId('unread-dot-n1')).toBeInTheDocument()
    expect(screen.queryByTestId('unread-dot-n2')).not.toBeInTheDocument()
  })

  it('renders the empty state when there are no notifications', async () => {
    listNotifications.mockResolvedValue({ notifications: [], page: 1, pageSize: 20, total: 0 })
    renderPage()
    expect(await screen.findByText(/no notifications/i)).toBeInTheDocument()
  })

  it('renders an error state when the list fails', async () => {
    listNotifications.mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByText(/could not load/i)).toBeInTheDocument()
  })

  it('the unread-only toggle re-queries with unreadOnly:true (query-key change)', async () => {
    renderPage()
    await screen.findByText('Application update')
    listNotifications.mockClear()
    fireEvent.click(screen.getByRole('checkbox', { name: /unread only/i }))
    await waitFor(() =>
      expect(listNotifications).toHaveBeenCalledWith(expect.objectContaining({ unreadOnly: true })),
    )
  })

  it('"Mark all as read" calls the API and invalidates', async () => {
    renderPage()
    await screen.findByText('Application update')
    fireEvent.click(screen.getByRole('button', { name: /mark all as read/i }))
    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalledTimes(1))
  })

  it('a row click marks it read then navigates to the resolved destination', async () => {
    renderPage()
    const item = await screen.findByText('Application update')
    fireEvent.click(item.closest('button')!)
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('n1'))
    expect(push).toHaveBeenCalledWith('/')
  })

  it('a row with an unknown referenceType still navigates to the safe fallback', async () => {
    listNotifications.mockResolvedValue({
      notifications: [row({ id: 'n9', referenceType: 'voucher', referenceId: 'v1' })],
      page: 1,
      pageSize: 20,
      total: 1,
    })
    renderPage()
    const item = await screen.findByText('Application update')
    fireEvent.click(item.closest('button')!)
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('n9'))
    expect(push).toHaveBeenCalledWith('/')
  })

  it('pagination drives the page in the query (next/prev)', async () => {
    listNotifications.mockResolvedValue({ notifications: [row()], page: 1, pageSize: 20, total: 45 })
    renderPage()
    await screen.findByText('Application update')
    listNotifications.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() =>
      expect(listNotifications).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })),
    )
  })

  it('renders only the curated fields (no recipient id / no contact PII)', async () => {
    const { container } = renderPage()
    await screen.findByText('Application update')
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/@|07\d{9}|\+44|recipientId/)
  })
})

describe('/notifications is NOT in the sidebar', () => {
  it('no nav group, pinned item, or home item points at /notifications', () => {
    const allHrefs = [
      HOME_ITEM.href,
      ...PINNED_ITEMS.map((i) => i.href),
      ...NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)),
    ]
    expect(allHrefs).not.toContain('/notifications')
  })
})
