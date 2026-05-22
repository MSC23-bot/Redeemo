import { api } from '@/lib/api'
import { discoveryApi, homeFeedResponseSchema } from '@/lib/api/discovery'

jest.spyOn(api, 'get')

const tile = {
  id:                 'm1',
  businessName:       'Cafe',
  tradingName:        null,
  logoUrl:            null,
  bannerUrl:          null,
  primaryCategory:    null,
  subcategory:        null,
  voucherCount:       0,
  maxEstimatedSaving: null,
  distance:           null,
  nearestBranchId:    null,
  latitude:           null,
  longitude:          null,
  avgRating:          null,
  reviewCount:        0,
  isFavourited:       false,
  supplyTier:         'NEARBY' as const,
  descriptor:         null,
  highlights:         [],
}

const meta = {
  scope:            'city' as const,
  resolvedArea:     'London',
  scopeExpanded:    false,
  nearbyCount:      1,
  cityCount:        0,
  distantCount:     0,
  emptyStateReason: 'none' as const,
}

describe('discoveryApi', () => {
  beforeEach(() => { (api.get as jest.Mock).mockReset() })

  it('getHomeFeed calls /home with no qs when no opts', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      locationContext: { city: null, source: 'none' },
      featured: [], trending: [], campaigns: [], nearbyByCategory: [],
      // Phase 2.3 additive arms — backend always emits these.
      featuredBranches: [], trendingBranches: [], nearbyByCategoryBranches: [],
    })
    await discoveryApi.getHomeFeed()
    expect(api.get).toHaveBeenCalledWith('/api/v1/customer/home')
  })

  it('getHomeFeed includes lat/lng when provided', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      locationContext: { city: 'London', source: 'coordinates' },
      featured: [], trending: [], campaigns: [], nearbyByCategory: [],
      // Phase 2.3 additive arms — backend always emits these.
      featuredBranches: [], trendingBranches: [], nearbyByCategoryBranches: [],
    })
    await discoveryApi.getHomeFeed({ lat: 51.5, lng: -0.1 })
    expect(api.get).toHaveBeenCalledWith('/api/v1/customer/home?lat=51.5&lng=-0.1')
  })

  // ─── Phase B.2 — Home Relevance new envelope shape ────────────────────────
  //
  // Spec §5 + plan v1.1 Hard Invariant: new envelope fields
  // (featuredRail / trendingRail / popularRail / nearbyByCategoryRails)
  // arrive ADDITIVELY alongside the legacy branch-themed fields
  // (featuredBranches / trendingBranches / nearbyByCategoryBranches).
  // Backend continues emitting BOTH sets through Phase F; customer-app
  // stops reading legacy in Phase G but the schema keeps them as
  // .optional() so older fixtures and pre-merge backend responses
  // still parse cleanly.
  it('homeFeedResponseSchema parses the new envelope shape with non-colliding names', () => {
    const sample = {
      locationContext: {
        locality: { id: 'loc1', name: 'Huddersfield' },
        city:     'Huddersfield',
        source:   'coordinates' as const,
      },
      campaigns: [],
      featuredRail: {
        branches: [],
        meta: {
          locality:      { id: 'loc1', name: 'Huddersfield' },
          scope:         'city' as const,
          scopeExpanded: false,
          rungCounts:    { NEARBY: 0 },
        },
      },
      trendingRail:          { branches: [], meta: null },
      popularRail:           { branches: [], meta: null },
      nearbyByCategoryRails: [],
      featuredBranches:         [],
      trendingBranches:         [],
      nearbyByCategoryBranches: [],
    }
    expect(() => homeFeedResponseSchema.parse(sample)).not.toThrow()
  })

  it('searchMerchants serialises array filters as comma-separated', async () => {
    (api.get as jest.Mock).mockResolvedValue({ merchants: [], total: 0 })
    await discoveryApi.searchMerchants({ q: 'cafe', voucherTypes: ['BOGO', 'DISCOUNT'], amenityIds: ['a1'] })
    expect(api.get).toHaveBeenCalledWith(
      '/api/v1/customer/search?q=cafe&voucherTypes=BOGO,DISCOUNT&amenityIds=a1',
    )
  })

  it('searchMerchants supports scope filter (nearby|city|platform; region NOT surfaced)', async () => {
    (api.get as jest.Mock).mockResolvedValue({ merchants: [], total: 0, meta })
    await discoveryApi.searchMerchants({ q: 'cafe', scope: 'platform' })
    expect(api.get).toHaveBeenCalledWith('/api/v1/customer/search?q=cafe&scope=platform')
  })

  it('getCategories hits the parameter-less endpoint', async () => {
    (api.get as jest.Mock).mockResolvedValue({ categories: [] })
    await discoveryApi.getCategories()
    expect(api.get).toHaveBeenCalledWith('/api/v1/customer/categories')
  })

  it('getCategories parses the new fields (intentType, descriptorState, merchantCountByCity)', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      categories: [{
        id: 'c1', name: 'Food & Drink', parentId: null,
        intentType: 'LOCAL', descriptorState: null,
        merchantCountByCity: { London: 47 },
      }],
    })
    const r = await discoveryApi.getCategories()
    expect(r.categories[0]?.intentType).toBe('LOCAL')
    expect(r.categories[0]?.merchantCountByCity).toEqual({ London: 47 })
  })

  it('getCategoryMerchants forwards opts as querystring', async () => {
    // Phase 2.4: branches + totalBranches are now required on the response.
    (api.get as jest.Mock).mockResolvedValue({ merchants: [tile], total: 1, meta, branches: [], totalBranches: 0 })
    const r = await discoveryApi.getCategoryMerchants('cat-1', { scope: 'city', lat: 51.5, lng: -0.1, limit: 20 })
    expect(api.get).toHaveBeenCalledWith(
      '/api/v1/customer/categories/cat-1/merchants?scope=city&lat=51.5&lng=-0.1&limit=20',
    )
  })

  it('getInAreaBranches forwards bbox and returns the in-area meta shape (no scope/scopeExpanded)', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      merchants: [tile], total: 1,
      meta: { resolvedArea: 'London', nearbyCount: 1, cityCount: 0, distantCount: 0, emptyStateReason: 'none' },
    })
    const r = await discoveryApi.getInAreaBranches({
      minLat: 51.4, maxLat: 51.6, minLng: -0.2, maxLng: 0,
      categoryId: 'cat-1', limit: 50,
    })
    expect(api.get).toHaveBeenCalledWith(
      '/api/v1/customer/discovery/in-area?minLat=51.4&maxLat=51.6&minLng=-0.2&maxLng=0&categoryId=cat-1&limit=50',
    )
    expect((r.meta as any).scope).toBeUndefined()
    expect((r.meta as any).scopeExpanded).toBeUndefined()
    expect(r.meta.resolvedArea).toBe('London')
  })

  it('getEligibleAmenities calls /categories/:id/amenities', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      amenities: [
        { id: 'a1', name: 'Wi-Fi', iconUrl: null, isActive: true },
        { id: 'a2', name: 'Outdoor Seating', iconUrl: null, isActive: true },
      ],
    })
    const r = await discoveryApi.getEligibleAmenities('cat-restaurant')
    expect(api.get).toHaveBeenCalledWith('/api/v1/customer/categories/cat-restaurant/amenities')
    expect(r.amenities).toHaveLength(2)
    expect(r.amenities[0]?.name).toBe('Wi-Fi')
  })

  // ─── Phase 2.4 categoryMerchantsResponseSchema — branches + totalBranches ──
  //
  // Backend (PR #110) has always emitted `branches[]` + `totalBranches` on the
  // category-merchants endpoint; prior to Phase 2.4 Task B the customer-app
  // schema silently stripped them on parse. These pins verify:
  //   1. The extended schema accepts a payload with `branches` + `totalBranches`.
  //   2. `branches[*].merchant.totalEstimatedSaving` passes through (Fold #2).
  //   3. `branchMeta` is NOT part of the schema (category endpoint does not emit it).

  describe('Phase 2.4 categoryMerchantsResponseSchema — branch-first extension', () => {
    // Minimal BranchTile fixture — mirrors a live Karaara Huddersfield tile
    // from the probe in §1.2 of the plan. All required fields populated;
    // branchTileSchema is .strict() so no extra fields allowed.
    const branchTileMerchant = {
      id:                   'merchant-1',
      businessName:         'Karaara Huddersfield',
      tradingName:          null,
      logoUrl:              null,
      bannerUrl:            null,
      primaryCategory:      null,
      primaryDescriptorTag: null,
      subcategory:          null,
      descriptor:           'Restaurant',
      highlights:           [],
      voucherCount:         2,
      maxEstimatedSaving:   3,
      totalEstimatedSaving: 5,   // Fold #2 — non-null saving
    }

    const branchTileA = {
      id:                       'branch-1',
      branchName:               'Karaara Huddersfield',
      branchLocalityId:         'loc-1',
      branchLocalityName:       'Huddersfield',
      branchPostTown:           'Huddersfield',
      branchCity:               'Huddersfield',
      branchLatitude:           53.6458,
      branchLongitude:          -1.785,
      branchLocationConfidence: 'MANUALLY_CONFIRMED' as const,
      isOpenNow:                true,
      closesAtLocal:            '22:00',
      distance:                 120,
      isFavourited:             false,
      avgRating:                4.5,
      reviewCount:              12,
      supplyRung:               'NEARBY' as const,
      proximityBand:            'NEARBY' as const,
      distanceMetres:           120,
      merchant:                 branchTileMerchant,
    }

    const branchTileB = {
      ...branchTileA,
      id:           'branch-2',
      branchName:   'Karaara Bradford',
      branchCity:   'Bradford',
      supplyRung:   'CATCHMENT' as const,
      proximityBand: 'IN_YOUR_AREA' as const,
    }

    const categoryPayload = {
      merchants: [tile],   // legacy arm — still present during additive period
      total:     1,
      meta,
      branches:      [branchTileA, branchTileB],
      totalBranches: 2,
    }

    it('accepts payload with branches[] + totalBranches (Phase 2.4 additive)', async () => {
      ;(api.get as jest.Mock).mockResolvedValue(categoryPayload)
      const r = await discoveryApi.getCategoryMerchants('cat-food-drink', { lat: 53.6458, lng: -1.785 })
      expect(r.branches).toHaveLength(2)
      expect(r.totalBranches).toBe(2)
    })

    it('branches[0].merchant.totalEstimatedSaving parses as number — Fold #2 verify', async () => {
      ;(api.get as jest.Mock).mockResolvedValue(categoryPayload)
      const r = await discoveryApi.getCategoryMerchants('cat-food-drink', { lat: 53.6458, lng: -1.785 })
      expect(typeof r.branches[0]?.merchant.totalEstimatedSaving).toBe('number')
      expect(r.branches[0]?.merchant.totalEstimatedSaving).toBe(5)
    })

    it('branches[1].merchant.totalEstimatedSaving parses as number for second tile', async () => {
      ;(api.get as jest.Mock).mockResolvedValue(categoryPayload)
      const r = await discoveryApi.getCategoryMerchants('cat-food-drink', { lat: 53.6458, lng: -1.785 })
      // Both tiles share the same merchant grouping — totalEstimatedSaving non-null
      expect(typeof r.branches[1]?.merchant.totalEstimatedSaving).toBe('number')
    })

    // PR #120 device-QA fix (2026-05-21) — branchMeta is NOW part of the
    // schema. The category-merchants endpoint emits it additively for
    // branch-aligned scope pill counts, mirroring /search. Owner-reported
    // bug: pre-fix, the screen rendered branches against merchant-tier
    // meta → counts disagreed with the list ("Nearby · 0" while nearby
    // branches were visible at 0.2 mi).

    it('branchMeta IS in the parsed output when emitted — PR #120 device-QA fix', async () => {
      ;(api.get as jest.Mock).mockResolvedValue({ ...categoryPayload, branchMeta: meta })
      const r = await discoveryApi.getCategoryMerchants('cat-food-drink', { lat: 53.6458, lng: -1.785 })
      expect(r.branchMeta).toBeDefined()
      expect(r.branchMeta?.scope).toBe(meta.scope)
      expect(r.branchMeta?.nearbyCount).toBe(meta.nearbyCount)
      expect(r.branchMeta?.cityCount).toBe(meta.cityCount)
      expect(r.branchMeta?.distantCount).toBe(meta.distantCount)
      expect(r.branchMeta?.emptyStateReason).toBe(meta.emptyStateReason)
    })

    it('branchMeta is absent when not emitted — back-compat with pre-fix server / cold cache', async () => {
      // The field is optional on the schema. Pre-fix server or stale cache
      // omits branchMeta; the schema parses cleanly and the screen falls
      // back to legacy `meta`.
      ;(api.get as jest.Mock).mockResolvedValue(categoryPayload)
      const r = await discoveryApi.getCategoryMerchants('cat-food-drink', { lat: 53.6458, lng: -1.785 })
      expect(r.branchMeta).toBeUndefined()
    })

    it('empty branches[] + totalBranches:0 still parses cleanly (no supply case)', async () => {
      ;(api.get as jest.Mock).mockResolvedValue({
        merchants: [], total: 0, meta,
        branches: [], totalBranches: 0,
      })
      const r = await discoveryApi.getCategoryMerchants('cat-empty')
      expect(r.branches).toEqual([])
      expect(r.totalBranches).toBe(0)
    })

    it('legacy-only payload (no branches / totalBranches) FAILS — fields are now required', async () => {
      // The extension makes branches + totalBranches required (not optional).
      // A payload missing them should throw a Zod parse error.
      ;(api.get as jest.Mock).mockResolvedValue({ merchants: [tile], total: 1, meta })
      await expect(
        discoveryApi.getCategoryMerchants('cat-food-drink'),
      ).rejects.toThrow()
    })
  })

})
