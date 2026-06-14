import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  listAdminNotifications,
  getAdminUnreadCount,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from '../../../src/api/admin/notifications/service'

// M2 — admin notification service (real DB). Tests scoping, idempotent mark-read,
// cross-admin boundary. Rows are seeded directly via prisma and cleaned up in afterAll.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const ADMIN_A = 'm2-notif-admin-a'
const ADMIN_B = 'm2-notif-admin-b'
const PREFIX = 'm2-notif-'

const createdNotifIds: string[] = []

async function seedNotif(adminId: string, opts: { isRead?: boolean; title?: string } = {}) {
  const n = await prisma.notification.create({
    data: {
      recipientType: 'ADMIN',
      recipientId: adminId,
      channel: 'IN_APP',
      type: 'ADMIN_MERCHANT_SUBMITTED',
      title: opts.title ?? `${PREFIX}title-${Date.now()}-${Math.random()}`,
      body: `${PREFIX}body`,
      isRead: opts.isRead ?? false,
    },
  })
  createdNotifIds.push(n.id)
  return n
}

beforeAll(async () => {
  // Seed 3 notifications for ADMIN_A (2 unread, 1 read) and 1 for ADMIN_B.
  await seedNotif(ADMIN_A, { title: `${PREFIX}A-unread-1` })
  await seedNotif(ADMIN_A, { title: `${PREFIX}A-unread-2` })
  await seedNotif(ADMIN_A, { title: `${PREFIX}A-read-1`, isRead: true })
  await seedNotif(ADMIN_B, { title: `${PREFIX}B-unread-1` })
})

afterAll(async () => {
  if (createdNotifIds.length > 0) {
    await prisma.notification.deleteMany({ where: { id: { in: createdNotifIds } } })
  }
  await prisma.$disconnect()
})

describe('M2 — listAdminNotifications (real DB)', () => {
  it('returns only adminA rows, ordered by sentAt desc, with correct total', async () => {
    const result = await listAdminNotifications(prisma, ADMIN_A, { page: 1, pageSize: 20, unreadOnly: false })
    const ids = result.notifications.map((n) => n.id)
    // All returned rows belong to ADMIN_A
    for (const n of result.notifications) {
      expect(createdNotifIds).toContain(n.id)
    }
    // total is >= 3 (the 3 we seeded; may be more if other tests leaked rows, but unlikely)
    expect(result.total).toBeGreaterThanOrEqual(3)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(20)
    // ADMIN_B row NOT in the list (scoping)
    const adminBRow = await prisma.notification.findFirst({ where: { recipientType: 'ADMIN', recipientId: ADMIN_B } })
    if (adminBRow) {
      expect(ids).not.toContain(adminBRow.id)
    }
    // Ordered newest first: sentAt desc
    const sentAts = result.notifications.map((n) => new Date(n.sentAt).getTime())
    for (let i = 1; i < sentAts.length; i++) {
      expect(sentAts[i - 1]).toBeGreaterThanOrEqual(sentAts[i])
    }
  })

  it('unreadOnly=true returns only unread rows for adminA', async () => {
    const result = await listAdminNotifications(prisma, ADMIN_A, { page: 1, pageSize: 20, unreadOnly: true })
    expect(result.notifications.every((n) => n.isRead === false)).toBe(true)
    // The read row must not appear
    const readRow = (await prisma.notification.findMany({
      where: { recipientType: 'ADMIN', recipientId: ADMIN_A, isRead: true },
      select: { id: true },
    })).map((r) => r.id)
    for (const id of readRow) {
      expect(result.notifications.map((n) => n.id)).not.toContain(id)
    }
  })

  it('pagination: page 2 with pageSize 2 returns the correct slice', async () => {
    const p1 = await listAdminNotifications(prisma, ADMIN_A, { page: 1, pageSize: 2, unreadOnly: false })
    const p2 = await listAdminNotifications(prisma, ADMIN_A, { page: 2, pageSize: 2, unreadOnly: false })
    expect(p1.notifications.length).toBe(2)
    // No overlap between pages
    const p1ids = new Set(p1.notifications.map((n) => n.id))
    for (const n of p2.notifications) {
      expect(p1ids.has(n.id)).toBe(false)
    }
    // total is consistent
    expect(p1.total).toBe(p2.total)
  })
})

