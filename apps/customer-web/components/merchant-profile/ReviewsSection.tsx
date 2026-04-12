'use client'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

type Review = {
  id: string
  rating: number
  comment: string | null
  displayName: string
  branchId: string
  branchName: string
  isVerified: boolean
  isOwnReview: boolean
  createdAt: string
  updatedAt: string
}

type Props = {
  merchantId: string
  avgRating: number | null
  reviewCount: number
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-[14px]" aria-label={`${rating} out of 5 stars`}>
      {[1,2,3,4,5].map(n => (
        <span key={n} className={n <= rating ? 'text-amber-500' : 'text-navy/15'}>★</span>
      ))}
    </span>
  )
}

export function ReviewsSection({ merchantId, avgRating, reviewCount }: Props) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    apiFetch<{ reviews: Review[]; total: number }>(
      `/api/v1/customer/merchants/${merchantId}/reviews?limit=5&offset=0`,
    ).then(data => {
      setReviews(data.reviews)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [merchantId])

  if (reviewCount === 0) return null

  return (
    <section id="reviews" className="px-6 py-10 border-t border-navy/[0.06]">
      <div className="flex items-baseline gap-3 mb-6">
        <h2 className="font-display text-[22px] text-navy">Reviews</h2>
        {avgRating !== null && (
          <span className="font-mono text-[12px] text-navy/40">
            {avgRating.toFixed(1)} avg · {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
          </span>
        )}
      </div>

      {loaded && reviews.length === 0 && (
        <p className="text-[14px] text-navy/40">No reviews yet.</p>
      )}

      <div className="flex flex-col gap-5 max-w-2xl">
        {reviews.map((review, i) => (
          <motion.div
            key={review.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            className="bg-white border border-navy/[0.08] rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[14px] text-navy">
                  {review.displayName}
                </span>
                <StarRating rating={review.rating} />
                {review.isVerified && (
                  <span className="font-mono text-[10px] text-green-600 tracking-wide">✓ Verified</span>
                )}
              </div>
              <span className="font-mono text-[11px] text-navy/30">
                {new Date(review.createdAt).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </span>
            </div>
            {review.comment && (
              <p className="text-[14px] leading-relaxed text-navy/60">{review.comment}</p>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  )
}
