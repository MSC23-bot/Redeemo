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
  // ISO-8601 with `Z` suffix — required per the datetime contract in the
  // branch-aware spec §5.6. `z.string().datetime()` accepts "...Z" and
  // rejects naive datetimes (which `new Date()` parses as device-local
  // time, silently shifting timestamps). Backend serialises with
  // `Date.toISOString()` which always emits Z. Pin the contract here so
  // any future regression to naive datetimes throws at the API boundary
  // instead of producing wrong "12 hours ago" values on devices in
  // non-UTC timezones.
  createdAt:   z.string().datetime(),
  updatedAt:   z.string().datetime(),
  // Helpful state — backend always returns these on the list endpoint
  // (default to 0 / false when no rows). Without these, the Helpful
  // button appears tappable but produces no visible state change because
  // there's nothing to display.
  helpfulCount:      z.number().int().min(0),
  userMarkedHelpful: z.boolean(),
})
export type Review = z.infer<typeof reviewSchema>
// Alias for cefaf45 component imports during M2 salvage.
export type ReviewItem = Review

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

  /**
   * POST /api/v1/customer/branches/:branchId/reviews — create or update.
   * Auth required. Returns the formatted review.
   */
  async createReview(branchId: string, data: { rating: number; comment?: string }): Promise<Review> {
    // Backend Zod schema rejects `comment: undefined` with exactOptionalPropertyTypes;
    // omit the key entirely when caller didn't provide one.
    const body: { rating: number; comment?: string } = { rating: data.rating }
    if (data.comment !== undefined) body.comment = data.comment
    const res = await api.post<unknown>(`/api/v1/customer/branches/${encodeURIComponent(branchId)}/reviews`, body)
    return reviewSchema.parse(res)
  },

  /**
   * DELETE /api/v1/customer/branches/:branchId/reviews/:reviewId
   * Auth required. Soft-deletes (isHidden=true) so analytics stays intact.
   */
  async deleteReview(branchId: string, reviewId: string): Promise<{ success: boolean }> {
    const res = await api.del<unknown>(
      `/api/v1/customer/branches/${encodeURIComponent(branchId)}/reviews/${encodeURIComponent(reviewId)}`,
    )
    return z.object({ success: z.boolean() }).parse(res)
  },

  /**
   * POST /api/v1/customer/reviews/:reviewId/helpful — toggle helpful flag.
   * Auth required. Backend returns `{ helpful: boolean }` only — no
   * `success` envelope (verified against `src/api/customer/reviews/
   * service.ts:toggleHelpful`). Earlier scaffolding assumed a `success`
   * field that the backend never set, so every tap threw a Zod parse
   * error and surfaced as a generic "Something went wrong" toast.
   */
  async toggleHelpful(reviewId: string): Promise<{ helpful: boolean }> {
    const res = await api.post<unknown>(`/api/v1/customer/reviews/${encodeURIComponent(reviewId)}/helpful`, undefined)
    return z.object({ helpful: z.boolean() }).parse(res)
  },
}
