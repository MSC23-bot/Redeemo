import { api } from '../api'

export type ReviewItem = {
  id: string
  branchId: string
  branchName: string
  displayName: string
  rating: number
  comment: string | null
  isVerified: boolean
  isOwnReview: boolean
  createdAt: string
  updatedAt: string
}

export type ReviewSummary = {
  averageRating: number
  totalReviews: number
  distribution: Record<number, number>
}

export type ReviewListResponse = {
  reviews: ReviewItem[]
  total: number
}

export const reviewsApi = {
  getMerchantReviews(merchantId: string, params: { limit?: number; offset?: number; branchId?: string } = {}) {
    const qs = new URLSearchParams()
    if (params.limit) qs.set('limit', String(params.limit))
    if (params.offset) qs.set('offset', String(params.offset))
    if (params.branchId) qs.set('branchId', params.branchId)
    const query = qs.toString()
    return api.get<ReviewListResponse>(`/api/v1/customer/merchants/${merchantId}/reviews${query ? `?${query}` : ''}`)
  },

  getReviewSummary(merchantId: string) {
    return api.get<ReviewSummary>(`/api/v1/customer/merchants/${merchantId}/reviews/summary`)
  },

  createReview(branchId: string, data: { rating: number; comment?: string }) {
    return api.post<ReviewItem>(`/api/v1/customer/branches/${branchId}/reviews`, data)
  },

  deleteReview(branchId: string, reviewId: string) {
    return api.del<{ success: boolean }>(`/api/v1/customer/branches/${branchId}/reviews/${reviewId}`)
  },

  toggleHelpful(reviewId: string) {
    return api.post<{ helpful: boolean }>(`/api/v1/customer/reviews/${reviewId}/helpful`, {})
  },

  reportReview(reviewId: string, data: { reason: string; comment?: string }) {
    return api.post<{ success: boolean }>(`/api/v1/customer/reviews/${reviewId}/report`, data)
  },
}
