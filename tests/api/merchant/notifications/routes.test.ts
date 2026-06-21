import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// M4 B1: merchant personal notification bell. Mirrors the redemptions harness
// (buildApp + prisma-mock + merchant JWT) but every query/mutation is scoped to
// recipientType MERCHANT_ADMIN + recipientId = req.user.sub (the MerchantAdmin id).
// The routes deliberately do NOT call resolveAdminMerchant, so a suspended/rejected
// merchant can still read their own notices: isolation is purely recipientId.

describe('merchant notifications (M4 B1)', () => {
  let app: FastifyInstance
  let merchantToken: string

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: 'n1',
      type: 'MERCHANT_VERIFICATION_UPDATE',
      title: 'Application update',
      body: 'Your application was approved.',
      referenceId: 'm1',
      referenceType: 'merchant',
      isRead: false,
      readAt: null,
      sentAt: new Date('2026-06-21T10:00:00.000Z'),
      ...overrides,
    }
  }

  function signToken(sub: string) {
    return (app.jwt as any).merchant.sign(
      { sub, role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  }

  beforeEach(async () => {
    app = await buildApp()
    const prismaMock: any = {
      notification: {
        findMany: vi.fn().mockResolvedValue([row()]),
        count: vi.fn().mockResolvedValue(1),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      // present but should never be consulted by the notification routes (no suspend gate)
      merchantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1',
          merchant: { status: 'ACTIVE', businessName: 'Acme' },
        }),
      },
    }
    app.decorate('prisma', prismaMock as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    merchantToken = signToken('ma1')
  })

  afterEach(async () => { await app.close() })

  function get(url: string, token = merchantToken) {
    return app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } })
  }
  function post(url: string, token = merchantToken) {
    return app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${token}` } })
  }

  function findManyArg() { return (app.prisma.notification.findMany as any).mock.calls[0][0] }
  function countArg() { return (app.prisma.notification.count as any).mock.calls[0][0] }
  function updateManyArg() { return (app.prisma.notification.updateMany as any).mock.calls[0][0] }

  // ---- GET list ----

  it('GET list returns 200 with the paginated envelope and default page/pageSize', async () => {
    const res = await get('/api/v1/merchant/notifications')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toMatchObject({ page: 1, pageSize: 20, total: 1 })
    expect(body.notifications).toHaveLength(1)
    expect(body.notifications[0]).toMatchObject({ id: 'n1', type: 'MERCHANT_VERIFICATION_UPDATE' })
  })

  it('scopes the list where to recipientType MERCHANT_ADMIN + recipientId, ordered by sentAt desc', async () => {
    await get('/api/v1/merchant/notifications')
    const arg = findManyArg()
    expect(arg.where).toEqual({ recipientType: 'MERCHANT_ADMIN', recipientId: 'ma1' })
    expect(arg.orderBy).toEqual({ sentAt: 'desc' })
    // count shares the same where so total matches the page
    expect(countArg().where).toEqual({ recipientType: 'MERCHANT_ADMIN', recipientId: 'ma1' })
  })

  it('default paging skips 0 and takes 20', async () => {
    await get('/api/v1/merchant/notifications')
    const arg = findManyArg()
    expect(arg.skip).toBe(0)
    expect(arg.take).toBe(20)
  })

  it('?page=2&pageSize=10 sets skip:10, take:10', async () => {
    await get('/api/v1/merchant/notifications?page=2&pageSize=10')
    const arg = findManyArg()
    expect(arg.skip).toBe(10)
    expect(arg.take).toBe(10)
    const body = JSON.parse((await get('/api/v1/merchant/notifications?page=2&pageSize=10')).body)
    expect(body).toMatchObject({ page: 2, pageSize: 10 })
  })

  it('?unreadOnly=true adds isRead:false to the where', async () => {
    await get('/api/v1/merchant/notifications?unreadOnly=true')
    expect(findManyArg().where).toEqual({
      recipientType: 'MERCHANT_ADMIN', recipientId: 'ma1', isRead: false,
    })
  })

  it('?unreadOnly=false does NOT add isRead', async () => {
    await get('/api/v1/merchant/notifications?unreadOnly=false')
    const where = findManyArg().where
    expect(where).toEqual({ recipientType: 'MERCHANT_ADMIN', recipientId: 'ma1' })
    expect('isRead' in where).toBe(false)
  })

  it('?unreadOnly=banana is rejected with a clean 400, never reaching Prisma', async () => {
    const res = await get('/api/v1/merchant/notifications?unreadOnly=banana')
    expect(res.statusCode).toBe(400)
    expect(app.prisma.notification.findMany).not.toHaveBeenCalled()
  })

  it('?pageSize=51 is rejected with a 400 (max 50)', async () => {
    const res = await get('/api/v1/merchant/notifications?pageSize=51')
    expect(res.statusCode).toBe(400)
    expect(app.prisma.notification.findMany).not.toHaveBeenCalled()
  })

  it('uses the curated select with exactly id,type,title,body,referenceId,referenceType,isRead,readAt,sentAt and no other field', async () => {
    await get('/api/v1/merchant/notifications')
    const select = findManyArg().select
    expect(select).toEqual({
      id: true, type: true, title: true, body: true,
      referenceId: true, referenceType: true,
      isRead: true, readAt: true, sentAt: true,
    })
    // never selects the recipient pointers or any other field
    const keys = Object.keys(select)
    expect(keys).not.toContain('recipientId')
    expect(keys).not.toContain('recipientType')
    expect(keys).not.toContain('userId')
    expect(keys).not.toContain('channel')
    expect(keys).toHaveLength(9)
  })

  // ---- GET unread-count ----

  it('GET unread-count returns { count } scoped to MERCHANT_ADMIN + recipientId + isRead:false', async () => {
    app.prisma.notification.count = vi.fn().mockResolvedValue(3)
    const res = await get('/api/v1/merchant/notifications/unread-count')
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ count: 3 })
    expect((app.prisma.notification.count as any).mock.calls[0][0].where).toEqual({
      recipientType: 'MERCHANT_ADMIN', recipientId: 'ma1', isRead: false,
    })
  })

  // ---- POST :id/read ----

  it('POST :id/read scopes the updateMany where and stamps readAt, returns { updated }', async () => {
    const res = await post('/api/v1/merchant/notifications/n1/read')
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ updated: 1 })
    const arg = updateManyArg()
    expect(arg.where).toEqual({
      id: 'n1', recipientType: 'MERCHANT_ADMIN', recipientId: 'ma1', isRead: false,
    })
    expect(arg.data.isRead).toBe(true)
    expect(arg.data.readAt).toBeInstanceOf(Date)
  })

  it('POST :id/read for a not-mine / not-found id is a no-op updated:0 (scoped where guarantees it)', async () => {
    app.prisma.notification.updateMany = vi.fn().mockResolvedValue({ count: 0 })
    const res = await post('/api/v1/merchant/notifications/someoneElse/read')
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ updated: 0 })
    expect(updateManyArg().where).toMatchObject({
      id: 'someoneElse', recipientType: 'MERCHANT_ADMIN', recipientId: 'ma1', isRead: false,
    })
  })

  // ---- POST read-all ----

  it('POST read-all updates all unread for the caller, returns { updated }', async () => {
    app.prisma.notification.updateMany = vi.fn().mockResolvedValue({ count: 5 })
    const res = await post('/api/v1/merchant/notifications/read-all')
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ updated: 5 })
    const arg = updateManyArg()
    expect(arg.where).toEqual({
      recipientType: 'MERCHANT_ADMIN', recipientId: 'ma1', isRead: false,
    })
    expect(arg.data.isRead).toBe(true)
    expect(arg.data.readAt).toBeInstanceOf(Date)
  })

  // ---- Per-person isolation ----

  it('a second merchant-admin (ma2) scopes every where to recipientId:ma2', async () => {
    const ma2 = signToken('ma2')
    await get('/api/v1/merchant/notifications', ma2)
    expect(findManyArg().where).toEqual({ recipientType: 'MERCHANT_ADMIN', recipientId: 'ma2' })

    app.prisma.notification.count = vi.fn().mockResolvedValue(0)
    await get('/api/v1/merchant/notifications/unread-count', ma2)
    expect((app.prisma.notification.count as any).mock.calls[0][0].where.recipientId).toBe('ma2')

    await post('/api/v1/merchant/notifications/n1/read', ma2)
    expect(updateManyArg().where.recipientId).toBe('ma2')
  })

  // ---- No suspend gate ----

  it('a SUSPENDED merchant still reads their own notifications (no resolveAdminMerchant, no MERCHANT_SUSPENDED)', async () => {
    app.prisma.merchantMembership.findFirst = vi.fn().mockResolvedValue({
      id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1',
      merchant: { status: 'SUSPENDED', businessName: 'Acme' },
    })
    const list = await get('/api/v1/merchant/notifications')
    expect(list.statusCode).toBe(200)
    expect(list.body).not.toContain('MERCHANT_SUSPENDED')

    const count = await get('/api/v1/merchant/notifications/unread-count')
    expect(count.statusCode).toBe(200)

    const read = await post('/api/v1/merchant/notifications/n1/read')
    expect(read.statusCode).toBe(200)

    const readAll = await post('/api/v1/merchant/notifications/read-all')
    expect(readAll.statusCode).toBe(200)

    // the merchant-org suspend gate must never have been consulted by these routes
    expect(app.prisma.merchantMembership.findFirst).not.toHaveBeenCalled()
  })

  // ---- Auth boundary ----

  it('rejects an unauthenticated request', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/notifications' })
    expect(res.statusCode).toBe(401)
    expect(app.prisma.notification.findMany).not.toHaveBeenCalled()
  })
})
