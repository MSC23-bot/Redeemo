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
    category             = { findMany: vi.fn().mockResolvedValue([]) }
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
import { searchMerchants } from '../../../src/api/customer/discovery/service'
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

    expect(result.meta.scope).toEqual(expect.any(String))
    expect(result.meta.chipsHidden).toBe(false)
    expect(result.meta.scopeExpanded).toBe(false)
    expect(result.meta.resolvedArea).toEqual(expect.any(String))
  })

  it('returns scopeExpanded=true when scope=city', async () => {
    const result = await searchMerchants(prisma, {
      q: 'cafe',
      scope: 'city',
      limit: 20,
      offset: 0,
      userId: null,
    })

    expect(result.meta.scopeExpanded).toBe(true)
  })
})
