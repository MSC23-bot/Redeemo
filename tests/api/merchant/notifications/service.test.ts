import { describe, it, expect, vi } from 'vitest'
import {
  listMerchantNotifications,
  getMerchantUnreadCount,
  markMerchantNotificationRead,
  markAllMerchantNotificationsRead,
} from '../../../../src/api/merchant/notifications/service'

// Pure-function unit tests for the merchant bell service. Every query/update is
// bound to recipientType MERCHANT_ADMIN + recipientId (the MerchantAdmin id).

function mockPrisma(over: Record<string, any> = {}) {
  return {
    notification: {
      findMany: vi.fn().mockResolvedValue([{ id: 'n1' }]),
      count: vi.fn().mockResolvedValue(2),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...over,
    },
  } as any
}

describe('merchant notifications service', () => {
  it('listMerchantNotifications scopes where, orders sentAt desc, pages, curated select', async () => {
    const prisma = mockPrisma()
    const out = await listMerchantNotifications(prisma, 'ma1', { page: 2, pageSize: 10, unreadOnly: false })
    expect(out).toMatchObject({ page: 2, pageSize: 10, total: 2 })
    const arg = prisma.notification.findMany.mock.calls[0][0]
    expect(arg.where).toEqual({ recipientType: 'MERCHANT_ADMIN', recipientId: 'ma1' })
    expect(arg.orderBy).toEqual({ sentAt: 'desc' })
    expect(arg.skip).toBe(10)
    expect(arg.take).toBe(10)
    expect(arg.select).toEqual({
      id: true, type: true, title: true, body: true,
      referenceId: true, referenceType: true,
      isRead: true, readAt: true, sentAt: true,
    })
  })

  it('listMerchantNotifications with unreadOnly adds isRead:false', async () => {
    const prisma = mockPrisma()
    await listMerchantNotifications(prisma, 'ma1', { page: 1, pageSize: 20, unreadOnly: true })
    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({
      recipientType: 'MERCHANT_ADMIN', recipientId: 'ma1', isRead: false,
    })
  })

  it('getMerchantUnreadCount counts unread for the caller', async () => {
    const prisma = mockPrisma({ count: vi.fn().mockResolvedValue(7) })
    const out = await getMerchantUnreadCount(prisma, 'ma1')
    expect(out).toEqual({ count: 7 })
    expect(prisma.notification.count.mock.calls[0][0].where).toEqual({
      recipientType: 'MERCHANT_ADMIN', recipientId: 'ma1', isRead: false,
    })
  })

  it('markMerchantNotificationRead scopes updateMany with isRead:false guard, stamps readAt', async () => {
    const prisma = mockPrisma()
    const out = await markMerchantNotificationRead(prisma, 'ma1', 'n1')
    expect(out).toEqual({ updated: 1 })
    const arg = prisma.notification.updateMany.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'n1', recipientType: 'MERCHANT_ADMIN', recipientId: 'ma1', isRead: false })
    expect(arg.data.isRead).toBe(true)
    expect(arg.data.readAt).toBeInstanceOf(Date)
  })

  it('markAllMerchantNotificationsRead scopes updateMany over unread', async () => {
    const prisma = mockPrisma({ updateMany: vi.fn().mockResolvedValue({ count: 4 }) })
    const out = await markAllMerchantNotificationsRead(prisma, 'ma1')
    expect(out).toEqual({ updated: 4 })
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({
      recipientType: 'MERCHANT_ADMIN', recipientId: 'ma1', isRead: false,
    })
  })
})
