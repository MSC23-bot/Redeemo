import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/shared/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}))

describe('Stripe webhook handler', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      subscription: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      userVoucherCycleState: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      del: vi.fn(),
    } as any)
    await app.ready()
  })

  afterEach(async () => { await app.close() })

  it('returns 400 with WEBHOOK_SIGNATURE_INVALID when stripe signature check fails', async () => {
    const { stripe } = await import('../../../src/api/shared/stripe')
    ;(stripe.webhooks.constructEvent as any).mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload.')
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/stripe/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 'invalid-sig',
      },
      payload: JSON.stringify({ type: 'test' }),
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('WEBHOOK_SIGNATURE_INVALID')
  })

  it('returns 200 and ignores unknown event types', async () => {
    const { stripe } = await import('../../../src/api/shared/stripe')
    ;(stripe.webhooks.constructEvent as any).mockReturnValue({
      type: 'some.unknown.event',
      data: { object: {} },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/stripe/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 'valid-sig',
      },
      payload: JSON.stringify({ type: 'some.unknown.event' }),
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ received: true })
  })

  it('handles customer.subscription.deleted — calls prisma.subscription.update with status CANCELLED', async () => {
    const { stripe } = await import('../../../src/api/shared/stripe')
    ;(stripe.webhooks.constructEvent as any).mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_xyz',
          status: 'canceled',
          current_period_start: 1700000000,
          current_period_end: 1702592000,
        },
      },
    })
    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue({
      id: 'db-sub-1',
      userId: 'user-1',
      stripeSubscriptionId: 'sub_xyz',
    })
    app.prisma.subscription.update = vi.fn().mockResolvedValue({ id: 'db-sub-1', status: 'CANCELLED' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/stripe/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 'valid-sig',
      },
      payload: JSON.stringify({ type: 'customer.subscription.deleted' }),
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      })
    )
  })

  it('handles invoice.payment_succeeded with billing_reason subscription_cycle — calls prisma.userVoucherCycleState.updateMany', async () => {
    const { stripe } = await import('../../../src/api/shared/stripe')
    ;(stripe.webhooks.constructEvent as any).mockReturnValue({
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'in_abc',
          billing_reason: 'subscription_cycle',
          subscription: 'sub_xyz',
        },
      },
    })
    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue({
      id: 'db-sub-1',
      userId: 'user-1',
      stripeSubscriptionId: 'sub_xyz',
    })
    app.prisma.userVoucherCycleState.updateMany = vi.fn().mockResolvedValue({ count: 2 })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/stripe/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 'valid-sig',
      },
      payload: JSON.stringify({ type: 'invoice.payment_succeeded' }),
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.userVoucherCycleState.updateMany).toHaveBeenCalled()
  })

  it('handles invoice.payment_failed — calls prisma.subscription.update with status PAST_DUE', async () => {
    const { stripe } = await import('../../../src/api/shared/stripe')
    ;(stripe.webhooks.constructEvent as any).mockReturnValue({
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_fail',
          subscription: 'sub_xyz',
        },
      },
    })
    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue({
      id: 'db-sub-1',
      userId: 'user-1',
      stripeSubscriptionId: 'sub_xyz',
    })
    app.prisma.subscription.update = vi.fn().mockResolvedValue({ id: 'db-sub-1', status: 'PAST_DUE' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/stripe/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 'invalid-sig',
      },
      payload: JSON.stringify({ type: 'invoice.payment_failed' }),
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAST_DUE' }),
      })
    )
  })
})
