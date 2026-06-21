/**
 * F2 tests for the topbar NotificationBell.
 *
 * Wraps in a QueryClientProvider; mocks @/lib/api/notifications + next/navigation.
 * Pins: the unread badge (count + 9+ cap + hidden at 0); the popover opens on
 * click; recent items render with unread dots; "Mark all as read"; a row click
 * marks read + router.push to the resolved destination; "See all" -> /notifications;
 * Escape closes + returns focus to the trigger (mirrors the account-menu pattern);
 * empty/loading/error states; no PII in the rendered rows.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotificationBell } from '../NotificationBell'

// --- next/navigation ---------------------------------------------------------
const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

// --- API client mock ---------------------------------------------------------
const getUnreadCount = jest.fn()
const listNotifications = jest.fn()
const markNotificationRead = jest.fn()
const markAllNotificationsRead = jest.fn()
jest.mock('@/lib/api/notifications', () => ({
  getUnreadCount: () => getUnreadCount(),
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

function renderBell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <NotificationBell />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  push.mockReset()
  getUnreadCount.mockReset().mockResolvedValue({ count: 0 })
  listNotifications.mockReset().mockResolvedValue({ notifications: [], page: 1, pageSize: 8, total: 0 })
  markNotificationRead.mockReset().mockResolvedValue({ updated: 1 })
  markAllNotificationsRead.mockReset().mockResolvedValue({ updated: 1 })
})

describe('NotificationBell badge', () => {
  it('shows the unread count on the badge', async () => {
    getUnreadCount.mockResolvedValue({ count: 3 })
    renderBell()
    expect(await screen.findByText('3')).toBeInTheDocument()
  })

  it('caps the badge at 9+ for counts over 9', async () => {
    getUnreadCount.mockResolvedValue({ count: 12 })
    renderBell()
    expect(await screen.findByText('9+')).toBeInTheDocument()
  })

  it('renders no badge when the unread count is 0', async () => {
    getUnreadCount.mockResolvedValue({ count: 0 })
    renderBell()
    // Let the query settle, then confirm no count bubble.
    await waitFor(() => expect(getUnreadCount).toHaveBeenCalled())
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})

describe('NotificationBell popover', () => {
  it('opens the popover on bell click and lists the recent items with unread dots', async () => {
    listNotifications.mockResolvedValue({
      notifications: [row(), row({ id: 'n2', title: 'Voucher update', type: 'VOUCHER_APPROVAL_UPDATE', isRead: true })],
      page: 1,
      pageSize: 8,
      total: 2,
    })
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    expect(await screen.findByText('Application update')).toBeInTheDocument()
    expect(screen.getByText('Voucher update')).toBeInTheDocument()
    // The unread item carries an unread indicator; the read one does not.
    expect(screen.getByTestId('unread-dot-n1')).toBeInTheDocument()
    expect(screen.queryByTestId('unread-dot-n2')).not.toBeInTheDocument()
  })

  it('requests the most recent 8 for the popover', async () => {
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    await waitFor(() =>
      expect(listNotifications).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 8 })),
    )
  })

  it('renders an empty state when there are no notifications', async () => {
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    expect(await screen.findByText(/all caught up/i)).toBeInTheDocument()
  })

  it('renders a loading state while the recent list is in flight', async () => {
    listNotifications.mockReturnValue(new Promise(() => {}))
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })

  it('renders an error state when the recent list fails', async () => {
    listNotifications.mockRejectedValue(new Error('boom'))
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    expect(await screen.findByText(/could not load/i)).toBeInTheDocument()
  })
})

describe('NotificationBell actions', () => {
  it('marks all as read and invalidates', async () => {
    listNotifications.mockResolvedValue({ notifications: [row()], page: 1, pageSize: 8, total: 1 })
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    await screen.findByText('Application update')
    fireEvent.click(screen.getByRole('menuitem', { name: /mark all as read/i }))
    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalledTimes(1))
  })

  it('a row click marks it read then navigates to the resolved destination', async () => {
    listNotifications.mockResolvedValue({ notifications: [row()], page: 1, pageSize: 8, total: 1 })
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    const item = await screen.findByText('Application update')
    fireEvent.click(item.closest('button')!)
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('n1'))
    // referenceType 'merchant' resolves to '/'.
    expect(push).toHaveBeenCalledWith('/')
  })

  it('a row with an unknown referenceType still navigates to the safe fallback', async () => {
    listNotifications.mockResolvedValue({
      notifications: [row({ id: 'n9', referenceType: 'voucher', referenceId: 'v1' })],
      page: 1,
      pageSize: 8,
      total: 1,
    })
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    const item = await screen.findByText('Application update')
    fireEvent.click(item.closest('button')!)
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('n9'))
    expect(push).toHaveBeenCalledWith('/')
  })

  it('"See all" pushes /notifications', async () => {
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /see all/i }))
    expect(push).toHaveBeenCalledWith('/notifications')
  })
})

describe('NotificationBell popover focus + Escape (mirrors the account menu)', () => {
  it('focuses the first interactive item when the popover opens', async () => {
    listNotifications.mockResolvedValue({ notifications: [row()], page: 1, pageSize: 8, total: 1 })
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    const firstRow = (await screen.findByText('Application update')).closest('button')!
    await waitFor(() => expect(firstRow).toHaveFocus())
  })

  it('Escape closes the popover and returns focus to the bell trigger', async () => {
    listNotifications.mockResolvedValue({ notifications: [row()], page: 1, pageSize: 8, total: 1 })
    renderBell()
    const trigger = screen.getByRole('button', { name: /notifications/i })
    fireEvent.click(trigger)
    const panel = await screen.findByRole('menu')
    fireEvent.keyDown(panel, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('an outside click (scrim) closes the popover', async () => {
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    await screen.findByRole('menu')
    fireEvent.click(screen.getByTestId('notification-popover-scrim'))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })
})

describe('NotificationBell privacy', () => {
  it('renders only the curated fields (no recipient id / no contact PII)', async () => {
    listNotifications.mockResolvedValue({ notifications: [row()], page: 1, pageSize: 8, total: 1 })
    const { container } = renderBell()
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    await screen.findByText('Application update')
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/@|07\d{9}|\+44|recipientId/)
  })
})
