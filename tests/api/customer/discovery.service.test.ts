import 'dotenv/config'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock @prisma/adapter-pg so new PrismaPg(...) doesn't need a real DB ──────
vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class PrismaPg {
    constructor(_opts: { connectionString: string }) {}
  },
}))

// ── Mock the Prisma client with all methods used by searchMerchants ───────────
vi.mock('../../../generated/prisma/client', () => {
  class PrismaClient {
    merchantSuggestedTag = { findMany: vi.fn().mockResolvedValue([]) }
    category             = { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) }
    merchant             = { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) }
    redundantHighlight   = { findMany: vi.fn().mockResolvedValue([]) }
    review               = { groupBy: vi.fn().mockResolvedValue([]) }
    favouriteMerchant    = { findMany: vi.fn().mockResolvedValue([]) }
    user                 = { findUnique: vi.fn().mockResolvedValue(null) }
    constructor(_opts?: any) {}
  }
  return {
    PrismaClient,
    MerchantStatus: { ACTIVE: 'ACTIVE' },
    MerchantSuggestedTagStatus: { APPROVED: 'APPROVED' },
    VoucherStatus: { ACTIVE: 'ACTIVE' },
    ApprovalStatus: { APPROVED: 'APPROVED' },
  }
})

// ── Mock resolveProfileCity so it doesn't hit the real DB ────────────────────
vi.mock('../../../src/api/lib/userCity', () => ({
  resolveProfileCity: vi.fn().mockResolvedValue(null),
}))

// ── Real service under test ───────────────────────────────────────────────────
import { searchMerchants, listActiveCategories } from '../../../src/api/customer/discovery/service'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Shared merchant tile fixture builder for tests below. Returns a record with
// the shape MERCHANT_TILE_SELECT produces, with sensible nulls for fields the
// rank-then-enrich pipeline doesn't read in these tests.
function fixtureMerchant(overrides: {
  id: string
  branches: Array<{ id: string; city: string; latitude: number; longitude: number }>
}) {
  return {
    id:                   overrides.id,
    businessName:         overrides.id.toUpperCase(),
    tradingName:          null,
    logoUrl:              null,
    bannerUrl:            null,
    primaryCategoryId:    null,
    primaryCategory:      null,
    primaryDescriptorTag: null,
    categories:           [],
    highlights:           [],
    vouchers:             [],
    branches:             overrides.branches.map(b => ({ ...b, isActive: true })),
    _count:               { vouchers: 0 },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 24 — tagIds OR-of-three-paths predicate
// ─────────────────────────────────────────────────────────────────────────────

describe('searchMerchants — tagIds filter', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
  })

  it('builds an OR clause covering MerchantTag, MerchantHighlight, and primaryDescriptorTagId', async () => {
    await searchMerchants(prisma, {
      q: 'cafe',
      tagIds: ['tag-1'],
      limit: 20,
      offset: 0,
      userId: null,
    })

    expect(prisma.merchant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: [
                { tags:       { some: { tagId:          { in: ['tag-1'] } } } },
                { highlights: { some: { highlightTagId: { in: ['tag-1'] } } } },
                { primaryDescriptorTagId: { in: ['tag-1'] } },
              ],
            }),
          ]),
        }),
      }),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Plan 1.5 — meta envelope (tier counts + emptyStateReason; no chipsHidden)
// ─────────────────────────────────────────────────────────────────────────────

