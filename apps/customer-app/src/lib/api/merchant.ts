import { api } from '../api'
import type { VoucherType } from './redemption'

export type OpeningHourEntry = {
  dayOfWeek: number
  openTime: string
  closeTime: string
  isClosed: boolean
}

export type Amenity = {
  id: string
  name: string
  iconUrl: string | null
}

export type BranchDetail = {
  id: string
  name: string
  addressLine1: string
  addressLine2: string | null
  city: string
  postcode: string
  latitude: number | null
  longitude: number | null
  phone: string | null
  email: string | null
  distance: number | null
  isOpenNow: boolean
  avgRating: number | null
  reviewCount: number
}

export type MerchantVoucher = {
  id: string
  title: string
  type: VoucherType
  description: string | null
  terms: string | null
  imageUrl: string | null
  estimatedSaving: number
  expiryDate: string | null
}

export type MerchantProfile = {
  id: string
  businessName: string
  tradingName: string | null
  logoUrl: string | null
  bannerUrl: string | null
  about: string | null
  websiteUrl: string | null
  primaryCategory: { id: string; name: string } | null
  subcategory: { id: string; name: string } | null
  avgRating: number | null
  reviewCount: number
  isFavourited: boolean
  isFeatured?: boolean
  isTrending?: boolean
  distance: number | null
  isOpenNow: boolean
  openingHours: OpeningHourEntry[]
  amenities: Amenity[]
  photos: string[]
  nearestBranch: {
    id: string
    name: string
    addressLine1: string
    addressLine2: string | null
    city: string
    postcode: string
    latitude: number | null
    longitude: number | null
    phone: string | null
    email: string | null
    distance: number | null
    isOpenNow: boolean
  } | null
  vouchers: MerchantVoucher[]
  branches: BranchDetail[]
}

function buildQuery(params: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    parts.push(`${key}=${encodeURIComponent(String(value))}`)
  }
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

export const merchantApi = {
  getProfile(id: string, opts: { lat?: number; lng?: number } = {}) {
    const qs = buildQuery({ lat: opts.lat, lng: opts.lng })
    return api.get<MerchantProfile>(`/api/v1/customer/merchants/${id}${qs}`)
  },

  getBranches(id: string) {
    return api.get<BranchDetail[]>(`/api/v1/customer/merchants/${id}/branches`)
  },
}
