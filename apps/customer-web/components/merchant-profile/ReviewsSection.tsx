'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
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

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(n => (
        <svg
          key={n}
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill={n <= rating ? '#FBBF24' : '#E5E7EB'}
          aria-hidden="true"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  )
}

function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const day = 86400000
  if (diff < day) return 'Today'
  if (diff < 2 * day) return 'Yesterday'
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))} wk ago`
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))} mo ago`
  return `${Math.floor(diff / (365 * day))} yr ago`
}

export function ReviewsSection({ merchantId, avgRating, reviewCount }: Props) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoaded(false)
    setReviews([])
    apiFetch<{ reviews: Review[]; total: number }>(
      `/api/v1/customer/merchants/${merchantId}/reviews?limit=4&offset=0`,
      { signal: controller.signal },
    )
      .then(data => {
        setReviews(data.reviews)
        setLoaded(true)
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return
        setLoaded(true)
      })
    return () => controller.abort()
  }, [merchantId])

  if (reviewCount === 0) return null

  return (
    <motion.section
      id="reviews"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-7xl mx-auto px-6 py-10 md:py-12 border-b border-[#EDE8E8]"
    >
      <div className="flex items-center gap-5 mb-6 flex-wrap">
        {avgRating !== null && (
          <div
            className="rounded-2xl border border-[#E5E3DF] px-5 py-3.5 text-center flex-shrink-0"
            style={{ background: '#F9F8F6' }}
          >
            <div
              className="font-display text-[#010C35] leading-none mb-1"
              style={{ fontSize: '34px', letterSpacing: '-0.5px' }}
            >
              {avgRating.toFixed(1)}
            </div>
            <StarRow rating={Math.round(avgRating)} />
          </div>
        )}
        <div>
          <h2
            className="font-display text-[#010C35] leading-tight mb-1"
            style={{ fontSize: 'clamp(22px, 2.6vw, 28px)', letterSpacing: '-0.2px' }}
          >
            Member reviews
          </h2>
          <p className="text-[13.5px] text-[#9CA3AF]">
            {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
          </p>
        </div>
      </div>

      {!loaded && <p className="text-[14px] text-[#9CA3AF]">Loading reviews…</p>}

      {loaded && reviews.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl">
          {reviews.map(r => (
            <article
              key={r.id}
              className="rounded-2xl border border-[#E5E3DF] p-5"
              style={{ background: '#F9F8F6' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-[14px] text-[#010C35] truncate">
                    {r.displayName}
                  </span>
                  {r.isVerified && (
                    <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#16A34A]">
                      Verified
                    </span>
                  )}
                </div>
                <span className="text-[11.5px] text-[#9CA3AF] flex-shrink-0">
                  {formatRelativeDate(r.createdAt)}
                </span>
              </div>
              <div className="mb-2">
                <StarRow rating={r.rating} />
              </div>
              {r.comment && (
                <p className="text-[13.5px] text-[#4B5563] leading-[1.65]">{r.comment}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </motion.section>
  )
}
