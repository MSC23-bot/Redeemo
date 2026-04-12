'use client'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { apiFetch } from '@/lib/api'

type Props = {
  merchant: {
    id: string
    businessName: string
    tradingName: string | null
    logoUrl: string | null
    bannerUrl: string | null
    primaryCategory: { name: string } | null
    avgRating: number | null
    reviewCount: number
    isFavourited: boolean
    isOpenNow: boolean
    distance: number | null
  }
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m away`
  return `${(metres / 1000).toFixed(1)}km away`
}

export function MerchantProfileHeader({ merchant }: Props) {
  const [isFavourited, setIsFavourited] = useState(merchant.isFavourited)
  const displayName = merchant.tradingName ?? merchant.businessName
  const dist = formatDistance(merchant.distance)

  const toggleFavourite = async () => {
    const prev = isFavourited
    setIsFavourited(!prev)
    try {
      await apiFetch(
        `/api/v1/customer/favourites/merchants/${merchant.id}`,
        { method: prev ? 'DELETE' : 'POST', auth: true },
      )
    } catch {
      setIsFavourited(prev)
    }
  }

  return (
    <div className="bg-[#FAF8F5]">
      {/* Banner */}
      <div className="relative h-[220px] md:h-[300px] overflow-hidden bg-navy/10">
        {merchant.bannerUrl ? (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          >
            <Image
              src={merchant.bannerUrl}
              alt=""
              fill
              className="object-cover"
              sizes="100vw"
              priority
            />
          </motion.div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-navy/30 to-navy/10" />
        )}

        {/* Favourite button — top right */}
        <button
          onClick={toggleFavourite}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-md hover:bg-white transition-colors"
          aria-label={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
        >
          <span className="text-[17px]" aria-hidden="true">
            {isFavourited ? '❤️' : '🤍'}
          </span>
        </button>
      </div>

      {/* Info area — logo overlaps banner */}
      <div className="relative px-6 pb-6 max-w-screen-xl mx-auto">
        {/* Logo — absolute positioned to straddle banner/info boundary */}
        {merchant.logoUrl && (
          <div className="absolute -top-10 left-6 w-[72px] h-[72px] rounded-full border-4 border-white shadow-lg overflow-hidden bg-white">
            <Image src={merchant.logoUrl} alt={displayName} fill className="object-cover" sizes="72px" />
          </div>
        )}

        {/* Spacer to push content below logo */}
        <div className={merchant.logoUrl ? 'pt-[52px]' : 'pt-5'}>
          {/* Category badge */}
          {merchant.primaryCategory && (
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-orange-red block mb-1">
              {merchant.primaryCategory.name}
            </span>
          )}

          {/* Name */}
          <h1 className="font-display text-[clamp(26px,4vw,40px)] text-navy leading-[1.08] mb-3">
            {displayName}
          </h1>

          {/* Chips row */}
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            {merchant.avgRating !== null && (
              <span className="flex items-center gap-1 text-navy/70">
                <span className="text-amber-500">★</span>
                {merchant.avgRating.toFixed(1)}
                <span className="text-navy/35">({merchant.reviewCount})</span>
              </span>
            )}

            <span
              className={`font-mono text-[11px] tracking-wide px-3 py-1 rounded-full ${
                merchant.isOpenNow
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red/[0.07] text-red border border-red/20'
              }`}
            >
              {merchant.isOpenNow ? 'Open now' : 'Closed'}
            </span>

            {dist && (
              <span className="font-mono text-[11px] text-navy/40">{dist}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
