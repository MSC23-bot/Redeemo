import { describe, it, expect, vi, beforeEach } from 'vitest'

// Race-safe atomic cycle-state claim — flow logic.
//
// IMPORTANT: this mocked-Prisma harness CANNOT prove the real Postgres
// concurrency property. The race-safe design intentionally avoids
// continuing to query inside a transaction after a P2002 error
// (Postgres marks the tx 25P02 in_failed_sql_transaction; subsequent
// queries fail with "current transaction is aborted"). The
// implementation handles P2002 by:
//   1. First $transaction throws P2002 → Prisma rolls it back → our
//      outer catch (OUTSIDE the tx) sees the P2002.
//   2. We open a FRESH $transaction and retry the conditional
//      updateMany only (no create, since the row now exists).
//
// What we test here is the FLOW LOGIC across the two-transaction shape:
//
//   Single tx, no retry:
//     1. updateMany count=1 → claim ok via update; redemption written.
//     2. updateMany count=0 → create succeeds → claim ok; redemption written.
//
//   Two transactions:
//     3. updateMany count=0 → create P2002 → first tx rolls back →
//        retry tx updateMany count=1 → claim ok; redemption written.
//     4. updateMany count=0 → create P2002 → first tx rolls back →
//        retry tx updateMany count=0 → ALREADY_REDEEMED, no redemption.
//
//   Single tx, error propagated:
//     5. updateMany count=0 → create non-P2002 error → re-thrown.
//     6. WHERE clause shape pinned (both stale-cycle and not-yet-redeemed).
//
// See docs/superpowers/plans/2026-05-06-voucher-detail-m2.md §A5.

vi.mock('../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

import { createRedemption } from '../../../src/api/redemption/service'

const REAL_PIN = '1234'
const baseCtx = { ipAddress: '127.0.0.1', userAgent: 'test' }

function mockHappyPrisma() {
  // Tx mock — shared across all $transaction invocations within a single
  // createRedemption call. Each test uses mockResolvedValueOnce/
  // mockRejectedValueOnce to sequence behaviour across calls.
  const tx: any = {
    userVoucherCycleState: {
      updateMany: vi.fn(),
      create:     vi.fn(),
    },
    voucherRedemption: {
      create: vi.fn().mockResolvedValue({
        id: 'r1', userId: 'user-1', voucherId: 'v1', branchId: 'b1',
        redemptionCode: 'TESTCODE123',
        estimatedSaving: 5.00,
        isValidated: false,
        redeemedAt: new Date(),
      }),
    },
  }
  const prisma: any = {
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
        status: 'ACTIVE', approvalStatus: 'APPROVED',
        expiryDate: null, estimatedSaving: 5.00,
        merchant: { id: 'm1', status: 'ACTIVE' },
      }),
    },
    userVoucherCycleState: { findUnique: vi.fn().mockResolvedValue(null) },
    voucherRedemption: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue({ phoneVerified: true }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    // $transaction runs the callback with our tx mock. Each call invokes
    // the callback fresh; the tx mock is shared so sequential mocked
    // responses chain across calls (matching the real two-transaction flow).
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  }
  return { prisma, tx }
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

