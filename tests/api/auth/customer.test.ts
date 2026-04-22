import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/shared/stripe', () => ({
  stripe: {
    subscriptions: { cancel: vi.fn().mockResolvedValue({}) },
  },
}))

describe('customer auth routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()

    // Inject mock prisma
    app.decorate('prisma', {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      subscription: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
      userSession: { create: vi.fn(), updateMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)

    // Inject mock redis
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
    } as any)

    await app.ready()
    const jwtAny = app.jwt as any
    customerToken = jwtAny.customer.sign(
      { sub: 'user-del-1', role: 'customer', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  it('POST /api/v1/customer/auth/register returns 200 with valid payload', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue(null) // email not taken
    app.prisma.user.create = vi.fn().mockResolvedValue({ id: 'u1', email: 'test@example.com' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'MyPass123!',
        firstName: 'Test',
        lastName: 'User',
        marketingConsent: false,
      },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).message).toContain('email')
  })

  it('POST /api/v1/customer/auth/register returns 409 if email taken', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue({ id: 'u1' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/auth/register',
      payload: {
        email: 'taken@example.com',
        password: 'MyPass123!',
        firstName: 'Test',
        lastName: 'User',
        marketingConsent: false,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('EMAIL_ALREADY_EXISTS')
  })

  it('POST /api/v1/customer/auth/register returns 400 for weak password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'weak',
        firstName: 'Test',
        lastName: 'User',
        marketingConsent: false,
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST /api/v1/customer/auth/login returns 403 for unverified account', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue({
      id: 'u1',
      email: 'test@example.com',
      passwordHash: '$2a$12$placeholder',
      emailVerified: false,
      phoneVerified: false,
      status: 'ACTIVE',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/auth/login',
      payload: {
        email: 'test@example.com',
        password: 'MyPass123!',
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        deviceType: 'ios',
      },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ACCOUNT_NOT_ACTIVE')
  })

  it('POST /delete-account calls stripe.subscriptions.cancel when subscription has stripeSubscriptionId', async () => {
    const { stripe } = await import('../../../src/api/shared/stripe')

    // Subscription with an active Stripe subscription
    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue({
      stripeSubscriptionId: 'sub_test123',
      status: 'ACTIVE',
    })
    app.prisma.subscription.update = vi.fn().mockResolvedValue({})
    app.prisma.user.update = vi.fn().mockResolvedValue({})

    // actionToken: redis returns stored token matching what we send
    const storedToken = 'valid-action-token'
    app.redis.get = vi.fn().mockResolvedValue(storedToken)
    app.redis.del = vi.fn().mockResolvedValue(1)
    app.redis.keys = vi.fn().mockResolvedValue([])

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/auth/delete-account',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { actionToken: storedToken },
    })

    expect(res.statusCode).toBe(200)
    expect((stripe.subscriptions.cancel as any)).toHaveBeenCalledWith('sub_test123')
    expect(app.prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      })
    )
  })

  it('POST /delete-account does NOT call stripe.subscriptions.cancel when no stripeSubscriptionId', async () => {
    const { stripe } = await import('../../../src/api/shared/stripe')
    ;(stripe.subscriptions.cancel as any).mockClear()

    // Subscription with no Stripe ID (e.g. admin-granted)
    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue({
      stripeSubscriptionId: null,
      status: 'ACTIVE',
    })
    app.prisma.subscription.update = vi.fn().mockResolvedValue({})
    app.prisma.user.update = vi.fn().mockResolvedValue({})

    const storedToken = 'valid-action-token-2'
    app.redis.get = vi.fn().mockResolvedValue(storedToken)
    app.redis.del = vi.fn().mockResolvedValue(1)
    app.redis.keys = vi.fn().mockResolvedValue([])

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/auth/delete-account',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { actionToken: storedToken },
    })

    expect(res.statusCode).toBe(200)
    expect(stripe.subscriptions.cancel as any).not.toHaveBeenCalled()
  })

  it('POST /delete-account does NOT call stripe.subscriptions.cancel when subscription already CANCELLED', async () => {
    const { stripe } = await import('../../../src/api/shared/stripe')
    ;(stripe.subscriptions.cancel as any).mockClear()

    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue({
      stripeSubscriptionId: 'sub_already_done',
      status: 'CANCELLED',
    })
    app.prisma.subscription.update = vi.fn().mockResolvedValue({})
    app.prisma.user.update = vi.fn().mockResolvedValue({})

    const storedToken = 'valid-action-token-3'
    app.redis.get = vi.fn().mockResolvedValue(storedToken)
    app.redis.del = vi.fn().mockResolvedValue(1)
    app.redis.keys = vi.fn().mockResolvedValue([])

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/auth/delete-account',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { actionToken: storedToken },
    })

    expect(res.statusCode).toBe(200)
    expect(stripe.subscriptions.cancel as any).not.toHaveBeenCalled()
  })

  it('POST /delete-account still succeeds when stripe.subscriptions.cancel fails', async () => {
    const { stripe } = await import('../../../src/api/shared/stripe')
    ;(stripe.subscriptions.cancel as any).mockRejectedValueOnce(new Error('network'))

    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue({
      stripeSubscriptionId: 'sub_fail',
      status: 'ACTIVE',
    })
    app.prisma.subscription.update = vi.fn().mockResolvedValue({})
    app.prisma.user.update = vi.fn().mockResolvedValue({})

    const storedToken = 'valid-action-token-4'
    app.redis.get = vi.fn().mockResolvedValue(storedToken)
    app.redis.del = vi.fn().mockResolvedValue(1)
    app.redis.keys = vi.fn().mockResolvedValue([])

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/auth/delete-account',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { actionToken: storedToken },
    })

    expect(res.statusCode).toBe(200)
    expect(stripe.subscriptions.cancel as any).toHaveBeenCalledWith('sub_fail')
    // User anonymisation STILL ran despite Stripe failure
    expect(app.prisma.user.update).toHaveBeenCalled()
  })
})
