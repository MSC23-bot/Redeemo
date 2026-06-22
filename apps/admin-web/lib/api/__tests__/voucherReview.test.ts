/**
 * lib/api/voucherReview: Zod schema parsing + apiFetch wiring (Day-2 Vouchers PR-C).
 *
 * Mirrors lib/api/__tests__/review.test.ts. Validates the VoucherReviewContext
 * schema and the four endpoint wrappers (get / approve / reject / requestChanges)
 * against the PR-A voucherApprover contract.
 */
import {
  voucherReviewApi,
  voucherReviewContextSchema,
} from '../voucherReview'

// ── Mock apiFetch ─────────────────────────────────────────────────────────────

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
}))

import { apiFetch } from '../client'

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeContext() {
  return {
    voucher: {
      id: 'v-1',
      title: '20% off all mains',
      type: 'DISCOUNT',
      status: 'PENDING_APPROVAL',
      approvalStatus: 'PENDING',
      description: 'Enjoy 20% off your main course.',
      terms: 'One per customer.',
      estimatedSaving: 6.5,
      expiryDate: null,
      cooldownSeconds: null,
      merchantFields: { askHelp: true, builderType: 'discount' },
      availabilityWindows: [] as { dayOfWeek: number; openTime: string; closeTime: string }[],
    },
    merchant: { id: 'm-1', businessName: 'Acme Coffee', status: 'ACTIVE' },
    goLive: true,
  }
}

// ── Schema tests ──────────────────────────────────────────────────────────────

describe('voucherReviewContextSchema', () => {
  it('parses a valid voucher review context', () => {
    const ctx = makeContext()
    const parsed = voucherReviewContextSchema.parse(ctx)
    expect(parsed.voucher.id).toBe('v-1')
    expect(parsed.voucher.estimatedSaving).toBe(6.5)
    expect(parsed.merchant?.businessName).toBe('Acme Coffee')
    expect(parsed.goLive).toBe(true)
  })

  it('allows merchant to be null', () => {
    const ctx = { ...makeContext(), merchant: null }
    const parsed = voucherReviewContextSchema.parse(ctx)
    expect(parsed.merchant).toBeNull()
  })

  it('allows nullable description / terms / expiryDate / cooldownSeconds and null merchantFields', () => {
    const ctx = makeContext()
    const bag = {
      ...ctx,
      voucher: {
        ...ctx.voucher,
        description: null,
        terms: null,
        expiryDate: '2026-12-31T23:59:59.000Z',
        cooldownSeconds: 86400,
        merchantFields: null,
      },
    }
    const parsed = voucherReviewContextSchema.parse(bag)
    expect(parsed.voucher.description).toBeNull()
    expect(parsed.voucher.terms).toBeNull()
    expect(parsed.voucher.expiryDate).toBe('2026-12-31T23:59:59.000Z')
    expect(parsed.voucher.cooldownSeconds).toBe(86400)
    expect(parsed.voucher.merchantFields).toBeNull()
  })

  it('degrades a non-object merchantFields (array / scalar) to null instead of crashing', () => {
    const ctx = makeContext()
    // The backend passes the raw Prisma Json column through; a non-object Json
    // (array or scalar) must not fail z.record and crash the whole panel into
    // its error state. The schema .catch(null)s it to a benign null.
    for (const bad of [['not', 'an', 'object'], 'a string', 42, true]) {
      const parsed = voucherReviewContextSchema.parse({
        ...ctx,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        voucher: { ...ctx.voucher, merchantFields: bad as any },
      })
      expect(parsed.voucher.merchantFields).toBeNull()
    }
  })

  it('parses availability windows for a TIME_LIMITED voucher', () => {
    const ctx = makeContext()
    const bag = {
      ...ctx,
      voucher: {
        ...ctx.voucher,
        type: 'TIME_LIMITED',
        availabilityWindows: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00' }],
      },
    }
    const parsed = voucherReviewContextSchema.parse(bag)
    expect(parsed.voucher.availabilityWindows).toHaveLength(1)
    expect(parsed.voucher.availabilityWindows[0].openTime).toBe('09:00')
  })

  it('throws on a missing required voucher field', () => {
    const ctx = makeContext()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = { ...ctx, voucher: { ...ctx.voucher, id: undefined } } as any
    expect(() => voucherReviewContextSchema.parse(bad)).toThrow()
  })
})

