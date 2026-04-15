'use client'
import { useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MerchantTile } from '@/components/ui/MerchantTile'
import { apiFetch, type MerchantTileData } from '@/lib/api'

type Props = {
  results: MerchantTileData[]
  total: number
  hasMore: boolean
  onLoadMore: () => void
  isLoading: boolean
}

export function SearchResults({ results, total, hasMore, onLoadMore, isLoading }: Props) {
  const [favourites, setFavourites] = useState<Set<string>>(
    new Set(results.filter(m => m.isFavourited).map(m => m.id)),
  )

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

  useEffect(() => {
    const newlyFavourited = results.filter(m => m.isFavourited).map(m => m.id)
    if (newlyFavourited.length > 0) {
      setFavourites(prev => {
        const next = new Set(prev)
        newlyFavourited.forEach(id => next.add(id))
        return next
      })
    }
  }, [results])

  if (results.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <span className="text-5xl mb-4" aria-hidden>🔍</span>
        <h3 className="font-display text-[24px] text-navy mb-2">No results found</h3>
        <p className="text-[15px] text-navy/50 max-w-sm">
          Try adjusting your search term or removing some filters.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 px-6 py-6">
      <p className="font-mono text-[12px] tracking-wide text-navy/40 mb-5">
        {total} {total === 1 ? 'result' : 'results'}
      </p>

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.06 } },
        }}
      >
        {results.map((m, i) => (
          <motion.div
            key={m.id}
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
            }}
          >
            <MerchantTile
              merchant={{ ...m, isFavourited: favourites.has(m.id) }}
              onFavouriteToggle={handleFavouriteToggle}
              index={i}
              variant="grid"
            />
          </motion.div>
        ))}
      </motion.div>

      {hasMore && (
        <div className="mt-10 flex justify-center">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="font-mono text-[12px] tracking-[0.1em] uppercase text-navy/55 border border-navy/[0.15] rounded-xl px-8 py-3 hover:border-navy/30 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
