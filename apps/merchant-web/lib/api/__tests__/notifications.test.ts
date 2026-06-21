/**
 * F1 client tests for lib/api/notifications.ts.
 *
 * Mocks apiFetch and asserts: listNotifications builds the querystring + parses
 * { notifications, page, pageSize, total }; getUnreadCount parses { count };
 * markNotificationRead POSTs /notifications/:id/read; markAllNotificationsRead
 * POSTs /notifications/read-all. The curated payload carries no recipient ids or
 * customer PII (the backend select already excludes them).
 */
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../notifications'

const apiFetch = jest.fn()
jest.mock('../client', () => ({
  apiFetch: (path: string, opts: unknown) => apiFetch(path, opts),
}))

const ROW = {
  id: 'n1',
  type: 'MERCHANT_VERIFICATION_UPDATE',
  title: 'Application update',
  body: 'Your application is being reviewed.',
  referenceId: 'm1',
  referenceType: 'merchant',
  isRead: false,
  readAt: null,
  sentAt: '2026-06-21T10:00:00.000Z',
}

beforeEach(() => {
  apiFetch.mockReset()
})

describe('listNotifications', () => {
  it('calls the merchant notifications endpoint with no query when no opts', async () => {
    apiFetch.mockResolvedValueOnce({ notifications: [ROW], page: 1, pageSize: 20, total: 1 })
    const res = await listNotifications()
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/notifications', {
      method: 'GET',
      auth: true,
    })
    expect(res.notifications).toHaveLength(1)
    expect(res.total).toBe(1)
    expect(res.page).toBe(1)
    expect(res.pageSize).toBe(20)
    expect(res.notifications[0].title).toBe('Application update')
  })

  it('builds a querystring from the provided opts (skips empty/undefined)', async () => {
    apiFetch.mockResolvedValueOnce({ notifications: [], page: 2, pageSize: 8, total: 0 })
    await listNotifications({ page: 2, pageSize: 8, unreadOnly: true })
    const path = apiFetch.mock.calls[0][0] as string
    expect(path).toContain('/api/v1/merchant/notifications?')
    expect(path).toContain('page=2')
    expect(path).toContain('pageSize=8')
    expect(path).toContain('unreadOnly=true')
  })

  it('omits undefined opts from the querystring', async () => {
    apiFetch.mockResolvedValueOnce({ notifications: [], page: 1, pageSize: 20, total: 0 })
    await listNotifications({ pageSize: 8 })
    const path = apiFetch.mock.calls[0][0] as string
    expect(path).toContain('pageSize=8')
    expect(path).not.toContain('page=')
    expect(path).not.toContain('unreadOnly=')
  })

  it('rejects when the row shape is invalid (zod)', async () => {
    apiFetch.mockResolvedValueOnce({ notifications: [{ id: 'x' }], page: 1, pageSize: 20, total: 1 })
    await expect(listNotifications()).rejects.toBeDefined()
  })

  it('parses a read row with a readAt timestamp', async () => {
    apiFetch.mockResolvedValueOnce({
      notifications: [{ ...ROW, isRead: true, readAt: '2026-06-21T11:00:00.000Z' }],
      page: 1,
      pageSize: 20,
      total: 1,
    })
    const res = await listNotifications()
    expect(res.notifications[0].isRead).toBe(true)
    expect(res.notifications[0].readAt).toBe('2026-06-21T11:00:00.000Z')
  })

  it('parses a row with null reference fields (unbuilt destination)', async () => {
    apiFetch.mockResolvedValueOnce({
      notifications: [{ ...ROW, referenceId: null, referenceType: null }],
      page: 1,
      pageSize: 20,
      total: 1,
    })
    const res = await listNotifications()
    expect(res.notifications[0].referenceId).toBeNull()
    expect(res.notifications[0].referenceType).toBeNull()
  })
})

describe('getUnreadCount', () => {
  it('GETs the unread-count endpoint and parses { count }', async () => {
    apiFetch.mockResolvedValueOnce({ count: 3 })
    const res = await getUnreadCount()
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/notifications/unread-count', {
      method: 'GET',
      auth: true,
    })
    expect(res.count).toBe(3)
  })
})

describe('markNotificationRead', () => {
  it('POSTs to /notifications/:id/read', async () => {
    apiFetch.mockResolvedValueOnce({ updated: 1 })
    await markNotificationRead('n1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/notifications/n1/read', {
      method: 'POST',
      auth: true,
    })
  })
})

describe('markAllNotificationsRead', () => {
  it('POSTs to /notifications/read-all', async () => {
    apiFetch.mockResolvedValueOnce({ updated: 4 })
    await markAllNotificationsRead()
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/notifications/read-all', {
      method: 'POST',
      auth: true,
    })
  })
})
