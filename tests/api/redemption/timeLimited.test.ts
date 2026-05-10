import { describe, it, expect, vi, beforeEach } from 'vitest'

// M4a-6: TIME_LIMITED guard order + 2 typed errors with nextWindowAt
// payload. Pins:
//
//   1. VOUCHER_OUTSIDE_AVAILABILITY_WINDOW (Guard 3 NEW) — fires when
//      voucher.type === 'TIME_LIMITED' AND no current window-occurrence
//      is open. Payload: { nextWindowAt: ISO | null }.
//   2. ALREADY_REDEEMED_THIS_WINDOW (Guard 7 branch) — fires when a
//      VoucherRedemption row already exists for (userId, voucherId)
//      with redeemedAt inside the current window-occurrence. Payload:
//      { nextWindowAt: ISO | null }.
//   3. TIME_LIMITED redemption MUST NOT touch UserVoucherCycleState
//      (no findUnique read, no upsert in the transaction).
//   4. Non-TIME_LIMITED flow uses cycleStart from outer scope —
//      regression pin against accidental scope migration.
//   5. Guard order: VOUCHER_NOT_FOUND (expiry collapse) fires BEFORE
//      VOUCHER_OUTSIDE_AVAILABILITY_WINDOW. A dead voucher is dead
//      regardless of window state.
//   6. HTTP route layer preserves error-shape end-to-end via the
//      global AppError handler — the customer-app's mapRedemptionError
//      can pick `nextWindowAt` off the response.

vi.mock('../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

import { createRedemption } from '../../../src/api/redemption/service'

const REAL_PIN = '1234'
const baseCtx = { ipAddress: '127.0.0.1', userAgent: 'test' }

// Mon-Fri 11:00-15:00 windows.
const MON_FRI_LUNCH = [1, 2, 3, 4, 5].map(d => ({
  dayOfWeek: d, openTime: '11:00', closeTime: '15:00',
}))

// 2026-05-11 12:00 UTC = Mon 13:00 BST → INSIDE Mon-Fri lunch window.
const TEST_INSIDE  = new Date('2026-05-11T12:00:00.000Z')
// 2026-05-16 12:00 UTC = Sat 13:00 BST → OUTSIDE all windows.
const TEST_OUTSIDE = new Date('2026-05-16T12:00:00.000Z')

function mockTimeLimitedPrisma(opts: {
  windows?: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>
  expiryDate?: Date | null
  existingRedemption?: any
} = {}) {
  return {
    branch: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'b1', merchantId: 'm1', isActive: true,
        redemptionPin: `enc:${REAL_PIN}`,
      }),
    },
    subscription: {
      findUnique: vi.fn().mockResolvedValue({
        status: 'ACTIVE',
        cycleAnchorDate: new Date(Date.UTC(2025, 10, 11)), // 6 months before TEST_INSIDE
      }),
    },
    voucher: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'v1', merchantId: 'm1',
        type: 'TIME_LIMITED',
        status: 'ACTIVE', approvalStatus: 'APPROVED',
        expiryDate: opts.expiryDate ?? null,
        estimatedSaving: 8.5,
        merchant: { id: 'm1', status: 'ACTIVE' },
        availabilityWindows: opts.windows ?? MON_FRI_LUNCH,
      }),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ phoneVerified: true }) },
    userVoucherCycleState: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert:     vi.fn(),
      updateMany: vi.fn(),
      create:     vi.fn(),
    },
    voucherRedemption: {
      create: vi.fn().mockResolvedValue({
        id: 'r1', userId: 'user-1', voucherId: 'v1', branchId: 'b1',
        redemptionCode: 'A7K2P9X4', estimatedSaving: 8.5,
        isValidated: false, redeemedAt: TEST_INSIDE,
      }),
      findFirst: vi.fn().mockResolvedValue(opts.existingRedemption ?? null),
      findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn(),
    },
    auditLog:    { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (fn: any) => {
      const tx = {
        userVoucherCycleState: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          create:     vi.fn().mockResolvedValue({}),
          upsert:     vi.fn().mockResolvedValue({}),
        },
        voucherRedemption: {
          create: vi.fn().mockResolvedValue({
            id: 'r1', userId: 'user-1', voucherId: 'v1', branchId: 'b1',
            redemptionCode: 'A7K2P9X4', estimatedSaving: 8.5,
            isValidated: false, redeemedAt: TEST_INSIDE,
          }),
        },
      }
      const result = await fn(tx)
      ;(prismaTxSpies.userVoucherCycleStateUpsertCalls as any) = tx.userVoucherCycleState.upsert.mock.calls
      ;(prismaTxSpies.userVoucherCycleStateCreateCalls as any) = tx.userVoucherCycleState.create.mock.calls
      ;(prismaTxSpies.userVoucherCycleStateUpdateManyCalls as any) = tx.userVoucherCycleState.updateMany.mock.calls
      ;(prismaTxSpies.voucherRedemptionCreateCalls as any) = tx.voucherRedemption.create.mock.calls
      return result
    }),
  } as any
}

