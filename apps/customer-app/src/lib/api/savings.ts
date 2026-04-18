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

export type MonthBreakdown = {
  month: string   // 'YYYY-MM'
  saving: number
  count: number
}

export type MerchantSaving = {
  merchantId: string
  businessName: string
  logoUrl: string | null
  saving: number
  count: number
}

export type CategorySaving = {
  categoryId: string
  name: string
  saving: number
}

export type SavingsSummary = {
  lifetimeSaving: number
  thisMonthSaving: number
  thisMonthRedemptionCount: number
  monthlyBreakdown: MonthBreakdown[]
  byMerchant: MerchantSaving[]
  byCategory: CategorySaving[]
}

export type SavingsRedemption = {
  id: string
  redeemedAt: string
  estimatedSaving: number
  isValidated: boolean
  validatedAt: string | null
  merchant: {
    id: string
    businessName: string
    logoUrl: string | null
  }
  voucher: {
    id: string
    title: string
    voucherType: VoucherType
  }
  branch: {
    id: string
    name: string
  }
}

export type SavingsRedemptionsResponse = {
  redemptions: SavingsRedemption[]
  total: number
}

export type MonthlyDetail = {
  totalSaving: number
  redemptionCount: number
  byMerchant: MerchantSaving[]
  byCategory: CategorySaving[]
}

export const savingsApi = {
  getSummary() {
    return api.get<SavingsSummary>('/api/v1/customer/savings/summary')
  },

  getRedemptions(params: { limit?: number; offset?: number }) {
    const qs = new URLSearchParams()
    if (params.limit) qs.set('limit', String(params.limit))
    if (params.offset) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return api.get<SavingsRedemptionsResponse>(
      `/api/v1/customer/savings/redemptions${query ? `?${query}` : ''}`,
    )
  },

  getMonthlyDetail(month: string) {
    return api.get<MonthlyDetail>(
      `/api/v1/customer/savings/monthly-detail?month=${month}`,
    )
  },
}
