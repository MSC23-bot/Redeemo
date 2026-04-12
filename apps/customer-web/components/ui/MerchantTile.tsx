'use client'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import type { MerchantTileData } from '@/lib/api'

// Re-export the canonical type under the short name for local use.
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
      className={`group relative flex flex-col bg-white rounded-2xl overflow-hidden border border-navy/[0.06] shadow-sm hover:shadow-md transition-shadow ${
        variant === 'grid' ? 'w-full' : 'flex-shrink-0 w-[220px] sm:w-[240px]'
      }`}
    >
      {/* Banner image area */}
      <Link href={`/merchants/${merchant.id}`} className="relative block h-[130px] bg-navy/10 flex-shrink-0">
        {merchant.bannerUrl ? (
          <Image
            src={merchant.bannerUrl}
            alt={displayName}
            fill
            className="object-cover"
            sizes="240px"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-navy/20 to-navy/5" />
        )}

        {/* Logo circle — overlaps bottom-left of banner */}
        {merchant.logoUrl && (
          <div className="absolute bottom-0 left-3 translate-y-1/2 w-10 h-10 rounded-full border-2 border-white shadow overflow-hidden bg-white">
            <Image src={merchant.logoUrl} alt="" fill className="object-cover" sizes="40px" />
          </div>
        )}
      </Link>

      {/* Favourite heart — top right of image, always visible */}
      {onFavouriteToggle && (
        <button
          onClick={e => { e.preventDefault(); onFavouriteToggle(merchant.id) }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-white transition-colors"
          aria-label={merchant.isFavourited ? 'Remove from favourites' : 'Add to favourites'}
        >
          <span className="text-[15px]" aria-hidden>
            {merchant.isFavourited ? '❤️' : '🤍'}
          </span>
        </button>
      )}

      {/* Info area */}
      <Link href={`/merchants/${merchant.id}`} className="flex flex-col gap-2 p-4 pt-6 flex-1 no-underline">
        {/* Category badge */}
        {merchant.primaryCategory && (
          <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-orange-red">
            {merchant.primaryCategory.name}
          </span>
        )}

        {/* Merchant name */}
        <h3 className="font-display text-[17px] text-navy leading-snug line-clamp-2">
          {displayName}
        </h3>

        {/* Vouchers + saving row */}
        <div className="flex items-center gap-2 flex-wrap">
          {merchant.voucherCount > 0 && (
            <span className="text-[12px] text-navy/55 font-mono">
              {merchant.voucherCount} {merchant.voucherCount === 1 ? 'voucher' : 'vouchers'}
            </span>
          )}
          {merchant.maxEstimatedSaving !== null && (
            <span className="text-[11px] font-semibold text-red bg-red/[0.08] px-2 py-0.5 rounded-full">
              Save up to £{merchant.maxEstimatedSaving.toFixed(0)}
            </span>
          )}
        </div>

        {/* Rating + distance row */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-navy/[0.06]">
          {merchant.avgRating !== null ? (
            <span className="text-[12px] text-navy/60">
              ★ {merchant.avgRating.toFixed(1)}
              <span className="text-navy/35 ml-1">({merchant.reviewCount})</span>
            </span>
          ) : (
            <span className="text-[11px] text-navy/30 font-mono">New</span>
          )}
          {dist && (
            <span className="text-[11px] text-navy/40 font-mono">{dist}</span>
          )}
        </div>
      </Link>
    </motion.div>
  )
}