// Module-scoped spy bucket so tests can assert on transaction internals.
const prismaTxSpies: any = {}

function mockNonTimeLimitedPrisma() {
  const tlSpies: any = {}
  return {
    branch: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'b1', merchantId: 'm1', isActive: true,
        redemptionPin: `enc:${REAL_PIN}`,
      }),
    },
    subscription: {
      findUnique: vi.fn().mockResolvedValue({
        status: 'ACTIVE',
        cycleAnchorDate: new Date(Date.UTC(2025, 10, 11)),
      }),
    },
    voucher: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'v2', merchantId: 'm1',
        type: 'FREEBIE',
        status: 'ACTIVE', approvalStatus: 'APPROVED',
        expiryDate: null,
        estimatedSaving: 5,
        merchant: { id: 'm1', status: 'ACTIVE' },
        availabilityWindows: [],
      }),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ phoneVerified: true }) },
    userVoucherCycleState: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    voucherRedemption: {
      create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(),
      update: vi.fn(), findMany: vi.fn(), count: vi.fn(),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (fn: any) => {
      tlSpies.cycleStateUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
      tlSpies.cycleStateCreate     = vi.fn().mockResolvedValue({})
      tlSpies.cycleStateUpsert     = vi.fn().mockResolvedValue({})
      tlSpies.redemptionCreate     = vi.fn().mockResolvedValue({
        id: 'r2', userId: 'user-1', voucherId: 'v2', branchId: 'b1',
        redemptionCode: 'B8C9D0E1', estimatedSaving: 5,
        isValidated: false, redeemedAt: TEST_INSIDE,
      })
      const tx = {
        userVoucherCycleState: {
          updateMany: tlSpies.cycleStateUpdateMany,
          create:     tlSpies.cycleStateCreate,
          upsert:     tlSpies.cycleStateUpsert,
        },
        voucherRedemption: { create: tlSpies.redemptionCreate },
      }
      const result = await fn(tx)
      ;(nonTLTxSpies as any).cycleStateUpdateMany = tlSpies.cycleStateUpdateMany
      ;(nonTLTxSpies as any).cycleStateCreate     = tlSpies.cycleStateCreate
      ;(nonTLTxSpies as any).cycleStateUpsert     = tlSpies.cycleStateUpsert
      ;(nonTLTxSpies as any).redemptionCreate     = tlSpies.redemptionCreate
      return result
    }),
  } as any
}

const nonTLTxSpies: any = {}

function mockRedis() {
  return {
    get:    vi.fn().mockResolvedValue(null),
    incr:   vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    del:    vi.fn().mockResolvedValue(1),
    ttl:    vi.fn().mockResolvedValue(900),
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(TEST_INSIDE)
})

