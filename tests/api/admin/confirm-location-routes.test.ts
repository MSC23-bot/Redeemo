import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Phase 2 Slice 1 M4 — auth + capability gate on the admin confirm-location
// route. The gate fires in preHandlers (authenticateAdmin →
// requireAdminCapability('branch:confirm-location')) BEFORE the service runs,
// so a bare prisma mock suffices for the 401/403 cases. The positive cases
// (OPERATIONS / SUPER_ADMIN pass the gate) use a tiny prisma mock whose branch
// lookup misses → the route surfaces BRANCH_NOT_FOUND (404), proving the role
// reached the handler rather than being 403'd at the gate.
describe('M4 — /admin/branches/:id/confirm-location auth + capability gate', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })

  const url = '/api/v1/admin/branches/some-branch-id/confirm-location'
  const goodBody = { latitude: 53.6463, longitude: -1.7809 }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      // Used only by the positive gate cases — branch miss → BRANCH_NOT_FOUND.
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb((app as any).prisma)),
      branch: { findUnique: vi.fn().mockResolvedValue(null) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  it('401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'POST', url, payload: goodBody })
    expect(res.statusCode).toBe(401)
  })

  it('403 ADMIN_CAPABILITY_DENIED for a role without branch:confirm-location (SUPPORT)', async () => {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
      payload: goodBody,
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('403 for FINANCE (also lacks branch:confirm-location)', async () => {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${signAdmin('FINANCE')}` },
      payload: goodBody,
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('OPERATIONS passes the capability gate (404 BRANCH_NOT_FOUND, not 403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: goodBody,
    })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_NOT_FOUND')
  })

  it('SUPER_ADMIN passes the capability gate (superuser → 404, not 403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
      payload: goodBody,
    })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_NOT_FOUND')
  })

  it('400 on an out-of-range latitude (Zod body validation, gate already passed)', async () => {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { latitude: 999, longitude: -1.78 },
    })
    expect(res.statusCode).toBe(400)
  })
})