describe('searchMerchants — meta envelope', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
  })

  it('preserves explicit scope=nearby (no cascade) when NEARBY supply exists', async () => {
    prisma.merchant.findMany.mockResolvedValueOnce([
      fixtureMerchant({
        id:       'm1',
        branches: [{ id: 'b1', city: 'London', latitude: 51.5074, longitude: -0.128 }],
      }),
    ])
    const result = await searchMerchants(prisma, {
      q: 'cafe', scope: 'nearby', lat: 51.5074, lng: -0.1278,
      limit: 20, offset: 0, userId: null,
    })

    expect(result.meta.scope).toBe('nearby')
    expect(result.meta.resolvedArea).toBe('Nearby')
    expect(result.meta.scopeExpanded).toBe(false)
    expect(result.meta.nearbyCount).toBe(1)
    expect(result.meta.cityCount).toBe(0)
    expect(result.meta.distantCount).toBe(0)
    expect(result.meta.emptyStateReason).toBe('none')
  })

  it('cascades scope=city to platform with emptyStateReason=no_uk_supply when nothing exists anywhere', async () => {
    const result = await searchMerchants(prisma, {
      q: 'cafe', scope: 'city', lat: 51.5, lng: -0.1,
      limit: 20, offset: 0, userId: null,
    })

    // Empty mocks → all tier counts zero → cascade through CITY → DISTANT.
    expect(result.meta.scopeExpanded).toBe(true)
    expect(result.meta.scope).toBe('platform')
    expect(result.meta.nearbyCount).toBe(0)
    expect(result.meta.cityCount).toBe(0)
    expect(result.meta.distantCount).toBe(0)
    expect(result.meta.emptyStateReason).toBe('no_uk_supply')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Plan 1.5 — rank-then-enrich integration: tier classification, default scope,
// scope cascade, emptyStateReason variants, supplyTier propagation, pagination
// overflow guard. Mocks Prisma; exercises the full rankMerchants → tier filter
// → enrich pipeline.
// ─────────────────────────────────────────────────────────────────────────────

describe('rankMerchants integration — searchMerchants', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
  })

  it('LOCAL default returns NEARBY+CITY only; distantCount reports DISTANT supply', async () => {
    const { resolveProfileCity } = await import('../../../src/api/lib/userCity')
    vi.mocked(resolveProfileCity).mockResolvedValueOnce('London')

    prisma.category.findUnique.mockResolvedValueOnce({ intentType: 'LOCAL', parent: null })
    prisma.merchant.findMany.mockResolvedValueOnce([
      // NEARBY: London, ~10m from user coords
      fixtureMerchant({ id: 'near', branches: [{ id: 'b1', city: 'London',     latitude: 51.5074, longitude: -0.128 }] }),
      // CITY: London (matches profileCity) but ~12km from user coords
      fixtureMerchant({ id: 'city', branches: [{ id: 'b2', city: 'London',     latitude: 51.6,    longitude: -0.2   }] }),
      // DISTANT: Manchester
      fixtureMerchant({ id: 'far1', branches: [{ id: 'b3', city: 'Manchester', latitude: 53.5,    longitude: -2.2   }] }),
      // DISTANT: Edinburgh
      fixtureMerchant({ id: 'far2', branches: [{ id: 'b4', city: 'Edinburgh',  latitude: 55.95,   longitude: -3.19  }] }),
    ])

    const result = await searchMerchants(prisma, {
      q: 'thing', categoryId: 'cat-1',
      lat: 51.5074, lng: -0.1278,
      limit: 20, offset: 0, userId: null,
    })

    expect(result.merchants.map((m: any) => m.id).sort()).toEqual(['city', 'near'])
    expect(result.total).toBe(2)
    expect(result.meta.nearbyCount).toBe(1)
    expect(result.meta.cityCount).toBe(1)
    expect(result.meta.distantCount).toBe(2)
    expect(result.meta.scopeExpanded).toBe(false)
    expect(result.meta.emptyStateReason).toBe('none')
  })

  it('DESTINATION default returns all tiers (no auto-expand needed — already widest)', async () => {
    prisma.category.findUnique.mockResolvedValueOnce({ intentType: 'DESTINATION', parent: null })
    prisma.merchant.findMany.mockResolvedValueOnce([
      fixtureMerchant({ id: 'near', branches: [{ id: 'b1', city: 'London',    latitude: 51.5074, longitude: -0.128 }] }),
      fixtureMerchant({ id: 'far',  branches: [{ id: 'b2', city: 'Edinburgh', latitude: 55.95,   longitude: -3.19  }] }),
    ])

    const result = await searchMerchants(prisma, {
      q: 'thing', categoryId: 'cat-1',
      lat: 51.5074, lng: -0.1278,
      limit: 20, offset: 0, userId: null,
    })

    expect(result.merchants).toHaveLength(2)
    expect(result.meta.scopeExpanded).toBe(false)
    expect(result.meta.distantCount).toBe(1)
  })

  it("emptyStateReason='expanded_to_wider' when LOCAL local empty + DISTANT has supply", async () => {
    prisma.category.findUnique.mockResolvedValueOnce({ intentType: 'LOCAL', parent: null })
    prisma.merchant.findMany.mockResolvedValueOnce([
      fixtureMerchant({ id: 'far', branches: [{ id: 'b1', city: 'Edinburgh', latitude: 55.95, longitude: -3.19 }] }),
    ])

    const result = await searchMerchants(prisma, {
      q: 'thing', categoryId: 'cat-1',
      lat: 51.5074, lng: -0.1278,
      limit: 20, offset: 0, userId: null,
    })

    expect(result.meta.emptyStateReason).toBe('expanded_to_wider')
    expect(result.meta.scopeExpanded).toBe(true)
    expect(result.merchants).toHaveLength(1)
  })

  it("emptyStateReason='no_uk_supply' when all tiers empty", async () => {
    prisma.category.findUnique.mockResolvedValueOnce({ intentType: 'LOCAL', parent: null })
    prisma.merchant.findMany.mockResolvedValueOnce([])

    const result = await searchMerchants(prisma, {
      q: 'thing', categoryId: 'cat-1',
      limit: 20, offset: 0, userId: null,
    })

    expect(result.meta.emptyStateReason).toBe('no_uk_supply')
    expect(result.merchants).toHaveLength(0)
  })

  it('each merchant tile includes supplyTier', async () => {
    prisma.category.findUnique.mockResolvedValueOnce({ intentType: 'LOCAL', parent: null })
    prisma.merchant.findMany.mockResolvedValueOnce([
      fixtureMerchant({ id: 'm', branches: [{ id: 'b1', city: 'London', latitude: 51.5074, longitude: -0.128 }] }),
    ])

    const result = await searchMerchants(prisma, {
      q: 'thing', categoryId: 'cat-1',
      lat: 51.5074, lng: -0.1278,
      limit: 20, offset: 0, userId: null,
    })

    expect(result.merchants[0]).toHaveProperty('supplyTier')
    expect(['NEARBY', 'CITY', 'DISTANT']).toContain(result.merchants[0].supplyTier)
  })

  it("emptyStateReason='none' when offset overruns total but supply exists (pagination overflow guard)", async () => {
    // Risk-2 regression test: paginated.length === 0 (offset > total) must NOT
    // produce 'no_uk_supply'. The reason should reflect the pre-paginate total,
    // not the empty page slice.
    prisma.category.findUnique.mockResolvedValueOnce({ intentType: 'LOCAL', parent: null })
    prisma.merchant.findMany.mockResolvedValueOnce([
      // Both NEARBY (well within the 2-mile / ~3.2km radius around the user)
      fixtureMerchant({ id: 'a', branches: [{ id: 'b1', city: 'London', latitude: 51.5074, longitude: -0.128 }] }),
      fixtureMerchant({ id: 'b', branches: [{ id: 'b2', city: 'London', latitude: 51.510,  longitude: -0.130 }] }),
    ])

    const result = await searchMerchants(prisma, {
      q: 'thing', categoryId: 'cat-1',
      lat: 51.5074, lng: -0.1278,
      limit: 20, offset: 100,        // beyond the 2-merchant total
      userId: null,
    })

    expect(result.merchants).toHaveLength(0)
    expect(result.total).toBe(2)
    expect(result.meta.emptyStateReason).toBe('none')   // NOT 'no_uk_supply'
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Plan 1.5 — listActiveCategories: rejects hide-on-low-supply rule from Plan 1.
// Top-levels are always returned; subcategories return only when ≥1 active UK
// merchant exists. No more chipsHidden / scope / lat / lng / userId arguments.
// ─────────────────────────────────────────────────────────────────────────────

describe('listActiveCategories — top-level visibility', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
  })

  it('returns ALL top-level categories regardless of supply', async () => {
    prisma.category.findMany
      // First findMany: top-levels (always visible)
      .mockResolvedValueOnce([
        { id: 't-1', name: 'Top A', parentId: null },
        { id: 't-2', name: 'Top B', parentId: null },
      ])
      // Second findMany: subcategories with supply (empty here — top-levels
      // must still come through)
      .mockResolvedValueOnce([])

    const result = await listActiveCategories(prisma)

    expect(result).toHaveLength(2)
    expect(result.every((c: any) => c.parentId === null)).toBe(true)
  })

  it('appends subcategories that have active UK supply', async () => {
    prisma.category.findMany
      .mockResolvedValueOnce([
        { id: 'top', name: 'Food & Drink', parentId: null },
      ])
      .mockResolvedValueOnce([
        { id: 'sub-restaurant', name: 'Restaurant', parentId: 'top' },
        { id: 'sub-cafe',       name: 'Cafe',       parentId: 'top' },
      ])

    const result = await listActiveCategories(prisma)

    expect(result.map((c: any) => c.id)).toEqual(['top', 'sub-restaurant', 'sub-cafe'])
  })
})
