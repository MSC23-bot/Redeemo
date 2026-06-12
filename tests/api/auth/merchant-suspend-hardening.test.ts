import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// H1/G2 — merchant suspend / session-revocation hardening.
//   1. authenticateMerchant rejects a token whose session was revoked (admin
//      suspension / logout / password-reset) with 401 SESSION_REVOKED, before the
//      access-token TTL expires — distinct from a merely-expired token.
//   2. The self-service deactivate/reactivate routes refuse a SUSPENDED merchant
//      with 403 MERCHANT_SUSPENDED, closing the deactivate->reactivate escape.
// These are mocked route tests (no DB): the decorator's `redis.exists` and the
// routes' `getOwnerMembership` (merchantMembership.findFirst) are stubbed.

describe('H1/G2 — merchant suspend/session-revocation hardening', () => {
  let app: FastifyInstance
  const ADMIN = 'ma-1'
  const SESSION = 'sess-1'

  const signMerchant = (over: Record<string, unknown> = {}) =>
    (app.jwt as any).merchant.sign(
      { sub: ADMIN, role: 'merchant', deviceId: 'd1', sessionId: SESSION, ...over },
      { expiresIn: '1h' }
    )

  const membership = (status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE') => ({
    id: 'mm1', merchantId: 'm1', merchantAdminId: ADMIN,
    merchant: { status, businessName: 'Test Co' },
  })

  const auth = () => ({ authorization: `Bearer ${signMerchant()}` })

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchantMembership: { findFirst: vi.fn() },
      merchant:           { update: vi.fn().mockResolvedValue({}) },
      auditLog:           { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get:    vi.fn().mockResolvedValue(null),
      set:    vi.fn().mockResolvedValue('OK'),
      del:    vi.fn().mockResolvedValue(1),
      keys:   vi.fn().mockResolvedValue([]),
      exists: vi.fn().mockResolvedValue(1), // session live by default
    } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  // ── authenticateMerchant: session-revocation awareness ──────────────────────

  it('rejects a protected route with 401 SESSION_REVOKED when the session refresh token is gone', async () => {
    app.prisma.merchantMembership.findFirst = vi.fn().mockResolvedValue(membership('ACTIVE'))
    app.redis.exists = vi.fn().mockResolvedValue(0) // revoked by suspend/logout/pwd-reset

    const res = await app.inject({ method: 'POST', url: '/api/v1/merchant/auth/deactivate', headers: auth() })

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error.code).toBe('SESSION_REVOKED')
    // The route never runs — revocation is enforced at the decorator.
    expect(app.prisma.merchantMembership.findFirst).not.toHaveBeenCalled()
    expect(app.prisma.merchant.update).not.toHaveBeenCalled()
    expect(app.redis.exists).toHaveBeenCalledWith('refresh:merchant:ma-1:sess-1')
  })

  it('rejects a token with no sessionId claim as 401 REFRESH_TOKEN_INVALID (malformed/legacy)', async () => {
    const token = signMerchant({ sessionId: undefined })
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/auth/deactivate',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error.code).toBe('REFRESH_TOKEN_INVALID')
  })

  it('allows a live session (refresh token exists) to reach the protected route', async () => {
    app.prisma.merchantMembership.findFirst = vi.fn().mockResolvedValue(membership('ACTIVE'))
    app.redis.exists = vi.fn().mockResolvedValue(1)

    const res = await app.inject({ method: 'POST', url: '/api/v1/merchant/auth/deactivate', headers: auth() })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.merchant.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'INACTIVE' } })
  })

  // ── self-service suspension escape: blocked ─────────────────────────────────

  it('blocks self-deactivate for a SUSPENDED merchant with 403 MERCHANT_SUSPENDED (escape step 1)', async () => {
    app.prisma.merchantMembership.findFirst = vi.fn().mockResolvedValue(membership('SUSPENDED'))

    const res = await app.inject({ method: 'POST', url: '/api/v1/merchant/auth/deactivate', headers: auth() })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_SUSPENDED')
    expect(app.prisma.merchant.update).not.toHaveBeenCalled()
  })

  it('blocks self-reactivate for a SUSPENDED merchant with 403 MERCHANT_SUSPENDED (escape step 2)', async () => {
    app.prisma.merchantMembership.findFirst = vi.fn().mockResolvedValue(membership('SUSPENDED'))

    const res = await app.inject({ method: 'POST', url: '/api/v1/merchant/auth/reactivate', headers: auth() })

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_SUSPENDED')
    expect(app.prisma.merchant.update).not.toHaveBeenCalled()
  })

  // ── no regression: legitimate self-deactivate / reactivate still work ───────

  it('still allows a self-deactivated INACTIVE merchant to reactivate (no regression)', async () => {
    app.prisma.merchantMembership.findFirst = vi.fn().mockResolvedValue(membership('INACTIVE'))

    const res = await app.inject({ method: 'POST', url: '/api/v1/merchant/auth/reactivate', headers: auth() })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.merchant.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'ACTIVE' } })
  })

  it('reactivate on an already-ACTIVE merchant is an idempotent no-op (no regression)', async () => {
    app.prisma.merchantMembership.findFirst = vi.fn().mockResolvedValue(membership('ACTIVE'))

    const res = await app.inject({ method: 'POST', url: '/api/v1/merchant/auth/reactivate', headers: auth() })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).message).toMatch(/already active/i)
    expect(app.prisma.merchant.update).not.toHaveBeenCalled()
  })
})