describe('createRedemption — TIME_LIMITED guard order (M4a-6)', () => {
  it('rejects redemption with VOUCHER_OUTSIDE_AVAILABILITY_WINDOW when now is outside any window', async () => {
    vi.setSystemTime(TEST_OUTSIDE) // Sat 13:00 BST — outside Mon-Fri lunch
    const prisma = mockTimeLimitedPrisma()
    const redis  = mockRedis()

    await expect(
      createRedemption(prisma, redis, 'user-1',
        { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx)
    ).rejects.toMatchObject({
      code: 'VOUCHER_OUTSIDE_AVAILABILITY_WINDOW',
    })
  })

  it('VOUCHER_OUTSIDE_AVAILABILITY_WINDOW.details.nextWindowAt is the next Mon 11:00 BST (10:00 UTC)', async () => {
    vi.setSystemTime(TEST_OUTSIDE) // Sat 13:00 BST
    const prisma = mockTimeLimitedPrisma()
    const redis  = mockRedis()

    try {
      await createRedemption(prisma, redis, 'user-1',
        { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx)
      throw new Error('expected rejection')
    } catch (err: any) {
      expect(err.code).toBe('VOUCHER_OUTSIDE_AVAILABILITY_WINDOW')
      // Sat 2026-05-16 → next Mon 2026-05-18 11:00 BST = 10:00 UTC.
      expect(err.details).toEqual({ nextWindowAt: '2026-05-18T10:00:00.000Z' })
    }
  })

  it('accepts redemption when now=Mon 13:00 BST (inside the Mon-Fri 11-15 window)', async () => {
    const prisma = mockTimeLimitedPrisma()
    const redis  = mockRedis()

    const result = await createRedemption(prisma, redis, 'user-1',
      { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx)

    expect(result.redemptionCode).toBe('A7K2P9X4')
  })

  it('rejects second redemption inside the same window-occurrence with ALREADY_REDEEMED_THIS_WINDOW', async () => {
    const prisma = mockTimeLimitedPrisma({
      existingRedemption: {
        id: 'r0', userId: 'user-1', voucherId: 'v1',
        redeemedAt: new Date('2026-05-11T12:30:00.000Z'),
      },
    })
    const redis  = mockRedis()

    await expect(
      createRedemption(prisma, redis, 'user-1',
        { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx)
    ).rejects.toMatchObject({ code: 'ALREADY_REDEEMED_THIS_WINDOW' })
  })

  it('ALREADY_REDEEMED_THIS_WINDOW.details.nextWindowAt is the next-occurrence Tue 11:00 BST', async () => {
    const prisma = mockTimeLimitedPrisma({
      existingRedemption: {
        id: 'r0', userId: 'user-1', voucherId: 'v1',
        redeemedAt: new Date('2026-05-11T12:30:00.000Z'),
      },
    })
    const redis  = mockRedis()

    try {
      await createRedemption(prisma, redis, 'user-1',
        { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx)
      throw new Error('expected rejection')
    } catch (err: any) {
      expect(err.code).toBe('ALREADY_REDEEMED_THIS_WINDOW')
      // Mon 2026-05-11 13:00 BST → next occurrence Tue 2026-05-12 11:00 BST = 10:00 UTC.
      expect(err.details).toEqual({ nextWindowAt: '2026-05-12T10:00:00.000Z' })
    }
  })

  it('TIME_LIMITED redemption: cycle-state upsert/update/create NEVER called inside the transaction', async () => {
    const prisma = mockTimeLimitedPrisma()
    const redis  = mockRedis()

    await createRedemption(prisma, redis, 'user-1',
      { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx)

    expect(prismaTxSpies.userVoucherCycleStateUpsertCalls).toEqual([])
    expect(prismaTxSpies.userVoucherCycleStateCreateCalls).toEqual([])
    expect(prismaTxSpies.userVoucherCycleStateUpdateManyCalls).toEqual([])
    expect(prismaTxSpies.voucherRedemptionCreateCalls.length).toBe(1)
  })

  it('TIME_LIMITED redemption: cycle-state findUnique NEVER called outside the transaction (Guard 7 branch skip)', async () => {
    const prisma = mockTimeLimitedPrisma()
    const redis  = mockRedis()

    await createRedemption(prisma, redis, 'user-1',
      { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx)

    expect(prisma.userVoucherCycleState.findUnique).not.toHaveBeenCalled()
  })

  it('non-TIME_LIMITED voucher: cycle-state path unchanged — findUnique called, transaction touches cycle state', async () => {
    const prisma = mockNonTimeLimitedPrisma()
    const redis  = mockRedis()

    const result = await createRedemption(prisma, redis, 'user-1',
      { voucherId: 'v2', branchId: 'b1', pin: REAL_PIN }, baseCtx)

    expect(result.redemptionCode).toBe('B8C9D0E1')
    // Non-TL still reads cycle-state for Guard 7.
    expect(prisma.userVoucherCycleState.findUnique).toHaveBeenCalledTimes(1)
    // And the transaction MUST run the conditional updateMany / create
    // path (the existing race-safe flow).
    expect(nonTLTxSpies.cycleStateUpdateMany).toHaveBeenCalledTimes(1)
    expect(nonTLTxSpies.redemptionCreate).toHaveBeenCalledTimes(1)
  })

  it('guard ORDER: expired TIME_LIMITED voucher fails with VOUCHER_NOT_FOUND BEFORE the availability check fires', async () => {
    vi.setSystemTime(TEST_OUTSIDE) // outside window (would normally fire VOUCHER_OUTSIDE_AVAILABILITY_WINDOW)
    const prisma = mockTimeLimitedPrisma({
      expiryDate: new Date('2026-05-01T00:00:00.000Z'), // 15 days before TEST_OUTSIDE
    })
    const redis  = mockRedis()

    // Expired voucher must fail with VOUCHER_NOT_FOUND, NOT
    // VOUCHER_OUTSIDE_AVAILABILITY_WINDOW. Guard 2 (expiry collapse) is
    // the load-bearing fast-fail; an attacker cannot probe the window
    // schedule of an expired voucher.
    await expect(
      createRedemption(prisma, redis, 'user-1',
        { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx)
    ).rejects.toMatchObject({ code: 'VOUCHER_NOT_FOUND' })
  })
})

describe('TIME_LIMITED typed errors propagate end-to-end through the HTTP route layer (M4a-6 §AC)', () => {
  // Pins the HTTP response body shape via `AppError.toJSON()` — the
  // global handler in src/api/app.ts sends
  // `reply.status(appErr.statusCode).send(appErr.toJSON())`. The
  // toJSON spreads `details` flat into the `error` object (alongside
  // `code` / `message` / `statusCode`) — same shape as
  // PIN_RATE_LIMIT_EXCEEDED's `retryAfter` and INVALID_PIN's
  // `remainingAttempts`. The customer-app's mapRedemptionError
  // (M4a-8) reads `nextWindowAt` off this flat shape.

  it('VOUCHER_OUTSIDE_AVAILABILITY_WINDOW returns 400 with nextWindowAt in body.error', async () => {
    vi.setSystemTime(TEST_OUTSIDE) // Sat 13:00 BST — outside

    // Direct service-call path: assert that the `toJSON()` shape of
    // the AppError thrown matches what the global handler will send.
    // The integration is exercised by the global handler spreading
    // `details` flat — see src/api/shared/errors.ts toJSON.
    const prisma = mockTimeLimitedPrisma()
    const redis  = mockRedis()

    try {
      await createRedemption(prisma, redis, 'user-1',
        { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx)
      throw new Error('expected rejection')
    } catch (err: any) {
      // Pin the HTTP body shape via AppError.toJSON() — global handler
      // sends `reply.status(appErr.statusCode).send(appErr.toJSON())`.
      const body = err.toJSON()
      expect(body).toEqual({
        error: {
          nextWindowAt: '2026-05-18T10:00:00.000Z',
          code:         'VOUCHER_OUTSIDE_AVAILABILITY_WINDOW',
          message:      'This voucher is not available right now.',
          statusCode:   400,
        },
      })
    }
  })

  it('ALREADY_REDEEMED_THIS_WINDOW returns 400 with nextWindowAt in body.error', async () => {
    const prisma = mockTimeLimitedPrisma({
      existingRedemption: {
        id: 'r0', userId: 'user-1', voucherId: 'v1',
        redeemedAt: new Date('2026-05-11T12:30:00.000Z'),
      },
    })
    const redis  = mockRedis()

    try {
      await createRedemption(prisma, redis, 'user-1',
        { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx)
      throw new Error('expected rejection')
    } catch (err: any) {
      const body = err.toJSON()
      expect(body).toEqual({
        error: {
          nextWindowAt: '2026-05-12T10:00:00.000Z',
          code:         'ALREADY_REDEEMED_THIS_WINDOW',
          message:      "You've already used this offer for the current window.",
          statusCode:   400,
        },
      })
    }
  })
})
