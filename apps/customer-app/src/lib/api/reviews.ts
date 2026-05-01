import { z } from 'zod'
import { api } from '../api'

// Review-list + review-summary read endpoints. Write endpoints (upsert /
// delete / report / toggleHelpful) are out of scope for M1 — they may be
// added in M2 when the WriteReviewSheet is wired (or skipped if writing
// is deferred per owner decision §9.4).

const reviewSchema = z.object({
  id:          z.string(),
  branchId:    z.string(),
  branchName:  z.string(),
  displayName: z.string(),
  rating:      z.number().int().min(1).max(5),
  comment:     z.string().nullable(),
  isVerified:  z.boolean(),
  isOwnReview: z.boolean(),
  createdAt:   z.string(),    // ISO
  updatedAt:   z.string(),    // ISO
})
export type Review = z.infer<typeof reviewSchema>

const reviewsResponseSchema = z.object({
  reviews: z.array(reviewSchema),
  total:   z.number().int().min(0),
})
export type ReviewsResponse = z.infer<typeof reviewsResponseSchema>

const reviewSummarySchema = z.object({
  averageRating: z.number(),                      // 0 if no reviews
  totalReviews:  z.number().int().min(0),
  // Backend returns numeric keys (1..5) but JSON serialises them as strings;
  // accept either at the schema boundary.
  distribution:  z.record(z.string(), z.number().int().min(0)),
})
export type ReviewSummary = z.infer<typeof reviewSummarySchema>

export const reviewsApi = {
  /**
   * GET /api/v1/customer/merchants/:id/reviews
   * Paginated; optional branchId filter.
   */
  async getMerchantReviews(
    merchantId: string,
    params: { limit?: number; offset?: number; branchId?: string } = {},
  ): Promise<ReviewsResponse> {
    const qp = new URLSearchParams()
    if (params.limit  !== undefined) qp.set('limit',  String(params.limit))
    if (params.offset !== undefined) qp.set('offset', String(params.offset))
    if (params.branchId)             qp.set('branchId', params.branchId)
    const qs  = qp.toString() ? `?${qp.toString()}` : ''
    const res = await api.get<unknown>(`/api/v1/customer/merchants/${encodeURIComponent(merchantId)}/reviews${qs}`)
    return reviewsResponseSchema.parse(res)
  },

  /**
   * GET /api/v1/customer/merchants/:id/reviews/summary
   * Aggregated rating histogram + average.
   */
  async getReviewSummary(merchantId: string): Promise<ReviewSummary> {
    const res = await api.get<unknown>(`/api/v1/customer/merchants/${encodeURIComponent(merchantId)}/reviews/summary`)
    return reviewSummarySchema.parse(res)
  },
}
