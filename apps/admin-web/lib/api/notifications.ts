/**
 * Admin notifications API.
 *
 * Typed wrappers for the four admin notification endpoints:
 *
 *   GET  /api/v1/admin/notifications          -> paginated list
 *   GET  /api/v1/admin/notifications/unread-count -> { count }
 *   POST /api/v1/admin/notifications/:id/read -> { updated }
 *   POST /api/v1/admin/notifications/read-all -> { updated }
 *
 * Every response is validated with Zod so contract drift surfaces as a clear
 * error rather than an undefined-field crash.
 */
import { z } from 'zod'
import { apiFetch } from './client'

// ── Response schemas ──────────────────────────────────────────────────────────

export const notificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  referenceId: z.string().nullable(),
  referenceType: z.string().nullable(),
  isRead: z.boolean(),
  readAt: z.string().nullable(),
  sentAt: z.string(),
})
export type AdminNotification = z.infer<typeof notificationSchema>

const listResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
})
export type NotificationsListResponse = z.infer<typeof listResponseSchema>

const unreadCountSchema = z.object({ count: z.number() })
export type UnreadCountResponse = z.infer<typeof unreadCountSchema>

const mutationResultSchema = z.object({ updated: z.number() })
export type MutationResultResponse = z.infer<typeof mutationResultSchema>

// ── API calls ─────────────────────────────────────────────────────────────────

export const notificationsApi = {
  /** Fetch a page of notifications. All three params are optional. */
  list: async (params?: {
    page?: number
    pageSize?: number
    unreadOnly?: boolean
  }): Promise<NotificationsListResponse> => {
    const qs = new URLSearchParams()
    if (params?.page !== undefined) qs.set('page', String(params.page))
    if (params?.pageSize !== undefined) qs.set('pageSize', String(params.pageSize))
    if (params?.unreadOnly !== undefined) {
      qs.set('unreadOnly', params.unreadOnly ? 'true' : 'false')
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    const raw = await apiFetch<unknown>(`/api/v1/admin/notifications${suffix}`, {
      auth: true,
    })
    return listResponseSchema.parse(raw)
  },

  /** Poll-friendly: returns only the count of unread notifications. */
  unreadCount: async (): Promise<UnreadCountResponse> => {
    const raw = await apiFetch<unknown>('/api/v1/admin/notifications/unread-count', {
      auth: true,
    })
    return unreadCountSchema.parse(raw)
  },

  /** Mark a single notification as read. Returns { updated: 0 } if already read. */
  markRead: async (id: string): Promise<MutationResultResponse> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/admin/notifications/${encodeURIComponent(id)}/read`,
      { method: 'POST', auth: true }
    )
    return mutationResultSchema.parse(raw)
  },

  /** Mark all notifications for this admin as read. */
  markAllRead: async (): Promise<MutationResultResponse> => {
    const raw = await apiFetch<unknown>('/api/v1/admin/notifications/read-all', {
      method: 'POST',
      auth: true,
    })
    return mutationResultSchema.parse(raw)
  },
}
