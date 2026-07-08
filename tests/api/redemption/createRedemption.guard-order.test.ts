import { describe, it, expect, vi, beforeEach } from 'vitest'

// Threat-model regression: PIN oracle closed.
//
// Every eligibility gate (subscription, phone-verified, voucher status +
// expiryDate, branch isActive + merchant coherence, cycle state) must
// reject BEFORE PIN comparison runs. The fail counter must NOT increment
// for any eligibility-failure path. INVALID_PIN is the ONLY error that
// increments the counter, and only after every eligibility check passes.
//
// See docs/superpowers/plans/2026-05-06-voucher-detail-m2.md §Threat model.

vi.mock('../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

import { createRedemption } from '../../../src/api/redemption/service'
import { makeRedemptionRedis } from './helpers/pinLimiterRedis'

const REAL_PIN = '1234'
const WRONG_PIN = '0000'
const baseCtx = { ipAddress: '127.0.0.1', userAgent: 'test' }

// A fully-eligible mock — every gate passes, decrypted PIN is REAL_PIN.
// Each test tweaks ONE field to simulate that gate failing.
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
    userVoucherCycleState: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    voucherRedemption: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ phoneVerified: true }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockResolvedValue({
      id: 'r1', redemptionCode: 'A7K2P9X4',
      voucherId: 'v1', branchId: 'b1', userId: 'user-1',
      redeemedAt: new Date(), isValidated: false,
      estimatedSaving: 5.00,
    }),
  } as any
}

// The PIN rate-limit gate now runs through the shared atomic consume() limiter,
// which calls redis.eval(). "The counter was not touched" is therefore asserted
// as "redis.eval was not called" (the gate was never reached); "the counter was
// touched once" is "redis.eval called once". A correct PIN clears the counter via
// redis.del (unchanged).
const mockRedis = () => makeRedemptionRedis()

