import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Slice E: per-voucher analytics unit tests (no real DB). We mock resolveMerchantContext
// (the SESSION resolver) and a minimal Prisma so the aggregation shaping + the privacy
// discipline + the cross-merchant isolation are exercised deterministically.
//
// resolveMerchantContext is the ONLY thing analytics.ts imports from ../shared, so
// mocking that module here does not disturb any other surface. AppError, the eligibility
// SQL builder, the London/daypart helpers, num, intensityBand and busyPeakMinCount are all
// REAL, so the test proves the actual cleanliness + band cut, not a stub of it.
vi.mock('../../../../src/api/merchant/shared', () => ({
  resolveMerchantContext: vi.fn(),
}))

import {
  getVoucherAnalytics,
  bandSlots,
  computeDaysLive,
  resolveLiveSince,
} from '../../../../src/api/merchant/voucher/analytics'
import { resolveMerchantContext } from '../../../../src/api/merchant/shared'
import { AppError } from '../../../../src/api/shared/errors'

const mockResolve = resolveMerchantContext as unknown as ReturnType<typeof vi.fn>

const OWNER_CTX = {
  adminId: 'admin-1',
  merchantId: 'merchant-1',
  role: 'OWNER' as const,
  allBranches: true,
  allowedBranchIds: [] as string[],
  canManageVouchers: true,
}

const ENV_KEYS = ['INSIGHTS_BUSY_PEAK_MIN_COUNT'] as const
const SAVED: Record<string, string | undefined> = {}
beforeEach(() => {
  for (const k of ENV_KEYS) SAVED[k] = process.env[k]
  mockResolve.mockReset()
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k]
    else process.env[k] = SAVED[k]
  }
})

/**
 * A minimal Prisma double. `voucher.findFirst` returns the given voucher (or null),
 * and `$queryRaw` yields the queued result rows IN CALL ORDER (totals, trend, days,
 * dayparts, branches). Every $queryRaw call's Sql is captured so we can assert the
 * eligibility fragment + voucherId parameter are present.
 */
function makePrisma(opts: {
  voucher: { id: string; approvedAt: Date | null; publishedAt: Date | null } | null
  queryResults: unknown[][]
  /** Merchant.status the analytics access gate (assertMerchantActive) reads. Defaults ACTIVE. */
  merchantStatus?: string
}) {
  const calls: any[] = []
  let i = 0
  return {
    calls,
    prisma: {
      // assertMerchantActive selects Merchant.status; default ACTIVE so the happy path passes.
      merchant: { findUnique: vi.fn().mockResolvedValue({ status: opts.merchantStatus ?? 'ACTIVE' }) },
      voucher: { findFirst: vi.fn().mockResolvedValue(opts.voucher) },
      $queryRaw: vi.fn((sql: any) => {
        calls.push(sql)
        return Promise.resolve(opts.queryResults[i++] ?? [])
      }),
    } as any,
  }
}

const STAFF_CTX = { ...OWNER_CTX, role: 'STAFF' as const, allBranches: false, allowedBranchIds: ['b-1'] }
const BM_CTX = { ...OWNER_CTX, role: 'BRANCH_MANAGER' as const }

describe('bandSlots (privacy cut mirrors busy-times)', () => {
  it('maps counts to ordinal bands 0..3 relative to the peak; raw counts never surface', () => {
    // peak = 30. ratios: 30->3, 25->3(>2/3), 15->2(>1/3), 5->1, 0->0.
    const { slots } = bandSlots([0, 5, 15, 25, 30])
    expect(slots.map((s) => s.intensity)).toEqual([0, 1, 2, 3, 3])
    // The returned slots carry ONLY index + intensity (no count field).
    expect(Object.keys(slots[0]).sort()).toEqual(['index', 'intensity'])
  })

  it('all-zero input is a valid all-zero-band result with no busiest', () => {
    process.env.INSIGHTS_BUSY_PEAK_MIN_COUNT = '3'
    const { slots, busiestIndex } = bandSlots([0, 0, 0])
    expect(slots.every((s) => s.intensity === 0)).toBe(true)
    expect(busiestIndex).toBeNull()
  })

  it('NEVER names a busiest slot when no D6 threshold is recorded (fail-closed)', () => {
    delete process.env.INSIGHTS_BUSY_PEAK_MIN_COUNT
    const { busiestIndex } = bandSlots([1, 9, 2])
    expect(busiestIndex).toBeNull()
  })

  it('surfaces the peak index only when the peak count clears the D6 threshold', () => {
    process.env.INSIGHTS_BUSY_PEAK_MIN_COUNT = '5'
    expect(bandSlots([1, 4, 2]).busiestIndex).toBeNull() // peak 4 < 5
    expect(bandSlots([1, 9, 2]).busiestIndex).toBe(1) // peak 9 >= 5
  })
})

