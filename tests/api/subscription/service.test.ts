import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppError } from '../../../src/api/shared/errors'

vi.mock('../../../src/api/shared/stripe', () => ({
  stripe: {
    customers: { create: vi.fn() },
    paymentMethods: { attach: vi.fn() },
    setupIntents: { create: vi.fn() },
    subscriptions: { create: vi.fn(), update: vi.fn() },
  },
}))

import { stripe } from '../../../src/api/shared/stripe'
import {
  getActivePlans,
  getMySubscription,
  createSetupIntent,
  createSubscription,
  cancelSubscription,
} from '../../../src/api/subscription/service'

const mockPrisma = () => ({
  subscriptionPlan: { findMany: vi.fn(), findUnique: vi.fn() },
  subscription: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
  promoCode: { findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn().mockResolvedValue({}) },
} as any)

const mockRedis = () => ({
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn(),
  del: vi.fn().mockResolvedValue(1),
} as any)

describe('getActivePlans', () => {
  it('returns active plans ordered by sortOrder', async () => {
    const prisma = mockPrisma()
    const plans = [
      { id: 'p1', name: 'Monthly', priceGbp: 6.99, billingInterval: 'MONTHLY', isActive: true, sortOrder: 1 },
      { id: 'p2', name: 'Annual', priceGbp: 69.99, billingInterval: 'ANNUAL', isActive: true, sortOrder: 2 },
    ]
    prisma.subscriptionPlan.findMany.mockResolvedValue(plans)

    const result = await getActivePlans(prisma)

    expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })
    expect(result).toEqual(plans)
  })
})

describe('getMySubscription', () => {
  it('returns null when user has no subscription', async () => {
    const prisma = mockPrisma()
    prisma.subscription.findUnique.mockResolvedValue(null)

    const result = await getMySubscription(prisma, 'user-1')

    expect(result).toBeNull()
  })

  it('returns the subscription with plan details', async () => {
    const prisma = mockPrisma()
    const sub = { id: 's1', status: 'ACTIVE', plan: { name: 'Monthly' } }
    prisma.subscription.findUnique.mockResolvedValue(sub)

    const result = await getMySubscription(prisma, 'user-1')

    expect(result).toEqual(sub)
  })
})

describe('createSetupIntent', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('creates Stripe customer, stores customerId in Redis, returns only clientSecret', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1', email: 'test@example.com', firstName: 'Test', lastName: 'User',
      stripeCustomerId: null,
    })
    ;(stripe.customers.create as any).mockResolvedValue({ id: 'cus_abc' })
    ;(stripe.setupIntents.create as any).mockResolvedValue({
      id: 'seti_xyz',
      client_secret: 'seti_xyz_secret_abc',
    })

    const result = await createSetupIntent(prisma, redis, 'user-1')

    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: 'test@example.com',
      name: 'Test User',
      metadata: { userId: 'user-1' },
    })
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { stripeCustomerId: 'cus_abc' },
    })
    expect(redis.set).toHaveBeenCalledWith('sub:setup:user-1', 'cus_abc', 'EX', 3600)
    // stripeCustomerId must NOT be in the returned object
    expect(result).toEqual({ clientSecret: 'seti_xyz_secret_abc' })
    expect((result as any).stripeCustomerId).toBeUndefined()
  })

  it('reuses existing Stripe customer without creating a new one', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1', email: 'test@example.com', firstName: 'Test', lastName: 'User',
      stripeCustomerId: 'cus_existing',
    })
    ;(stripe.setupIntents.create as any).mockResolvedValue({
      id: 'seti_xyz',
      client_secret: 'seti_xyz_secret_abc',
    })

    const result = await createSetupIntent(prisma, redis, 'user-1')

    expect(stripe.customers.create).not.toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(redis.set).toHaveBeenCalledWith('sub:setup:user-1', 'cus_existing', 'EX', 3600)
    expect(result).toEqual({ clientSecret: 'seti_xyz_secret_abc' })
  })
})

