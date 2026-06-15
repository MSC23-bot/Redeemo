/**
 * notifications.ts — typed client for the four admin notification endpoints.
 *
 * apiFetch is mocked to verify URL, method, auth option, and Zod parsing.
 * A malformed response must throw (Zod error, not a silent undefined).
 */
import { notificationsApi, notificationSchema } from '../notifications'
import { apiFetch } from '../client'

// ── Mock apiFetch ─────────────────────────────────────────────────────────────

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
}))

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOTIFICATION = {
  id: 'notif-1',
  type: 'MERCHANT_SUBMITTED',
  title: 'New merchant submitted',
  body: 'Acme Coffee has submitted for review.',
  referenceId: 'merchant-42',
  referenceType: 'MERCHANT',
  isRead: false,
  readAt: null,
  sentAt: '2026-06-14T10:00:00.000Z',
}

const LIST_RESPONSE = {
  notifications: [NOTIFICATION],
  page: 1,
  pageSize: 10,
  total: 1,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('notificationsApi.list', () => {
  it('calls the correct URL with auth: true and returns parsed data', async () => {
    mockedApiFetch.mockResolvedValueOnce(LIST_RESPONSE)

    const result = await notificationsApi.list()

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/notifications',
      { auth: true }
    )
    expect(result.notifications).toHaveLength(1)
    expect(result.notifications[0]).toEqual(NOTIFICATION)
    expect(result.total).toBe(1)
  })

  it('appends page and pageSize query params when provided', async () => {
    mockedApiFetch.mockResolvedValueOnce({ ...LIST_RESPONSE, page: 2, pageSize: 5 })

    await notificationsApi.list({ page: 2, pageSize: 5 })

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/notifications?page=2&pageSize=5',
      { auth: true }
    )
  })

  it('sends unreadOnly=true when unreadOnly is true', async () => {
    mockedApiFetch.mockResolvedValueOnce(LIST_RESPONSE)

    await notificationsApi.list({ unreadOnly: true })

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/notifications?unreadOnly=true',
      { auth: true }
    )
  })

  it('sends unreadOnly=false when unreadOnly is false (not omitted)', async () => {
    mockedApiFetch.mockResolvedValueOnce(LIST_RESPONSE)

    await notificationsApi.list({ unreadOnly: false })

    const callArg = (mockedApiFetch.mock.calls[0][0] as string)
    // Must include the param set to 'false', not omit it entirely
    expect(callArg).toContain('unreadOnly=false')
    expect(callArg).not.toContain('unreadOnly=true')
  })

  it('throws on a malformed response (Zod validation)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ bad: 'shape' })

    await expect(notificationsApi.list()).rejects.toThrow()
  })

  it('accepts a notification with null referenceId and referenceType', async () => {
    const withNulls = {
      ...NOTIFICATION,
      referenceId: null,
      referenceType: null,
    }
    mockedApiFetch.mockResolvedValueOnce({
      notifications: [withNulls],
      page: 1,
      pageSize: 10,
      total: 1,
    })

    const result = await notificationsApi.list()
    expect(result.notifications[0].referenceId).toBeNull()
    expect(result.notifications[0].referenceType).toBeNull()
  })
})

describe('notificationsApi.unreadCount', () => {
  it('calls the correct URL with auth: true and returns the count', async () => {
    mockedApiFetch.mockResolvedValueOnce({ count: 5 })

    const result = await notificationsApi.unreadCount()

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/notifications/unread-count',
      { auth: true }
    )
    expect(result.count).toBe(5)
  })

  it('throws on a malformed response (Zod validation)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ bad: 'shape' })

    await expect(notificationsApi.unreadCount()).rejects.toThrow()
  })
})

describe('notificationsApi.markRead', () => {
  it('calls the correct URL with POST + auth: true', async () => {
    mockedApiFetch.mockResolvedValueOnce({ updated: 1 })

    const result = await notificationsApi.markRead('notif-1')

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/notifications/notif-1/read',
      { method: 'POST', auth: true }
    )
    expect(result.updated).toBe(1)
  })

  it('URL-encodes the notification id', async () => {
    mockedApiFetch.mockResolvedValueOnce({ updated: 0 })

    await notificationsApi.markRead('id with spaces')

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/notifications/id%20with%20spaces/read',
      expect.any(Object)
    )
  })

  it('returns updated: 0 when the notification was already read (valid schema)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ updated: 0 })

    const result = await notificationsApi.markRead('already-read-id')

    expect(result.updated).toBe(0)
  })

  it('throws on a malformed response (Zod validation)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ bad: 'shape' })

    await expect(notificationsApi.markRead('notif-1')).rejects.toThrow()
  })
})

describe('notificationsApi.markAllRead', () => {
  it('calls the correct URL with POST + auth: true', async () => {
    mockedApiFetch.mockResolvedValueOnce({ updated: 3 })

    const result = await notificationsApi.markAllRead()

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/notifications/read-all',
      { method: 'POST', auth: true }
    )
    expect(result.updated).toBe(3)
  })

  it('throws on a malformed response (Zod validation)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ not: 'right' })

    await expect(notificationsApi.markAllRead()).rejects.toThrow()
  })
})

// ── (PR4) Emit-to-read contract seam ─────────────────────────────────────────
// The M8 emitter (src/api/shared/adminNotify.ts) writes a merchant alert with
// `referenceType: 'merchant'` (lowercase) + `referenceId: merchant.id`. The bell
// click-through (components/notification-bell.tsx) hinges on those exact values
// (`referenceType === 'merchant'` + a non-null referenceId). This pins that the
// admin-web notificationSchema accepts that wire shape so the click-through hinge
// cannot silently break if the schema drifts.

describe('notificationSchema: emit to read contract seam (PR4)', () => {
  it('round-trips a merchant alert with the exact M8 emitter wire shape', () => {
    // Mirror of emitMerchantSubmittedAlert's adminNotify payload (plus the
    // read-side fields the list endpoint adds: id/isRead/readAt/sentAt).
    const emitted = {
      id: 'notif-seam',
      type: 'ADMIN_MERCHANT_SUBMITTED',
      title: 'New merchant submitted for approval',
      body: 'Acme Coffee has submitted for approval. Open the queue to review it.',
      referenceId: 'merchant-abc123',
      referenceType: 'merchant', // lowercase: the value the emitter writes
      isRead: false,
      readAt: null,
      sentAt: '2026-06-14T11:45:00.000Z',
    }

    const parsed = notificationSchema.parse(emitted)
    // The two fields the click-through hinges on survive parsing intact.
    expect(parsed.referenceType).toBe('merchant')
    expect(parsed.referenceId).toBe('merchant-abc123')
  })
})
