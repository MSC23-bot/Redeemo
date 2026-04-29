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
import { searchMerchants, listActiveCategories, getCategoryMerchants } from '../../../src/api/customer/discovery/service'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

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
// Task 25 — meta envelope
// ─────────────────────────────────────────────────────────────────────────────

describe('searchMerchants — meta envelope', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
  })

  it('returns meta with scope, resolvedArea, scopeExpanded=false for scope=nearby, and chipsHidden=false', async () => {
    const result = await searchMerchants(prisma, {
      q: 'cafe',
      scope: 'nearby',
      lat: 51.5,
      lng: -0.1,
      limit: 20,
      offset: 0,
      userId: null,
    })

    expect(result.meta.scope).toBe('nearby')
    expect(result.meta.chipsHidden).toBe(false)
    expect(result.meta.scopeExpanded).toBe(false)
    expect(result.meta.resolvedArea).toBe('Nearby')
  })

  it('returns scopeExpanded=true when scope=city', async () => {
    const result = await searchMerchants(prisma, {
      q: 'cafe',
      scope: 'city',
      lat: 51.5,
      lng: -0.1,
      limit: 20,
      offset: 0,
      userId: null,
    })

    expect(result.meta.scopeExpanded).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// listActiveCategories — supply-aware chipsHidden
// ─────────────────────────────────────────────────────────────────────────────

describe('listActiveCategories — supply-aware chipsHidden', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
  })

  it('marks chipsHidden=true on top-level rows when surviving subcategories < threshold', async () => {
    const { resolveProfileCity } = await import('../../../src/api/lib/userCity')
    vi.mocked(resolveProfileCity).mockResolvedValueOnce('London')

    // Top-level 'food' has minSubcategoryCountForChips=3
    // Two subcategories: 'sub1' has supply in London, 'sub2' has zero in London
    // → surviving=1, threshold=3 → chipsHidden=true on the top-level row
    prisma.category.findMany.mockResolvedValueOnce([
      {
        id: 'food', name: 'Food & Drink', iconUrl: null, illustrationUrl: null,
        parentId: null, pinColour: null, pinIcon: null, sortOrder: 1,
        merchantCountByCity: { London: 5 },
        minSubcategoryCountForChips: 3,
        descriptorState: null, descriptorSuffix: null,
      },
      {
        id: 'sub1', name: 'Restaurant', iconUrl: null, illustrationUrl: null,
        parentId: 'food', pinColour: null, pinIcon: null, sortOrder: 1,
        merchantCountByCity: { London: 2 },
        minSubcategoryCountForChips: 0,
        descriptorState: 'RECOMMENDED', descriptorSuffix: 'Restaurant',
      },
      {
        id: 'sub2', name: 'Cafe', iconUrl: null, illustrationUrl: null,
        parentId: 'food', pinColour: null, pinIcon: null, sortOrder: 2,
        merchantCountByCity: { London: 0 },
        minSubcategoryCountForChips: 0,
        descriptorState: 'OPTIONAL', descriptorSuffix: 'Cafe',
      },
    ])

    const result = await listActiveCategories(prisma, {
      scope: 'city', userId: 'user-1',
    }) as any[]

    const food = result.find((r: any) => r.id === 'food')
    expect(food).toBeDefined()
    expect(food.chipsHidden).toBe(true)
  })

  it('marks chipsHidden=false on top-level rows when surviving subcategories >= threshold', async () => {
    const { resolveProfileCity } = await import('../../../src/api/lib/userCity')
    vi.mocked(resolveProfileCity).mockResolvedValueOnce('London')

    prisma.category.findMany.mockResolvedValueOnce([
      {
        id: 'food', name: 'Food & Drink', iconUrl: null, illustrationUrl: null,
        parentId: null, pinColour: null, pinIcon: null, sortOrder: 1,
        merchantCountByCity: { London: 10 },
        minSubcategoryCountForChips: 1,
        descriptorState: null, descriptorSuffix: null,
      },
      {
        id: 'sub1', name: 'Restaurant', iconUrl: null, illustrationUrl: null,
        parentId: 'food', pinColour: null, pinIcon: null, sortOrder: 1,
        merchantCountByCity: { London: 5 },
        minSubcategoryCountForChips: 0,
        descriptorState: 'RECOMMENDED', descriptorSuffix: 'Restaurant',
      },
    ])

    const result = await listActiveCategories(prisma, {
      scope: 'city', userId: 'user-1',
    }) as any[]

    const food = result.find((r: any) => r.id === 'food')
    expect(food.chipsHidden).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getCategoryMerchants — chipsHidden semantics
// ─────────────────────────────────────────────────────────────────────────────

describe('getCategoryMerchants — chipsHidden semantics', () => {
  let prisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    const adapter = new PrismaPg({ connectionString: 'postgresql://mock' })
    prisma = new PrismaClient({ adapter } as any)
  })

  it('returns chipsHidden=false when categoryId is a subcategory (leaf has no chip strip)', async () => {
    const { resolveProfileCity } = await import('../../../src/api/lib/userCity')
    vi.mocked(resolveProfileCity).mockResolvedValueOnce('London')

    // The category requested has parentId !== null → it's a subcategory
    prisma.category.findUnique.mockResolvedValueOnce({
      minSubcategoryCountForChips: 3,
      parentId: 'food',  // ← non-null marks this as a subcategory
    })
    // No children
    prisma.category.findMany.mockResolvedValueOnce([])

    const result = await getCategoryMerchants(prisma, 'restaurant-subcat', {
      scope: 'city',
      userId: 'user-1',
      limit: 20,
      offset: 0,
    })

    expect(result.meta.chipsHidden).toBe(false)
  })

  it('returns chipsHidden=true when categoryId is a top-level category with insufficient subcategory supply', async () => {
    const { resolveProfileCity } = await import('../../../src/api/lib/userCity')
    vi.mocked(resolveProfileCity).mockResolvedValueOnce('London')

    prisma.category.findUnique.mockResolvedValueOnce({
      minSubcategoryCountForChips: 3,
      parentId: null,  // ← top-level
    })
    // Only 1 subcategory with supply, threshold is 3 → chipsHidden=true
    prisma.category.findMany.mockResolvedValueOnce([
      { id: 'sub1', merchantCountByCity: { London: 5 } },
      { id: 'sub2', merchantCountByCity: { London: 0 } },
      { id: 'sub3', merchantCountByCity: { London: 0 } },
    ])

    const result = await getCategoryMerchants(prisma, 'food', {
      scope: 'city',
      userId: 'user-1',
      limit: 20,
      offset: 0,
    })

    expect(result.meta.chipsHidden).toBe(true)
  })
})
