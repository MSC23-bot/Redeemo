import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('customer plugin', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()

    // Minimal prisma stub — only auditLog is touched during these routes
    app.decorate('prisma', {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)

    // Minimal redis stub — customer auth middleware checks session
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any)

    await app.ready()

    // Sign a valid customer JWT using the app's internal JWT instance
    const jwtAny = app.jwt as any
    customerToken = jwtAny.customer.sign(
      { sub: 'user-test-1', role: 'customer', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' },
    )
  })

  afterEach(async () => {
    await app.close()
  })

  // ------------------------------------------------------------------ //
  // Open scope: health check — no token required
  // ------------------------------------------------------------------ //

  it('GET /api/v1/customer/health returns 200 without any token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/health',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })

  // ------------------------------------------------------------------ //
  // Authenticated scope: /me — requires valid customer JWT
  // ------------------------------------------------------------------ //

  it('GET /api/v1/customer/me returns 401 without token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/me',
    })

    expect(res.statusCode).toBe(401)
  })

  it('GET /api/v1/customer/me returns 200 with valid customer JWT', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/me',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.userId).toBe('user-test-1')
  })
})
