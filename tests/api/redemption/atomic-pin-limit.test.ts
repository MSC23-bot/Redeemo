import { describe, it, expect, vi, beforeEach } from 'vitest'

// H2 (2026-07-06 platform security audit): the branch-PIN brute-force limiter
// must be ATOMIC — a concurrent burst of redeem requests can never exceed the
// per-window attempt cap. The previous GET-check + late conditional INCR could
// overshoot (all N read a stale count, all N pass the gate, all N compare),
// making the shared 4-digit PIN brute-forceable. The gate now runs through the
// shared atomic consume() limiter (INCR-and-check in one Lua/shimEval step).
//
// These tests drive the counter through REAL shared state and pin:
//   1. a concurrent burst reaches the PIN compare AT MOST `limit` times;
//   2. the sequential lockout contract is unchanged (5 wrong → then locked);
//   3. a correct PIN clears the counter (only failures accrue);
//   4. a decrypt/data fault REFUNDS its reserved slot (Guard-10: a branch key/
//      ciphertext fault never accrues toward the lockout).

const decryptState = { impl: (v: string) => v.replace('enc:', '') }
vi.mock('../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => decryptState.impl(v)),
}))
vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'A7K2P9X4') }))

import { createRedemption } from '../../../src/api/redemption/service'
import { decrypt } from '../../../src/api/shared/encryption'
import { GcmAuthError } from '../../../src/api/shared/keyring'
import { RedisKey } from '../../../src/api/shared/redis-keys'
import { makeRedemptionRedis } from './helpers/pinLimiterRedis'

const REAL_PIN = '1234'
const WRONG_PIN = '0000'
const LIMIT = 5
const baseCtx = { ipAddress: '127.0.0.1', userAgent: 'test' }
const FAIL_KEY = RedisKey.pinFailCount('u1', 'b1')

