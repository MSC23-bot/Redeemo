'use client'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Heart } from 'lucide-react'
import type { MerchantTileData } from '@/lib/api'

export type MerchantTile = MerchantTileData

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  return `${(metres / 1000).toFixed(1)}km`
}

type Props = {
  merchant: MerchantTile
  onFavouriteToggle?: (id: string) => void
  index?: number
  variant?: 'rail' | 'grid'
}

export function MerchantTile({ merchant, onFavouriteToggle, index = 0, variant = 'rail' }: Props) {
  const displayName = merchant.tradingName ?? merchant.businessName
  const dist = formatDistance(merchant.distance ?? null)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.07 }}
      className={`group relative flex flex-col bg-white rounded-xl overflow-hidden border border-[#EDE8E8] shadow-sm hover:shadow-md transition-shadow ${
        variant === 'grid' ? 'w-full' : 'flex-shrink-0 w-[220px] sm:w-[240px]'
      }`}
    >
      {/* Thumbnail — neutral gray placeholder, never warm tint */}
      <Link
        href={`/merchants/${merchant.id}`}
        className="relative block flex-shrink-0"
        style={{ paddingTop: '66.67%' /* 3:2 ratio */ }}
      >
        <div className="absolute inset-0 bg-[#EFEFEF]">
          {merchant.bannerUrl && (
            <Image
              src={merchant.bannerUrl}
              alt={displayName}
              fill
              className="object-cover"
              sizes={variant === 'grid' ? '(max-width: 768px) 100vw, 33vw' : '240px'}
            />
          )}
        </div>

        {/* Logo circle */}
        {merchant.logoUrl && (
          <div className="absolute bottom-0 left-3 translate-y-1/2 w-10 h-10 rounded-full border-2 border-white shadow overflow-hidden bg-white z-10">
            <Image src={merchant.logoUrl} alt="" fill className="object-cover" sizes="40px" />
          </div>
        )}
      </Link>

      {/* Favourite button — top right of thumbnail */}
      {onFavouriteToggle && (
        <button
          onClick={e => { e.preventDefault(); onFavouriteToggle(merchant.id) }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-white transition-colors z-10"
          aria-label={merchant.isFavourited ? 'Remove from favourites' : 'Add to favourites'}
        >
          <Heart
            size={15}
            strokeWidth={1.8}
            className={merchant.isFavourited ? 'text-[#E20C04] fill-[#E20C04]' : 'text-[#9CA3AF]'}
          />
        </button>
      )}

      {/* Info area */}
      <Link href={`/merchants/${merchant.id}`} className="flex flex-col gap-2 p-4 pt-6 flex-1 no-underline">
        {merchant.primaryCategory && (
          <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#E20C04]">
            {merchant.primaryCategory.name}
          </span>
        )}

        <h3 className="font-body text-[16px] font-bold text-[#010C35] leading-snug line-clamp-2">
          {displayName}
        </h3>

        <div className="flex items-center gap-2 flex-wrap">
          {merchant.voucherCount > 0 && (
            <span className="text-[12px] text-[#4B5563]">
              {merchant.voucherCount} {merchant.voucherCount === 1 ? 'voucher' : 'vouchers'}
            </span>
          )}
          {merchant.maxEstimatedSaving !== null && (
            <span
              className="text-[11px] font-semibold text-white px-2 py-0.5 rounded-full"
              style={{ background: 'var(--brand-gradient)' }}
            >
              Save up to £{merchant.maxEstimatedSaving.toFixed(0)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-[#EDE8E8]">
          {merchant.avgRating !== null ? (
            <span className="text-[12px] text-[#4B5563]">
              &#9733; {merchant.avgRating.toFixed(1)}
              <span className="text-[#9CA3AF] ml-1">({merchant.reviewCount})</span>
            </span>
          ) : (
            <span className="text-[11px] text-[#9CA3AF] font-bold tracking-wide uppercase">New</span>
          )}
          {dist && (
            <span className="text-[11px] text-[#9CA3AF]">{dist}</span>
          )}
        </div>
      </Link>
    </motion.div>
  )
}
