import { api } from '../api'
import type { VoucherType } from './savings'

export type FavouriteMerchantItem = {
  id: string
  businessName: string
  tradingName: string | null
  logoUrl: string | null
  bannerUrl: string | null
  status: string
  primaryCategory: { id: string; name: string } | null
  voucherCount: number
  maxEstimatedSaving: number
  avgRating: number | null
  reviewCount: number
  isOpen: boolean
  branch: {
    id: string
    name: string
    addressLine1: string
    latitude: number | null
    longitude: number | null
  } | null
  favouritedAt: string
  isUnavailable: boolean
}

export type FavouriteVoucherItem = {
  id: string
  title: string
  type: VoucherType
  estimatedSaving: number
  description: string | null
  expiresAt: string | null
  status: string
  approvalStatus: string
  isRedeemedInCurrentCycle: boolean
  merchant: {
    id: string
    businessName: string
    logoUrl: string | null
    status: string
  }
  favouritedAt: string
  isUnavailable: boolean
}

export type FavouriteMerchantsResponse = {
  items: FavouriteMerchantItem[]
  total: number
  page: number
  limit: number
}

export type FavouriteVouchersResponse = {
  items: FavouriteVoucherItem[]
  total: number
  page: number
  limit: number
}

export const favouritesApi = {
  getMerchants(params: { page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams()
    if (params.page)  qs.set('page',  String(params.page))
    if (params.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return api.get<FavouriteMerchantsResponse>(
      `/api/v1/customer/favourites/merchants${query ? `?${query}` : ''}`,
    )
  },

  getVouchers(params: { page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams()
    if (params.page)  qs.set('page',  String(params.page))
    if (params.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return api.get<FavouriteVouchersResponse>(
      `/api/v1/customer/favourites/vouchers${query ? `?${query}` : ''}`,
    )
  },

  addMerchant(merchantId: string) {
    return api.post(`/api/v1/customer/favourites/merchants/${merchantId}`, undefined)
  },

  removeMerchant(merchantId: string) {
    return api.del(`/api/v1/customer/favourites/merchants/${merchantId}`)
  },

  addVoucher(voucherId: string) {
    return api.post(`/api/v1/customer/favourites/vouchers/${voucherId}`, undefined)
  },

  removeVoucher(voucherId: string) {
    return api.del(`/api/v1/customer/favourites/vouchers/${voucherId}`)
  },
}