describe('createSubscription', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws PAYMENT_METHOD_REQUIRED if Redis has no customer ID for user', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null) // no setup session

    await expect(
      createSubscription(
        prisma, redis, 'user-1',
        { planId: 'p1', paymentMethodId: 'pm_abc' },
        { ipAddress: '127.0.0.1', userAgent: 'test' }
      )
    ).rejects.toThrow('PAYMENT_METHOD_REQUIRED')
  })

  it('throws SUBSCRIPTION_ALREADY_ACTIVE if user already has active subscription', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue('cus_abc')
    prisma.subscription.findUnique.mockResolvedValue({ id: 's1', status: 'ACTIVE' })

    await expect(
      createSubscription(
        prisma, redis, 'user-1',
        { planId: 'p1', paymentMethodId: 'pm_abc' },
        { ipAddress: '127.0.0.1', userAgent: 'test' }
      )
    ).rejects.toThrow('SUBSCRIPTION_ALREADY_ACTIVE')
  })

  it('throws PLAN_NOT_FOUND if plan does not exist', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue('cus_abc')
    prisma.subscription.findUnique.mockResolvedValue(null)
    prisma.subscriptionPlan.findUnique.mockResolvedValue(null)

    await expect(
      createSubscription(
        prisma, redis, 'user-1',
        { planId: 'bad-plan', paymentMethodId: 'pm_abc' },
        { ipAddress: '127.0.0.1', userAgent: 'test' }
      )
    ).rejects.toThrow('PLAN_NOT_FOUND')
  })

  it('throws PROMO_CODE_INVALID if promo code not found', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue('cus_abc')
    prisma.subscription.findUnique.mockResolvedValue(null)
    prisma.subscriptionPlan.findUnique.mockResolvedValue({ id: 'p1', isActive: true, stripePriceId: 'price_123' })
    prisma.promoCode.findUnique.mockResolvedValue(null)

    await expect(
      createSubscription(
        prisma, redis, 'user-1',
        { planId: 'p1', paymentMethodId: 'pm_abc', promoCode: 'BADCODE' },
        { ipAddress: '127.0.0.1', userAgent: 'test' }
      )
    ).rejects.toThrow('PROMO_CODE_INVALID')
  })

  it('reads customerId from Redis, attaches payment method, creates subscription, deletes Redis key', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue('cus_abc') // resolved from Redis, NOT from client
    prisma.subscription.findUnique.mockResolvedValue(null)
    prisma.subscriptionPlan.findUnique.mockResolvedValue({
      id: 'p1', isActive: true, stripePriceId: 'price_monthly',
    })
    ;(stripe.paymentMethods.attach as any).mockResolvedValue({})
    ;(stripe.subscriptions.create as any).mockResolvedValue({
      id: 'sub_xyz', status: 'active',
      items: { data: [{ current_period_start: 1700000000, current_period_end: 1702592000 }] },
    })
    prisma.subscription.create.mockResolvedValue({ id: 'db-sub-1', status: 'ACTIVE' })

    const result = await createSubscription(
      prisma, redis, 'user-1',
      { planId: 'p1', paymentMethodId: 'pm_abc' },
      { ipAddress: '127.0.0.1', userAgent: 'test' }
    )

    expect(redis.get).toHaveBeenCalledWith('sub:setup:user-1')
    expect(stripe.paymentMethods.attach).toHaveBeenCalledWith('pm_abc', { customer: 'cus_abc' })
    expect(stripe.subscriptions.create).toHaveBeenCalledWith({
      customer: 'cus_abc',
      items: [{ price: 'price_monthly' }],
      default_payment_method: 'pm_abc',
      expand: ['latest_invoice.payment_intent'],
    })
    expect(redis.del).toHaveBeenCalledWith('sub:setup:user-1')
    expect(prisma.subscription.create).toHaveBeenCalled()
    expect(result).toEqual({ id: 'db-sub-1', status: 'ACTIVE' })
  })

  it('applies promo via stripeCouponId when provided', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue('cus_abc')
    prisma.subscription.findUnique.mockResolvedValue(null)
    prisma.subscriptionPlan.findUnique.mockResolvedValue({
      id: 'p1', isActive: true, stripePriceId: 'price_monthly',
    })
    prisma.promoCode.findUnique.mockResolvedValue({
      id: 'promo-1', isActive: true, expiresAt: null,
      maxUses: null, usesCount: 0,
      stripeCouponId: 'cpn_summer20',
    })
    ;(stripe.paymentMethods.attach as any).mockResolvedValue({})
    ;(stripe.subscriptions.create as any).mockResolvedValue({
      id: 'sub_xyz', status: 'active',
      items: { data: [{ current_period_start: 1700000000, current_period_end: 1702592000 }] },
    })
    prisma.subscription.create.mockResolvedValue({ id: 'db-sub-1', status: 'ACTIVE' })
    prisma.promoCode.update.mockResolvedValue({})

    await createSubscription(
      prisma, redis, 'user-1',
      { planId: 'p1', paymentMethodId: 'pm_abc', promoCode: 'SUMMER20' },
      { ipAddress: '127.0.0.1', userAgent: 'test' }
    )

    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        discounts: [{ coupon: 'cpn_summer20' }],
      })
    )
  })
})

describe('cancelSubscription', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws SUBSCRIPTION_NOT_FOUND if no subscription', async () => {
    const prisma = mockPrisma()
    prisma.subscription.findUnique.mockResolvedValue(null)

    await expect(
      cancelSubscription(prisma, 'user-1', { ipAddress: '127.0.0.1', userAgent: 'test' })
    ).rejects.toThrow('SUBSCRIPTION_NOT_FOUND')
  })

  it('throws SUBSCRIPTION_NOT_CANCELLABLE if already cancelled', async () => {
    const prisma = mockPrisma()
    prisma.subscription.findUnique.mockResolvedValue({
      id: 's1', status: 'CANCELLED', stripeSubscriptionId: 'sub_xyz',
    })

    await expect(
      cancelSubscription(prisma, 'user-1', { ipAddress: '127.0.0.1', userAgent: 'test' })
    ).rejects.toThrow('SUBSCRIPTION_NOT_CANCELLABLE')
  })

  it('sets cancelAtPeriodEnd on Stripe and updates DB', async () => {
    const prisma = mockPrisma()
    prisma.subscription.findUnique.mockResolvedValue({
      id: 's1', status: 'ACTIVE', stripeSubscriptionId: 'sub_xyz',
    })
    ;(stripe.subscriptions.update as any).mockResolvedValue({ id: 'sub_xyz' })
    prisma.subscription.update.mockResolvedValue({ id: 's1', status: 'ACTIVE', cancelAtPeriodEnd: true })

    const result = await cancelSubscription(prisma, 'user-1', { ipAddress: '127.0.0.1', userAgent: 'test' })

    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_xyz', { cancel_at_period_end: true })
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { cancelAtPeriodEnd: true, cancelledAt: expect.any(Date) },
    })
    expect(result.cancelAtPeriodEnd).toBe(true)
  })
})
