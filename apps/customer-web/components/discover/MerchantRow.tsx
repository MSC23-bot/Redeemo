'use client'
import Link from 'next/link'
import { useState, useCallback } from 'react'
import { MerchantTile } from '@/components/ui/MerchantTile'
import { apiFetch, type MerchantTileData } from '@/lib/api'

type Props = {
  title: string
  subtitle?: string
  merchants: MerchantTileData[]
  initialFavourites?: Set<string>
  badge?: 'featured' | 'trending'
  seeAllHref?: string
}

export function MerchantRow({
  title,
  subtitle,
  merchants,
  initialFavourites,
  badge,
  seeAllHref,
}: Props) {
  const [favourites, setFavourites] = useState<Set<string>>(initialFavourites ?? new Set())

  const handleFavouriteToggle = useCallback(async (merchantId: string) => {
    let wasFav = false
    setFavourites(prev => {
      wasFav = prev.has(merchantId)
      const next = new Set(prev)
      wasFav ? next.delete(merchantId) : next.add(merchantId)
      return next
    })
    try {
      await apiFetch(
        `/api/v1/customer/favourites/merchants/${merchantId}`,
        { method: wasFav ? 'DELETE' : 'POST', auth: true },
      )
    } catch {
      setFavourites(prev => {
        const next = new Set(prev)
        wasFav ? next.add(merchantId) : next.delete(merchantId)
        return next
      })
    }
  }, [])

  if (merchants.length === 0) return null

  return (
    <section className="py-2">
      <div className="max-w-7xl mx-auto px-6 mb-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {badge && <RowBadge kind={badge} />}
              <h2
                className="font-display text-[#010C35] leading-tight"
                style={{ fontSize: 'clamp(22px, 2.6vw, 28px)', letterSpacing: '-0.2px' }}
              >
                {title}
              </h2>
            </div>
            {subtitle && (
              <p className="text-[13px] text-[#9CA3AF]">{subtitle}</p>
            )}
          </div>
          {seeAllHref && (
            <Link
              href={seeAllHref}
              className="text-[13px] font-semibold text-[#E20C04] no-underline hover:underline flex-shrink-0"
            >
              See all &rarr;
            </Link>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        <div
          className="overflow-x-auto scrollbar-none px-6"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          <div className="flex gap-4" style={{ width: 'max-content', paddingRight: 24 }}>
            {merchants.map((m, i) => (
              <div key={m.id} style={{ scrollSnapAlign: 'start' }} className="relative">
                {badge && <TileBadgeOverlay kind={badge} />}
                <MerchantTile
                  merchant={{ ...m, isFavourited: favourites.has(m.id) }}
                  onFavouriteToggle={handleFavouriteToggle}
                  index={i}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function RowBadge({ kind }: { kind: 'featured' | 'trending' }) {
  if (kind === 'featured') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[0.12em] uppercase text-[#D97706] px-2 py-0.5 rounded-full bg-[#FEF3E7] border border-[#F3D9A4]">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        Featured
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[0.12em] uppercase text-[#E20C04] px-2 py-0.5 rounded-full bg-[#FEF0EE] border border-[#FFD6CF]">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14a8 8 0 0 0 16 0C20 9.9 18.04 6.24 14.99 3.93L13.5 0.67z" />
      </svg>
      Trending
    </span>
  )
}

function TileBadgeOverlay({ kind }: { kind: 'featured' | 'trending' }) {
  if (kind === 'featured') {
    return (
      <span
        className="absolute top-2.5 left-2.5 z-10 text-[9px] font-bold tracking-[0.1em] uppercase text-white px-2 py-0.5 rounded-full pointer-events-none"
        style={{ background: '#D97706' }}
      >
        Featured
      </span>
    )
  }
  return (
    <span
      className="absolute top-2.5 left-2.5 z-10 text-[9px] font-bold tracking-[0.1em] uppercase text-white px-2 py-0.5 rounded-full pointer-events-none"
      style={{ background: 'var(--brand-gradient)' }}
    >
      Trending
    </span>
  )
}
