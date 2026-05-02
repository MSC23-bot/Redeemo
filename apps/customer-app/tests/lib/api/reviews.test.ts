import { api } from '@/lib/api'
import { reviewsApi } from '@/lib/api/reviews'

jest.spyOn(api, 'get')

const review = {
  id:                'r1',
  branchId:          'b1',
  branchName:        'Main',
  displayName:       'Ada L.',
  rating:            5,
  comment:           'Excellent',
  isVerified:        true,
  isOwnReview:       false,
  createdAt:         '2026-04-01T00:00:00.000Z',
  updatedAt:         '2026-04-01T00:00:00.000Z',
  helpfulCount:      0,
  userMarkedHelpful: false,
}

describe('reviewsApi.getMerchantReviews', () => {
  beforeEach(() => { (api.get as jest.Mock).mockReset() })

  it('parses the list response', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce({ reviews: [review], total: 1 })
    const r = await reviewsApi.getMerchantReviews('m1')
    expect(r.total).toBe(1)
    expect(r.reviews[0]!.displayName).toBe('Ada L.')
  })

  it('builds query string with limit + offset + branchId', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce({ reviews: [], total: 0 })
    await reviewsApi.getMerchantReviews('m1', { limit: 10, offset: 20, branchId: 'b1' })
    const url = (api.get as jest.Mock).mock.calls[0]![0]
    expect(url).toMatch(/^\/api\/v1\/customer\/merchants\/m1\/reviews\?/)
    expect(url).toContain('limit=10')
    expect(url).toContain('offset=20')
    expect(url).toContain('branchId=b1')
  })

  it('omits query string when no params given', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce({ reviews: [], total: 0 })
    await reviewsApi.getMerchantReviews('m1')
    expect((api.get as jest.Mock).mock.calls[0]![0]).toBe('/api/v1/customer/merchants/m1/reviews')
  })

  it('rejects a malformed review (rating out of range)', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce({ reviews: [{ ...review, rating: 7 }], total: 1 })
    await expect(reviewsApi.getMerchantReviews('m1')).rejects.toThrow()
  })

  // PR A round-4 — list payload must surface helpful state. Without these
  // fields the Helpful button looks tappable but produces no visible change
  // because there's nothing to display.
  it('rejects a review missing helpfulCount', async () => {
    const { helpfulCount: _omit, ...partial } = review
    ;(api.get as jest.Mock).mockResolvedValueOnce({ reviews: [partial], total: 1 })
    await expect(reviewsApi.getMerchantReviews('m1')).rejects.toThrow()
  })

  it('rejects a review missing userMarkedHelpful', async () => {
    const { userMarkedHelpful: _omit, ...partial } = review
    ;(api.get as jest.Mock).mockResolvedValueOnce({ reviews: [partial], total: 1 })
    await expect(reviewsApi.getMerchantReviews('m1')).rejects.toThrow()
  })

  it('parses helpfulCount + userMarkedHelpful from the list response', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce({
      reviews: [{ ...review, helpfulCount: 7, userMarkedHelpful: true }],
      total: 1,
    })
    const r = await reviewsApi.getMerchantReviews('m1')
    expect(r.reviews[0]!.helpfulCount).toBe(7)
    expect(r.reviews[0]!.userMarkedHelpful).toBe(true)
  })

  // Regression for the datetime contract locked in branch-aware spec §5.6.
  // A naive datetime ("2026-04-01T00:00:00") parses as device-local time
  // and shifts every "X ago" display by the user's UTC offset (the root
  // cause of the "12 hours ago" review-timestamp report on a Qatar device).
  // Pin: the schema must reject naive datetimes at the API boundary.
  it('rejects a review with a naive (no-Z) createdAt', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce({
      reviews: [{ ...review, createdAt: '2026-04-01T00:00:00' }],
      total: 1,
    })
    await expect(reviewsApi.getMerchantReviews('m1')).rejects.toThrow()
  })

  // Pin the toggleHelpful contract — backend returns `{ helpful: boolean }`
  // only (verified against `src/api/customer/reviews/service.ts`). Earlier
  // scaffolding required a non-existent `success` field, which made every
  // helpful-tap throw a Zod parse error → generic "Something went wrong"
  // toast. These regression tests catch a re-introduction of that mismatch.
  describe('toggleHelpful', () => {
    let postSpy: jest.SpyInstance
    beforeEach(() => { postSpy = jest.spyOn(api, 'post').mockReset() })

    it('parses { helpful: true } from the backend', async () => {
      postSpy.mockResolvedValueOnce({ helpful: true })
      const r = await reviewsApi.toggleHelpful('rev-1')
      expect(r).toEqual({ helpful: true })
    })

    it('parses { helpful: false } from the backend', async () => {
      postSpy.mockResolvedValueOnce({ helpful: false })
      const r = await reviewsApi.toggleHelpful('rev-1')
      expect(r).toEqual({ helpful: false })
    })

    it('POSTs to the right URL with no body', async () => {
      postSpy.mockResolvedValueOnce({ helpful: true })
      await reviewsApi.toggleHelpful('rev with spaces')
      expect(postSpy.mock.calls[0]![0]).toBe('/api/v1/customer/reviews/rev%20with%20spaces/helpful')
      expect(postSpy.mock.calls[0]![1]).toBeUndefined()
    })

    it('rejects when the backend response is missing `helpful`', async () => {
      // Catches the prior bug where the schema was tolerant of {} or
      // { success: true } without the actual flag.
      postSpy.mockResolvedValueOnce({ success: true })
      await expect(reviewsApi.toggleHelpful('rev-1')).rejects.toThrow()
    })
  })

  it('accepts an ISO datetime with `Z` suffix (the contract from spec §5.6)', async () => {
    // `Date.toISOString()` always emits the `Z` form; the schema must accept
    // exactly that. We deliberately do NOT exercise +00:00 offset variants —
    // the spec's contract is "ISO with Z", and accepting other forms would
    // weaken it.
    ;(api.get as jest.Mock).mockResolvedValueOnce({
      reviews: [
        { ...review, id: 'r1', createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z' },
      ],
      total: 1,
    })
    await expect(reviewsApi.getMerchantReviews('m1')).resolves.toBeDefined()
  })
})

describe('reviewsApi.getReviewSummary', () => {
  beforeEach(() => { (api.get as jest.Mock).mockReset() })

  it('parses a populated summary', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce({
      averageRating: 4.5,
      totalReviews:  10,
      distribution:  { '1': 0, '2': 0, '3': 1, '4': 3, '5': 6 },
    })
    const r = await reviewsApi.getReviewSummary('m1')
    expect(r.averageRating).toBe(4.5)
    expect(r.totalReviews).toBe(10)
    expect(r.distribution['5']).toBe(6)
  })

  it('parses a zero-review summary', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce({
      averageRating: 0,
      totalReviews:  0,
      distribution:  { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    })
    const r = await reviewsApi.getReviewSummary('m1')
    expect(r.totalReviews).toBe(0)
  })
})
