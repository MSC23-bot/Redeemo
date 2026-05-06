import { describe, it, expect, vi, beforeEach } from 'vitest'

// Race-safe atomic cycle-state claim — flow logic.
//
// Under mocked Prisma (the project's redemption test harness), we can't
// truly test the post-PIN concurrency property — that property comes from
// Postgres atomicity + the conditional updateMany WHERE clause. What WE
// test here is the flow logic:
//
//   1. updateMany returns count=1 → claim succeeds, no create fallback.
//   2. updateMany returns count=0 → create attempt; success → claim ok.
//   3. updateMany returns count=0 → create P2002 → retry updateMany;
//      retry count=1 → claim ok.
//   4. updateMany returns count=0 → create P2002 → retry updateMany;
//      retry count=0 → throw ALREADY_REDEEMED.
//   5. updateMany returns count=0 → create non-P2002 error → re-throw.
//
// The real concurrency property (two simultaneous createRedemption calls
// produce exactly one VoucherRedemption + one ALREADY_REDEEMED) needs
// real Postgres + isolation. Track separately as integration coverage if
// needed; not within this mocked-harness scope.
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
    $transaction: vi.fn(async (cb: any) => cb(tx)), // run the callback with our tx mock
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

describe('createRedemption — race-safe atomic cycle-state claim', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('updateMany returns count=1 → claim succeeds, create-fallback not invoked, redemption written', async () => {
    const { prisma, tx } = mockHappyPrisma()
    const redis = mockRedis()
    tx.userVoucherCycleState.updateMany.mockResolvedValue({ count: 1 })

    const result = await createRedemption(
      prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx
    )

    expect(tx.userVoucherCycleState.updateMany).toHaveBeenCalledTimes(1)
    expect(tx.userVoucherCycleState.create).not.toHaveBeenCalled()
    expect(tx.voucherRedemption.create).toHaveBeenCalledTimes(1)
    expect(result.redemptionCode).toBe('TESTCODE123')
  })

  it('updateMany count=0 → create succeeds → claim ok, redemption written', async () => {
    const { prisma, tx } = mockHappyPrisma()
    const redis = mockRedis()
    tx.userVoucherCycleState.updateMany.mockResolvedValue({ count: 0 })
    tx.userVoucherCycleState.create.mockResolvedValue({ id: 'cs1' })

    const result = await createRedemption(
      prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx
    )

    expect(tx.userVoucherCycleState.updateMany).toHaveBeenCalledTimes(1)
    expect(tx.userVoucherCycleState.create).toHaveBeenCalledTimes(1)
    expect(tx.voucherRedemption.create).toHaveBeenCalledTimes(1)
    expect(result.redemptionCode).toBe('TESTCODE123')
  })

  it('updateMany count=0 → create P2002 → retry updateMany count=1 → claim ok, redemption written', async () => {
    const { prisma, tx } = mockHappyPrisma()
    const redis = mockRedis()
    // First updateMany: no row to update.
    // create: P2002 (concurrent winner inserted the row).
    // Retry updateMany: WHERE matches because the concurrent winner's row
    //   does not satisfy the WHERE; but for THIS test we simulate the
    //   *self-recovery* path where the row appears claimable on retry
    //   (e.g. an aborted concurrent transaction).
    tx.userVoucherCycleState.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
    tx.userVoucherCycleState.create.mockRejectedValue({ code: 'P2002' })

    const result = await createRedemption(
      prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx
    )

    expect(tx.userVoucherCycleState.updateMany).toHaveBeenCalledTimes(2)
    expect(tx.userVoucherCycleState.create).toHaveBeenCalledTimes(1)
    expect(tx.voucherRedemption.create).toHaveBeenCalledTimes(1)
    expect(result.redemptionCode).toBe('TESTCODE123')
  })

  it('updateMany count=0 → create P2002 → retry updateMany count=0 → throws ALREADY_REDEEMED, no redemption written', async () => {
    const { prisma, tx } = mockHappyPrisma()
    const redis = mockRedis()
    // Concurrent winner already claimed for the current cycle. Both
    // updateMany attempts return count=0; create hits P2002.
    tx.userVoucherCycleState.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
    tx.userVoucherCycleState.create.mockRejectedValue({ code: 'P2002' })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx)
    ).rejects.toThrow('ALREADY_REDEEMED')

    expect(tx.userVoucherCycleState.updateMany).toHaveBeenCalledTimes(2)
    expect(tx.userVoucherCycleState.create).toHaveBeenCalledTimes(1)
    expect(tx.voucherRedemption.create).not.toHaveBeenCalled()
  })

  it('updateMany count=0 → create throws non-P2002 error → re-thrown (no swallowing of other DB errors)', async () => {
    const { prisma, tx } = mockHappyPrisma()
    const redis = mockRedis()
    tx.userVoucherCycleState.updateMany.mockResolvedValue({ count: 0 })
    // Some other DB error — e.g. connection lost mid-write.
    const dbError = new Error('connection terminated')
    tx.userVoucherCycleState.create.mockRejectedValue(dbError)

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx)
    ).rejects.toThrow('connection terminated')

    expect(tx.userVoucherCycleState.updateMany).toHaveBeenCalledTimes(1) // no retry on non-P2002
    expect(tx.voucherRedemption.create).not.toHaveBeenCalled()
  })

  it('claim WHERE clause includes both stale-cycle and not-yet-redeemed branches', async () => {
    const { prisma, tx } = mockHappyPrisma()
    const redis = mockRedis()
    tx.userVoucherCycleState.updateMany.mockResolvedValue({ count: 1 })

    await createRedemption(
      prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: REAL_PIN }, baseCtx
    )

    // Verify the WHERE clause shape — both OR clauses must be present.
    const updateCall = tx.userVoucherCycleState.updateMany.mock.calls[0][0]
    expect(updateCall.where.userId).toBe('user-1')
    expect(updateCall.where.voucherId).toBe('v1')
    expect(updateCall.where.OR).toHaveLength(2)
    // Stale cycle branch
    expect(updateCall.where.OR[0]).toMatchObject({ cycleStartDate: { lt: expect.any(Date) } })
    // Not-yet-redeemed branch
    expect(updateCall.where.OR[1]).toMatchObject({ isRedeemedInCurrentCycle: false })
  })
})
