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
})
