import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// M3 — auth + capability gate on the /admin/approvals routes (not business
// logic). The gate fires in preHandlers (authenticateAdmin → requireAdminCapability)
// before any service/prisma call, so a bare prisma mock suffices.
describe('M3 — /admin/approvals route auth + capability gate', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {} as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  it('401 when unauthenticated (GET list)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/approvals' })
    expect(res.statusCode).toBe(401)
  })

  it('401 when unauthenticated (POST claim)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/approvals/some-id/claim' })
    expect(res.statusCode).toBe(401)
  })

  it('403 ADMIN_CAPABILITY_DENIED for a role without approval:read (SUPPORT, GET list)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals',
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('403 for a role without approval:action (SUPPORT, POST request-changes)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/approvals/some-id/request-changes',
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
      payload: { reason: 'x' },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })
})
