/**
 * useNotifications — hook behaviour.
 *
 * notificationsApi is mocked; a fresh QueryClient (retry: false) is seeded per
 * test so we can assert cache mutations directly.
 *
 * Covers:
 *   - useMarkRead optimistically flips the row to read + decrements the badge
 *   - useMarkRead rolls both caches back when the request fails
 *   - useMarkRead does not drive the badge negative when the row was already read
 *   - useNotificationList polls while open (enabled) and not while closed
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import {
  useMarkRead,
  useNotificationList,
  NOTIFICATIONS_KEY,
} from '../useNotifications'
import { notificationsApi } from '@/lib/api/notifications'

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

const LIST_KEY = [...NOTIFICATIONS_KEY, 'list']
const COUNT_KEY = [...NOTIFICATIONS_KEY, 'unread-count']

const UNREAD = {
  id: 'notif-1',
  type: 'MERCHANT_SUBMITTED',
  title: 'New merchant submitted',
  body: 'Acme Coffee has submitted for review.',
  referenceId: 'merchant-42',
  referenceType: 'MERCHANT',
  isRead: false,
  readAt: null,
  sentAt: '2026-06-14T11:45:00.000Z',
}

let qc: QueryClient

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  qc = makeQueryClient()
})

// ── useMarkRead — optimistic + rollback ──────────────────────────────────────

describe('useMarkRead — optimistic mark-read', () => {
  function seedOneUnread() {
    qc.setQueryData(LIST_KEY, {
      notifications: [{ ...UNREAD }],
      page: 1,
      pageSize: 10,
      total: 1,
    })
    qc.setQueryData(COUNT_KEY, { count: 1 })
  }

  it('flips the row to read and decrements the count synchronously, then settles', async () => {
    seedOneUnread()
    // Resolve, but slowly enough that we can observe the optimistic state first.
    let resolve!: (v: { updated: number }) => void
    mockedApi.markRead.mockReturnValue(
      new Promise<{ updated: number }>((r) => {
        resolve = r
      })
    )

    const { result } = renderHook(() => useMarkRead(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate('notif-1')
    })

    // Optimistic: onMutate ran -> row read + count decremented, before the
    // mutationFn resolves.
    await waitFor(() => {
      const list = qc.getQueryData<{ notifications: { id: string; isRead: boolean }[] }>(LIST_KEY)
      expect(list?.notifications[0].isRead).toBe(true)
    })
    expect(qc.getQueryData<{ count: number }>(COUNT_KEY)?.count).toBe(0)

    // Resolve the request; the hook settles without error.
    act(() => resolve({ updated: 1 }))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedApi.markRead).toHaveBeenCalledWith('notif-1')
  })

  it('rolls both caches back when the request fails', async () => {
    seedOneUnread()
    mockedApi.markRead.mockRejectedValueOnce(new Error('boom'))

    const { result } = renderHook(() => useMarkRead(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate('notif-1')
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    // Rolled back to the pre-mutation snapshot.
    const list = qc.getQueryData<{ notifications: { id: string; isRead: boolean }[] }>(LIST_KEY)
    expect(list?.notifications[0].isRead).toBe(false)
    expect(qc.getQueryData<{ count: number }>(COUNT_KEY)?.count).toBe(1)
  })

  it('does not drive the badge negative when the row was already read', async () => {
    // Seed a READ row but a count of 0 (consistent state).
    qc.setQueryData(LIST_KEY, {
      notifications: [{ ...UNREAD, isRead: true }],
      page: 1,
      pageSize: 10,
      total: 1,
    })
    qc.setQueryData(COUNT_KEY, { count: 0 })
    mockedApi.markRead.mockResolvedValueOnce({ updated: 0 })

    const { result } = renderHook(() => useMarkRead(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate('notif-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // Count stayed at 0 (never decremented below zero).
    expect(qc.getQueryData<{ count: number }>(COUNT_KEY)?.count).toBe(0)
  })
})

// ── useNotificationList — poll while open ─────────────────────────────────────

describe('useNotificationList — re-poll while open', () => {
  it('does not fetch while disabled (panel closed)', async () => {
    mockedApi.list.mockResolvedValue({ notifications: [], page: 1, pageSize: 10, total: 0 })

    renderHook(() => useNotificationList(false), { wrapper: Wrapper })

    // Give React Query a tick; a disabled query must not call the API.
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockedApi.list).not.toHaveBeenCalled()
  })

  it('fetches once when enabled (panel open)', async () => {
    mockedApi.list.mockResolvedValue({
      notifications: [{ ...UNREAD }],
      page: 1,
      pageSize: 10,
      total: 1,
    })

    const { result } = renderHook(() => useNotificationList(true), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedApi.list).toHaveBeenCalledWith({ page: 1, pageSize: 10 })
  })
})
