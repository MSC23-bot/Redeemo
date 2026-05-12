import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * REUSABLE v1 Task 3 — pre-PIN Guard 8a cooldown check.
 *
 * Pins:
 *   1. REUSABLE_COOLDOWN_ACTIVE fires when the user's latest redemption
 *      for (userId, voucherId) sits inside the effective cooldown window.
 *      Payload `availableAgainAt` (ISO) = lastRedeemedAt + effectiveCooldownMs.
 *   2. Guard 8a passes when cooldown has elapsed (no throw, control flows
 *      to PIN-compare and atomic-claim).
 *   3. Guard 8a passes when there's no prior redemption.
 *   4. Floor clamp: raw cooldownSeconds below 1800 is treated as 1800.
 *      A 5-min-old redemption with raw=60 still throws (effective floor wins).
 *   5. Above-floor raw value is honoured: cooldownSeconds=7200 (2h) blocks
 *      a 1h-old redemption.
 *   6. Non-REUSABLE voucher (BOGO with recent redemption) → cycle gate
 *      fires (ALREADY_REDEEMED), NOT cooldown gate. Verifies the new
 *      branch doesn't poach control from the existing cycle branch.
 *
 * Mocking convention follows tests/api/redemption/service.test.ts +
 * tests/api/redemption/timeLimited.test.ts — vi.fn() Prisma stubs, fake
 * timers fixed at a known NOW. No real DB; Task 4 owns the real-DB
 * advisory-lock race test.
 *
 * Spec §5.1, §5.3. Plan Step 3.3 / 3.5.
 */

vi.mock('../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

import { createRedemption } from '../../../src/api/redemption/service'

const REAL_PIN = '1234'
const baseCtx = { ipAddress: '127.0.0.1', userAgent: 'test' }

// Fixed system time for deterministic availableAgainAt assertions.
const NOW = new Date('2026-05-12T12:00:00.000Z')

interface ReusablePrismaOpts {
  /**
   * Raw merchant-configured cooldown (seconds). `null` → platform default
   * (4h = 14400s). Below 1800 is clamped at runtime to the 30-min floor by
   * `effectiveCooldownSeconds(voucher)`.
   */
  cooldownSeconds?: number | null
  /**
   * Most-recent VoucherRedemption.redeemedAt for (userId, voucherId).
   * `null` → no prior redemption.
   */
  lastRedeemedAt?: Date | null
}

/**
 * REUSABLE-flavoured happy-path Prisma mock. All eligibility guards
 * (voucher, branch, subscription, phone) pass — Guard 8a is the only
 * material check exercised here.
 */
function mockReusablePrisma(opts: ReusablePrismaOpts = {}) {
  const cooldownSeconds = opts.cooldownSeconds === undefined ? null : opts.cooldownSeconds
  const lastRedeemedAt  = opts.lastRedeemedAt === undefined ? null : opts.lastRedeemedAt

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
        cycleAnchorDate: new Date(Date.UTC(2026, 0, 10)),
      }),
    },
    voucher: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'v1', merchantId: 'm1',
        type: 'REUSABLE',
        status: 'ACTIVE', approvalStatus: 'APPROVED',
        expiryDate: null,
        estimatedSaving: 5.00,
        cooldownSeconds,
        merchant: { id: 'm1', status: 'ACTIVE' },
        availabilityWindows: [],
      }),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ phoneVerified: true }) },
    userVoucherCycleState: {
      // Defensive — REUSABLE must NEVER read cycle state. The mock returns
      // null so a regression that accidentally invokes it doesn't blow up
      // before the assertion catches the wrong-branch behaviour.
      findUnique: vi.fn().mockResolvedValue(null),
    },
    voucherRedemption: {
      findFirst: vi.fn().mockResolvedValue(
        lastRedeemedAt ? { redeemedAt: lastRedeemedAt } : null,
      ),
      create: vi.fn(), findUnique: vi.fn(), update: vi.fn(),
      findMany: vi.fn(), count: vi.fn(),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    // Mock $transaction so the happy-path tests (no cooldown / cooldown
    // elapsed) succeed past Guard 8a + PIN compare and exit cleanly.
    // Task 4 owns the real atomic-claim shape; for Task 3 we just need a
    // pass-through that returns the same redemption record.
    $transaction: vi.fn().mockResolvedValue({
      id: 'r1', userId: 'user-1', voucherId: 'v1', branchId: 'b1',
      redemptionCode: 'A7K2P9X4', estimatedSaving: 5.00,
      isValidated: false, redeemedAt: NOW,
    }),
  } as any
}

