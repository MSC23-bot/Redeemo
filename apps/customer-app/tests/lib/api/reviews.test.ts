import { api } from '@/lib/api'
import { reviewsApi } from '@/lib/api/reviews'

jest.spyOn(api, 'get')

const review = {
  id:          'r1',
  branchId:    'b1',
  branchName:  'Main',
  displayName: 'Ada L.',
  rating:      5,
  comment:     'Excellent',
  isVerified:  true,
  isOwnReview: false,
  createdAt:   '2026-04-01T00:00:00.000Z',
  updatedAt:   '2026-04-01T00:00:00.000Z',
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
