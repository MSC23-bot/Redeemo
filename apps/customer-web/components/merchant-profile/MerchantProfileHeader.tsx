'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { apiFetch } from '@/lib/api'

type Props = {
  merchant: {
    id: string
    businessName: string
    tradingName: string | null
    logoUrl: string | null
    bannerUrl: string | null
    coverImageUrl: string | null
    primaryCategory: { name: string } | null
    subcategory: { name: string } | null
    avgRating: number | null
    reviewCount: number
    isFavourited: boolean
    isOpenNow: boolean
    distance: number | null
    branches: { city: string }[]
  }
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m away`
  return `${(metres / 1000).toFixed(1)}km away`
}

export function MerchantProfileHeader({ merchant }: Props) {
  const [isFavourited, setIsFavourited] = useState(merchant.isFavourited)
  const [pending, setPending] = useState(false)
  const displayName = merchant.tradingName ?? merchant.businessName
  const dist = formatDistance(merchant.distance)
  const bannerSrc = merchant.coverImageUrl ?? merchant.bannerUrl
  const city = merchant.branches[0]?.city ?? null
  const hasLogo = Boolean(merchant.logoUrl)

  // Strip primary category words from subcategory to avoid "Restaurant · Indian Restaurant"
  const subcategoryLabel = (() => {
    if (!merchant.subcategory) return null
    const sub = merchant.subcategory.name
    const pri = merchant.primaryCategory?.name ?? ''
    if (!pri || sub.toLowerCase() === pri.toLowerCase()) return null
    const priWords = pri.toLowerCase().split(/\s+/)
    let stripped = sub
    for (const w of priWords) {
      stripped = stripped.replace(new RegExp(`\\b${w}\\b`, 'gi'), '').trim()
    }
    stripped = stripped.replace(/^[-&·,\s]+|[-&·,\s]+$/g, '').trim()
    return stripped || sub
  })()

  const toggleFavourite = async () => {
    if (pending) return
    const prev = isFavourited
    setPending(true)
    setIsFavourited(!prev)
    try {
      await apiFetch(
        `/api/v1/customer/favourites/merchants/${merchant.id}`,
        { method: prev ? 'DELETE' : 'POST', auth: true },
      )
    } catch {
      setIsFavourited(prev)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="bg-white">
      {/* Back link */}
      <div className="max-w-7xl mx-auto px-6 pt-5 pb-4">
        <Link
          href="/discover"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#4B5563] no-underline hover:text-[#010C35] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Discover
        </Link>
      </div>

      {/* Banner + floating logo container */}
      <div className="max-w-7xl mx-auto px-6">
        <div className="relative">

          {/* ── Banner ── */}
          <motion.div
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="relative h-[260px] md:h-[390px] rounded-2xl overflow-hidden bg-[#010C35]"
          >
            {bannerSrc ? (
              <Image
                src={bannerSrc}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 1280px) 100vw, 1280px"
                priority
              />
            ) : (
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  background:
                    'radial-gradient(700px circle at 80% 10%, rgba(226,12,4,0.4), transparent 55%), linear-gradient(145deg, #010C35 0%, #071240 50%, #0d1f6b 100%)',
                }}
              />
            )}

            {/* Depth gradient — works on both light and dark banners */}
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, transparent 28%, rgba(0,0,0,0.38) 58%, rgba(0,0,0,0.82) 100%)',
              }}
            />

            {/* Subtle vignette sides */}
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse at center, transparent 60%, rgba(1,12,53,0.22) 100%)',
              }}
            />

            {/* Favourite button */}
            <motion.button
              onClick={toggleFavourite}
              type="button"
              disabled={pending}
              aria-disabled={pending}
              aria-label={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
              aria-pressed={isFavourited}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.4 }}
              whileHover={{ scale: 1.07 }}
              whileTap={{ scale: 0.93 }}
              className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/95 backdrop-blur-sm flex items-center justify-center shadow-[0_4px_20px_rgba(1,12,53,0.25)] hover:bg-white transition-colors cursor-pointer"
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill={isFavourited ? '#E20C04' : 'none'}
                stroke={isFavourited ? '#E20C04' : '#010C35'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ transition: 'fill 0.2s, stroke 0.2s' }}
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </motion.button>

            {/* Bottom content: category label · city + merchant name + chips */}
            <div
              className={`absolute bottom-0 left-0 right-0 p-6 md:p-8 ${hasLogo ? 'pl-[120px] md:pl-[148px]' : ''}`}
            >
              {merchant.primaryCategory && (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                  className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/80 mb-2.5"
                  style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}
                >
                  {merchant.primaryCategory.name}
                  {subcategoryLabel && <span className="text-white/60"> &middot; {subcategoryLabel}</span>}
                  {city && <span className="text-white/55"> &middot; {city}</span>}
                </motion.p>
              )}

              <div className="flex items-end justify-between gap-4 flex-wrap">
                <motion.h1
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="font-display text-white leading-[1.07] max-w-[700px]"
                  style={{
                    fontSize: 'clamp(26px, 4vw, 46px)',
                    letterSpacing: '-0.6px',
                    textShadow: '0 2px 16px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.4)',
                  }}
                >
                  {displayName}
                </motion.h1>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.5 }}
                  className="flex items-center gap-2.5 text-white/90 text-[13px] flex-wrap"
                >
                  {merchant.avgRating !== null && (
                    <span className="inline-flex items-center gap-1 bg-white/12 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/15">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="#FBBF24" aria-hidden="true">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      <span className="font-semibold">{merchant.avgRating.toFixed(1)}</span>
                      <span className="text-white/60">({merchant.reviewCount})</span>
                    </span>
                  )}
                  {dist && (
                    <span className="text-white/65 text-[12px] font-medium">{dist}</span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full ${
                      merchant.isOpenNow
                        ? 'bg-[#16A34A]/20 text-[#4ADE80] border border-[#16A34A]/35'
                        : 'bg-white/10 text-white/65 border border-white/15'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        merchant.isOpenNow ? 'bg-[#4ADE80]' : 'bg-white/45'
                      }`}
                      aria-hidden="true"
                    />
                    {merchant.isOpenNow ? 'Open now' : 'Closed'}
                  </span>
                </motion.div>
              </div>
            </div>
          </motion.div>

          {/* ── Floating logo — overlaps banner bottom edge ── */}
          {hasLogo && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.72 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.55 }}
              className="absolute bottom-0 left-6 md:left-8 translate-y-1/2 z-10"
            >
              <div className="w-[84px] h-[84px] md:w-[100px] md:h-[100px] rounded-2xl border-[3px] border-white shadow-[0_8px_28px_rgba(1,12,53,0.22)] overflow-hidden bg-white flex-shrink-0">
                <Image
                  src={merchant.logoUrl!}
                  alt={`${displayName} logo`}
                  width={100}
                  height={100}
                  className="w-full h-full object-cover"
                  sizes="100px"
                />
              </div>
            </motion.div>
          )}
        </div>

        {/* Spacer to make room for the logo overhang (half of 100px = 50px) */}
        {hasLogo && <div className="h-11 md:h-14" />}
      </div>
    </div>
  )
}