/**
 * Non-REUSABLE (BOGO) Prisma mock with a recent in-cycle redemption.
 * Used to prove Guard 8a doesn't poach control from the existing
 * cycle-state branch.
 */
function mockBogoPrismaWithRecentCycleRedemption() {
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
        cycleAnchorDate: new Date(Date.UTC(2026, 4, 1)),
      }),
    },
    voucher: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'v1', merchantId: 'm1',
        type: 'BOGO',
        status: 'ACTIVE', approvalStatus: 'APPROVED',
        expiryDate: null,
        estimatedSaving: 5.00,
        cooldownSeconds: null,
        merchant: { id: 'm1', status: 'ACTIVE' },
        availabilityWindows: [],
      }),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ phoneVerified: true }) },
    userVoucherCycleState: {
      findUnique: vi.fn().mockResolvedValue({
        isRedeemedInCurrentCycle: true,
        cycleStartDate: NOW, // within the current cycle window
      }),
    },
    voucherRedemption: {
      // Defensive — Guard 8a uses findFirst. If the BOGO branch ever
      // accidentally routes here, this returning null would mask the
      // regression. We make it throw so the test catches the wrong-branch
      // execution loudly.
      findFirst: vi.fn().mockImplementation(() => {
        throw new Error(
          'voucherRedemption.findFirst should NOT be called for non-REUSABLE — Guard 8a leaked control',
        )
      }),
      create: vi.fn(), findUnique: vi.fn(), update: vi.fn(),
      findMany: vi.fn(), count: vi.fn(),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  } as any
}

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
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createRedemption — REUSABLE pre-PIN Guard 8a (cooldown)', () => {
  it('passes Guard 8a when no prior redemption (proceeds to PIN + atomic-claim)', async () => {
    // findFirst returns null → no prior redemption → Guard 8a is a no-op.
    // We expect the call to resolve (transaction mock returns a redemption).
    const prisma = mockReusablePrisma({ lastRedeemedAt: null })
    const redis = mockRedis()

    await expect(
      createRedemption(
        prisma, redis, 'user-1',
        { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN },
        baseCtx,
      ),
    ).resolves.toBeDefined()

    expect(prisma.voucherRedemption.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where:   { userId: 'user-1', voucherId: 'v1' },
        orderBy: { redeemedAt: 'desc' },
      }),
    )
    // Defensive: REUSABLE must NOT read UserVoucherCycleState in Guard 8a.
    expect(prisma.userVoucherCycleState.findUnique).not.toHaveBeenCalled()
  })

  it('passes Guard 8a when prior redemption is older than effective cooldown', async () => {
    // Default cooldown is 4h. Last redemption 5h ago → outside the
    // cooldown window → no throw, control flows on.
    const lastRedeemedAt = new Date(NOW.getTime() - 5 * 60 * 60 * 1000)
    const prisma = mockReusablePrisma({
      cooldownSeconds: null, // platform default 14400s (4h)
      lastRedeemedAt,
    })
    const redis = mockRedis()

    await expect(
      createRedemption(
        prisma, redis, 'user-1',
        { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN },
        baseCtx,
      ),
    ).resolves.toBeDefined()
  })

  it('throws REUSABLE_COOLDOWN_ACTIVE when last redemption inside effective cooldown (default 4h)', async () => {
    // Last redemption 1h ago. Default cooldown 4h. Still 3h of cooldown
    // remaining → throw with availableAgainAt = lastRedeemedAt + 4h.
    const lastRedeemedAt = new Date(NOW.getTime() - 60 * 60 * 1000)
    const expectedAvailableAgainAt = new Date(
      lastRedeemedAt.getTime() + 4 * 60 * 60 * 1000,
    ).toISOString()
    const prisma = mockReusablePrisma({
      cooldownSeconds: null,
      lastRedeemedAt,
    })
    const redis = mockRedis()

    try {
      await createRedemption(
        prisma, redis, 'user-1',
        { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN },
        baseCtx,
      )
      throw new Error('expected createRedemption to throw REUSABLE_COOLDOWN_ACTIVE')
    } catch (err: any) {
      expect(err.code).toBe('REUSABLE_COOLDOWN_ACTIVE')
      expect(err.details).toEqual({ availableAgainAt: expectedAvailableAgainAt })
    }

    // Atomic claim must NOT run when Guard 8a rejects.
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('clamps below-floor cooldownSeconds to the 1800s (30min) floor', async () => {
    // Merchant-configured cooldownSeconds = 60 (somehow slipped past Zod +
    // the DB CHECK constraint). The runtime Math.max floor in
    // `effectiveCooldownSeconds(voucher)` clamps to 1800s (30min). A 5-min-
    // ago redemption is still inside the clamped 30-min window, so we throw
    // with availableAgainAt = lastRedeemedAt + 30min.
    const lastRedeemedAt = new Date(NOW.getTime() - 5 * 60 * 1000) // 5min ago
    const expectedAvailableAgainAt = new Date(
      lastRedeemedAt.getTime() + 30 * 60 * 1000, // clamped 30min, NOT 60s
    ).toISOString()
    const prisma = mockReusablePrisma({
      cooldownSeconds: 60, // below floor — must be clamped
      lastRedeemedAt,
    })
    const redis = mockRedis()

    try {
      await createRedemption(
        prisma, redis, 'user-1',
        { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN },
        baseCtx,
      )
      throw new Error('expected createRedemption to throw REUSABLE_COOLDOWN_ACTIVE')
    } catch (err: any) {
      expect(err.code).toBe('REUSABLE_COOLDOWN_ACTIVE')
      expect(err.details).toEqual({ availableAgainAt: expectedAvailableAgainAt })
    }
  })

  it('uses merchant cooldownSeconds when above the 1800s floor', async () => {
    // Merchant-configured cooldownSeconds = 7200 (2h). Above floor — used
    // verbatim. A 1h-ago redemption is still inside the 2h window, so we
    // throw with availableAgainAt = lastRedeemedAt + 2h.
    const lastRedeemedAt = new Date(NOW.getTime() - 60 * 60 * 1000) // 1h ago
    const expectedAvailableAgainAt = new Date(
      lastRedeemedAt.getTime() + 2 * 60 * 60 * 1000, // merchant 2h, not default 4h
    ).toISOString()
    const prisma = mockReusablePrisma({
      cooldownSeconds: 7200, // 2h, above floor
      lastRedeemedAt,
    })
    const redis = mockRedis()

    try {
      await createRedemption(
        prisma, redis, 'user-1',
        { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN },
        baseCtx,
      )
      throw new Error('expected createRedemption to throw REUSABLE_COOLDOWN_ACTIVE')
    } catch (err: any) {
      expect(err.code).toBe('REUSABLE_COOLDOWN_ACTIVE')
      expect(err.details).toEqual({ availableAgainAt: expectedAvailableAgainAt })
    }
  })

  it('does NOT fire Guard 8a for non-REUSABLE voucher types (cycle gate owns BOGO)', async () => {
    // BOGO voucher with a recent in-cycle redemption. The existing cycle
    // branch fires (ALREADY_REDEEMED). Guard 8a must stay inert — its
    // `voucherRedemption.findFirst` mock is wired to throw a distinct error
    // if the REUSABLE branch ever poaches control.
    const prisma = mockBogoPrismaWithRecentCycleRedemption()
    const redis = mockRedis()

    await expect(
      createRedemption(
        prisma, redis, 'user-1',
        { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN },
        baseCtx,
      ),
    ).rejects.toThrow('ALREADY_REDEEMED')

    // Hard pin: the REUSABLE branch's findFirst must NEVER be called for BOGO.
    expect(prisma.voucherRedemption.findFirst).not.toHaveBeenCalled()
    // And the cycle branch's findUnique on UserVoucherCycleState MUST run.
    expect(prisma.userVoucherCycleState.findUnique).toHaveBeenCalled()
  })
})
