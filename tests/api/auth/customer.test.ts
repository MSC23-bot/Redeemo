import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/shared/otp', async () => {
  const actual = await vi.importActual<typeof import('../../../src/api/shared/otp')>(
    '../../../src/api/shared/otp'
  )
  return {
    ...actual,
    sendOtp: vi.fn().mockResolvedValue(undefined),
    verifyOtp: vi.fn().mockResolvedValue({ success: true, locked: false, attemptsRemaining: 3 }),
    checkOtpRateLimit: vi.fn().mockResolvedValue(true),
    recordOtpSend: vi.fn().mockResolvedValue(undefined),
    checkOtpUserRateLimit: vi.fn().mockResolvedValue(true),
    recordOtpUserSend: vi.fn().mockResolvedValue(undefined),
    clearOtpAttempts: vi.fn().mockResolvedValue(undefined),
  }
})

const DEVICE = {
  deviceId:   '550e8400-e29b-41d4-a716-446655440000',
  deviceType: 'ios' as const,
}

describe('customer auth routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()

    app.decorate('prisma', {
      user: {
        findUnique: vi.fn(),
        create:     vi.fn(),
        update:     vi.fn(),
      },
      userSession: { create: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({}) },
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

    const jwtAny = app.jwt as any
    customerToken = jwtAny.customer.sign(
      { sub: 'u1', role: 'customer', deviceId: DEVICE.deviceId, sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  // ── Register ──────────────────────────────────────────────────────────────

  it('POST /register returns 200 with tokens + user when payload is valid', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue(null)   // email + phone both free
    app.prisma.user.create     = vi.fn().mockResolvedValue({
      id: 'u1', email: 'test@example.com', firstName: 'Test', lastName: 'User',
      phone: '+447700900000', emailVerified: false, phoneVerified: false,
    })

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/register',
      payload: {
        email: 'test@example.com', password: 'MyPass123!',
        firstName: 'Test', lastName: 'User',
        phone: '+447700900000', marketingConsent: false,
        ...DEVICE,
      },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.accessToken).toBeTruthy()
    expect(body.refreshToken).toBeTruthy()
    expect(body.user.email).toBe('test@example.com')
    expect(body.user.phone).toBe('+447700900000')
    expect(body.user.phoneVerified).toBe(false)
  })

  it('POST /register returns 409 EMAIL_ALREADY_EXISTS when verified email is taken', async () => {
    app.prisma.user.findUnique = vi.fn()
      .mockResolvedValueOnce({ id: 'u-other', emailVerified: true })  // email hit — verified
      .mockResolvedValueOnce(null)                                     // phone free
    app.prisma.user.delete = vi.fn()
    app.prisma.user.create = vi.fn()

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/register',
      payload: {
        email: 'taken@example.com', password: 'MyPass123!',
        firstName: 'Test', lastName: 'User',
        phone: '+447700900001', marketingConsent: false,
        ...DEVICE,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('EMAIL_ALREADY_EXISTS')
    expect(app.prisma.user.delete).not.toHaveBeenCalled()
    expect(app.prisma.user.create).not.toHaveBeenCalled()
  })

  it('POST /register returns 409 PHONE_ALREADY_EXISTS when verified phone is taken', async () => {
    app.prisma.user.findUnique = vi.fn()
      .mockResolvedValueOnce(null)                                     // email free
      .mockResolvedValueOnce({ id: 'u-other', emailVerified: true })  // phone hit — verified
    app.prisma.user.delete = vi.fn()
    app.prisma.user.create = vi.fn()

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/register',
      payload: {
        email: 'new@example.com', password: 'MyPass123!',
        firstName: 'Test', lastName: 'User',
        phone: '+447700900002', marketingConsent: false,
        ...DEVICE,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('PHONE_ALREADY_EXISTS')
    expect(app.prisma.user.delete).not.toHaveBeenCalled()
    expect(app.prisma.user.create).not.toHaveBeenCalled()
  })

  it('POST /register returns 409 EMAIL_ALREADY_EXISTS even when the existing email account is unverified (no auto-delete)', async () => {
    const staleUser = { id: 'u-stale', emailVerified: false }
    app.prisma.user.findUnique = vi.fn()
      .mockResolvedValueOnce(staleUser)  // email hit — unverified
      .mockResolvedValueOnce(null)       // phone free
    app.prisma.user.delete = vi.fn()
    app.prisma.user.create = vi.fn()

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/register',
      payload: {
        email: 'retry@example.com', password: 'MyPass123!',
        firstName: 'Test', lastName: 'User',
        phone: '+447700900003', marketingConsent: false,
        ...DEVICE,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('EMAIL_ALREADY_EXISTS')
    expect(app.prisma.user.delete).not.toHaveBeenCalled()
    expect(app.prisma.user.create).not.toHaveBeenCalled()
  })

  it('POST /register returns 409 PHONE_ALREADY_EXISTS even when the existing phone account is unverified (no auto-delete)', async () => {
    const staleUser = { id: 'u-stale', emailVerified: false }
    app.prisma.user.findUnique = vi.fn()
      .mockResolvedValueOnce(null)       // email free
      .mockResolvedValueOnce(staleUser)  // phone hit — unverified
    app.prisma.user.delete = vi.fn()
    app.prisma.user.create = vi.fn()

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/register',
      payload: {
        email: 'attacker@example.com', password: 'MyPass123!',
        firstName: 'Attacker', lastName: 'Tester',
        phone: '+447700900004', marketingConsent: false,
        ...DEVICE,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('PHONE_ALREADY_EXISTS')
    expect(app.prisma.user.delete).not.toHaveBeenCalled()
    expect(app.prisma.user.create).not.toHaveBeenCalled()
  })

  it('POST /register returns 400 for weak password', async () => {
    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/register',
      payload: {
        email: 'test@example.com', password: 'weak',
        firstName: 'Test', lastName: 'User',
        phone: '+447700900000', marketingConsent: false,
        ...DEVICE,
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /register returns 400 when phone is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/register',
      payload: {
        email: 'test@example.com', password: 'MyPass123!',
        firstName: 'Test', lastName: 'User',
        marketingConsent: false,
        ...DEVICE,
      },
    })
    expect(res.statusCode).toBe(400)
  })

  // ── Login ─────────────────────────────────────────────────────────────────

  it('POST /login succeeds for email-unverified user (email verification is no longer a login gate)', async () => {
    const { hashPassword } = await import('../../../src/api/shared/password')
    const hash = await hashPassword('MyPass123!')

    app.prisma.user.findUnique = vi.fn().mockResolvedValue({
      id: 'u1', email: 'test@example.com', passwordHash: hash,
      firstName: 'Test', lastName: 'User', phone: '+447700900000',
      emailVerified: false, phoneVerified: false, status: 'ACTIVE',
    })

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/login',
      payload: { email: 'test@example.com', password: 'MyPass123!', ...DEVICE },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.accessToken).toBeTruthy()
    expect(body.user.emailVerified).toBe(false)
  })

  it('POST /login succeeds for phone-unverified ACTIVE user', async () => {
    const { hashPassword } = await import('../../../src/api/shared/password')
    const hash = await hashPassword('MyPass123!')

    app.prisma.user.findUnique = vi.fn().mockResolvedValue({
      id: 'u1', email: 'test@example.com', passwordHash: hash,
      firstName: 'Test', lastName: 'User', phone: '+447700900000',
      emailVerified: true, phoneVerified: false, status: 'ACTIVE',
    })

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/login',
      payload: { email: 'test@example.com', password: 'MyPass123!', ...DEVICE },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.accessToken).toBeTruthy()
    expect(body.user.phoneVerified).toBe(false)
  })

  it('POST /login returns 403 ACCOUNT_INACTIVE when user status is INACTIVE', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue({
      id: 'u1', email: 'test@example.com', passwordHash: '$2a$12$placeholder',
      emailVerified: true, phoneVerified: true, status: 'INACTIVE',
    })

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/login',
      payload: { email: 'test@example.com', password: 'MyPass123!', ...DEVICE },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ACCOUNT_INACTIVE')
  })

  it('POST /login returns 403 ACCOUNT_SUSPENDED when user is suspended', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue({
      id: 'u1', email: 'test@example.com', passwordHash: '$2a$12$placeholder',
      emailVerified: true, phoneVerified: true, status: 'SUSPENDED',
    })

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/login',
      payload: { email: 'test@example.com', password: 'MyPass123!', ...DEVICE },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ACCOUNT_SUSPENDED')
  })

  // ── Verify phone — send ───────────────────────────────────────────────────

  it('POST /verify-phone/send returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/verify-phone/send',
      payload: {},
    })
    expect(res.statusCode).toBe(401)
  })

  it('POST /verify-phone/send returns 200 when authed user has a stored phone', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue({
      id: 'u1', phone: '+447700900000', phoneVerified: false,
    })

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/verify-phone/send',
      payload: {},
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).phone).toBe('+447700900000')
  })

  it('POST /verify-phone/send accepts a phoneNumber override', async () => {
    app.prisma.user.findUnique = vi.fn()
      .mockResolvedValueOnce({ id: 'u1', phone: '+447700900000', phoneVerified: false })
      .mockResolvedValueOnce(null) // override not taken

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/verify-phone/send',
      payload: { phoneNumber: '+447700900111' },
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).phone).toBe('+447700900111')
  })

  it('POST /verify-phone/send returns 409 ALREADY_VERIFIED when the phone is already verified', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue({
      id: 'u1', phone: '+447700900000', phoneVerified: true,
    })

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/verify-phone/send',
      payload: {},
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('ALREADY_VERIFIED')
  })

  it('POST /verify-phone/send returns 409 PHONE_ALREADY_EXISTS when override is taken by another user', async () => {
    app.prisma.user.findUnique = vi.fn()
      .mockResolvedValueOnce({ id: 'u1', phone: '+447700900000', phoneVerified: false })
      .mockResolvedValueOnce({ id: 'u-other', phone: '+447700900111' }) // override taken

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/verify-phone/send',
      payload: { phoneNumber: '+447700900111' },
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('PHONE_ALREADY_EXISTS')
  })

  it('POST /verify-phone/send returns 429 when per-user OTP rate limit is exceeded', async () => {
    const otp = await import('../../../src/api/shared/otp')
    ;(otp.checkOtpUserRateLimit as any).mockResolvedValueOnce(false)

    app.prisma.user.findUnique = vi.fn().mockResolvedValue({
      id: 'u1', phone: '+447700900000', phoneVerified: false,
    })

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/verify-phone/send',
      payload: {},
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(429)
    expect(JSON.parse(res.body).error.code).toBe('OTP_MAX_ATTEMPTS')
  })

  // ── Verify phone — confirm ────────────────────────────────────────────────

  it('POST /verify-phone/confirm returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/verify-phone/confirm',
      payload: { code: '123456' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('POST /verify-phone/confirm returns 409 ALREADY_VERIFIED when phone is already verified', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue({
      id: 'u1', phone: '+447700900000', phoneVerified: true,
    })

    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/customer/auth/verify-phone/confirm',
      payload: { code: '123456' },
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('ALREADY_VERIFIED')
  })
})