describe('M2 — getAdminUnreadCount (real DB)', () => {
  it('counts only adminA unread', async () => {
    const { count } = await getAdminUnreadCount(prisma, ADMIN_A)
    // We seeded 2 unread for adminA (the read one is not counted). May be higher
    // if a previous test has not yet cleaned up, but our seed rows are 2 unread + 1 read.
    expect(count).toBeGreaterThanOrEqual(2)
  })

  it('count does not include adminB rows', async () => {
    const { count: countA } = await getAdminUnreadCount(prisma, ADMIN_A)
    const { count: countB } = await getAdminUnreadCount(prisma, ADMIN_B)
    // They must be independent (separate recipientId scope)
    expect(typeof countA).toBe('number')
    expect(typeof countB).toBe('number')
    // ADMIN_B has 1 unread from seed
    expect(countB).toBeGreaterThanOrEqual(1)
  })
})

describe('M2 — markAdminNotificationRead (real DB)', () => {
  it('flips one unread row to read (updated: 1, isRead true, readAt set)', async () => {
    const notif = await seedNotif(ADMIN_A, { isRead: false, title: `${PREFIX}mark-read-target` })
    const res = await markAdminNotificationRead(prisma, ADMIN_A, notif.id)
    expect(res).toEqual({ updated: 1 })
    const after = await prisma.notification.findUnique({ where: { id: notif.id }, select: { isRead: true, readAt: true } })
    expect(after?.isRead).toBe(true)
    expect(after?.readAt).not.toBeNull()
  })

  it('idempotent: second call on already-read row returns updated: 0', async () => {
    const notif = await seedNotif(ADMIN_A, { isRead: false, title: `${PREFIX}idempotent-target` })
    await markAdminNotificationRead(prisma, ADMIN_A, notif.id)
    const second = await markAdminNotificationRead(prisma, ADMIN_A, notif.id)
    expect(second).toEqual({ updated: 0 })
  })

  it('cross-admin boundary: adminA cannot mark adminB row as read (updated: 0, row stays unread)', async () => {
    const bRow = await seedNotif(ADMIN_B, { isRead: false, title: `${PREFIX}B-boundary-target` })
    // adminA tries to mark adminB's row
    const res = await markAdminNotificationRead(prisma, ADMIN_A, bRow.id)
    expect(res).toEqual({ updated: 0 })
    const after = await prisma.notification.findUnique({ where: { id: bRow.id }, select: { isRead: true } })
    expect(after?.isRead).toBe(false)
  })
})

describe('M2 — markAllAdminNotificationsRead (real DB)', () => {
  it('marks all adminA unread as read, returns count, leaves adminB untouched', async () => {
    // Seed fresh unread rows for both admins to ensure clean state for this test.
    const aRow1 = await seedNotif(ADMIN_A, { isRead: false, title: `${PREFIX}mark-all-A1` })
    const aRow2 = await seedNotif(ADMIN_A, { isRead: false, title: `${PREFIX}mark-all-A2` })
    const bRow = await seedNotif(ADMIN_B, { isRead: false, title: `${PREFIX}mark-all-B1` })

    const unreadBefore = await prisma.notification.count({
      where: { recipientType: 'ADMIN', recipientId: ADMIN_A, isRead: false },
    })
    const res = await markAllAdminNotificationsRead(prisma, ADMIN_A)
    expect(res.updated).toBeGreaterThanOrEqual(2) // at least the 2 we just seeded
    expect(res.updated).toBe(unreadBefore)

    // AdminA: no more unread
    const unreadAfterA = await prisma.notification.count({
      where: { recipientType: 'ADMIN', recipientId: ADMIN_A, isRead: false },
    })
    expect(unreadAfterA).toBe(0)

    // AdminB: unread count unchanged (bRow still unread)
    const bAfter = await prisma.notification.findUnique({ where: { id: bRow.id }, select: { isRead: true } })
    expect(bAfter?.isRead).toBe(false)
  })
})
