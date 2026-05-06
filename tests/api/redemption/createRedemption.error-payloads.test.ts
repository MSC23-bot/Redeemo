import { describe, it, expect, vi, beforeEach } from 'vitest'

// Error payload contracts — ensure the customer-app receives authoritative
// data for the lockout countdown UI (retryAfter) and the "X attempts
// remaining" copy (remainingAttempts).
//
// See docs/superpowers/plans/2026-05-06-voucher-detail-m2.md §A3 + §A4.

vi.mock('../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

import { createRedemption } from '../../../src/api/redemption/service'

const REAL_PIN = '1234'
const WRONG_PIN = '0000'
const baseCtx = { ipAddress: '127.0.0.1', userAgent: 'test' }

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

function mockRedis() {
  return {
    get: vi.fn().mockResolvedValue(null),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    del: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(900),
  } as any
}

describe('createRedemption — INVALID_PIN.details.remainingAttempts', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('includes remainingAttempts: 4 after the first wrong PIN (counter=1, limit=5)', async () => {
    const prisma = mockHappyPrisma()
    const redis = mockRedis()
    redis.incr.mockResolvedValue(1)

    try {
      await createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err.code).toBe('INVALID_PIN')
      expect(err.details).toEqual({ remainingAttempts: 4 })
    }
  })

  it('decrements remainingAttempts as fail counter increases (4 → 3 → 2 → 1 → 0)', async () => {
    for (const [counterValue, expectedRemaining] of [[1, 4], [2, 3], [3, 2], [4, 1], [5, 0]] as const) {
      const prisma = mockHappyPrisma()
      const redis = mockRedis()
      redis.incr.mockResolvedValue(counterValue)

      try {
        await createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
        throw new Error('expected throw')
      } catch (err: any) {
        expect(err.code).toBe('INVALID_PIN')
        expect(err.details.remainingAttempts).toBe(expectedRemaining)
      }
    }
  })

  it('clamps at zero — never returns a negative remainingAttempts even if counter exceeds limit', async () => {
    const prisma = mockHappyPrisma()
    const redis = mockRedis()
    redis.incr.mockResolvedValue(100) // counter wildly past the limit

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
    const redis = mockRedis()
    redis.incr.mockResolvedValue(2)

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
