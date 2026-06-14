'use client'

/**
 * React Query hooks for the admin notification surface.
 *
 * - useUnreadCount: polls every 45s (no background polling, refetch on focus).
 *   Used by NotificationBell to drive the badge.
 * - useNotificationList: only fetches while `enabled` is true (pass the open
 *   state so the list only loads while the panel is visible).
 * - useMarkRead / useMarkAllRead: mutations that invalidate the shared key.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '@/lib/api/notifications'

/** Shared query key root. All notifications queries live under this. */
export const NOTIFICATIONS_KEY = ['admin-notifications'] as const

/** Poll the unread badge. No background polling. Refetch when the tab regains focus. */
export function useUnreadCount() {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'unread-count'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
}

/**
 * Fetch the first page of notifications. Only runs while `enabled` is true
 * (pass the panel open state to avoid unnecessary network calls).
 */
export function useNotificationList(enabled: boolean) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, 'list'],
    queryFn: () => notificationsApi.list({ page: 1, pageSize: 10 }),
    enabled,
  })
}

/** Mark a single notification as read and invalidate all notification queries. */
export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
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
