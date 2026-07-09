import 'dotenv/config'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Map in-area reliability slice — unit coverage for `getInAreaBranches`'s
// candidate-fetch fix (deterministic cap + orderBy BEFORE ranking) and the
// new opt-in `includeEmptyStateReason` param used by the route's
// `branchesOnly` mode. Mocked prisma (no real DB) — mirrors the pattern in
// discovery.service.test.ts.

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class PrismaPg {
    constructor(_opts: { connectionString: string }) {}
  },
}))

vi.mock('../../../generated/prisma/client', () => {
  class PrismaClient {
    branch = {
      findMany: vi.fn().mockResolvedValue([]),
      count:    vi.fn().mockResolvedValue(0),
    }
    // locality.findMany empty → findNearestLocality resolves null →
    // resolveEffectiveLocation returns null → the rankBranchesV3 step is
    // skipped entirely, so tests don't need to mock the ranking/enrichment
    // dependency chain to assert on the candidate-fetch call shape.
    locality              = { findMany: vi.fn().mockResolvedValue([]) }
    localityCatchmentEdge = { findMany: vi.fn().mockResolvedValue([]) }
    category               = { findUnique: vi.fn().mockResolvedValue(null) }
    favouriteBranch         = { findMany: vi.fn().mockResolvedValue([]) }
    review                  = { groupBy: vi.fn().mockResolvedValue([]) }
    constructor(_opts?: any) {}
  }
  return {
    PrismaClient,
    MerchantStatus:             { ACTIVE: 'ACTIVE' },
    VoucherStatus:              { ACTIVE: 'ACTIVE' },
    ApprovalStatus:             { APPROVED: 'APPROVED' },
    MerchantSuggestedTagStatus: { APPROVED: 'APPROVED' },
  }
})

import { getInAreaBranches } from '../../../src/api/customer/discovery/service'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const BBOX = { minLat: 51.4, maxLat: 51.6, minLng: -0.2, maxLng: 0 }

describe('getInAreaBranches — candidate fetch (Map in-area reliability)', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
    prisma.branch.findMany.mockResolvedValue([])
    prisma.branch.count.mockResolvedValue(0)
  })

  it('fetches candidates with a deterministic orderBy (id asc) instead of no order', async () => {
    await getInAreaBranches(prisma, { bbox: BBOX, userId: null, limit: 50 })

    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: 'asc' } }),
    )
  })

  it('caps the candidate pool at max(limit*4, 200), not the raw caller limit', async () => {
    await getInAreaBranches(prisma, { bbox: BBOX, userId: null, limit: 10 })
    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }), // max(10*4, 200) = 200
    )

    prisma.branch.findMany.mockClear()
    await getInAreaBranches(prisma, { bbox: BBOX, userId: null, limit: 100 })
    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 400 }), // max(100*4, 200) = 400
    )
  })

  it('never passes `take: limit` directly (the pre-fix behaviour)', async () => {
    await getInAreaBranches(prisma, { bbox: BBOX, userId: null, limit: 50 })
    const call = prisma.branch.findMany.mock.calls[0][0]
    expect(call.take).not.toBe(50)
    expect(call.take).toBe(200)
  })
})

describe('getInAreaBranches — includeEmptyStateReason (branchesOnly route mode)', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
    prisma.branch.findMany.mockResolvedValue([])
  })

  it('omits emptyStateReason and skips the extra count() query when not requested', async () => {
    const result = await getInAreaBranches(prisma, { bbox: BBOX, userId: null, limit: 50 })
    expect(result.meta.emptyStateReason).toBeUndefined()
    expect(prisma.branch.count).not.toHaveBeenCalled()
  })

  it('sets emptyStateReason to no_uk_supply when the UK-wide count is 0', async () => {
    prisma.branch.count.mockResolvedValue(0)
    const result = await getInAreaBranches(prisma, {
      bbox: BBOX, userId: null, limit: 50, includeEmptyStateReason: true,
    })
    expect(result.meta.emptyStateReason).toBe('no_uk_supply')
    // Slice 1 composition (PR #435 on #434): the count's confidence filter
    // mirrors the pin-exposure set (CONFIRMED_LOCATION_SET), not
    // MANUALLY_CONFIRMED-only, so ADDRESS_GEOCODED-only categories report
    // viewport_empty rather than no_uk_supply. Slice 3 (pin-drop addendum §2)
    // widens the set by one tier: MERCHANT_CONFIRMED joins it via the shared
    // constant, so the filter widens automatically with no per-site literal edit.
    expect(prisma.branch.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          locationConfidence: { in: ['MANUALLY_CONFIRMED', 'ADDRESS_GEOCODED', 'MERCHANT_CONFIRMED'] },
        }),
      }),
    )
    // The UK-wide count must NOT carry the viewport bbox constraint.
    const countArgs = prisma.branch.count.mock.calls[0][0]
    expect(countArgs.where.latitude).toBeUndefined()
    expect(countArgs.where.longitude).toBeUndefined()
  })

  it('sets emptyStateReason to none when UK-wide supply exists', async () => {
    prisma.branch.count.mockResolvedValue(3)
    const result = await getInAreaBranches(prisma, {
      bbox: BBOX, userId: null, limit: 50, includeEmptyStateReason: true,
    })
    expect(result.meta.emptyStateReason).toBe('none')
  })
})
