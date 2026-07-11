import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Team & Roles S1 — /admin/team routes are SUPER_ADMIN-only (gated on
// admin:manage-team, which is not in any baseline and not grantable). The gate
// fires in a preHandler before the service, so a tiny prisma mock suffices.
describe('Team & Roles routes — admin:manage-team (SUPER_ADMIN-only) gate', () => {
  let app: FastifyInstance
  const sign = (adminRole?: string, caps?: string[]) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, caps, sessionId: 's1' }, { expiresIn: '1h' })

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb((app as any).prisma)),
      adminUser: { findUnique: vi.fn().mockResolvedValue(null) },
    } as any)
    app.decorate('redis', { get: vi.fn(), set: vi.fn(), del: vi.fn(), keys: vi.fn().mockResolvedValue([]) } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  it('401 when unauthenticated (create account)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/team', payload: { email: 'a@b.com', firstName: 'A', lastName: 'B', role: 'FIELD' } })
    expect(res.statusCode).toBe(401)
  })

  it('403 for a non-SUPER_ADMIN role (OPERATIONS) — team surface is SUPER_ADMIN-only', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/team', headers: { authorization: `Bearer ${sign('OPERATIONS')}` }, payload: { email: 'a@b.com', firstName: 'A', lastName: 'B', role: 'FIELD' } })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('403 for a FIELD admin EVEN WITH a granted approval:action (grant never confers admin:manage-team)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/team/field-2/grants', headers: { authorization: `Bearer ${sign('FIELD', ['lead:manage', 'approval:action'])}` }, payload: { capability: 'approval:action' } })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('SUPER_ADMIN passes the gate; granting a NON-grantable cap is rejected at the route (400)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/team/field-2/grants', headers: { authorization: `Bearer ${sign('SUPER_ADMIN')}` }, payload: { capability: 'admin:manage-team' } })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('CAPABILITY_NOT_GRANTABLE')
  })

  it('SUPER_ADMIN passes the gate; granting merchant:suspend (off allow-list) is 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/team/field-2/grants', headers: { authorization: `Bearer ${sign('SUPER_ADMIN')}` }, payload: { capability: 'merchant:suspend' } })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('CAPABILITY_NOT_GRANTABLE')
  })

  it('SUPER_ADMIN deactivate passes the gate (reaches service -> ADMIN_NOT_FOUND 404, not 403)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/team/ghost/deactivate', headers: { authorization: `Bearer ${sign('SUPER_ADMIN')}` } })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_NOT_FOUND')
  })
})
