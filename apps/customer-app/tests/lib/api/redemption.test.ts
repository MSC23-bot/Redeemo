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
      redemptionCode: 'A7K2P9X4', estimatedSaving: '4.50',
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
      id: 'r1', voucherId: 'v1', branchId: 'b1', redemptionCode: 'A7K2P9X4',
      estimatedSaving: '4.50', isValidated: false, redeemedAt: '2026-05-06T12:00:00Z',
    })
    expect(r.estimatedSaving).toBe(4.5)
  })

  // ── M4a-8: TIME_LIMITED error codes ───────────────────────────────────────
  //
  // FLAT shape lock (spec §3.6.4 + AppError.toJSON()): the backend serialises
  // typed-error details directly on `error.<key>`, not nested under
  // `error.details.<key>`. Mirrors INVALID_PIN.remainingAttempts and
  // PIN_RATE_LIMIT_EXCEEDED.retryAfter.
  //
  // Wire shape:
  //   { error: { code: '…', message, statusCode, nextWindowAt: '…' | null } }

  it('RedemptionErrorSchema parses VOUCHER_OUTSIDE_AVAILABILITY_WINDOW with flat nextWindowAt (ISO)', () => {
    const e = RedemptionErrorSchema.parse({
      code: 'VOUCHER_OUTSIDE_AVAILABILITY_WINDOW',
      message: 'Not available right now.',
      statusCode: 400,
      nextWindowAt: '2026-05-12T10:00:00.000Z',   // FLAT — not under .details
    })
    expect(e.code).toBe('VOUCHER_OUTSIDE_AVAILABILITY_WINDOW')
    if (e.code === 'VOUCHER_OUTSIDE_AVAILABILITY_WINDOW') {
      expect(e.nextWindowAt).toBe('2026-05-12T10:00:00.000Z')
    }
  })

  it('RedemptionErrorSchema parses VOUCHER_OUTSIDE_AVAILABILITY_WINDOW with nextWindowAt: null (degenerate no-windows case)', () => {
    const e = RedemptionErrorSchema.parse({
      code: 'VOUCHER_OUTSIDE_AVAILABILITY_WINDOW',
      message: 'Not available right now.',
      statusCode: 400,
      nextWindowAt: null,
    })
    if (e.code === 'VOUCHER_OUTSIDE_AVAILABILITY_WINDOW') {
      expect(e.nextWindowAt).toBeNull()
    }
  })

  it('RedemptionErrorSchema parses ALREADY_REDEEMED_THIS_WINDOW with flat nextWindowAt', () => {
    const e = RedemptionErrorSchema.parse({
      code: 'ALREADY_REDEEMED_THIS_WINDOW',
      message: 'You already used this offer for this window.',
      statusCode: 400,
      nextWindowAt: '2026-05-12T10:00:00.000Z',
    })
    expect(e.code).toBe('ALREADY_REDEEMED_THIS_WINDOW')
    if (e.code === 'ALREADY_REDEEMED_THIS_WINDOW') {
      expect(e.nextWindowAt).toBe('2026-05-12T10:00:00.000Z')
    }
  })

  it('RedemptionErrorSchema parses ALREADY_REDEEMED_THIS_WINDOW with nextWindowAt: null', () => {
    const e = RedemptionErrorSchema.parse({
      code: 'ALREADY_REDEEMED_THIS_WINDOW',
      message: 'You already used this offer for this window.',
      statusCode: 400,
      nextWindowAt: null,
    })
    if (e.code === 'ALREADY_REDEEMED_THIS_WINDOW') {
      expect(e.nextWindowAt).toBeNull()
    }
  })

  it('RedemptionErrorSchema rejects new codes without nextWindowAt key', () => {
    // nextWindowAt is required (nullable but not optional) for the two new
    // codes — backend always emits it (computed from availability windows).
    // Defensive pin against a backend drift that drops the field entirely.
    expect(() => RedemptionErrorSchema.parse({
      code: 'VOUCHER_OUTSIDE_AVAILABILITY_WINDOW',
      message: 'x', statusCode: 400,
    })).toThrow()
    expect(() => RedemptionErrorSchema.parse({
      code: 'ALREADY_REDEEMED_THIS_WINDOW',
      message: 'x', statusCode: 400,
    })).toThrow()
  })

  // ── M5: REUSABLE_COOLDOWN_ACTIVE error code ────────────────────────────────
  //
  // Backend (Task 5, `src/api/redemption/service.ts`) throws on the pre-PIN
  // guard when a REUSABLE voucher is still inside its cooldown window.
  // Payload is FLAT (same lock as the M4a-8 ...AVAILABILITY_WINDOW codes
  // and INVALID_PIN / PIN_RATE_LIMIT_EXCEEDED):
  //
  //   { error: { code: 'REUSABLE_COOLDOWN_ACTIVE', message, statusCode: 400,
  //              availableAgainAt: ISO } }
  //
  // availableAgainAt is REQUIRED + non-nullable for this code — backend only
  // throws when there IS a prior redemption inside the cooldown, so the
  // future instant is always defined (no degenerate null case unlike the
  // TIME_LIMITED codes).

  it('RedemptionErrorSchema parses REUSABLE_COOLDOWN_ACTIVE with flat availableAgainAt (ISO)', () => {
    const e = RedemptionErrorSchema.parse({
      code: 'REUSABLE_COOLDOWN_ACTIVE',
      message: 'This voucher is on cooldown. Please try again later.',
      statusCode: 400,
      availableAgainAt: '2026-05-12T16:00:00.000Z',
    })
    expect(e.code).toBe('REUSABLE_COOLDOWN_ACTIVE')
    if (e.code === 'REUSABLE_COOLDOWN_ACTIVE') {
      expect(e.availableAgainAt).toBe('2026-05-12T16:00:00.000Z')
    }
  })

  it('RedemptionErrorSchema rejects REUSABLE_COOLDOWN_ACTIVE without availableAgainAt key', () => {
    // Defensive pin against a backend drift that drops the field. Unlike
    // the TIME_LIMITED codes, REUSABLE_COOLDOWN_ACTIVE has no degenerate
    // null case — the schema rejects both absence and null.
    expect(() => RedemptionErrorSchema.parse({
      code: 'REUSABLE_COOLDOWN_ACTIVE',
      message: 'x', statusCode: 400,
    })).toThrow()
    expect(() => RedemptionErrorSchema.parse({
      code: 'REUSABLE_COOLDOWN_ACTIVE',
      message: 'x', statusCode: 400, availableAgainAt: null,
    })).toThrow()
  })

  it('ReusableCooldownActiveContext type carries { availableAgainAt: string }', () => {
    // Type-level pin: compile-time check via a const-typed value. If the
    // exported type ever drifts (e.g. becomes nullable, or renames the
    // field), tsc will fail this file.  We do a runtime no-op assertion
    // so jest also reports a green test.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const ctx: import('@/lib/api/redemption').ReusableCooldownActiveContext = {
      availableAgainAt: '2026-05-12T16:00:00.000Z',
    }
    expect(ctx.availableAgainAt).toBe('2026-05-12T16:00:00.000Z')
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
      redemptionCode: 'A7K2P9X4', estimatedSaving: '4.50',
      isValidated: false, redeemedAt: '2026-05-06T12:00:00Z',
    }, 201)) as unknown as typeof fetch

    const r = await redemptionApi.redeem({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
    expect(r.redemptionCode).toBe('A7K2P9X4')
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

  // ── M4a-8: end-to-end typed-error mapping for TIME_LIMITED codes ──────────
  //
  // The wire shape is flat: `body.error.nextWindowAt` directly. The api.ts
  // envelope-unwrap strips standard fields (code/message/statusCode/field)
  // and stuffs everything else into `ApiClientError.details`, then
  // toRedemptionError reconstructs `{ code, message, statusCode, ...details }`
  // and parses through RedemptionErrorSchema. End result: the typed error
  // exposes nextWindowAt at the top level, not under details.

  it('on VOUCHER_OUTSIDE_AVAILABILITY_WINDOW throws a typed RedemptionError carrying flat nextWindowAt', async () => {
    global.fetch = jest.fn(async () => mockResponse({
      error: {
        code: 'VOUCHER_OUTSIDE_AVAILABILITY_WINDOW',
        message: 'Not available right now.',
        statusCode: 400,
        nextWindowAt: '2026-05-12T10:00:00.000Z',   // FLAT — not under .details
      },
    }, 400)) as unknown as typeof fetch

    try {
      await redemptionApi.redeem({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err).not.toBeInstanceOf(ApiClientError)
      expect(err.code).toBe('VOUCHER_OUTSIDE_AVAILABILITY_WINDOW')
      expect(err.nextWindowAt).toBe('2026-05-12T10:00:00.000Z')
    }
  })

  it('on ALREADY_REDEEMED_THIS_WINDOW throws a typed RedemptionError carrying flat nextWindowAt', async () => {
    global.fetch = jest.fn(async () => mockResponse({
      error: {
        code: 'ALREADY_REDEEMED_THIS_WINDOW',
        message: 'You already used this offer for this window.',
        statusCode: 400,
        nextWindowAt: '2026-05-12T10:00:00.000Z',
      },
    }, 400)) as unknown as typeof fetch

    try {
      await redemptionApi.redeem({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err.code).toBe('ALREADY_REDEEMED_THIS_WINDOW')
      expect(err.nextWindowAt).toBe('2026-05-12T10:00:00.000Z')
    }
  })

  it('on VOUCHER_OUTSIDE_AVAILABILITY_WINDOW with nextWindowAt: null (degenerate no-windows) — typed error carries null', async () => {
    global.fetch = jest.fn(async () => mockResponse({
      error: {
        code: 'VOUCHER_OUTSIDE_AVAILABILITY_WINDOW',
        message: 'Not available right now.',
        statusCode: 400,
        nextWindowAt: null,
      },
    }, 400)) as unknown as typeof fetch

    try {
      await redemptionApi.redeem({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err.code).toBe('VOUCHER_OUTSIDE_AVAILABILITY_WINDOW')
      expect(err.nextWindowAt).toBeNull()
    }
  })

  // ── M5: REUSABLE_COOLDOWN_ACTIVE end-to-end typed-error mapping ───────────

  it('on REUSABLE_COOLDOWN_ACTIVE throws a typed RedemptionError carrying flat availableAgainAt', async () => {
    global.fetch = jest.fn(async () => mockResponse({
      error: {
        code: 'REUSABLE_COOLDOWN_ACTIVE',
        message: 'This voucher is on cooldown. Please try again later.',
        statusCode: 400,
        availableAgainAt: '2026-05-12T16:00:00.000Z',
      },
    }, 400)) as unknown as typeof fetch

    try {
      await redemptionApi.redeem({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err).not.toBeInstanceOf(ApiClientError)
      expect(err.code).toBe('REUSABLE_COOLDOWN_ACTIVE')
      expect(err.availableAgainAt).toBe('2026-05-12T16:00:00.000Z')
    }
  })

  it('defensive — nested error.details.nextWindowAt shape is NOT silently mapped through (spec §3.6.4 locks flat)', async () => {
    // If a future backend regression emits the WRONG shape
    // (`error.details.nextWindowAt` instead of `error.nextWindowAt`),
    // the typed-error parser must NOT silently mint a typed error with
    // nextWindowAt undefined — because RedemptionErrorSchema requires
    // nextWindowAt to be present (string | null). The mapper falls
    // through to "unknown code path" semantics and the original
    // ApiClientError is re-thrown.
    global.fetch = jest.fn(async () => mockResponse({
      error: {
        code: 'VOUCHER_OUTSIDE_AVAILABILITY_WINDOW',
        message: '…',
        statusCode: 400,
        details: { nextWindowAt: '2026-05-12T10:00:00.000Z' },   // WRONG shape — nested
      },
    }, 400)) as unknown as typeof fetch

    try {
      await redemptionApi.redeem({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
      throw new Error('expected throw')
    } catch (err: any) {
      // Schema parse fails → fall through; the ApiClientError is re-thrown.
      expect(err).toBeInstanceOf(ApiClientError)
      expect(err.code).toBe('VOUCHER_OUTSIDE_AVAILABILITY_WINDOW')
      // The flat nextWindowAt is NOT picked up from the nested details
      // shape — confirms the schema does not accept the wrong wire shape.
    }
  })
})
