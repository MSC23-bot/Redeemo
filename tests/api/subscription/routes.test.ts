import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/shared/stripe', () => ({
  stripe: {
    customers: { create: vi.fn() },
    paymentMethods: { attach: vi.fn() },
    setupIntents: { create: vi.fn() },
    subscriptions: { create: vi.fn(), update: vi.fn() },
  },
}))

describe('subscription routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      subscriptionPlan: { findMany: vi.fn(), findUnique: vi.fn() },
      subscription: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      user: { findUnique: vi.fn() },
      promoCode: { findUnique: vi.fn(), update: vi.fn() },
      userVoucherCycleState: { updateMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any)
    await app.ready()
    const jwtAny = app.jwt as any
    customerToken = jwtAny.customer.sign(
      { sub: 'user-1', role: 'customer', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  it('GET /api/v1/subscription/plans returns 200 with active plans', async () => {
    const plans = [
      { id: 'p1', name: 'Monthly', priceGbp: '6.99', billingInterval: 'MONTHLY' },
      { id: 'p2', name: 'Annual', priceGbp: '69.99', billingInterval: 'ANNUAL' },
    ]
    app.prisma.subscriptionPlan.findMany = vi.fn().mockResolvedValue(plans)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/subscription/plans',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual(plans)
  })

  it('GET /api/v1/subscription/plans returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/subscription/plans' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /api/v1/subscription/me returns 200 with null when no subscription', async () => {
    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue(null)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/subscription/me',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toBeNull()
  })

  it('POST /api/v1/subscription/setup-intent returns 200 with clientSecret only (no customerId)', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue({
      id: 'user-1', email: 'test@example.com', firstName: 'Test', lastName: 'User',
    })
    const { stripe } = await import('../../../src/api/shared/stripe')
    ;(stripe.customers.create as any).mockResolvedValue({ id: 'cus_abc' })
    ;(stripe.setupIntents.create as any).mockResolvedValue({
      id: 'seti_xyz',
      client_secret: 'seti_xyz_secret_abc',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription/setup-intent',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.clientSecret).toBe('seti_xyz_secret_abc')
    // stripeCustomerId must not be exposed to the client
    expect(body.stripeCustomerId).toBeUndefined()
  })

  it('POST /api/v1/subscription returns 201 on successful subscribe', async () => {
    // Redis returns the customer ID server-side
    app.redis.get = vi.fn().mockResolvedValue('cus_abc')
    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue(null)
    app.prisma.subscriptionPlan.findUnique = vi.fn().mockResolvedValue({
      id: 'p1', isActive: true, stripePriceId: 'price_monthly',
    })
    const { stripe } = await import('../../../src/api/shared/stripe')
    ;(stripe.paymentMethods.attach as any).mockResolvedValue({})
    ;(stripe.subscriptions.create as any).mockResolvedValue({
      id: 'sub_xyz', status: 'active',
      current_period_start: 1700000000,
      current_period_end: 1702592000,
      items: { data: [{ current_period_start: 1700000000, current_period_end: 1702592000 }] },
    })
    app.prisma.subscription.create = vi.fn().mockResolvedValue({
      id: 'db-sub-1', status: 'ACTIVE', planId: 'p1',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription',
      headers: { authorization: `Bearer ${customerToken}` },
      // Note: no stripeCustomerId in payload — that comes from Redis server-side
      payload: { planId: 'p1', paymentMethodId: 'pm_abc' },
    })

    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body).status).toBe('ACTIVE')
  })

  it('POST /api/v1/subscription returns 400 without paymentMethodId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { planId: 'p1' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('POST /api/v1/subscription returns 400 if no setup session in Redis', async () => {
    app.redis.get = vi.fn().mockResolvedValue(null) // no setup session

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { planId: 'p1', paymentMethodId: 'pm_abc' },
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('PAYMENT_METHOD_REQUIRED')
  })

  it('POST /api/v1/subscription returns 409 if already subscribed', async () => {
    app.redis.get = vi.fn().mockResolvedValue('cus_abc')
    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue({ id: 's1', status: 'ACTIVE' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { planId: 'p1', paymentMethodId: 'pm_abc' },
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('SUBSCRIPTION_ALREADY_ACTIVE')
  })

  it('DELETE /api/v1/subscription returns 200 on successful cancel', async () => {
    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue({
      id: 's1', status: 'ACTIVE', stripeSubscriptionId: 'sub_xyz',
    })
    const { stripe } = await import('../../../src/api/shared/stripe')
    ;(stripe.subscriptions.update as any).mockResolvedValue({ id: 'sub_xyz' })
    app.prisma.subscription.update = vi.fn().mockResolvedValue({
      id: 's1', status: 'ACTIVE', cancelAtPeriodEnd: true,
    })

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/subscription',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).cancelAtPeriodEnd).toBe(true)
  })
})
