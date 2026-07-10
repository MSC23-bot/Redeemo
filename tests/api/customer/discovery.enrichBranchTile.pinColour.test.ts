import 'dotenv/config'
import { describe, it, expect, vi } from 'vitest'

// `enrichBranchTile` is a pure function, but `service.ts` constructs a
// PrismaClient + PrismaPg adapter at module scope (elsewhere in the file)
// and imports `resolveProfileCity`, mirroring the mock boilerplate every
// other discovery-service test file uses (discovery.service.test.ts,
// discovery.in-area-branches.service.test.ts) so importing the module
// under test doesn't require a real DB connection.
vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class PrismaPg {
    constructor(_opts: { connectionString: string }) {}
  },
}))
vi.mock('../../../generated/prisma/client', () => ({
  PrismaClient: class PrismaClient {
    constructor(_opts?: any) {}
  },
  MerchantStatus: { ACTIVE: 'ACTIVE' },
  VoucherStatus: { ACTIVE: 'ACTIVE' },
  ApprovalStatus: { APPROVED: 'APPROVED' },
}))
vi.mock('../../../src/api/lib/userCity', () => ({
  resolveProfileCity: vi.fn().mockResolvedValue(null),
}))

import { enrichBranchTile, type BranchSelectResult } from '../../../src/api/customer/discovery/service'

// Map Phase 2 Slice S3 (2026-07-10) — pinColour read-time parent-fallback.
//
// `enrichBranchTile` is a pure function (no DB calls): given a
// BranchSelectResult (the shape `BRANCH_TILE_SELECT` produces), it must
// resolve `primaryCategory.pinColour` / `subcategory.pinColour` by:
//   1. the category's own `pinColour` when set (non-fallback path)
//   2. else its PARENT category's `pinColour` (new: read-time fallback)
//   3. else null (the client applies its own hardcoded default palette —
//      out of scope here, covered by MapPins/CustomPinV2 tests)
//
// No schema change — `BRANCH_TILE_SELECT` now nests a `parent: { select:
// { pinColour: true } }` under both `primaryCategory` and
// `categories.category`; this suite pins the resulting merge behaviour.

function baseBranch(overrides: Partial<any> = {}): BranchSelectResult {
  const branch: any = {
    id: 'branch-1',
    name: 'Test Branch',
    localityId: 'loc-1',
    localityName: 'Testville',
    postTown: 'Testville',
    city: 'Testville',
    latitude: 51.5,
    longitude: -0.1,
    locationConfidence: 'MANUALLY_CONFIRMED',
    isActive: true,
    openingHours: [],
    merchant: {
      id: 'merchant-1',
      businessName: 'Test Merchant',
      tradingName: null,
      logoUrl: null,
      bannerUrl: null,
      primaryCategoryId: 'cat-sub-1',
      description: null,
      primaryCategory: {
        id: 'cat-sub-1',
        name: 'Pizza Restaurant',
        pinColour: null,
        pinIcon: null,
        descriptorSuffix: null,
        parentId: 'cat-parent-1',
        intentType: null,
        parent: null,
      },
      primaryDescriptorTag: null,
      categories: [],
      tags: [],
      highlights: [],
      vouchers: [],
      _count: { vouchers: 0 },
    },
    ...overrides,
  }
  return branch as BranchSelectResult
}

const OPTS_BASE = {
  input: {
    branchId: 'branch-1',
    merchantId: 'merchant-1',
    supplyRung: 'NEARBY' as const,
    proximityBand: 'NEAREST_ON_REDEEMO' as const,
    distance: null,
  },
  isFavourited: false,
  redundantSet: new Set<string>(),
}