// ── voucherReviewApi.get ──────────────────────────────────────────────────────

describe('voucherReviewApi.get', () => {
  afterEach(() => jest.clearAllMocks())

  it('calls apiFetch with the correct URL and auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce(makeContext())
    await voucherReviewApi.get('apr-1')
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/approvals/apr-1/voucher-review',
      { auth: true },
    )
  })

  it('returns the parsed VoucherReviewContext', async () => {
    mockedApiFetch.mockResolvedValueOnce(makeContext())
    const result = await voucherReviewApi.get('apr-1')
    expect(result.voucher.title).toBe('20% off all mains')
    expect(result.goLive).toBe(true)
  })

  it('propagates apiFetch errors', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('Network error'))
    await expect(voucherReviewApi.get('apr-1')).rejects.toThrow('Network error')
  })

  it('throws when the response does not match the schema', async () => {
    mockedApiFetch.mockResolvedValueOnce({ not: 'a voucher review context' })
    await expect(voucherReviewApi.get('apr-1')).rejects.toThrow()
  })
})

// ── voucherReviewApi.approve ──────────────────────────────────────────────────

describe('voucherReviewApi.approve', () => {
  afterEach(() => jest.clearAllMocks())

  it('POSTs /:id/approve-voucher with auth and parses { approved, goLive }', async () => {
    mockedApiFetch.mockResolvedValueOnce({ approved: true, goLive: false })
    const result = await voucherReviewApi.approve('apr-1')
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/approvals/apr-1/approve-voucher',
      { method: 'POST', auth: true },
    )
    expect(result.approved).toBe(true)
    expect(result.goLive).toBe(false)
  })

  it('throws when the approve response does not match the schema', async () => {
    mockedApiFetch.mockResolvedValueOnce({ approved: true })
    await expect(voucherReviewApi.approve('apr-1')).rejects.toThrow()
  })
})

// ── voucherReviewApi.reject ───────────────────────────────────────────────────

describe('voucherReviewApi.reject', () => {
  afterEach(() => jest.clearAllMocks())

  it('POSTs /:id/reject-voucher with the reason body and parses { rejected }', async () => {
    mockedApiFetch.mockResolvedValueOnce({ rejected: true })
    const result = await voucherReviewApi.reject('apr-1', 'Saving claim is not accurate.')
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/approvals/apr-1/reject-voucher',
      { method: 'POST', auth: true, body: JSON.stringify({ reason: 'Saving claim is not accurate.' }) },
    )
    expect(result.rejected).toBe(true)
  })
})

// ── voucherReviewApi.requestChanges ───────────────────────────────────────────

describe('voucherReviewApi.requestChanges', () => {
  afterEach(() => jest.clearAllMocks())

  it('POSTs /:id/request-voucher-changes with { proposed, note } and parses { changesRequested }', async () => {
    mockedApiFetch.mockResolvedValueOnce({ changesRequested: true })
    const proposed = { title: 'Better title', estimatedSaving: 7 }
    const result = await voucherReviewApi.requestChanges('apr-1', { proposed, note: 'Tighten the title.' })
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/approvals/apr-1/request-voucher-changes',
      { method: 'POST', auth: true, body: JSON.stringify({ proposed, note: 'Tighten the title.' }) },
    )
    expect(result.changesRequested).toBe(true)
  })

  it('omits proposed from the body when not supplied (comment-only)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ changesRequested: true })
    await voucherReviewApi.requestChanges('apr-1', { note: 'Please add terms.' })
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/approvals/apr-1/request-voucher-changes',
      { method: 'POST', auth: true, body: JSON.stringify({ note: 'Please add terms.' }) },
    )
  })
})
