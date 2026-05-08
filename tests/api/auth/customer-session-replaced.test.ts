/**
 * One-mobile-device-per-account enforcement (PR #51 / deferred-followups
 * §AC6 + §AD). Tests pin three acceptance behaviours owner-locked
 * 2026-05-08:
 *
 *   1. `POST /auth/refresh` returns the distinct `SESSION_REPLACED`
 *      code when the previous mobile session was superseded by a newer
 *      login — NOT the generic `REFRESH_TOKEN_INVALID`.
 *   2. `authenticateCustomer` preHandler rejects Device A's still-valid
 *      access token IMMEDIATELY (not after the 15-minute JWT expiry)
 *      once Device B has signed in.
 *   3. Web sessions and legacy JWTs (no `deviceType` claim) are NOT
 *      affected — the check is mobile-only.
 *
 * Cross-ref: §AC.6 (one-mobile-device rule), §AD.2 (refresh-path
 * detection), §AD.3 (preHandler enforcement).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'
import { hashRefreshToken } from '../../../src/api/shared/tokens'

vi.mock('../../../src/api/shared/otp', async () => {
  const actual = await vi.importActual<typeof import('../../../src/api/shared/otp')>(
    '../../../src/api/shared/otp'
  )
  return {
    ...actual,
    sendOtp:               vi.fn().mockResolvedValue(undefined),
    verifyOtp:             vi.fn().mockResolvedValue({ success: true, locked: false, attemptsRemaining: 3 }),
    checkOtpRateLimit:     vi.fn().mockResolvedValue(true),
    recordOtpSend:         vi.fn().mockResolvedValue(undefined),
    checkOtpUserRateLimit: vi.fn().mockResolvedValue(true),
    recordOtpUserSend:     vi.fn().mockResolvedValue(undefined),
    clearOtpAttempts:      vi.fn().mockResolvedValue(undefined),
  }
})

const ENTITY_ID = 'u1'
const SESSION_A = 's_device_a'
const SESSION_B = 's_device_b'

describe('one-mobile-device enforcement — SESSION_REPLACED', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()

    app.decorate('prisma', {
      user:        { findUnique: vi.fn() },
      userSession: { create: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}), findFirst: vi.fn() },
      auditLog:    { create: vi.fn().mockResolvedValue({}) },
    } as any)

    app.decorate('redis', {
      get:    vi.fn().mockResolvedValue(null),
      set:    vi.fn().mockResolvedValue('OK'),
      del:    vi.fn().mockResolvedValue(1),
      incr:   vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      keys:   vi.fn().mockResolvedValue([]),
    } as any)

    await app.ready()
  })

  afterEach(async () => { await app.close() })

  // ── Refresh path: supersession detection ────────────────────────────────

  it('POST /auth/refresh returns 401 SESSION_REPLACED when UserSession.revokedReason === SUPERSEDED_BY_NEW_LOGIN', async () => {
    // Redis row for Device A's refresh-token is gone (deleted by
    // Device B login's `revokeRefreshToken(...)` call). validateRefreshToken
    // can't resolve → service falls into the supersession lookup.
    app.redis.get = vi.fn().mockResolvedValue(null)
    app.prisma.userSession.findFirst = vi.fn().mockResolvedValue({
      revokedReason: 'SUPERSEDED_BY_NEW_LOGIN',
    })

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/refresh',
      payload: { refreshToken: 'A_REFRESH', sessionId: SESSION_A, entityId: ENTITY_ID },
    })

    expect(res.statusCode).toBe(401)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('SESSION_REPLACED')
    expect(body.error.message).toMatch(/another device/i)
  })

  it('POST /auth/refresh returns 401 REFRESH_TOKEN_INVALID when UserSession is not superseded (generic expiry)', async () => {
    app.redis.get = vi.fn().mockResolvedValue(null)
    app.prisma.userSession.findFirst = vi.fn().mockResolvedValue({
      revokedReason: null,
    })

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/refresh',
      payload: { refreshToken: 'OLD_REFRESH', sessionId: SESSION_A, entityId: ENTITY_ID },
    })

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error.code).toBe('REFRESH_TOKEN_INVALID')
  })

  it('POST /auth/refresh returns 401 REFRESH_TOKEN_INVALID when no UserSession row exists', async () => {
    app.redis.get = vi.fn().mockResolvedValue(null)
    app.prisma.userSession.findFirst = vi.fn().mockResolvedValue(null)

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/refresh',
      payload: { refreshToken: 'BOGUS', sessionId: 's_unknown', entityId: ENTITY_ID },
    })

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error.code).toBe('REFRESH_TOKEN_INVALID')
  })

  it('POST /auth/refresh returns 401 SESSION_REPLACED with the distinct user-facing message', async () => {
    // Belt-and-braces — verify the locked product copy ships through
    // the error envelope, not just the code. Locked at deferred-
    // followups §AC6 / §AD1.
    app.redis.get = vi.fn().mockResolvedValue(null)
    app.prisma.userSession.findFirst = vi.fn().mockResolvedValue({
      revokedReason: 'SUPERSEDED_BY_NEW_LOGIN',
    })

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/refresh',
      payload: { refreshToken: 'A_REFRESH', sessionId: SESSION_A, entityId: ENTITY_ID },
    })

    const body = JSON.parse(res.body)
    expect(body.error.message).toBe(
      'Your account was signed in on another device, so this session has ended.',
    )
  })

  it('POST /auth/refresh issues a JWT carrying deviceType when refresh succeeds (forward-compat for preHandler)', async () => {
    // Session B's refresh is valid → service rotates and returns a
    // fresh access token. The new JWT must carry `deviceType` so the
    // preHandler can enforce the active-mobile-session check on
    // subsequent requests.
    const refreshToken = 'GOOD_REFRESH'
    const tokenHash = hashRefreshToken(refreshToken)
    app.redis.get = vi.fn().mockResolvedValue(JSON.stringify({
      tokenHash, deviceId: 'd1', deviceType: 'ios',
    }))
    app.redis.del = vi.fn().mockResolvedValue(1)
    app.redis.set = vi.fn().mockResolvedValue('OK')

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/refresh',
      payload: { refreshToken, sessionId: SESSION_B, entityId: ENTITY_ID },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.accessToken).toBeTruthy()

    // Decode the new JWT and verify deviceType is in the payload.
    const jwtAny = app.jwt as any
    const decoded = jwtAny.customer.verify(body.accessToken) as Record<string, unknown>
    expect(decoded.deviceType).toBe('ios')
    expect(decoded.sessionId).toBe(SESSION_B)
    expect(decoded.sub).toBe(ENTITY_ID)

    // Refresh MUST NOT touch the active-mobile-session pointer —
    // that's login-time only. If this regresses, two devices logging
    // in concurrently could race the active-mobile-session writes
    // through refresh and break the one-mobile-device rule.
    const setCalls = (app.redis.set as ReturnType<typeof vi.fn>).mock.calls
    const touchedActiveSession = setCalls.some(([key]) =>
      typeof key === 'string' && key.startsWith('sessions:mobile:'),
    )
    expect(touchedActiveSession).toBe(false)
  })

  // ── preHandler: stale-token immediate rejection ─────────────────────────

  it('authenticateCustomer rejects mobile JWT immediately with SESSION_REPLACED when its sessionId is not the active one', async () => {
    // Device A's still-valid mobile JWT is presented to a protected
    // route AFTER Device B has signed in. activeMobileSession Redis
    // key now holds Device B's session id. Without this preHandler
    // check, A's call would succeed for up to 15 minutes (until access
    // token expires).
    const jwtAny = app.jwt as any
    const deviceAToken = jwtAny.customer.sign(
      { sub: ENTITY_ID, role: 'customer', deviceId: 'd_a', deviceType: 'ios', sessionId: SESSION_A },
      { expiresIn: '1h' }
    )
    // Active mobile session is now B, not A → A must be rejected.
    app.redis.get = vi.fn().mockImplementation(async (key: string) =>
      key.startsWith('sessions:mobile:') ? SESSION_B : null,
    )

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/customer/auth/logout',  // any authed route
      headers: { Authorization: `Bearer ${deviceAToken}` },
      payload: { refreshToken: 'whatever' },
    })

    expect(res.statusCode).toBe(401)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('SESSION_REPLACED')
  })

  it('authenticateCustomer accepts mobile JWT when its sessionId matches the active mobile session (Device B happy path)', async () => {
    const jwtAny = app.jwt as any
    const deviceBToken = jwtAny.customer.sign(
      { sub: ENTITY_ID, role: 'customer', deviceId: 'd_b', deviceType: 'ios', sessionId: SESSION_B },
      { expiresIn: '1h' }
    )
    app.redis.get = vi.fn().mockImplementation(async (key: string) =>
      key.startsWith('sessions:mobile:') ? SESSION_B : null,
    )

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/customer/auth/logout',
      headers: { Authorization: `Bearer ${deviceBToken}` },
      payload: { refreshToken: 'whatever' },
    })

    // Pin: preHandler did NOT trip. Logout success is the deterministic
    // observable — `routes.ts` returns `{ success: true }` on the
    // happy path. A `if (statusCode === 401)` conditional would pass
    // vacuously here when the assertion never runs.
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ message: 'Logged out.' })
  })

  it('authenticateCustomer accepts web JWT (deviceType="web") even when an active mobile session exists', async () => {
    const jwtAny = app.jwt as any
    const webToken = jwtAny.customer.sign(
      { sub: ENTITY_ID, role: 'customer', deviceId: 'd_w', deviceType: 'web', sessionId: 's_web' },
      { expiresIn: '1h' }
    )
    // Active mobile session is unrelated to web sessions; the
    // preHandler MUST NOT cross-check web tokens against it.
    app.redis.get = vi.fn().mockImplementation(async (key: string) =>
      key.startsWith('sessions:mobile:') ? SESSION_B : null,
    )

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/customer/auth/logout',
      headers: { Authorization: `Bearer ${webToken}` },
      payload: { refreshToken: 'whatever' },
    })

    // Pin: preHandler did NOT trip. Conditional asserts pass vacuously.
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ message: 'Logged out.' })
  })

  it('authenticateCustomer accepts legacy JWT (no deviceType claim) — backward compat for tokens minted before this PR', async () => {
    // Legacy tokens minted by the previous backend signing path don't
    // carry `deviceType`. They must continue to verify successfully so
    // existing in-flight 15-minute access tokens don't break the
    // moment PR #51 deploys. They naturally age out at the access-
    // token TTL; future logins will mint deviceType-bearing tokens.
    const jwtAny = app.jwt as any
    const legacyToken = jwtAny.customer.sign(
      { sub: ENTITY_ID, role: 'customer', deviceId: 'd_legacy', sessionId: 's_legacy' },
      { expiresIn: '1h' }
    )
    app.redis.get = vi.fn().mockImplementation(async (key: string) =>
      key.startsWith('sessions:mobile:') ? SESSION_B : null,
    )

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/customer/auth/logout',
      headers: { Authorization: `Bearer ${legacyToken}` },
      payload: { refreshToken: 'whatever' },
    })

    // Pin: preHandler did NOT trip. Conditional asserts pass vacuously.
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ message: 'Logged out.' })
  })

  it('authenticateCustomer accepts mobile JWT when no active mobile session exists in Redis (e.g. after logout)', async () => {
    // If the user logs out cleanly the active-mobile-session Redis
    // key is cleared. A still-cached but valid access token in memory
    // would not race the absence — preHandler treats null as "no
    // enforcement target" and lets the JWT through. The next refresh
    // will fail naturally because the refresh-token Redis row is also
    // gone, and the user will be signed out at that point.
    const jwtAny = app.jwt as any
    const mobileToken = jwtAny.customer.sign(
      { sub: ENTITY_ID, role: 'customer', deviceId: 'd_a', deviceType: 'ios', sessionId: SESSION_A },
      { expiresIn: '1h' }
    )
    app.redis.get = vi.fn().mockResolvedValue(null) // no activeMobileSession set

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/customer/auth/logout',
      headers: { Authorization: `Bearer ${mobileToken}` },
      payload: { refreshToken: 'whatever' },
    })

    // Pin: preHandler did NOT trip. Conditional asserts pass vacuously.
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ message: 'Logged out.' })
  })
})
