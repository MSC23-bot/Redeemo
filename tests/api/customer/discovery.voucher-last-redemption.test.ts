import 'dotenv/config'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Backend tests for the voucher-detail `lastRedemption` payload extension.
//
// Contract (locked at M3 plan-time, fix 1 from owner review):
//   - cycleStart + cycleEnd are HOISTED to outer scope inside
//     getCustomerVoucher and assigned ONCE inside the ACTIVE/TRIALLING
//     subscription branch via getCurrentCycleWindow().
//   - availableAgainAt, isRedeemedThisCycle, AND lastRedemption all
//     derive from the SAME computed cycle window.
//   - lastRedemption is non-null ONLY when:
//       (1) ACTIVE or TRIALLING subscription, AND
//       (2) isRedeemedThisCycle === true (cycleState row in current
//           window), AND
//       (3) a VoucherRedemption row exists for (userId, voucherId)
//           with redeemedAt within [cycleStart, cycleEnd).
//   - After cycle rollover BOTH isRedeemedThisCycle AND lastRedemption
//     flip to false/null together — by construction.

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class PrismaPg {
    constructor(_opts: { connectionString: string }) {}
  },
}))

vi.mock('../../../generated/prisma/client', () => {
  class PrismaClient {
    // SEC-C3 (Gate-PR-4b): getCustomerVoucher resolves the voucher via
    // `voucher.findFirst` (NOT findUnique) so the non-unique isTestData
    // security filter can gate the query. Mock must expose findFirst.
    voucher                 = { findFirst: vi.fn() }
    subscription            = { findUnique: vi.fn() }
    userVoucherCycleState   = { findUnique: vi.fn() }
    favouriteVoucher        = { findUnique: vi.fn() }
    // M4a-5 — added groupBy used by batchLastRedemptionsByVoucher for
    // TIME_LIMITED redeemedWindow derivation. These tests cover the
    // §P2 lastRedemption path (findFirst-driven); groupBy defaults to
    // [] so the BOGO-typed rows always land on redeemedWindow:null.
    voucherRedemption       = {
      findFirst: vi.fn(),
      groupBy:   vi.fn().mockResolvedValue([]),
    }
    constructor(_opts?: any) {}
  }
  return {
    PrismaClient,
    MerchantStatus:  { ACTIVE: 'ACTIVE' },
    VoucherStatus:   { ACTIVE: 'ACTIVE' },
    ApprovalStatus:  { APPROVED: 'APPROVED' },
  }
})

import { getCustomerVoucher } from '../../../src/api/customer/discovery/service'
import { PrismaClient } from '../../../generated/prisma/client'

const VOUCHER_ID = 'v1'
const USER_ID    = 'u1'

const baseVoucherRow = {
  id: VOUCHER_ID,
  title: 'BOGO',
  type: 'BOGO',
  description: null,
  terms: null,
  imageUrl: null,
  estimatedSaving: 4.5,
  expiryDate: null,
  code: null,
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  merchant: {
    id: 'm1',
    businessName: 'Pizza Palace',
    tradingName: null,
    logoUrl: null,
    status: 'ACTIVE',
  },
  // M4a-4: getCustomerVoucher now selects availabilityWindows for the
  // TIME_LIMITED payload. Non-TIME_LIMITED rows in these tests always
  // see [] (no windows defined).
  availabilityWindows: [],
}

function makePrisma() {
  const prisma = new PrismaClient({} as any) as any
  prisma.voucher.findFirst.mockResolvedValue(baseVoucherRow)
  prisma.favouriteVoucher.findUnique.mockResolvedValue(null)
  return prisma
}

