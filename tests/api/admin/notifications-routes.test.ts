import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// M2 — auth gate on the /admin/notifications routes (not business logic).
// The gate fires in preHandlers (authenticateAdmin) before any service/prisma
// call. No capability gate — authenticated admin is sufficient (personal bell).
describe('M2 — /admin/notifications route auth gate', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })

  beforeEach(async () => {
    app = await buildApp()
    // Stub prisma with the methods the notification service calls.
    const notifFindMany = vi.fn().mockResolvedValue([])
    const notifCount = vi.fn().mockResolvedValue(0)
    const notifUpdateMany = vi.fn().mockResolvedValue({ count: 0 })
    app.decorate('prisma', {
      notification: {
        findMany: notifFindMany,
        count: notifCount,
        updateMany: notifUpdateMany,
      },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
    } as any)
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  // --- Auth guard ---

  it('401 when unauthenticated (GET list)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/notifications' })
    expect(res.statusCode).toBe(401)
  })

  it('401 when unauthenticated (GET unread-count)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/notifications/unread-count' })
    expect(res.statusCode).toBe(401)
  })

  it('401 when unauthenticated (POST :id/read)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/notifications/some-id/read' })
    expect(res.statusCode).toBe(401)
  })

  it('401 when unauthenticated (POST read-all)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/notifications/read-all' })
    expect(res.statusCode).toBe(401)
  })

  // --- Authenticated reaches handler (200) ---

  it('200 GET list with valid admin token (OPERATIONS)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/notifications',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toMatchObject({ notifications: [], page: 1, pageSize: 20, total: 0 })
  })

  it('200 GET unread-count with valid admin token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/notifications/unread-count',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ count: 0 })
  })

  it('200 POST read-all with valid admin token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/notifications/read-all',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ updated: 0 })
  })

  it('200 POST :id/read with valid admin token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/notifications/notif-abc/read',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ updated: 0 })
  })

  // --- Input validation ---

  it('400 GET list with invalid pageSize (over max of 50)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/notifications?pageSize=999',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('400 GET list with non-numeric page', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/notifications?page=abc',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    expect(res.statusCode).toBe(400)
  })

  // --- Service is called scoped to req.user.sub ---

  it('GET list scopes query to the signed-in admin sub', async () => {
    const notifFindMany = vi.fn().mockResolvedValue([])
    const notifCount = vi.fn().mockResolvedValue(0)
    ;(app as any).prisma = {
      notification: { findMany: notifFindMany, count: notifCount, updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    }
    const token = (app.jwt as any).admin.sign({ sub: 'admin-scoped', role: 'admin', adminRole: 'OPERATIONS', sessionId: 's2' }, { expiresIn: '1h' })
    await app.inject({
      method: 'GET',
      url: '/api/v1/admin/notifications',
      headers: { authorization: `Bearer ${token}` },
    })
    // Both findMany + count should be called with recipientId = 'admin-scoped'
    expect(notifFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ recipientType: 'ADMIN', recipientId: 'admin-scoped' }) }),
    )
    expect(notifCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ recipientType: 'ADMIN', recipientId: 'admin-scoped' }) }),
    )
  })

  // --- unreadOnly query coercion (z.coerce.boolean footgun guard) ---

  it('?unreadOnly=false does NOT filter to unread-only (string "false" must not coerce to true)', async () => {
    const notifFindMany = vi.fn().mockResolvedValue([])
    ;(app as any).prisma = {
      notification: { findMany: notifFindMany, count: vi.fn().mockResolvedValue(0), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    }
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/notifications?unreadOnly=false',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    expect(res.statusCode).toBe(200)
    expect(notifFindMany.mock.calls[0][0].where).not.toHaveProperty('isRead')
  })

  it('?unreadOnly=true filters to unread-only', async () => {
    const notifFindMany = vi.fn().mockResolvedValue([])
    ;(app as any).prisma = {
      notification: { findMany: notifFindMany, count: vi.fn().mockResolvedValue(0), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    }
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/notifications?unreadOnly=true',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    expect(res.statusCode).toBe(200)
    expect(notifFindMany.mock.calls[0][0].where).toMatchObject({ isRead: false })
  })

  it('400 GET list with an ambiguous unreadOnly value (e.g. 1)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/notifications?unreadOnly=1',
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    })
    expect(res.statusCode).toBe(400)
  })
})
