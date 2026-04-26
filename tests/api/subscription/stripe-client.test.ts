import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('stripe client', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake'
  })

  it('exports a stripe instance', async () => {
    const { stripe } = await import('../../../src/api/shared/stripe')
    expect(stripe).toBeDefined()
    expect(typeof stripe.subscriptions.retrieve).toBe('function')
    expect(typeof stripe.setupIntents.create).toBe('function')
  })
})