describe('createRedemption — guard order (PIN oracle closed)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Eligibility errors must return BEFORE PIN compare ──────────────────
  // Pattern: configure ONE gate to fail, submit a WRONG_PIN, assert:
  //   (a) the eligibility error is thrown (not INVALID_PIN), AND
  //   (b) redis.eval — the atomic rate-limit gate — was never reached (so the
  //       failure counter was never touched).

  it('SUBSCRIPTION_REQUIRED returns before PIN compare (no counter increment)', async () => {
    const prisma = mockHappyPrisma()
    prisma.subscription.findUnique.mockResolvedValue(null)
    const redis = mockRedis()

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
    ).rejects.toThrow('SUBSCRIPTION_REQUIRED')

    expect(redis.eval).not.toHaveBeenCalled()
  })

  it('PHONE_NOT_VERIFIED returns before PIN compare (no counter increment)', async () => {
    const prisma = mockHappyPrisma()
    prisma.user.findUnique.mockResolvedValue({ phoneVerified: false })
    const redis = mockRedis()

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
    ).rejects.toThrow('PHONE_NOT_VERIFIED')

    expect(redis.eval).not.toHaveBeenCalled()
  })

  it('VOUCHER_NOT_FOUND (inactive) returns before PIN compare (no counter increment)', async () => {
    const prisma = mockHappyPrisma()
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1',
      status: 'INACTIVE', approvalStatus: 'APPROVED',
      expiryDate: null, estimatedSaving: 5.00,
      merchant: { id: 'm1', status: 'ACTIVE' },
    })
    const redis = mockRedis()

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
    ).rejects.toThrow('VOUCHER_NOT_FOUND')

    expect(redis.eval).not.toHaveBeenCalled()
  })

  it('BRANCH_MERCHANT_MISMATCH returns before PIN compare (no counter increment)', async () => {
    const prisma = mockHappyPrisma()
    // Branch belongs to a different merchant than the voucher.
    prisma.branch.findUnique.mockResolvedValue({
      id: 'b1', merchantId: 'm-other',
      isActive: true,
      redemptionPin: `enc:${REAL_PIN}`,
    })
    const redis = mockRedis()

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
    ).rejects.toThrow('BRANCH_MERCHANT_MISMATCH')

    expect(redis.eval).not.toHaveBeenCalled()
  })

  it('ALREADY_REDEEMED returns before PIN compare (no counter increment)', async () => {
    const prisma = mockHappyPrisma()
    // Cycle state shows already-redeemed in current cycle window.
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date(),
    })
    const redis = mockRedis()

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
    ).rejects.toThrow('ALREADY_REDEEMED')

    expect(redis.eval).not.toHaveBeenCalled()
  })

  it('PIN_NOT_CONFIGURED returns BEFORE rate-limit check (so a no-PIN branch cannot trip the counter)', async () => {
    const prisma = mockHappyPrisma()
    prisma.branch.findUnique.mockResolvedValue({
      id: 'b1', merchantId: 'm1',
      isActive: true,
      redemptionPin: null, // no PIN set by merchant admin
    })
    const redis = mockRedis()

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
    ).rejects.toThrow('PIN_NOT_CONFIGURED')

    expect(redis.eval).not.toHaveBeenCalled()
  })

  // ── INVALID_PIN ONLY runs once eligibility passes ──────────────────────

  it('INVALID_PIN ONLY returns once eligibility passes (counter increments)', async () => {
    const prisma = mockHappyPrisma()
    const redis = mockRedis()

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
    ).rejects.toThrow('INVALID_PIN')

    expect(redis.eval).toHaveBeenCalledTimes(1)
  })

  it('successful redemption resets counter to zero', async () => {
    const prisma = mockHappyPrisma()
    const redis = mockRedis()

    const result = await createRedemption(
      prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx
    )

    expect(result.redemptionCode).toBe('A7K2P9X4')
    // Correct PIN reached the atomic gate exactly once (redis.eval) and cleared
    // the whole failure counter (redis.del) — no failure is recorded.
    expect(redis.del).toHaveBeenCalled()
    expect(redis.eval).toHaveBeenCalledTimes(1)
  })

  // ── Expired voucher eligibility (server-side; cannot be bypassed by UI) ──

  it('expired voucher + wrong PIN returns VOUCHER_NOT_FOUND, not INVALID_PIN', async () => {
    const prisma = mockHappyPrisma()
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1',
      status: 'ACTIVE', approvalStatus: 'APPROVED',
      expiryDate: new Date('2020-01-01T00:00:00Z'), // expired long ago
      estimatedSaving: 5.00,
      merchant: { id: 'm1', status: 'ACTIVE' },
    })
    const redis = mockRedis()

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
    ).rejects.toThrow('VOUCHER_NOT_FOUND')
  })

  it('expired voucher + wrong PIN does NOT increment the PIN fail counter', async () => {
    const prisma = mockHappyPrisma()
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1',
      status: 'ACTIVE', approvalStatus: 'APPROVED',
      expiryDate: new Date('2020-01-01T00:00:00Z'),
      estimatedSaving: 5.00,
      merchant: { id: 'm1', status: 'ACTIVE' },
    })
    const redis = mockRedis()

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
    ).rejects.toThrow('VOUCHER_NOT_FOUND')

    expect(redis.eval).not.toHaveBeenCalled()
    expect(redis.expire).not.toHaveBeenCalled()
  })

  it('expired voucher cannot create VoucherRedemption even with correct PIN', async () => {
    const prisma = mockHappyPrisma()
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1',
      status: 'ACTIVE', approvalStatus: 'APPROVED',
      expiryDate: new Date('2020-01-01T00:00:00Z'),
      estimatedSaving: 5.00,
      merchant: { id: 'm1', status: 'ACTIVE' },
    })
    const redis = mockRedis()

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx)
    ).rejects.toThrow('VOUCHER_NOT_FOUND')

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  // ── Inactive branch eligibility (server-side; cannot be bypassed by UI) ──

  it('inactive branch + wrong PIN returns BRANCH_UNAVAILABLE, not INVALID_PIN', async () => {
    const prisma = mockHappyPrisma()
    prisma.branch.findUnique.mockResolvedValue({
      id: 'b1', merchantId: 'm1',
      isActive: false,
      redemptionPin: `enc:${REAL_PIN}`,
    })
    const redis = mockRedis()

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
    ).rejects.toThrow('BRANCH_UNAVAILABLE')
  })

  it('inactive branch + wrong PIN does NOT increment the PIN fail counter', async () => {
    const prisma = mockHappyPrisma()
    prisma.branch.findUnique.mockResolvedValue({
      id: 'b1', merchantId: 'm1',
      isActive: false,
      redemptionPin: `enc:${REAL_PIN}`,
    })
    const redis = mockRedis()

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: WRONG_PIN }, baseCtx)
    ).rejects.toThrow('BRANCH_UNAVAILABLE')

    expect(redis.eval).not.toHaveBeenCalled()
    expect(redis.expire).not.toHaveBeenCalled()
  })

  it('inactive branch cannot create VoucherRedemption even with correct PIN', async () => {
    const prisma = mockHappyPrisma()
    prisma.branch.findUnique.mockResolvedValue({
      id: 'b1', merchantId: 'm1',
      isActive: false,
      redemptionPin: `enc:${REAL_PIN}`,
    })
    const redis = mockRedis()

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx)
    ).rejects.toThrow('BRANCH_UNAVAILABLE')

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
