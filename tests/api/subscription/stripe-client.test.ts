import { describe, it, expect } from 'vitest'

describe('stripe client', () => {
  it('exports a stripe instance', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake'
    const { stripe } = await import('../../../src/api/shared/stripe')
    expect(stripe).toBeDefined()
    expect(typeof stripe.subscriptions.retrieve).toBe('function')
    expect(typeof stripe.setupIntents.create).toBe('function')
  })
})
