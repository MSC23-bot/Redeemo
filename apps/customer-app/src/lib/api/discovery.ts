import { api } from '../api'

export type MerchantTile = {
  id: string
  businessName: string
  tradingName: string | null
  logoUrl: string | null
  bannerUrl: string | null
  primaryCategory: { id: string; name: string } | null
  subcategory: { id: string; name: string } | null
  voucherCount: number
  maxEstimatedSaving: number | null
  distance: number | null
  nearestBranchId: string | null
  avgRating: number | null
  reviewCount: number
  isFavourited: boolean
}

export type LocationContext = {
  city: string | null
  lat: number | null
  lng: number | null
  source: 'coordinates' | 'profile' | 'none'
}

export type HomeFeedResponse = {
  locationContext: LocationContext
  featured: MerchantTile[]
  trending: MerchantTile[]
  campaigns: {
    id: string
    name: string
    description: string | null
    bannerUrl: string | null
    gradientStart: string | null
    gradientEnd: string | null
    ctaText: string | null
  }[]
  nearbyByCategory: {
    category: { id: string; name: string }
    merchants: MerchantTile[]
  }[]
}

export type Category = {
  id: string
  name: string
  iconUrl: string | null
  pinColour: string | null
  pinIcon: string | null
  merchantCount: number
  parentId: string | null
  subcategories?: { id: string; name: string }[]
}

export type SearchParams = {
  q?: string
  categoryId?: string
  subcategoryId?: string
  lat?: number
  lng?: number
  minLat?: number
  maxLat?: number
  minLng?: number
  maxLng?: number
  maxDistanceMiles?: number
  minSaving?: number
  voucherTypes?: string[]
  amenityIds?: string[]
  openNow?: boolean
  featured?: boolean
  topRated?: boolean
  sortBy?: 'relevance' | 'nearest' | 'top_rated' | 'highest_saving'
  limit?: number
  offset?: number
}

export type SearchResponse = {
  merchants: MerchantTile[]
  total: number
  limit: number
  offset: number
}

function buildQuery(params: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      parts.push(`${key}=${value.join(',')}`)
    } else {
      parts.push(`${key}=${encodeURIComponent(String(value))}`)
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

export const discoveryApi = {
  getHomeFeed(opts: { lat?: number; lng?: number } = {}) {
    const qs = buildQuery({ lat: opts.lat, lng: opts.lng })
    return api.get<HomeFeedResponse>(`/api/v1/customer/home${qs}`)
  },

  searchMerchants(params: SearchParams) {
    const qs = buildQuery(params as Record<string, unknown>)
    return api.get<SearchResponse>(`/api/v1/customer/search${qs}`)
  },

  getCategories() {
    return api.get<{ categories: Category[] }>('/api/v1/customer/categories')
  },

  getCampaigns() {
    return api.get<HomeFeedResponse['campaigns']>('/api/v1/customer/campaigns')
  },

  getMerchant(id: string, opts: { lat?: number; lng?: number } = {}) {
    const qs = buildQuery({ lat: opts.lat, lng: opts.lng })
    return api.get<unknown>(`/api/v1/customer/merchants/${id}${qs}`)
  },

  getMerchantBranches(id: string) {
    return api.get<unknown>(`/api/v1/customer/merchants/${id}/branches`)
  },

  getCampaignMerchants(id: string, params: { categoryId?: string; lat?: number; lng?: number; limit?: number; offset?: number } = {}) {
    const qs = buildQuery(params as Record<string, unknown>)
    return api.get<unknown>(`/api/v1/customer/campaigns/${id}/merchants${qs}`)
  },
}