describe('createRedemption — race-safe atomic cycle-state claim (cross-transaction retry)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('FIRST TX, NO RETRY — updateMany count=1 → claim ok via update, no create-fallback, redemption written', async () => {
    const { prisma, tx } = mockHappyPrisma()
    const redis = mockRedis()
    tx.userVoucherCycleState.updateMany.mockResolvedValue({ count: 1 })

    const result = await createRedemption(
      prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx
    )

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.userVoucherCycleState.updateMany).toHaveBeenCalledTimes(1)
    expect(tx.userVoucherCycleState.create).not.toHaveBeenCalled()
    expect(tx.voucherRedemption.create).toHaveBeenCalledTimes(1)
    expect(result.redemptionCode).toBe('TESTCODE123')
  })

  it('FIRST TX, NO RETRY — updateMany count=0 → create succeeds → claim ok, redemption written', async () => {
    const { prisma, tx } = mockHappyPrisma()
    const redis = mockRedis()
    tx.userVoucherCycleState.updateMany.mockResolvedValue({ count: 0 })
    tx.userVoucherCycleState.create.mockResolvedValue({ id: 'cs1' })

    const result = await createRedemption(
      prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx
    )

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.userVoucherCycleState.updateMany).toHaveBeenCalledTimes(1)
    expect(tx.userVoucherCycleState.create).toHaveBeenCalledTimes(1)
    expect(tx.voucherRedemption.create).toHaveBeenCalledTimes(1)
    expect(result.redemptionCode).toBe('TESTCODE123')
  })

  it('TWO TX — first updateMany count=0 → first create P2002 → fresh tx updateMany count=1 → claim ok, redemption written', async () => {
    const { prisma, tx } = mockHappyPrisma()
    const redis = mockRedis()
    // First tx: updateMany count=0; create rejects P2002 → first tx rolls back.
    // Fresh tx (second $transaction call): updateMany count=1; redemption written.
    tx.userVoucherCycleState.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
    tx.userVoucherCycleState.create.mockRejectedValueOnce({ code: 'P2002' })

    const result = await createRedemption(
      prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx
    )

    // The crucial assertion: $transaction was called TWICE. The retry
    // happens in a FRESH transaction, not by continuing inside the
    // failed first transaction.
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(tx.userVoucherCycleState.updateMany).toHaveBeenCalledTimes(2)
    expect(tx.userVoucherCycleState.create).toHaveBeenCalledTimes(1) // only in first tx
    expect(tx.voucherRedemption.create).toHaveBeenCalledTimes(1)     // only after retry succeeds
    expect(result.redemptionCode).toBe('TESTCODE123')
  })

  it('TWO TX — first updateMany count=0 → first create P2002 → fresh tx updateMany count=0 → ALREADY_REDEEMED, no redemption written', async () => {
    const { prisma, tx } = mockHappyPrisma()
    const redis = mockRedis()
    // Concurrent winner already claimed for the current cycle.
    tx.userVoucherCycleState.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
    tx.userVoucherCycleState.create.mockRejectedValueOnce({ code: 'P2002' })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx)
    ).rejects.toThrow('ALREADY_REDEEMED')

    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(tx.userVoucherCycleState.updateMany).toHaveBeenCalledTimes(2)
    expect(tx.userVoucherCycleState.create).toHaveBeenCalledTimes(1)  // only in first tx
    expect(tx.voucherRedemption.create).not.toHaveBeenCalled()         // never reached
  })

  it('FIRST TX, ERROR PROPAGATES — first updateMany count=0 → first create non-P2002 error → re-thrown, no retry', async () => {
    const { prisma, tx } = mockHappyPrisma()
    const redis = mockRedis()
    tx.userVoucherCycleState.updateMany.mockResolvedValue({ count: 0 })
    tx.userVoucherCycleState.create.mockRejectedValue(new Error('connection terminated'))

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx)
    ).rejects.toThrow('connection terminated')

    // No retry on non-P2002 — exactly ONE $transaction call.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.voucherRedemption.create).not.toHaveBeenCalled()
  })

  it('Claim WHERE clause includes both stale-cycle and not-yet-redeemed branches', async () => {
    const { prisma, tx } = mockHappyPrisma()
    const redis = mockRedis()
    tx.userVoucherCycleState.updateMany.mockResolvedValue({ count: 1 })

    await createRedemption(
      prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx
    )

    const updateCall = tx.userVoucherCycleState.updateMany.mock.calls[0][0]
    expect(updateCall.where.userId).toBe('user-1')
    expect(updateCall.where.voucherId).toBe('v1')
    expect(updateCall.where.OR).toHaveLength(2)
    expect(updateCall.where.OR[0]).toMatchObject({ cycleStartDate: { lt: expect.any(Date) } })
    expect(updateCall.where.OR[1]).toMatchObject({ isRedeemedInCurrentCycle: false })
  })

  it('Retry tx (when reached) uses the SAME conditional WHERE clause — no leniency on retry', async () => {
    // Defensive pin: a future refactor must not silently widen the retry
    // WHERE to "any row" — that would re-introduce the race.
    const { prisma, tx } = mockHappyPrisma()
    const redis = mockRedis()
    tx.userVoucherCycleState.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
    tx.userVoucherCycleState.create.mockRejectedValueOnce({ code: 'P2002' })

    await createRedemption(
      prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx
    )

    const firstCall  = tx.userVoucherCycleState.updateMany.mock.calls[0][0]
    const secondCall = tx.userVoucherCycleState.updateMany.mock.calls[1][0]
    expect(secondCall.where).toEqual(firstCall.where)
  })
})
