import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  listAdminNotifications, getAdminUnreadCount,
  markAdminNotificationRead, markAllAdminNotificationsRead,
} from './service'

// M2 — admin personal bell. `authenticateAdmin` is applied by the admin-management
// plugin scope. NO capability gate: every authenticated admin reads/manages their
// OWN notifications (scoped by recipientType ADMIN + recipientId = req.user.sub).
export async function adminNotificationRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/admin/notifications'

  app.get(prefix, async (req: any) => {
    const q = z.object({
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(50).optional(),
      unreadOnly: z.coerce.boolean().optional(),
    }).parse(req.query)
    return listAdminNotifications(app.prisma, req.user.sub, {
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 20,
      unreadOnly: q.unreadOnly ?? false,
    })
  })

  app.get(`${prefix}/unread-count`, async (req: any) => {
    return getAdminUnreadCount(app.prisma, req.user.sub)
  })

  app.post(`${prefix}/:id/read`, async (req: any) => {
    const id = z.object({ id: z.string().min(1) }).parse(req.params).id
    return markAdminNotificationRead(app.prisma, req.user.sub, id)
  })

  app.post(`${prefix}/read-all`, async (req: any) => {
    return markAllAdminNotificationsRead(app.prisma, req.user.sub)
  })
}
