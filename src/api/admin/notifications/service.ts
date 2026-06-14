import type { PrismaClient } from '../../../../generated/prisma/client'

// M2 — admin notification service. Pure functions scoped to a single admin's
// bell. Every query/update is bound to recipientType ADMIN + recipientId
// (the adminId) so one admin can never read or mutate another admin's rows.

const ADMIN = 'ADMIN' as const

export async function listAdminNotifications(
  prisma: PrismaClient,
  adminId: string,
  opts: { page: number; pageSize: number; unreadOnly: boolean },
) {
  const where = {
    recipientType: ADMIN,
    recipientId: adminId,
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

export async function getAdminUnreadCount(prisma: PrismaClient, adminId: string) {
  const count = await prisma.notification.count({
    where: { recipientType: ADMIN, recipientId: adminId, isRead: false },
  })
  return { count }
}

export async function markAdminNotificationRead(prisma: PrismaClient, adminId: string, id: string) {
  // Scoped updateMany so a non-existent / not-mine / already-read id is a no-op
  // (updated: 0), never a cross-admin mutation. Stamp readAt only on the transition.
  const res = await prisma.notification.updateMany({
    where: { id, recipientType: ADMIN, recipientId: adminId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  })
  return { updated: res.count }
}

export async function markAllAdminNotificationsRead(prisma: PrismaClient, adminId: string) {
  const res = await prisma.notification.updateMany({
    where: { recipientType: ADMIN, recipientId: adminId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  })
  return { updated: res.count }
}
