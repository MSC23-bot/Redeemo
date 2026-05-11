import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * REUSABLE v1 Task 4 — atomic-claim branch (mocked).
 *
 * Pins the SHAPE of the REUSABLE atomic-claim branch inside
 * `prisma.$transaction`:
 *
 *   1. Successful insert path: voucherRedemption.create called with
 *      windowStartsAt=null. UserVoucherCycleState.upsert / .create /
 *      .updateMany are NOT touched — REUSABLE bypasses cycle state (D11).
 *   2. Transactional re-check failure: if a concurrent insert lands
 *      between Guard 8a (pre-PIN) and the lock acquisition, the
 *      transactional re-read finds it and we throw REUSABLE_COOLDOWN_ACTIVE
 *      with `availableAgainAt` matching `latest.redeemedAt + cooldownMs`.
 *   3. Lock-call shape smoke test: tx.$executeRaw must be invoked with a
 *      template that includes `pg_advisory_xact_lock(` and references the
 *      `userId` + `voucherId` arguments. Implementation-detail sensitive,
 *      but useful as a regression guard for the lock-call wiring.
 *   4. No manual unlock: no pg_advisory_xact_unlock call. Postgres releases
 *      `pg_advisory_xact_lock` automatically on transaction commit/rollback.
 *
 * Mocking convention mirrors tests/api/redemption/cooldown-guard.test.ts +
 * tests/api/redemption/timeLimited.test.ts — vi.fn() Prisma stubs, fake
 * timers fixed at a known NOW, `$transaction` shimmed via a real callback
 * that receives a `tx` with `$executeRaw` + `voucherRedemption` mocks.
 *
 * Real Postgres lock semantics are proven separately in
 * `advisory-lock-race.integration.test.ts` (canonical proof per spec §5.5).
 *
 * Spec §5.2, §5.3, §5.5. Plan Step 4.1.
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

interface AtomicClaimMockOpts {
  /**
   * Raw merchant-configured cooldown (seconds). `null` → platform default
   * (4h = 14400s). Below 1800 is clamped at runtime to the 30-min floor.
   */
  cooldownSeconds?: number | null
  /**
   * Pre-PIN findFirst result — controls whether Guard 8a fires.
   * `null` means no prior redemption (Guard 8a passes; flow enters the
   * atomic-claim transaction).
   */
  preTxLastRedeemedAt?: Date | null
  /**
   * Transactional findFirst result — simulates a concurrent winner landing
   * BETWEEN Guard 8a and the lock acquisition. If non-null AND within
   * cooldown of NOW, the in-transaction re-check throws.
   */
  txLastRedeemedAt?: Date | null
  /**
   * Spy bucket for the transaction-internal Prisma mocks. Populated by the
   * `$transaction` shim so tests can assert on `tx.$executeRaw`,
   * `tx.voucherRedemption.create`, and `tx.userVoucherCycleState.*`.
   */
  txSpies?: any
}

function mockReusablePrisma(opts: AtomicClaimMockOpts = {}) {
  const cooldownSeconds = opts.cooldownSeconds === undefined ? null : opts.cooldownSeconds
  const preTxLastRedeemedAt = opts.preTxLastRedeemedAt === undefined ? null : opts.preTxLastRedeemedAt
  const txLastRedeemedAt    = opts.txLastRedeemedAt === undefined ? null : opts.txLastRedeemedAt
  const txSpies             = opts.txSpies ?? {}

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
      // Defensive — REUSABLE must NEVER read or write cycle state.
      findUnique: vi.fn().mockResolvedValue(null),
    },
    voucherRedemption: {
      // Pre-PIN Guard 8a findFirst — happy path returns null so Guard 8a
      // passes and control flows into the atomic-claim transaction.
      findFirst: vi.fn().mockResolvedValue(
        preTxLastRedeemedAt ? { redeemedAt: preTxLastRedeemedAt } : null,
      ),
      create: vi.fn(), findUnique: vi.fn(), update: vi.fn(),
      findMany: vi.fn(), count: vi.fn(),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (fn: any) => {
      // Build a `tx` that mirrors the live Postgres tx surface relevant
      // to the REUSABLE branch: $executeRaw (the advisory lock),
      // voucherRedemption.findFirst (the in-transaction cooldown re-check),
      // voucherRedemption.create (the insert), and the cycle-state methods
      // so a defensive regression catches a wrong-branch leak.
      txSpies.executeRaw          = vi.fn().mockResolvedValue(1)
      txSpies.txFindFirst         = vi.fn().mockResolvedValue(
        txLastRedeemedAt ? { redeemedAt: txLastRedeemedAt } : null,
      )
      txSpies.txRedemptionCreate  = vi.fn().mockResolvedValue({
        id: 'r1', userId: 'user-1', voucherId: 'v1', branchId: 'b1',
        redemptionCode: 'A7K2P9X4', estimatedSaving: 5.00,
        isValidated: false, redeemedAt: NOW,
      })
      txSpies.txCycleUpdateMany   = vi.fn().mockResolvedValue({ count: 0 })
      txSpies.txCycleCreate       = vi.fn().mockResolvedValue({})
      txSpies.txCycleUpsert       = vi.fn().mockResolvedValue({})

      const tx = {
        $executeRaw: txSpies.executeRaw,
        voucherRedemption: {
          findFirst: txSpies.txFindFirst,
          create:    txSpies.txRedemptionCreate,
        },
        userVoucherCycleState: {
          updateMany: txSpies.txCycleUpdateMany,
          create:     txSpies.txCycleCreate,
          upsert:     txSpies.txCycleUpsert,
        },
      }
      return await fn(tx)
    }),
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

