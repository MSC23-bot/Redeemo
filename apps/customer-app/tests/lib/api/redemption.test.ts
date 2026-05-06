import {
  RedeemRequestSchema,
  RedeemResponseSchema,
  RedemptionErrorSchema,
  RedemptionSummarySchema,
  redemptionApi,
} from '@/lib/api/redemption'
import { ApiClientError } from '@/lib/api'

const originalFetch = global.fetch

describe('redemption API schemas', () => {
  it('RedeemRequestSchema accepts { voucherId, branchId, pin: 4 digits }', () => {
    const r = RedeemRequestSchema.parse({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
    expect(r.pin).toBe('1234')
  })

  it('RedeemRequestSchema rejects PIN that is not exactly 4 digits', () => {
    expect(() => RedeemRequestSchema.parse({ voucherId: 'v1', branchId: 'b1', pin: 'abcd' })).toThrow()
    expect(() => RedeemRequestSchema.parse({ voucherId: 'v1', branchId: 'b1', pin: '12345' })).toThrow()
    expect(() => RedeemRequestSchema.parse({ voucherId: 'v1', branchId: 'b1', pin: '123' })).toThrow()
    expect(() => RedeemRequestSchema.parse({ voucherId: 'v1', branchId: 'b1', pin: '' })).toThrow()
  })

  it('RedeemRequestSchema rejects empty voucherId / branchId', () => {
    expect(() => RedeemRequestSchema.parse({ voucherId: '', branchId: 'b1', pin: '1234' })).toThrow()
    expect(() => RedeemRequestSchema.parse({ voucherId: 'v1', branchId: '', pin: '1234' })).toThrow()
  })

  it('RedeemResponseSchema parses estimatedSaving as number (z.coerce — Prisma Decimal lesson)', () => {
    // Backend returns Decimal as JSON string; coerce to number client-side.
    const r = RedeemResponseSchema.parse({
      id: 'r1', userId: 'u1', voucherId: 'v1', branchId: 'b1',
      redemptionCode: 'aB3xKZmLp9', estimatedSaving: '4.50',
      isValidated: false, redeemedAt: '2026-05-06T12:00:00Z',
    })
    expect(r.estimatedSaving).toBe(4.5)
  })

  it('RedeemResponseSchema rejects malformed redemptionCode', () => {
    expect(() => RedeemResponseSchema.parse({
      id: 'r1', userId: 'u1', voucherId: 'v1', branchId: 'b1',
      redemptionCode: 'short', estimatedSaving: '4.50',
      isValidated: false, redeemedAt: '2026-05-06T12:00:00Z',
    })).toThrow()
  })

  it('RedemptionErrorSchema parses INVALID_PIN with remainingAttempts', () => {
    const e = RedemptionErrorSchema.parse({
      code: 'INVALID_PIN', message: 'Wrong PIN', statusCode: 400, remainingAttempts: 3,
    })
    expect(e.code).toBe('INVALID_PIN')
    if (e.code === 'INVALID_PIN') expect(e.remainingAttempts).toBe(3)
  })

  it('RedemptionErrorSchema rejects INVALID_PIN without remainingAttempts', () => {
    expect(() => RedemptionErrorSchema.parse({
      code: 'INVALID_PIN', message: 'Wrong PIN', statusCode: 400,
    })).toThrow()
  })

  it('RedemptionErrorSchema parses PIN_RATE_LIMIT_EXCEEDED with retryAfter', () => {
    const e = RedemptionErrorSchema.parse({
      code: 'PIN_RATE_LIMIT_EXCEEDED', message: 'Locked', statusCode: 429, retryAfter: 540,
    })
    if (e.code === 'PIN_RATE_LIMIT_EXCEEDED') expect(e.retryAfter).toBe(540)
  })

  it('RedemptionErrorSchema parses every code with no extra payload required', () => {
    const codes = [
      ['SUBSCRIPTION_REQUIRED', 403],
      ['PHONE_NOT_VERIFIED',    403],
      ['VOUCHER_NOT_FOUND',     404],
      ['BRANCH_UNAVAILABLE',    404],
      ['BRANCH_MERCHANT_MISMATCH', 400],
      ['ALREADY_REDEEMED',      409],
      ['PIN_NOT_CONFIGURED',    400],
    ] as const
    for (const [code, statusCode] of codes) {
      const e = RedemptionErrorSchema.parse({ code, message: 'x', statusCode })
      expect(e.code).toBe(code)
    }
  })

  it('RedemptionSummarySchema parses listMyRedemptions item shape', () => {
    const r = RedemptionSummarySchema.parse({
      id: 'r1', voucherId: 'v1', branchId: 'b1', redemptionCode: 'aB3xKZmLp9',
      estimatedSaving: '4.50', isValidated: false, redeemedAt: '2026-05-06T12:00:00Z',
    })
    expect(r.estimatedSaving).toBe(4.5)
  })
})

describe('redemptionApi.redeem — typed-error mapping', () => {
  afterEach(() => {
    global.fetch = originalFetch
  })

  function mockResponse(body: any, status: number) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }

  it('on success returns parsed RedeemResponse', async () => {
    global.fetch = jest.fn(async () => mockResponse({
      id: 'r1', userId: 'u1', voucherId: 'v1', branchId: 'b1',
      redemptionCode: 'aB3xKZmLp9', estimatedSaving: '4.50',
      isValidated: false, redeemedAt: '2026-05-06T12:00:00Z',
    }, 201)) as unknown as typeof fetch

    const r = await redemptionApi.redeem({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
    expect(r.redemptionCode).toBe('aB3xKZmLp9')
    expect(r.estimatedSaving).toBe(4.5)
  })

  it('on INVALID_PIN throws a typed RedemptionError carrying remainingAttempts', async () => {
    global.fetch = jest.fn(async () => mockResponse({
      error: { code: 'INVALID_PIN', message: 'Wrong PIN', statusCode: 400, remainingAttempts: 3 }
    }, 400)) as unknown as typeof fetch

    try {
      await redemptionApi.redeem({ voucherId: 'v1', branchId: 'b1', pin: '0000' })
      throw new Error('expected throw')
    } catch (err: any) {
      // Must NOT be ApiClientError — should be the typed RedemptionError.
      expect(err).not.toBeInstanceOf(ApiClientError)
      expect(err.code).toBe('INVALID_PIN')
      expect(err.remainingAttempts).toBe(3)
    }
  })

  it('on PIN_RATE_LIMIT_EXCEEDED throws a typed RedemptionError carrying retryAfter', async () => {
    global.fetch = jest.fn(async () => mockResponse({
      error: { code: 'PIN_RATE_LIMIT_EXCEEDED', message: 'Locked', statusCode: 429, retryAfter: 540 }
    }, 429)) as unknown as typeof fetch

    try {
      await redemptionApi.redeem({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err.code).toBe('PIN_RATE_LIMIT_EXCEEDED')
      expect(err.retryAfter).toBe(540)
    }
  })

  it('on SUBSCRIPTION_REQUIRED throws a typed RedemptionError', async () => {
    global.fetch = jest.fn(async () => mockResponse({
      error: { code: 'SUBSCRIPTION_REQUIRED', message: 'Subscribe', statusCode: 403 }
    }, 403)) as unknown as typeof fetch

    try {
      await redemptionApi.redeem({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
    } catch (err: any) {
      expect(err.code).toBe('SUBSCRIPTION_REQUIRED')
      expect(err.statusCode).toBe(403)
    }
  })

  it('on ALREADY_REDEEMED throws a typed RedemptionError', async () => {
    global.fetch = jest.fn(async () => mockResponse({
      error: { code: 'ALREADY_REDEEMED', message: 'Used', statusCode: 409 }
    }, 409)) as unknown as typeof fetch

    try {
      await redemptionApi.redeem({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
    } catch (err: any) {
      expect(err.code).toBe('ALREADY_REDEEMED')
    }
  })

  it('on unknown error code re-throws the original ApiClientError', async () => {
    global.fetch = jest.fn(async () => mockResponse({
      error: { code: 'WHO_KNOWS', message: 'mystery', statusCode: 500 }
    }, 500)) as unknown as typeof fetch

    try {
      await redemptionApi.redeem({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiClientError)
      expect(err.code).toBe('WHO_KNOWS')
    }
  })

  it('throws Zod error on malformed request (caught before fetch)', async () => {
    let fetchCalled = false
    global.fetch = jest.fn(async () => {
      fetchCalled = true
      return mockResponse({}, 200)
    }) as unknown as typeof fetch

    await expect(
      redemptionApi.redeem({ voucherId: 'v1', branchId: 'b1', pin: 'abcd' })
    ).rejects.toThrow()
    expect(fetchCalled).toBe(false)
  })
})