function happyPrisma() {
  return {
    branch: { findUnique: vi.fn().mockResolvedValue({ id: 'b1', merchantId: 'm1', isActive: true, redemptionPin: `enc:${REAL_PIN}` }) },
    subscription: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE', cycleAnchorDate: new Date(Date.UTC(2026, 0, 10)) }) },
    voucher: { findUnique: vi.fn().mockResolvedValue({ id: 'v1', merchantId: 'm1', status: 'ACTIVE', approvalStatus: 'APPROVED', expiryDate: null, estimatedSaving: 5.0, merchant: { id: 'm1', status: 'ACTIVE' } }) },
    userVoucherCycleState: { findUnique: vi.fn().mockResolvedValue(null) },
    voucherRedemption: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue({ phoneVerified: true }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockResolvedValue({ id: 'r1', redemptionCode: 'A7K2P9X4', voucherId: 'v1', branchId: 'b1', userId: 'u1', redeemedAt: new Date(), isValidated: false, estimatedSaving: 5.0 }),
  } as any
}

const redeem = (prisma: any, redis: any, pin: string) =>
  createRedemption(prisma, redis, 'u1', { voucherId: 'v1', branchId: 'b1', pin }, baseCtx)

const codeOf = (err: unknown) => (err as any)?.code

describe('createRedemption — atomic PIN brute-force limiting (H2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    decryptState.impl = (v: string) => v.replace('enc:', '')
  })

  it('a CONCURRENT burst reaches the PIN compare AT MOST `limit` times (no overshoot)', async () => {
    const prisma = happyPrisma()
    const redis = makeRedemptionRedis()
    const BURST = 12 // >> limit

    const results = await Promise.allSettled(
      Array.from({ length: BURST }, () => redeem(prisma, redis, WRONG_PIN)),
    )

    // The compare (decrypt) is only reached AFTER a successful atomic reserve, so
    // it must run at most `limit` times regardless of concurrency — this is the
    // property the old non-atomic gate violated.
    expect((decrypt as any).mock.calls.length).toBeLessThanOrEqual(LIMIT)

    const invalid = results.filter((r) => r.status === 'rejected' && codeOf(r.reason) === 'INVALID_PIN')
    const limited = results.filter((r) => r.status === 'rejected' && codeOf(r.reason) === 'PIN_RATE_LIMIT_EXCEEDED')
    expect(invalid).toHaveLength(LIMIT)            // exactly `limit` attempts were served
    expect(limited).toHaveLength(BURST - LIMIT)    // the rest were atomically blocked
    // Every request was accounted for; none silently succeeded.
    expect(results.every((r) => r.status === 'rejected')).toBe(true)
  })

  it('sequential lockout contract unchanged: 5 wrong PINs then PIN_RATE_LIMIT_EXCEEDED', async () => {
    const prisma = happyPrisma()
    const redis = makeRedemptionRedis()

    for (let i = 0; i < LIMIT; i++) {
      await expect(redeem(prisma, redis, WRONG_PIN)).rejects.toThrow('INVALID_PIN')
    }
    await expect(redeem(prisma, redis, WRONG_PIN)).rejects.toThrow('PIN_RATE_LIMIT_EXCEEDED')
  })

  it('a CORRECT PIN clears the counter — only failures accrue toward the lockout', async () => {
    const prisma = happyPrisma()
    const redis = makeRedemptionRedis()

    await expect(redeem(prisma, redis, WRONG_PIN)).rejects.toThrow('INVALID_PIN') // counter → 1
    await expect(redeem(prisma, redis, WRONG_PIN)).rejects.toThrow('INVALID_PIN') // counter → 2
    await expect(redeem(prisma, redis, REAL_PIN)).resolves.toBeDefined()          // success → counter cleared
    expect(redis.__store.get(FAIL_KEY) ?? null).toBeNull()

    // A fresh wrong PIN starts the count over: remaining is back to 4, not 2.
    try {
      await redeem(prisma, redis, WRONG_PIN)
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err.code).toBe('INVALID_PIN')
      expect(err.details.remainingAttempts).toBe(4)
    }
  })

  it('a CORRECT PIN whose atomic claim then fails still clears the counter (no lockout accrual)', async () => {
    const prisma = happyPrisma()
    const redis = makeRedemptionRedis()

    // Two genuine failures first (counter → 2)...
    await expect(redeem(prisma, redis, WRONG_PIN)).rejects.toThrow('INVALID_PIN')
    await expect(redeem(prisma, redis, WRONG_PIN)).rejects.toThrow('INVALID_PIN')

    // ...then a CORRECT PIN whose downstream atomic claim throws (a concurrent race
    // or a transient DB error). The PIN was correct, so it must NOT count toward the
    // lockout — the counter is cleared before the claim runs.
    prisma.$transaction.mockRejectedValueOnce(new Error('transient DB error'))
    await expect(redeem(prisma, redis, REAL_PIN)).rejects.toThrow('transient DB error')
    expect(redis.__store.get(FAIL_KEY) ?? null).toBeNull()

    // Budget is full again — the correct-but-failed attempt burned nothing.
    try {
      await redeem(prisma, redis, WRONG_PIN)
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err.code).toBe('INVALID_PIN')
      expect(err.details.remainingAttempts).toBe(4)
    }
  })

  it('a decrypt/data fault REFUNDS its reserved slot (Guard-10: faults never accrue a lockout)', async () => {
    const prisma = happyPrisma()
    const redis = makeRedemptionRedis()
    // Stored ciphertext fails authentication (wrong key / corruption / tampering).
    decryptState.impl = () => { throw new GcmAuthError() }

    // Many faults in a row must NOT lock the user out — each refunds its slot.
    for (let i = 0; i < LIMIT + 3; i++) {
      await expect(redeem(prisma, redis, WRONG_PIN)).rejects.toThrow('REDEMPTION_PIN_UNREADABLE')
    }
    // Net counter is zero: no failure accrued from the faults.
    expect(Number(redis.__store.get(FAIL_KEY) ?? 0)).toBe(0)

    // Once the branch data is healthy again, a genuine wrong PIN gets the FULL
    // budget (remaining 4) — proving the faults consumed none of it.
    decryptState.impl = (v: string) => v.replace('enc:', '')
    try {
      await redeem(prisma, redis, WRONG_PIN)
      throw new Error('expected throw')
    } catch (err: any) {
      expect(err.code).toBe('INVALID_PIN')
      expect(err.details.remainingAttempts).toBe(4)
    }
  })
})
