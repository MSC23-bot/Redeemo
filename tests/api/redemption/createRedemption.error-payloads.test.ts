import { describe, it, expect, vi, beforeEach } from 'vitest'

// Error payload contracts — ensure the customer-app receives authoritative
// data for the lockout countdown UI (retryAfter) and the "X attempts
// remaining" copy (remainingAttempts).
//
// The PIN rate-limit gate routes through the shared atomic consume() limiter
// (H2 fix, 2026-07-06 security audit): the counter is reserved-and-checked in
// ONE atomic step before the compare, so these tests drive it through real
// counter STATE (a shared Map) rather than by mocking incr/ttl return values.
//
// See docs/superpowers/plans/2026-05-06-voucher-detail-m2.md §A3 + §A4.

vi.mock('../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

import { createRedemption } from '../../../src/api/redemption/service'
import { RedisKey } from '../../../src/api/shared/redis-keys'
import { makeRedemptionRedis } from './helpers/pinLimiterRedis'

const REAL_PIN = '1234'
const WRONG_PIN = '0000'
const baseCtx = { ipAddress: '127.0.0.1', userAgent: 'test' }
const FAIL_KEY = RedisKey.pinFailCount('user-1', 'b1')

function mockHappyPrisma() {
  return {
    branch: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'b1', merchantId: 'm1',
        isActive: true,
        redemptionPin: `enc:${REAL_PIN}`,
      }),
    },
    subscription: {
      findUnique: vi.fn().mockResolvedValue({
        status: 'ACTIVE',
        cycleAnchorDate: new Date(Date.UTC(2026, 0, 10)),
      }),
    },
    voucher: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'v1', merchantId: 'm1',
        status: 'ACTIVE', approvalStatus: 'APPROVED',
        expiryDate: null,
        estimatedSaving: 5.00,
        merchant: { id: 'm1', status: 'ACTIVE' },
      }),
    },
    userVoucherCycleState: { findUnique: vi.fn().mockResolvedValue(null) },
    voucherRedemption: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue({ phoneVerified: true }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  } as any
}

describe('createRedemption — INVALID_PIN.details.remainingAttempts', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('includes remainingAttempts: 4 after the first wrong PIN (counter=1, limit=5)', async () => {
    const prisma = mockHappyPrisma()
    const redis = makeRedemptionRedis() // empty counter

    try {
      await createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err.code).toBe('INVALID_PIN')
      expect(err.details).toEqual({ remainingAttempts: 4 })
    }
  })

  it('decrements remainingAttempts as the fail counter climbs (4 → 3 → 2 → 1 → 0)', async () => {
    const prisma = mockHappyPrisma()
    const redis = makeRedemptionRedis() // ONE instance: the counter accumulates across attempts

    for (const expectedRemaining of [4, 3, 2, 1, 0]) {
      try {
        await createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
        throw new Error('expected throw')
      } catch (err: any) {
        expect(err.code).toBe('INVALID_PIN')
        expect(err.details.remainingAttempts).toBe(expectedRemaining)
      }
    }
  })

  it('clamps at zero — never returns a negative remainingAttempts even if the display read is past the limit', async () => {
    const prisma = mockHappyPrisma()
    const redis = makeRedemptionRedis()
    // Defensive: force the display read past the limit while consume() still ALLOWS the
    // attempt (an impossible-in-practice stale read). remaining must clamp to 0, never negative.
    redis.get.mockResolvedValue('7')

    try {
      await createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err.code).toBe('INVALID_PIN')
      expect(err.details.remainingAttempts).toBe(0)
    }
  })

  it('error envelope (toJSON) spreads remainingAttempts alongside code/message/statusCode', async () => {
    const prisma = mockHappyPrisma()
    const redis = makeRedemptionRedis({ counts: { [FAIL_KEY]: '1' } }) // one prior failure → this is the 2nd

    try {
      await createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err.toJSON()).toEqual({
        error: {
          code: 'INVALID_PIN',
          message: 'The PIN you entered is incorrect.',
          statusCode: 400,
          remainingAttempts: 3,
        },
      })
    }
  })
})

describe('createRedemption — PIN_RATE_LIMIT_EXCEEDED.details.retryAfter', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns retryAfter from the limiter TTL when the cap is already reached', async () => {
    const prisma = mockHappyPrisma()
    const redis = makeRedemptionRedis({ counts: { [FAIL_KEY]: '5' }, ttl: 540 }) // at limit, 9m remaining

    try {
      await createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err.code).toBe('PIN_RATE_LIMIT_EXCEEDED')
      expect(err.details).toEqual({ retryAfter: 540 })
    }
  })

  it('falls back to PIN_FAIL_WINDOW (900s) when the limiter reports no TTL (-1)', async () => {
    const prisma = mockHappyPrisma()
    const redis = makeRedemptionRedis({ counts: { [FAIL_KEY]: '5' }, ttl: -1 })

    try {
      await createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err.code).toBe('PIN_RATE_LIMIT_EXCEEDED')
      expect(err.details).toEqual({ retryAfter: 900 })
    }
  })

  it('falls back to PIN_FAIL_WINDOW (900s) when the limiter reports a missing key (-2)', async () => {
    const prisma = mockHappyPrisma()
    const redis = makeRedemptionRedis({ counts: { [FAIL_KEY]: '5' }, ttl: -2 })

    try {
      await createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err.details).toEqual({ retryAfter: 900 })
    }
  })

  it('error envelope (toJSON) spreads retryAfter alongside code/message/statusCode', async () => {
    const prisma = mockHappyPrisma()
    const redis = makeRedemptionRedis({ counts: { [FAIL_KEY]: '5' }, ttl: 720 })

    try {
      await createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err.toJSON()).toEqual({
        error: {
          code: 'PIN_RATE_LIMIT_EXCEEDED',
          message: 'Too many incorrect PIN attempts. Please try again in 15 minutes.',
          statusCode: 429,
          retryAfter: 720,
        },
      })
    }
  })
})
