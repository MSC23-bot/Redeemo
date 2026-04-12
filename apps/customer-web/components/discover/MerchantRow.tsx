'use client'
import { useState, useCallback } from 'react'
import { MerchantTile, type MerchantTile as MerchantTileType } from '@/components/ui/MerchantTile'
import { apiFetch } from '@/lib/api'

type Props = {
  title: string
  subtitle?: string
  merchants: MerchantTileType[]
  initialFavourites?: Set<string>
}

export function MerchantRow({ title, subtitle, merchants, initialFavourites }: Props) {
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
  }, []) // no deps — reads state via functional updater

  if (merchants.length === 0) return null

  return (
    <section className="py-2">
      <div className="flex items-baseline gap-3 px-6 mb-4">
        <h2 className="font-display text-[22px] text-navy leading-none">
          {title}
        </h2>
        {subtitle && (
          <span className="font-mono text-[11px] text-navy/35 tracking-wide">
            {subtitle}
          </span>
        )}
      </div>

      <div
        className="overflow-x-auto scrollbar-none px-6"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        <div className="flex gap-4" style={{ width: 'max-content', paddingRight: 24 }}>
          {merchants.map((m, i) => (
            <div key={m.id} style={{ scrollSnapAlign: 'start' }}>
              <MerchantTile
                merchant={{ ...m, isFavourited: favourites.has(m.id) }}
                onFavouriteToggle={handleFavouriteToggle}
                index={i}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