describe('enrichBranchTile — pinColour parent-fallback (Map Phase 2 S3)', () => {
  it('uses the subcategory own pinColour when set (non-fallback path)', () => {
    const branch = baseBranch({
      merchant: {
        ...baseBranch().merchant,
        primaryCategory: {
          id: 'cat-sub-1',
          name: 'Pizza Restaurant',
          pinColour: '#FF5733',
          pinIcon: null,
          descriptorSuffix: null,
          parentId: 'cat-parent-1',
          intentType: null,
          parent: { pinColour: '#000000' },
        },
      },
    })
    const tile = enrichBranchTile(branch, OPTS_BASE)
    expect(tile.merchant.primaryCategory?.pinColour).toBe('#FF5733')
  })

  it('falls back to the parent category pinColour when the subcategory pinColour is null', () => {
    const branch = baseBranch({
      merchant: {
        ...baseBranch().merchant,
        primaryCategory: {
          id: 'cat-sub-1',
          name: 'Pizza Restaurant',
          pinColour: null,
          pinIcon: null,
          descriptorSuffix: null,
          parentId: 'cat-parent-1',
          intentType: null,
          parent: { pinColour: '#8B5CF6' },
        },
      },
    })
    const tile = enrichBranchTile(branch, OPTS_BASE)
    expect(tile.merchant.primaryCategory?.pinColour).toBe('#8B5CF6')
  })

  it('resolves null when both the subcategory AND the parent pinColour are null', () => {
    const branch = baseBranch({
      merchant: {
        ...baseBranch().merchant,
        primaryCategory: {
          id: 'cat-sub-1',
          name: 'Pizza Restaurant',
          pinColour: null,
          pinIcon: null,
          descriptorSuffix: null,
          parentId: 'cat-parent-1',
          intentType: null,
          parent: { pinColour: null },
        },
      },
    })
    const tile = enrichBranchTile(branch, OPTS_BASE)
    expect(tile.merchant.primaryCategory?.pinColour).toBeNull()
  })

  it('resolves null (not a crash) when the category is top-level (parent is null)', () => {
    const branch = baseBranch({
      merchant: {
        ...baseBranch().merchant,
        primaryCategory: {
          id: 'cat-top-1',
          name: 'Food & Drink',
          pinColour: null,
          pinIcon: null,
          descriptorSuffix: null,
          parentId: null,
          intentType: null,
          parent: null,
        },
      },
    })
    const tile = enrichBranchTile(branch, OPTS_BASE)
    expect(tile.merchant.primaryCategory?.pinColour).toBeNull()
  })

  it('applies the same fallback to the derived subcategory field', () => {
    const branch = baseBranch({
      merchant: {
        ...baseBranch().merchant,
        // primaryCategory here plays the "primary" role; `categories`
        // supplies a distinct subcategory row per the derivation in
        // enrichBranchTile (first non-primary category with parentId set).
        primaryCategory: {
          id: 'cat-primary',
          name: 'Food & Drink',
          pinColour: '#FF5733',
          pinIcon: null,
          descriptorSuffix: null,
          parentId: null,
          intentType: null,
          parent: null,
        },
        categories: [
          {
            category: {
              id: 'cat-sub-2',
              name: 'Vegan Cafe',
              parentId: 'cat-parent-2',
              pinColour: null,
              pinIcon: null,
              descriptorSuffix: null,
              intentType: null,
              parent: { pinColour: '#22C55E' },
            },
          },
        ],
      },
    })
    const tile = enrichBranchTile(branch, OPTS_BASE)
    expect(tile.merchant.subcategory?.pinColour).toBe('#22C55E')
  })

  it('is deterministic: repeated calls with the same input produce the same pinColour', () => {
    const branchDet = baseBranch({
      merchant: {
        ...baseBranch().merchant,
        primaryCategory: {
          id: 'cat-sub-1',
          name: 'Pizza Restaurant',
          pinColour: null,
          pinIcon: null,
          descriptorSuffix: null,
          parentId: 'cat-parent-1',
          intentType: null,
          parent: { pinColour: '#8B5CF6' },
        },
      },
    })
    const firstDet = enrichBranchTile(branchDet, OPTS_BASE).merchant.primaryCategory?.pinColour
    const secondDet = enrichBranchTile(branchDet, OPTS_BASE).merchant.primaryCategory?.pinColour
    expect(firstDet).toBe(secondDet)
  })
})

describe('enrichBranchTile — topLevelName resolution (Map Phase 2 S3 pin-glyph matcher)', () => {
  it('resolves topLevelName to the parent name for a subcategory', () => {
    const branch = baseBranch({
      merchant: {
        ...baseBranch().merchant,
        primaryCategory: {
          id: 'cat-sub-1',
          name: 'Pizza Restaurant',
          pinColour: null,
          pinIcon: null,
          descriptorSuffix: null,
          parentId: 'cat-parent-1',
          intentType: null,
          parent: { pinColour: null, name: 'Food & Drink' },
        },
      },
    })
    const tile = enrichBranchTile(branch, OPTS_BASE)
    expect(tile.merchant.primaryCategory?.name).toBe('Pizza Restaurant')
    expect((tile.merchant.primaryCategory as any)?.topLevelName).toBe('Food & Drink')
  })

  it('resolves topLevelName to its own name when the category is already top-level', () => {
    const branch = baseBranch({
      merchant: {
        ...baseBranch().merchant,
        primaryCategory: {
          id: 'cat-top-1',
          name: 'Food & Drink',
          pinColour: '#E65100',
          pinIcon: null,
          descriptorSuffix: null,
          parentId: null,
          intentType: null,
          parent: null,
        },
      },
    })
    const tile = enrichBranchTile(branch, OPTS_BASE)
    expect((tile.merchant.primaryCategory as any)?.topLevelName).toBe('Food & Drink')
  })

  it('resolves topLevelName to null when the subcategory has no queryable parent row', () => {
    const branch = baseBranch({
      merchant: {
        ...baseBranch().merchant,
        primaryCategory: {
          id: 'cat-sub-orphan',
          name: 'Orphan Sub',
          pinColour: null,
          pinIcon: null,
          descriptorSuffix: null,
          parentId: 'cat-parent-missing',
          intentType: null,
          parent: null, // defensive: parentId set but parent row didn't resolve
        },
      },
    })
    const tile = enrichBranchTile(branch, OPTS_BASE)
    expect((tile.merchant.primaryCategory as any)?.topLevelName).toBeNull()
  })

  it('applies the same topLevelName resolution to the derived subcategory field', () => {
    const branch = baseBranch({
      merchant: {
        ...baseBranch().merchant,
        primaryCategory: {
          id: 'cat-primary',
          name: 'Food & Drink',
          pinColour: '#E65100',
          pinIcon: null,
          descriptorSuffix: null,
          parentId: null,
          intentType: null,
          parent: null,
        },
        categories: [
          {
            category: {
              id: 'cat-sub-2',
              name: 'Vegan Cafe',
              parentId: 'cat-parent-2',
              pinColour: null,
              pinIcon: null,
              descriptorSuffix: null,
              intentType: null,
              parent: { pinColour: '#22C55E', name: 'Food & Drink' },
            },
          },
        ],
      },
    })
    const tile = enrichBranchTile(branch, OPTS_BASE)
    expect((tile.merchant.subcategory as any)?.topLevelName).toBe('Food & Drink')
  })
})
