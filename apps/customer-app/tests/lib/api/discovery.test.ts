import { api } from '@/lib/api'
import { discoveryApi } from '@/lib/api/discovery'

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
    })
    await discoveryApi.getHomeFeed()
    expect(api.get).toHaveBeenCalledWith('/api/v1/customer/home')
  })

  it('getHomeFeed includes lat/lng when provided', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      locationContext: { city: 'London', source: 'coordinates' },
      featured: [], trending: [], campaigns: [], nearbyByCategory: [],
    })
    await discoveryApi.getHomeFeed({ lat: 51.5, lng: -0.1 })
    expect(api.get).toHaveBeenCalledWith('/api/v1/customer/home?lat=51.5&lng=-0.1')
  })

  it('searchMerchants forwards q + meta envelope', async () => {
    (api.get as jest.Mock).mockResolvedValue({ merchants: [tile], total: 1, meta })
    const r = await discoveryApi.searchMerchants({ q: 'pizza', limit: 20 })
    expect(api.get).toHaveBeenCalledWith('/api/v1/customer/search?q=pizza&limit=20')
    expect(r.merchants[0]?.supplyTier).toBe('NEARBY')
    expect(r.meta?.emptyStateReason).toBe('none')
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

  it('getCategoryMerchants forwards id + opts and returns meta envelope', async () => {
    (api.get as jest.Mock).mockResolvedValue({ merchants: [tile], total: 1, meta })
    const r = await discoveryApi.getCategoryMerchants('cat-1', { scope: 'city', lat: 51.5, lng: -0.1, limit: 20 })
    expect(api.get).toHaveBeenCalledWith(
      '/api/v1/customer/categories/cat-1/merchants?scope=city&lat=51.5&lng=-0.1&limit=20',
    )
    expect(r.meta.emptyStateReason).toBe('none')
  })

  it('getInAreaMerchants forwards bbox and returns the in-area meta shape (no scope/scopeExpanded)', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      merchants: [tile], total: 1,
      meta: { resolvedArea: 'London', nearbyCount: 1, cityCount: 0, distantCount: 0, emptyStateReason: 'none' },
    })
    const r = await discoveryApi.getInAreaMerchants({
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

  // ─── Plan 4 M3.5 additive contract ────────────────────────────────────────
  //
  // The backend M3.3 hybrid pipeline now returns four optional tile fields
  // (supplyRung / proximityBand / distanceMetres / contextBranchId) AND two
  // optional meta fields (rungCounts / effectiveLocality) ALONGSIDE the
  // existing legacy fields. All new fields are `.optional()` AND
  // `.nullable()` so:
  //   - older mock fixtures (no new fields) still parse
  //   - hybrid responses with V2 fields populated parse
  //   - hybrid responses where V2 rejected the merchant (null new fields) parse
  //   - bad enum values are rejected (catches contract drift)

  describe('M3.5 additive contract parsing', () => {
    it('OLD payload (no new M3 fields) still parses — backwards compat with pre-M3 mocks', async () => {
      // `tile` defined at the top of this file has no M3 fields. This case
      // already runs through every existing test in this file — pinning it
      // here so the contract is explicit if the legacy tile shape ever
      // changes.
      ;(api.get as jest.Mock).mockResolvedValue({
        merchants: [tile], total: 1, meta,
      })
      const r = await discoveryApi.searchMerchants({ q: 'x' })
      expect(r.merchants[0]?.supplyRung).toBeUndefined()
      expect(r.merchants[0]?.proximityBand).toBeUndefined()
      expect(r.merchants[0]?.distanceMetres).toBeUndefined()
      expect(r.merchants[0]?.contextBranchId).toBeUndefined()
      expect((r.meta as any).rungCounts).toBeUndefined()
      expect((r.meta as any).effectiveLocality).toBeUndefined()
    })

    it('NEW payload (V2 fields populated) parses end-to-end', async () => {
      const v2Tile = {
        ...tile,
        supplyRung:      'NEARBY' as const,
        proximityBand:   'NEARBY' as const,
        distanceMetres:  142,
        contextBranchId: 'b-1',
      }
      const v2Meta = {
        ...meta,
        rungCounts: {
          NEARBY: 1, CATCHMENT: 0, POST_TOWN: 0, LAD: 0,
          COUNTY: 0, REGION: 0, COUNTRY: 0, NATIONAL: 0,
        },
        effectiveLocality: { id: 'loc-huddersfield', name: 'Huddersfield' },
      }
      ;(api.get as jest.Mock).mockResolvedValue({ merchants: [v2Tile], total: 1, meta: v2Meta })
      const r = await discoveryApi.searchMerchants({ q: 'x' })
      expect(r.merchants[0]?.supplyRung).toBe('NEARBY')
      expect(r.merchants[0]?.proximityBand).toBe('NEARBY')
      expect(r.merchants[0]?.distanceMetres).toBe(142)
      expect(r.merchants[0]?.contextBranchId).toBe('b-1')
      expect((r.meta as any).rungCounts?.NEARBY).toBe(1)
      expect((r.meta as any).effectiveLocality?.name).toBe('Huddersfield')
    })

    it('HYBRID payload — V2-rejected tile carries null V2 fields, V2-classified tile carries populated fields', async () => {
      const rejectedTile = {
        ...tile, id: 'm-rejected',
        // Hybrid backend explicitly emits null for these on V2-rejected tiles.
        supplyRung:      null,
        proximityBand:   null,
        distanceMetres:  null,
        contextBranchId: null,
      }
      const classifiedTile = {
        ...tile, id: 'm-classified',
        supplyRung:      'LAD' as const,
        proximityBand:   'IN_YOUR_AREA' as const,
        distanceMetres:  3200,
        contextBranchId: 'b-2',
      }
      ;(api.get as jest.Mock).mockResolvedValue({
        merchants: [rejectedTile, classifiedTile], total: 2, meta,
      })
      const r = await discoveryApi.searchMerchants({ q: 'x' })
      expect(r.merchants[0]?.supplyRung).toBeNull()
      expect(r.merchants[0]?.proximityBand).toBeNull()
      expect(r.merchants[0]?.distanceMetres).toBeNull()
      expect(r.merchants[0]?.contextBranchId).toBeNull()
      expect(r.merchants[1]?.supplyRung).toBe('LAD')
      expect(r.merchants[1]?.proximityBand).toBe('IN_YOUR_AREA')
    })

    it('rejects an invalid supplyRung enum value (catches contract drift)', async () => {
      const badTile = { ...tile, supplyRung: 'GALACTIC' as any }
      ;(api.get as jest.Mock).mockResolvedValue({ merchants: [badTile], total: 1, meta })
      await expect(discoveryApi.searchMerchants({ q: 'x' })).rejects.toThrow()
    })

    it('rejects an invalid proximityBand enum value', async () => {
      const badTile = { ...tile, proximityBand: 'TOO_FAR' as any }
      ;(api.get as jest.Mock).mockResolvedValue({ merchants: [badTile], total: 1, meta })
      await expect(discoveryApi.searchMerchants({ q: 'x' })).rejects.toThrow()
    })

    it('rejects rungCounts missing an enum key (catches drift)', async () => {
      const badMeta = {
        ...meta,
        // Missing NATIONAL — should fail parsing.
        rungCounts: { NEARBY: 0, CATCHMENT: 0, POST_TOWN: 0, LAD: 0, COUNTY: 0, REGION: 0, COUNTRY: 0 } as any,
      }
      ;(api.get as jest.Mock).mockResolvedValue({ merchants: [tile], total: 1, meta: badMeta })
      await expect(discoveryApi.searchMerchants({ q: 'x' })).rejects.toThrow()
    })

    it('in-area meta also accepts the new rungCounts + effectiveLocality fields', async () => {
      const inAreaMeta = {
        resolvedArea: 'London', nearbyCount: 0, cityCount: 0, distantCount: 0,
        emptyStateReason: 'none' as const,
        rungCounts: {
          NEARBY: 0, CATCHMENT: 0, POST_TOWN: 0, LAD: 0,
          COUNTY: 0, REGION: 0, COUNTRY: 0, NATIONAL: 0,
        },
        effectiveLocality: { id: 'loc-london', name: 'London' },
      }
      ;(api.get as jest.Mock).mockResolvedValue({ merchants: [], total: 0, meta: inAreaMeta })
      const r = await discoveryApi.getInAreaMerchants({
        minLat: 51.4, maxLat: 51.6, minLng: -0.2, maxLng: 0,
      })
      expect((r.meta as any).effectiveLocality?.id).toBe('loc-london')
    })
  })
})
