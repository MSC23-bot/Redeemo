import { discoveryApi } from '@/lib/api/discovery'

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
  },
}))

import { api } from '@/lib/api'
const mockGet = api.get as jest.Mock

describe('discoveryApi', () => {
  beforeEach(() => mockGet.mockReset())

  it('getHomeFeed calls correct endpoint with lat/lng', async () => {
    mockGet.mockResolvedValue({ featured: [], trending: [], campaigns: [], nearbyByCategory: [], locationContext: {} })
    await discoveryApi.getHomeFeed({ lat: 51.5, lng: -0.1 })
    expect(mockGet).toHaveBeenCalledWith('/api/v1/customer/home?lat=51.5&lng=-0.1')
  })

  it('getHomeFeed calls without coords when null', async () => {
    mockGet.mockResolvedValue({ featured: [] })
    await discoveryApi.getHomeFeed({})
    expect(mockGet).toHaveBeenCalledWith('/api/v1/customer/home')
  })

  it('searchMerchants sends query params', async () => {
    mockGet.mockResolvedValue({ merchants: [], total: 0 })
    await discoveryApi.searchMerchants({ q: 'pizza', lat: 51.5, lng: -0.1 })
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('q=pizza'))
  })

  it('searchMerchants sends bounding box params', async () => {
    mockGet.mockResolvedValue({ merchants: [], total: 0 })
    await discoveryApi.searchMerchants({ minLat: 51.4, maxLat: 51.6, minLng: -0.2, maxLng: 0 })
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('minLat=51.4'))
  })

  it('getCategories calls correct endpoint', async () => {
    mockGet.mockResolvedValue({ categories: [] })
    await discoveryApi.getCategories()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/customer/categories')
  })

  it('getCampaigns calls correct endpoint', async () => {
    mockGet.mockResolvedValue([])
    await discoveryApi.getCampaigns()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/customer/campaigns')
  })

  it('getMerchant calls correct endpoint', async () => {
    mockGet.mockResolvedValue({})
    await discoveryApi.getMerchant('m1', { lat: 51.5, lng: -0.1 })
    expect(mockGet).toHaveBeenCalledWith('/api/v1/customer/merchants/m1?lat=51.5&lng=-0.1')
  })
})
