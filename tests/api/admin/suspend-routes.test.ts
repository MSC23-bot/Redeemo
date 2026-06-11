import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Phase 2 Slice 1 M6a — auth + capability gate on the admin suspend/reactivate
// routes (cap `merchant:suspend`). The gate fires in preHandlers before the
// service runs, so a tiny prisma mock suffices.
describe('M6a — /admin/merchants/:id/{suspend,reactivate} auth + capability gate', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      // OPERATIONS reaches the service → merchant miss → MERCHANT_NOT_FOUND (404).
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb((app as any).prisma)),
      merchant: { findUnique: vi.fn().mockResolvedValue(null) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK'), del: vi.fn(), keys: vi.fn().mockResolvedValue([]) } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  it('401 when unauthenticated (suspend)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/merchants/m1/suspend', payload: { reason: 'x' } })
    expect(res.statusCode).toBe(401)
  })

  it('403 for a role without merchant:suspend (SUPPORT, suspend)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/merchants/m1/suspend', headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` }, payload: { reason: 'x' } })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('403 for a role without merchant:suspend (FINANCE, reactivate)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/merchants/m1/reactivate', headers: { authorization: `Bearer ${signAdmin('FINANCE')}` } })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('400 when suspend is missing a reason (Zod, gate already passed for OPERATIONS)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/merchants/m1/suspend', headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` }, payload: {} })
    expect(res.statusCode).toBe(400)
  })

  it('OPERATIONS passes the capability gate (404 MERCHANT_NOT_FOUND, not 403)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/merchants/m1/suspend', headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` }, payload: { reason: 'x' } })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_NOT_FOUND')
  })
})