describe('createRedemption — REUSABLE atomic claim (mocked, spec §5.2)', () => {
  it('on success: inserts VoucherRedemption with windowStartsAt=null + no UserVoucherCycleState write', async () => {
    const txSpies: any = {}
    const prisma = mockReusablePrisma({
      cooldownSeconds:     null,            // platform default (4h)
      preTxLastRedeemedAt: null,            // Guard 8a passes
      txLastRedeemedAt:    null,            // no concurrent winner
      txSpies,
    })
    const redis = mockRedis()

    await expect(
      createRedemption(
        prisma, redis, 'user-1',
        { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN },
        baseCtx,
      ),
    ).resolves.toBeDefined()

    // Atomic claim ran exactly once.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)

    // VoucherRedemption inserted with windowStartsAt=null (D11 — REUSABLE
    // uses NULL so it does not conflict with the @@unique([userId,
    // voucherId, windowStartsAt]) constraint).
    expect(txSpies.txRedemptionCreate).toHaveBeenCalledTimes(1)
    const createArg = txSpies.txRedemptionCreate.mock.calls[0][0]
    expect(createArg.data).toMatchObject({
      userId:    'user-1',
      voucherId: 'v1',
      branchId:  'b1',
      windowStartsAt: null,
    })

    // UserVoucherCycleState MUST NOT be touched on the REUSABLE branch —
    // its truth is `lastRedeemedAt + effectiveCooldownMs`, not the cycle
    // state row. Defensive pin against a regression that accidentally
    // routes REUSABLE into the cycle-state branch.
    expect(txSpies.txCycleUpdateMany).not.toHaveBeenCalled()
    expect(txSpies.txCycleCreate).not.toHaveBeenCalled()
    expect(txSpies.txCycleUpsert).not.toHaveBeenCalled()
  })

  it('on transactional re-check failure: rejects with REUSABLE_COOLDOWN_ACTIVE', async () => {
    // Guard 8a passes (no prior redemption), but BETWEEN Guard 8a and the
    // lock acquisition a concurrent transaction inserted a redemption.
    // The in-transaction findFirst sees it and we throw COOLDOWN_ACTIVE.
    const concurrentWinnerAt = new Date(NOW.getTime() - 60 * 60 * 1000) // 1h ago
    // Default cooldown 4h → availableAgainAt = winner + 4h.
    const expectedAvailableAgainAt = new Date(
      concurrentWinnerAt.getTime() + 4 * 60 * 60 * 1000,
    ).toISOString()

    const txSpies: any = {}
    const prisma = mockReusablePrisma({
      cooldownSeconds:     null,                 // 4h default
      preTxLastRedeemedAt: null,                 // Guard 8a passes
      txLastRedeemedAt:    concurrentWinnerAt,   // concurrent winner
      txSpies,
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

    // The in-transaction re-check ran (proves the branch entered) but the
    // create did NOT (the throw aborts the transaction before the insert).
    expect(txSpies.txFindFirst).toHaveBeenCalledTimes(1)
    expect(txSpies.txRedemptionCreate).not.toHaveBeenCalled()

    // Cycle state must stay untouched even on the failure path.
    expect(txSpies.txCycleUpdateMany).not.toHaveBeenCalled()
    expect(txSpies.txCycleCreate).not.toHaveBeenCalled()
    expect(txSpies.txCycleUpsert).not.toHaveBeenCalled()
  })

  it('acquires a pg_advisory_xact_lock keyed on userId + voucherId', async () => {
    // Spy on tx.$executeRaw and verify the SQL template + arguments.
    // Prisma raw template-literal calls receive the SQL as a TemplateStringsArray
    // and the interpolated values as the remaining arguments.
    const txSpies: any = {}
    const prisma = mockReusablePrisma({
      cooldownSeconds:     null,
      preTxLastRedeemedAt: null,
      txLastRedeemedAt:    null,
      txSpies,
    })
    const redis = mockRedis()

    await createRedemption(
      prisma, redis, 'user-1',
      { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN },
      baseCtx,
    )

    expect(txSpies.executeRaw).toHaveBeenCalledTimes(1)
    const args = txSpies.executeRaw.mock.calls[0]
    // First arg is a TemplateStringsArray (raw SQL parts).
    const sql = (args[0] as readonly string[]).join('?')
    expect(sql).toContain('pg_advisory_xact_lock(')
    // Remaining args are the interpolated values: the userId + voucherId.
    expect(args.slice(1)).toEqual(['user-1', 'v1'])
  })

  it('does not call pg_advisory_xact_unlock (Postgres releases on tx commit)', async () => {
    // The lock is transaction-scoped (`pg_advisory_xact_lock`) — Postgres
    // automatically releases it on COMMIT or ROLLBACK. A manual unlock
    // call would be either a no-op or a bug; either way it MUST NOT
    // appear in the service.
    const txSpies: any = {}
    const prisma = mockReusablePrisma({
      cooldownSeconds:     null,
      preTxLastRedeemedAt: null,
      txLastRedeemedAt:    null,
      txSpies,
    })
    const redis = mockRedis()

    await createRedemption(
      prisma, redis, 'user-1',
      { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN },
      baseCtx,
    )

    // Inspect every $executeRaw template literal — none of them may
    // reference pg_advisory_xact_unlock or pg_advisory_unlock.
    for (const call of txSpies.executeRaw.mock.calls) {
      const sql = (call[0] as readonly string[]).join('?')
      expect(sql).not.toContain('pg_advisory_xact_unlock')
      expect(sql).not.toContain('pg_advisory_unlock')
    }
  })
})