describe('getCustomerVoucher — lastRedemption (cycle-window gated)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('CURRENT cycle — returns lastRedemption with all 5 fields when redeemed within window', async () => {
    const prisma = makePrisma()
    const now = new Date('2026-05-15T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cycleAnchorDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      redemptionCode: 'A7K2P9X4',
      redeemedAt:     new Date('2026-05-12T18:30:00.000Z'),
      isValidated:    false,
      validatedAt:    null,
      branch:         { id: 'b1', name: 'High Street' },
    })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.isRedeemedThisCycle).toBe(true)
    expect(result.availableAgainAt).toBe(new Date('2026-06-05T00:00:00.000Z').toISOString())
    expect(result.lastRedemption).toEqual({
      code:        'A7K2P9X4',
      redeemedAt:  new Date('2026-05-12T18:30:00.000Z').toISOString(),
      branch:      { id: 'b1', name: 'High Street' },
      isValidated: false,
      validatedAt: null,
    })

    // findFirst is called with the cycle-window range from getCurrentCycleWindow,
    // proving the hoisted cycleStart/cycleEnd are reused (not recomputed).
    expect(prisma.voucherRedemption.findFirst).toHaveBeenCalledWith({
      where: {
        userId:    USER_ID,
        voucherId: VOUCHER_ID,
        redeemedAt: {
          gte: new Date('2026-05-05T00:00:00.000Z'),
          lt:  new Date('2026-06-05T00:00:00.000Z'),
        },
      },
      orderBy: { redeemedAt: 'desc' },
      include: { branch: { select: { id: true, name: true } } },
    })

    vi.useRealTimers()
  })

  it('VALIDATED — passes through isValidated:true + validatedAt ISO when staff validated', async () => {
    const prisma = makePrisma()
    const now = new Date('2026-05-15T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cycleAnchorDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    prisma.voucherRedemption.findFirst.mockResolvedValue({
      redemptionCode: 'A7K2P9X4',
      redeemedAt:     new Date('2026-05-12T18:30:00.000Z'),
      isValidated:    true,
      validatedAt:    new Date('2026-05-12T18:31:15.000Z'),
      branch:         { id: 'b1', name: 'High Street' },
    })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.lastRedemption?.isValidated).toBe(true)
    expect(result.lastRedemption?.validatedAt)
      .toBe(new Date('2026-05-12T18:31:15.000Z').toISOString())

    vi.useRealTimers()
  })

  it('PREVIOUS cycle — returns lastRedemption:null even when stored row exists (rollover)', async () => {
    const prisma = makePrisma()
    const now = new Date('2026-05-15T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cycleAnchorDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    // Stored row's cycleStartDate is from the PREVIOUS window — i.e. the
    // user's cycle has rolled over and isRedeemedThisCycle MUST be false,
    // so lastRedemption MUST be null.
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,                                  // stale flag
      cycleStartDate: new Date('2026-04-05T00:00:00.000Z'),            // last cycle
    })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.isRedeemedThisCycle).toBe(false)
    expect(result.lastRedemption).toBeNull()
    // findFirst MUST NOT be queried when the gate is closed — saves a DB hit.
    expect(prisma.voucherRedemption.findFirst).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('NO subscription — returns lastRedemption:null + does not query VoucherRedemption', async () => {
    const prisma = makePrisma()
    prisma.subscription.findUnique.mockResolvedValue(null)
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date('2026-05-05T00:00:00.000Z'),
    })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.isRedeemedThisCycle).toBe(false)
    expect(result.availableAgainAt).toBeNull()
    expect(result.lastRedemption).toBeNull()
    expect(prisma.voucherRedemption.findFirst).not.toHaveBeenCalled()
  })

  it('CANCELLED subscription — returns lastRedemption:null', async () => {
    const prisma = makePrisma()
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'CANCELLED',
      cycleAnchorDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date('2026-05-05T00:00:00.000Z'),
    })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.isRedeemedThisCycle).toBe(false)
    expect(result.availableAgainAt).toBeNull()
    expect(result.lastRedemption).toBeNull()
    expect(prisma.voucherRedemption.findFirst).not.toHaveBeenCalled()
  })

  it('PAST_DUE subscription — returns lastRedemption:null', async () => {
    const prisma = makePrisma()
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'PAST_DUE',
      cycleAnchorDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date('2026-05-05T00:00:00.000Z'),
    })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.isRedeemedThisCycle).toBe(false)
    expect(result.lastRedemption).toBeNull()
    expect(prisma.voucherRedemption.findFirst).not.toHaveBeenCalled()
  })

  it('NOT REDEEMED — current cycle but no cycle-state row → lastRedemption:null', async () => {
    const prisma = makePrisma()
    const now = new Date('2026-05-15T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cycleAnchorDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue(null)

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.isRedeemedThisCycle).toBe(false)
    // availableAgainAt IS computed for active subscribers even without a
    // redemption — it's the cycle-window end, used for "Renews on" copy
    // pre-redemption.
    expect(result.availableAgainAt).toBe(new Date('2026-06-05T00:00:00.000Z').toISOString())
    expect(result.lastRedemption).toBeNull()
    expect(prisma.voucherRedemption.findFirst).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('GUEST (userId null) — returns lastRedemption:null + does not touch any user-scoped query', async () => {
    const prisma = makePrisma()

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, null)

    expect(result.isRedeemedThisCycle).toBe(false)
    expect(result.availableAgainAt).toBeNull()
    expect(result.lastRedemption).toBeNull()
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled()
    expect(prisma.userVoucherCycleState.findUnique).not.toHaveBeenCalled()
    expect(prisma.voucherRedemption.findFirst).not.toHaveBeenCalled()
  })

  it('CURRENT cycle but VoucherRedemption row missing — lastRedemption:null (defensive)', async () => {
    // Defensive: the cycle-state flag says redeemed-this-cycle but no
    // matching VoucherRedemption row exists in the window. Should NOT
    // throw — should gracefully return lastRedemption:null. The
    // cycle-state and redemption tables can theoretically diverge in
    // exotic dev/test scenarios; the customer-app should still render
    // (just without the persisted-card extras).
    const prisma = makePrisma()
    const now = new Date('2026-05-15T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cycleAnchorDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    prisma.voucherRedemption.findFirst.mockResolvedValue(null)

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)

    expect(result.isRedeemedThisCycle).toBe(true)   // cycle-state says so
    expect(result.lastRedemption).toBeNull()        // but no row to surface
    expect(prisma.voucherRedemption.findFirst).toHaveBeenCalled()  // gate was open

    vi.useRealTimers()
  })
})
