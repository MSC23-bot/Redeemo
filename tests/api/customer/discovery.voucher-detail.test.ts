import 'dotenv/config'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Backend cycle-window enforcement tests for getCustomerVoucher.
//
// Why these exist (see PR #40 review): the previous implementation
// returned `cycleState?.isRedeemedInCurrentCycle ?? false` directly,
// without checking which cycle the row belonged to. The redemption
// guard in src/api/redemption/service.ts:108-124 DOES check
// `cycleState.cycleStartDate >= cycleStart` against
// `getCurrentCycleWindow(sub.cycleAnchorDate, now)`. After a cycle
// rollover OR a `cycleAnchorDate` reset (e.g. dev grant-script run,
// resubscribe scenario), the screen could show "Already redeemed"
// for a voucher the backend mutation would happily accept.
//
// These tests pin the fix: getCustomerVoucher now mirrors the
// redemption guard exactly. Three scenarios:
//   1. Stored cycleState belongs to CURRENT cycle → true.
//   2. Stored cycleState belongs to PREVIOUS cycle → false (rollover).
//   3. No subscription / wrong status / no cycle row → false.

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class PrismaPg {
    constructor(_opts: { connectionString: string }) {}
  },
}))

vi.mock('../../../generated/prisma/client', () => {
  class PrismaClient {
    voucher                 = { findUnique: vi.fn() }
    subscription            = { findUnique: vi.fn() }
    userVoucherCycleState   = { findUnique: vi.fn() }
    favouriteVoucher        = { findUnique: vi.fn() }
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
    businessName: 'Test',
    tradingName: null,
    logoUrl: null,
    status: 'ACTIVE',
  },
}

function makePrisma() {
  const prisma = new PrismaClient({} as any) as any
  prisma.voucher.findUnique.mockResolvedValue(baseVoucherRow)
  prisma.favouriteVoucher.findUnique.mockResolvedValue(null)
  return prisma
}

describe('getCustomerVoucher — isRedeemedThisCycle cycle-window enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('CURRENT cycle: returns true when stored cycleStartDate is in the current cycle and sub is ACTIVE', async () => {
    const prisma = makePrisma()
    const now = new Date('2026-05-15T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    // ACTIVE sub anchored to day-of-month 5 in May → current cycle
    // window starts 2026-05-05T00:00:00.000Z.
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cycleAnchorDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      // Stored row's cycleStartDate matches the current window start.
      cycleStartDate: new Date('2026-05-05T00:00:00.000Z'),
    })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)
    expect(result.isRedeemedThisCycle).toBe(true)
    vi.useRealTimers()
  })

  it('PREVIOUS cycle (rollover): returns false even though isRedeemedInCurrentCycle row says true — flag is from a stale cycle', async () => {
    const prisma = makePrisma()
    const now = new Date('2026-05-15T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cycleAnchorDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,                                  // stale flag
      cycleStartDate: new Date('2026-04-05T00:00:00.000Z'),            // last cycle's window
    })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)
    // Stored row is from the PREVIOUS cycle window — rolled over.
    // Frontend must show this voucher as redeemable.
    expect(result.isRedeemedThisCycle).toBe(false)
    vi.useRealTimers()
  })

  it('cycleAnchorDate reset scenario (dev script / resubscribe): returns false when stored cycleStartDate predates the new anchor', async () => {
    // Simulates: user was redeemed under old anchor 2026-04-05, then
    // dev script / resubscribe sets anchor to 2026-05-05. The stored
    // cycle-state row's cycleStartDate (2026-04-05) is now BEFORE the
    // current cycle window's start (2026-05-05), so the flag must
    // evaluate to false.
    const prisma = makePrisma()
    const now = new Date('2026-05-15T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cycleAnchorDate: new Date('2026-05-05T00:00:00.000Z'),     // new anchor
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date('2026-04-05T00:00:00.000Z'),       // pre-reset
    })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)
    expect(result.isRedeemedThisCycle).toBe(false)
    vi.useRealTimers()
  })

  it('NO subscription: returns false even when a cycle row exists (free user can never be "redeemed this cycle" semantically)', async () => {
    const prisma = makePrisma()
    prisma.subscription.findUnique.mockResolvedValue(null)
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)
    expect(result.isRedeemedThisCycle).toBe(false)
  })

  it('CANCELLED subscription: returns false (only ACTIVE/TRIALLING evaluate cycle state)', async () => {
    const prisma = makePrisma()
    const now = new Date('2026-05-15T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

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
    vi.useRealTimers()
  })

  it('PAST_DUE subscription: returns false (matches redemption guard\'s ACTIVE/TRIALLING-only set)', async () => {
    const prisma = makePrisma()
    const now = new Date('2026-05-15T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

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
    vi.useRealTimers()
  })

  it('TRIALLING subscription: same cycle-window check as ACTIVE — returns true for current-cycle redemption', async () => {
    const prisma = makePrisma()
    const now = new Date('2026-05-15T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    prisma.subscription.findUnique.mockResolvedValue({
      status: 'TRIALLING',
      cycleAnchorDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: true,
      cycleStartDate: new Date('2026-05-05T00:00:00.000Z'),
    })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)
    expect(result.isRedeemedThisCycle).toBe(true)
    vi.useRealTimers()
  })

  it('NO cycle row: returns false (user never redeemed this voucher)', async () => {
    const prisma = makePrisma()
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cycleAnchorDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue(null)

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)
    expect(result.isRedeemedThisCycle).toBe(false)
  })

  it('flag stored as false in current cycle: returns false (still redeemable)', async () => {
    const prisma = makePrisma()
    const now = new Date('2026-05-15T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cycleAnchorDate: new Date('2026-05-05T00:00:00.000Z'),
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({
      isRedeemedInCurrentCycle: false,
      cycleStartDate: new Date('2026-05-05T00:00:00.000Z'),
    })

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, USER_ID)
    expect(result.isRedeemedThisCycle).toBe(false)
    vi.useRealTimers()
  })
})

describe('getCustomerVoucher — guest (userId null)', () => {
  it('returns isRedeemedThisCycle:false + isFavourited:false without touching subscription/cycle-state queries', async () => {
    const prisma = makePrisma()

    const result = await getCustomerVoucher(prisma, VOUCHER_ID, null)
    expect(result.isRedeemedThisCycle).toBe(false)
    expect(result.isFavourited).toBe(false)
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled()
    expect(prisma.userVoucherCycleState.findUnique).not.toHaveBeenCalled()
    expect(prisma.favouriteVoucher.findUnique).not.toHaveBeenCalled()
  })
})
