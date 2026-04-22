import { api } from '../api'

export type VoucherType =
  | 'BOGO'
  | 'SPEND_AND_SAVE'
  | 'DISCOUNT_FIXED'
  | 'DISCOUNT_PERCENT'
  | 'FREEBIE'
  | 'PACKAGE_DEAL'
  | 'TIME_LIMITED'
  | 'REUSABLE'

export type VoucherDetail = {
  id: string
  title: string
  type: VoucherType
  description: string | null
  terms: string | null
  imageUrl: string | null
  estimatedSaving: number
  expiryDate: string | null
  code: string
  status: string
  approvalStatus: string
  isRedeemedThisCycle: boolean
  isFavourited: boolean
  merchant: {
    id: string
    businessName: string
    tradingName: string | null
    logoUrl: string | null
    status: string
  }
}

export type RedemptionResponse = {
  id: string
  userId: string
  voucherId: string
  branchId: string
  redemptionCode: string
  estimatedSaving: number
  isValidated: boolean
  redeemedAt: string
}

export type RedemptionDetail = {
  id: string
  userId: string
  voucherId: string
  branchId: string
  redemptionCode: string
  isValidated: boolean
  validatedAt: string | null
  validationMethod: 'QR_SCAN' | 'MANUAL' | null
  estimatedSaving: number
  redeemedAt: string
  validatedById: string | null
  voucher: {
    id: string
    title: string
    terms: string | null
    merchant: { businessName: string }
  }
  branch: {
    id: string
    name: string
    addressLine1: string
    city: string
    postcode: string
  }
}

export type RedeemParams = {
  voucherId: string
  branchId: string
  pin: string
}

export type RedemptionStatusByCode = {
  code: string
  isValidated: boolean
  validatedAt: string | null
  validationMethod: 'QR_SCAN' | 'MANUAL' | null
  voucherId: string
  merchantName: string
  branchName: string
}

export const redemptionApi = {
  getVoucherDetail(id: string) {
    return api.get<VoucherDetail>(`/api/v1/customer/vouchers/${id}`)
  },

  redeem(params: RedeemParams) {
    return api.post<RedemptionResponse>('/api/v1/redemption', params)
  },

  getMyRedemption(id: string) {
    return api.get<RedemptionDetail>(`/api/v1/redemption/my/${id}`)
  },

  getMyRedemptions(params: { limit?: number; offset?: number } = {}) {
    const qs = new URLSearchParams()
    if (params.limit) qs.set('limit', String(params.limit))
    if (params.offset) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return api.get<RedemptionDetail[]>(`/api/v1/redemption/my${query ? `?${query}` : ''}`)
  },

  getMyRedemptionByCode(code: string) {
    return api.get<RedemptionStatusByCode>(`/api/v1/redemption/me/${code}`)
  },

  postScreenshotFlag(code: string, platform: 'ios' | 'android') {
    return api.post<{ logged: boolean }>(
      `/api/v1/redemption/${code}/screenshot-flag`,
      { platform }
    )
  },
}
