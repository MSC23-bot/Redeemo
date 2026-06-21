import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import {
  listMerchantNotifications, getMerchantUnreadCount,
  markMerchantNotificationRead, markAllMerchantNotificationsRead,
} from './service'

// Merchant personal bell. authenticateMerchant is applied by the merchant plugin
// scope; req.user.sub IS the MerchantAdmin id = recipientId. NO resolveAdminMerchant
// (notifications are per-person, not per-merchant-org) so a suspended/rejected
// merchant can still read the notice that tells them so. Isolation = recipientId.
export async function merchantNotificationRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/notifications'

  app.get(prefix, async (req: FastifyRequest) => {
    const q = z.object({
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(50).optional(),
      // string query: parse the literal token (Boolean('false') === true would break ?unreadOnly=false)
      unreadOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    }).parse(req.query)
    return listMerchantNotifications(app.prisma, req.user.sub, {
      page: q.page ?? 1, pageSize: q.pageSize ?? 20, unreadOnly: q.unreadOnly ?? false,
    })
  })

  app.get(`${prefix}/unread-count`, async (req: FastifyRequest) => {
    return getMerchantUnreadCount(app.prisma, req.user.sub)
  })

  app.post(`${prefix}/:id/read`, async (req: FastifyRequest) => {
    const id = z.object({ id: z.string().min(1) }).parse(req.params).id
    return markMerchantNotificationRead(app.prisma, req.user.sub, id)
  })

  app.post(`${prefix}/read-all`, async (req: FastifyRequest) => {
    return markAllMerchantNotificationsRead(app.prisma, req.user.sub)
  })
}
