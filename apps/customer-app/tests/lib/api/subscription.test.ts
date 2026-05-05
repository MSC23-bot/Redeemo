import { api } from '@/lib/api'
import { subscriptionApi } from '@/lib/api/subscription'

jest.spyOn(api, 'get')

// Backend response shape captured live from a real
// /api/v1/subscription/me probe (ACTIVE customer, Prisma-rendered).
// The critical detail is `priceGbp: "6.99"` — a STRING. Prisma's
// `Decimal` type serialises to JSON as a string by default; the
// customer-app schema must coerce it back to a number, otherwise
// `safeParse` fails silently and `useSubscription` reports the
// authenticated user as a free user.
const ACTIVE_RESPONSE_DECIMAL_AS_STRING = {
  id: '609845a7-861b-423d-8b89-31c59cfcc0a9',
  status: 'ACTIVE' as const,
  currentPeriodStart: '2026-05-05T21:14:31.410Z',
  currentPeriodEnd: '2027-05-05T21:14:31.410Z',
  cancelAtPeriodEnd: false,
  promoCodeId: null,
  plan: {
    id: '35235ad8-41f4-4b3f-bcd5-15bdcfe717ce',
    name: 'Monthly',
    billingInterval: 'MONTHLY' as const,
    priceGbp: '6.99',                      // ← STRING (Prisma Decimal default)
  },
}

// Mirror of the same response with priceGbp as a real number — proves
// the schema still works if the backend serialiser ever changes (e.g.
// a future `Number(decimal)` coercion server-side, or migrating the
// column off Decimal). The schema's `z.coerce.number()` should accept
// both shapes uniformly.
const ACTIVE_RESPONSE_PRICE_AS_NUMBER = {
  ...ACTIVE_RESPONSE_DECIMAL_AS_STRING,
  plan: {
    ...ACTIVE_RESPONSE_DECIMAL_AS_STRING.plan,
    priceGbp: 6.99,                        // ← NUMBER
  },
}

describe('subscriptionApi.getMySubscription', () => {
  beforeEach(() => { (api.get as jest.Mock).mockReset() })

  it('parses an ACTIVE response when priceGbp arrives as a JSON STRING (Prisma Decimal default)', async () => {
    (api.get as jest.Mock).mockResolvedValue(ACTIVE_RESPONSE_DECIMAL_AS_STRING)
    const sub = await subscriptionApi.getMySubscription()
    expect(sub).not.toBeNull()
    expect(sub!.status).toBe('ACTIVE')
    expect(sub!.plan.priceGbp).toBe(6.99)         // coerced to number
    expect(typeof sub!.plan.priceGbp).toBe('number')
  })

  it('parses an ACTIVE response when priceGbp arrives as a real NUMBER', async () => {
    (api.get as jest.Mock).mockResolvedValue(ACTIVE_RESPONSE_PRICE_AS_NUMBER)
    const sub = await subscriptionApi.getMySubscription()
    expect(sub).not.toBeNull()
    expect(sub!.plan.priceGbp).toBe(6.99)
    expect(typeof sub!.plan.priceGbp).toBe('number')
  })

  it('returns null when the response is null (free user — no Subscription row)', async () => {
    (api.get as jest.Mock).mockResolvedValue(null)
    const sub = await subscriptionApi.getMySubscription()
    expect(sub).toBeNull()
  })

  it('returns null on truly malformed response (defensive — graceful free-user fallback)', async () => {
    (api.get as jest.Mock).mockResolvedValue({ status: 'NOT_A_REAL_STATUS', plan: {} })
    const sub = await subscriptionApi.getMySubscription()
    expect(sub).toBeNull()
  })

  it('coerces non-numeric-string priceGbp to NaN — and the schema rejects it', async () => {
    // `z.coerce.number()` returns NaN for non-numeric strings, which Zod
    // then rejects with the `nan` rule (default for z.number). Prove
    // `safeParse` still fails cleanly so we don't accidentally surface a
    // bogus subscription with priceGbp=NaN to the UI.
    (api.get as jest.Mock).mockResolvedValue({
      ...ACTIVE_RESPONSE_DECIMAL_AS_STRING,
      plan: { ...ACTIVE_RESPONSE_DECIMAL_AS_STRING.plan, priceGbp: 'not-a-number' },
    })
    const sub = await subscriptionApi.getMySubscription()
    expect(sub).toBeNull()
  })
})
