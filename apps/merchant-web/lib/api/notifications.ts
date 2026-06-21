import { z } from 'zod'
import { apiFetch } from './client'

// M4 F1: the merchant notification-bell API client. Direct browser->backend authed
// calls (Bearer access token); no BFF route is needed (no token issuance). Mirrors
// the lib/api/redemptions.ts pattern (zod .passthrough() + a qs() helper).
//
// Backend contract (src/api/merchant/notifications/*, recipientType MERCHANT_ADMIN
// + recipientId = req.user.sub, no suspend gate):
//   GET  /api/v1/merchant/notifications              -> { notifications, page, pageSize, total }
//        query: page? / pageSize? (max 50) / unreadOnly? ('true' | 'false')
//   GET  /api/v1/merchant/notifications/unread-count -> { count }
//   POST /api/v1/merchant/notifications/:id/read     -> { updated }
//   POST /api/v1/merchant/notifications/read-all     -> { updated }
//
// Privacy invariant: the curated backend select carries only
// id/type/title/body/referenceId/referenceType/isRead/readAt/sentAt - no recipient
// ids and no customer PII. The schema renders exactly those fields.

export const notificationSchema = z
  .object({
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
  .passthrough()

export type Notification = z.infer<typeof notificationSchema>

export interface NotificationListOpts {
  page?: number
  pageSize?: number
  unreadOnly?: boolean
}

const notificationListSchema = z.object({
  notifications: z.array(notificationSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
})

export type NotificationList = z.infer<typeof notificationListSchema>

// Builds a querystring, skipping undefined/null/empty values. Returns '' (no '?')
// when nothing is set so the bare path is preserved.
function qs(o: Record<string, unknown>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

export async function listNotifications(opts: NotificationListOpts = {}): Promise<NotificationList> {
  const data = await apiFetch(`/api/v1/merchant/notifications${qs(opts as Record<string, unknown>)}`, {
    method: 'GET',
    auth: true,
  })
  return notificationListSchema.parse(data)
}

export async function getUnreadCount(): Promise<{ count: number }> {
  const data = await apiFetch('/api/v1/merchant/notifications/unread-count', {
    method: 'GET',
    auth: true,
  })
  return z.object({ count: z.number() }).parse(data)
}

export async function markNotificationRead(id: string): Promise<unknown> {
  return apiFetch(`/api/v1/merchant/notifications/${id}/read`, { method: 'POST', auth: true })
}

export async function markAllNotificationsRead(): Promise<unknown> {
  return apiFetch('/api/v1/merchant/notifications/read-all', { method: 'POST', auth: true })
}
