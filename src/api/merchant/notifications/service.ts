import type { PrismaClient } from '../../../../generated/prisma/client'

// M4 merchant personal bell. Pure functions scoped to one merchant-admin's bell:
// every query/update is bound to recipientType MERCHANT_ADMIN + recipientId (the
// MerchantAdmin id = req.user.sub), so one person can never read or mutate another's
// rows. Mirrors src/api/admin/notifications/service.ts with MERCHANT_ADMIN.
const MERCHANT_ADMIN = 'MERCHANT_ADMIN' as const

export async function listMerchantNotifications(
  prisma: PrismaClient,
  merchantAdminId: string,
  opts: { page: number; pageSize: number; unreadOnly: boolean },
) {
  const where = {
    recipientType: MERCHANT_ADMIN,
    recipientId: merchantAdminId,
    ...(opts.unreadOnly ? { isRead: false } : {}),
  }
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: {
        id: true, type: true, title: true, body: true,
        referenceId: true, referenceType: true,
        isRead: true, readAt: true, sentAt: true,
      },
    }),
    prisma.notification.count({ where }),
  ])
  return { notifications, page: opts.page, pageSize: opts.pageSize, total }
}

export async function getMerchantUnreadCount(prisma: PrismaClient, merchantAdminId: string) {
  const count = await prisma.notification.count({
    where: { recipientType: MERCHANT_ADMIN, recipientId: merchantAdminId, isRead: false },
  })
  return { count }
}

export async function markMerchantNotificationRead(prisma: PrismaClient, merchantAdminId: string, id: string) {
  // Scoped updateMany so a non-existent / not-mine / already-read id is a no-op
  // (updated: 0), never a cross-person mutation. Stamp readAt only on the transition.
  const res = await prisma.notification.updateMany({
    where: { id, recipientType: MERCHANT_ADMIN, recipientId: merchantAdminId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  })
  return { updated: res.count }
}

export async function markAllMerchantNotificationsRead(prisma: PrismaClient, merchantAdminId: string) {
  const res = await prisma.notification.updateMany({
    where: { recipientType: MERCHANT_ADMIN, recipientId: merchantAdminId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  })
  return { updated: res.count }
}
