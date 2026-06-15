'use client'

/**
 * React Query hooks for the admin notification surface.
 *
 * - useUnreadCount: polls every 45s (no background polling, refetch on focus).
 *   Used by NotificationBell to drive the badge.
 * - useNotificationList: only fetches while `enabled` is true (pass the open
 *   state so the list only loads while the panel is visible). While open it also
 *   re-polls every 45s so a notification that arrives mid-session appears without
 *   reopening the panel.
 * - useMarkRead: optimistic — flips the row to read and decrements the badge
 *   immediately, rolling both back if the request fails.
 * - useMarkAllRead: invalidate-only (whole list flips read; no per-row patch).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '@/lib/api/notifications'
import type { AdminNotification } from '@/lib/api/notifications'

/** Shared query key root. All notifications queries live under this. */
export const NOTIFICATIONS_KEY = ['admin-notifications'] as const

const LIST_KEY = [...NOTIFICATIONS_KEY, 'list'] as const
const COUNT_KEY = [...NOTIFICATIONS_KEY, 'unread-count'] as const

/** Poll the unread badge. No background polling. Refetch when the tab regains focus. */
export function useUnreadCount() {
  return useQuery({
    queryKey: COUNT_KEY,
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true, // intentionally overrides the global refetchOnWindowFocus: false in app/providers.tsx
  })
}

/**
 * Fetch the first page of notifications. Only runs while `enabled` is true
 * (pass the panel open state to avoid unnecessary network calls). While open it
 * re-polls every 45s so newly-arrived notifications surface without a reopen;
 * polling stops the moment the panel closes (`enabled` flips false).
 */
export function useNotificationList(enabled: boolean) {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: () => notificationsApi.list({ page: 1, pageSize: 10 }),
    enabled,
    refetchInterval: enabled ? 45_000 : false,
    refetchIntervalInBackground: false,
  })
}

/**
 * Mark a single notification as read — optimistically.
 *
 * onMutate flips the matching row to `isRead: true` in the cached list and
 * decrements the cached unread count so the UI responds instantly. onError rolls
 * both caches back to their pre-mutation snapshots. onSettled reconciles against
 * the server by invalidating all notification queries.
 */
export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onMutate: async (id: string) => {
      // Cancel in-flight fetches so they can't overwrite the optimistic patch.
      await qc.cancelQueries({ queryKey: LIST_KEY })
      await qc.cancelQueries({ queryKey: COUNT_KEY })

      const prevList = qc.getQueryData<{ notifications: AdminNotification[] }>(LIST_KEY)
      const prevCount = qc.getQueryData<{ count: number }>(COUNT_KEY)

      // Only decrement the badge if the row we're marking was actually unread,
      // so a double-click (or marking an already-read row) can't drive it negative.
      const wasUnread = prevList?.notifications.some((n) => n.id === id && !n.isRead) ?? false

      if (prevList) {
        qc.setQueryData(LIST_KEY, {
          ...prevList,
          notifications: prevList.notifications.map((n) =>
            n.id === id ? { ...n, isRead: true } : n
          ),
        })
      }
      if (prevCount && wasUnread) {
        qc.setQueryData(COUNT_KEY, { count: Math.max(0, prevCount.count - 1) })
      }

      return { prevList, prevCount }
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prevList) qc.setQueryData(LIST_KEY, ctx.prevList)
      if (ctx?.prevCount) qc.setQueryData(COUNT_KEY, ctx.prevCount)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  })
}

/** Mark all notifications as read and invalidate all notification queries. */
export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  })
}