describe('computeDaysLive / resolveLiveSince', () => {
  it('computes whole days from liveSince, clamped at 0', () => {
    const live = new Date('2026-01-01T00:00:00Z')
    expect(computeDaysLive(live, new Date('2026-01-11T06:00:00Z'))).toBe(10)
    expect(computeDaysLive(live, new Date('2025-12-31T00:00:00Z'))).toBe(0) // clamp
    expect(computeDaysLive(null, new Date())).toBeNull()
  })

  it('prefers approvedAt, falls back to publishedAt, else null (never createdAt)', () => {
    const a = new Date('2026-02-01T00:00:00Z')
    const p = new Date('2026-01-01T00:00:00Z')
    expect(resolveLiveSince({ approvedAt: a, publishedAt: p })).toEqual({ liveSince: a, source: 'approvedAt' })
    expect(resolveLiveSince({ approvedAt: null, publishedAt: p })).toEqual({ liveSince: p, source: 'publishedAt' })
    expect(resolveLiveSince({ approvedAt: null, publishedAt: null })).toEqual({ liveSince: null, source: null })
  })
})

describe('getVoucherAnalytics', () => {
  it('rejects a cross-merchant / missing voucher with VOUCHER_NOT_FOUND (no aggregation runs)', async () => {
    mockResolve.mockResolvedValue(OWNER_CTX)
    const { prisma } = makePrisma({ voucher: null, queryResults: [] })
    await expect(getVoucherAnalytics(prisma, 'admin-1', 'other-merchants-voucher')).rejects.toMatchObject({
      code: 'VOUCHER_NOT_FOUND',
    })
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
    // Ownership is verified by joining merchantId into the findFirst where.
    expect(prisma.voucher.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'other-merchants-voucher', merchantId: 'merchant-1' } }),
    )
  })

  it('denies a STAFF viewer (INSUFFICIENT_PERMISSIONS), mirroring the Insights access policy', async () => {
    mockResolve.mockResolvedValue(STAFF_CTX)
    const { prisma } = makePrisma({ voucher: { id: 'v-1', approvedAt: null, publishedAt: null }, queryResults: [] })
    await expect(getVoucherAnalytics(prisma, 'admin-1', 'v-1')).rejects.toMatchObject({
      code: 'INSUFFICIENT_PERMISSIONS',
    })
    // The gate runs BEFORE the voucher lookup + any aggregation (no existence oracle).
    expect(prisma.voucher.findFirst).not.toHaveBeenCalled()
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
  })

  it('denies a non-ACTIVE merchant (MERCHANT_NOT_ACTIVE), mirroring the Insights access policy', async () => {
    mockResolve.mockResolvedValue(OWNER_CTX)
    const { prisma } = makePrisma({
      voucher: { id: 'v-1', approvedAt: null, publishedAt: null },
      queryResults: [],
      merchantStatus: 'PENDING_APPROVAL',
    })
    await expect(getVoucherAnalytics(prisma, 'admin-1', 'v-1')).rejects.toMatchObject({
      code: 'MERCHANT_NOT_ACTIVE',
    })
    expect(prisma.voucher.findFirst).not.toHaveBeenCalled()
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
  })

  it('allows an OWNER/BRANCH_MANAGER on an ACTIVE merchant', async () => {
    mockResolve.mockResolvedValue(BM_CTX)
    const { prisma } = makePrisma({
      voucher: { id: 'v-1', approvedAt: null, publishedAt: null },
      queryResults: [[{ logged: 0n, confirmed: 0n, distinct: 0n, est_logged: null, est_confirmed: null }], [], [], [], []],
    })
    await expect(getVoucherAnalytics(prisma, 'admin-1', 'v-1')).resolves.toMatchObject({ voucherId: 'v-1' })
    expect(prisma.$queryRaw).toHaveBeenCalled()
  })

  it('scopes every aggregation to the voucherId AND the cleanliness (isTestData) rule', async () => {
    mockResolve.mockResolvedValue(OWNER_CTX)
    const { prisma, calls } = makePrisma({
      voucher: { id: 'v-1', approvedAt: null, publishedAt: null },
      queryResults: [[{ logged: 0n, confirmed: 0n, distinct: 0n, est_logged: null, est_confirmed: null }], [], [], [], []],
    })
    await getVoucherAnalytics(prisma, 'admin-1', 'v-1')
    // The FROM/WHERE composes buildEligibilityWhereSql (isTestData x3, DELETED, QA) AND
    // the per-voucher filter, with the voucher id + merchant id as PARAMETERS.
    const totalsSql = calls[0]
    const literal = totalsSql.strings.join(' ')
    expect(literal).toContain('isTestData')
    expect(literal).toContain('"voucherId"')
    expect(totalsSql.values).toContain('v-1')
    expect(totalsSql.values).toContain('merchant-1')
  })

  it('returns a coherent shape for a voucher with redemptions, bands-only for when-used', async () => {
    process.env.INSIGHTS_BUSY_PEAK_MIN_COUNT = '2'
    mockResolve.mockResolvedValue(OWNER_CTX)
    const { prisma } = makePrisma({
      voucher: { id: 'v-1', approvedAt: new Date('2026-01-01T00:00:00Z'), publishedAt: null },
      queryResults: [
        // totals: est fields arrive as Decimal-like STRINGS (num() coerces).
        [{ logged: 10n, confirmed: 7n, distinct: 6n, est_logged: '123.50', est_confirmed: '80.00' }],
        // trend: one month bucket.
        [{ bucket: new Date('2026-01-01T00:00:00Z'), logged: 10n, confirmed: 7n }],
        // days: Mon(0)=2, Sat(5)=8 -> Sat is the peak (>=2) so busiestDay=5.
        [{ day: 0, cnt: 2n }, { day: 5, cnt: 8n }],
        // dayparts: Evening(4)=9 peak.
        [{ daypart: 1, cnt: 1n }, { daypart: 4, cnt: 9n }],
        // branches: two branches.
        [{ branch_id: 'b-1', name: 'High Street', logged: 6n }, { branch_id: 'b-2', name: 'Mill Road', logged: 4n }],
      ],
    })
    const out = await getVoucherAnalytics(prisma, 'admin-1', 'v-1', { now: new Date('2026-01-11T00:00:00Z') })

    expect(out.totals).toEqual({
      logged: 10,
      confirmed: 7,
      confirmedInPersonPct: 70,
      distinctCustomers: 6,
      estimatedSavingLogged: 123.5,
      estimatedSavingConfirmed: 80,
    })
    expect(out.lifecycle).toEqual({
      liveSince: '2026-01-01T00:00:00.000Z',
      liveSinceSource: 'approvedAt',
      daysLive: 10,
    })
    expect(out.trend.months).toEqual([{ monthStartLondon: '2026-01-01', logged: 10, confirmed: 7 }])

    // when-used: dense 7-day + 6-daypart band arrays; ordinal bands only (0..3).
    expect(out.whenUsed.days).toHaveLength(7)
    expect(out.whenUsed.dayparts).toHaveLength(6)
    expect(out.whenUsed.days.every((s) => s.intensity >= 0 && s.intensity <= 3)).toBe(true)
    expect(out.whenUsed.days[5].intensity).toBe(3) // Sat is the peak day
    expect(out.whenUsed.busiestDay).toBe(5)
    expect(out.whenUsed.busiestDaypart).toBe(4)
    // No raw count leaks into a when-used slot.
    expect(Object.keys(out.whenUsed.days[0]).sort()).toEqual(['index', 'intensity'])

    // where-used: raw counts + share over the branch total (6+4=10).
    expect(out.whereUsed.branches).toEqual([
      { branchId: 'b-1', name: 'High Street', logged: 6, sharePct: 60 },
      { branchId: 'b-2', name: 'Mill Road', logged: 4, sharePct: 40 },
    ])
  })

  it('returns a clean empty shape for a zero-redemption voucher', async () => {
    mockResolve.mockResolvedValue(OWNER_CTX)
    const { prisma } = makePrisma({
      voucher: { id: 'v-1', approvedAt: null, publishedAt: null },
      queryResults: [
        [{ logged: 0n, confirmed: 0n, distinct: 0n, est_logged: null, est_confirmed: null }],
        [],
        [],
        [],
        [],
      ],
    })
    const out = await getVoucherAnalytics(prisma, 'admin-1', 'v-1')
    expect(out.totals.logged).toBe(0)
    expect(out.totals.confirmedInPersonPct).toBe(0)
    expect(out.trend.months).toEqual([])
    expect(out.whenUsed.days.every((s) => s.intensity === 0)).toBe(true)
    expect(out.whenUsed.busiestDay).toBeNull()
    expect(out.whereUsed.branches).toEqual([])
    expect(out.lifecycle).toEqual({ liveSince: null, liveSinceSource: null, daysLive: null })
  })
})
