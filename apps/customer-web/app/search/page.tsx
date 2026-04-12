'use client'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { discoveryApi } from '@/lib/api'
import { SearchBar } from '@/components/search/SearchBar'
import { SearchResults } from '@/components/search/SearchResults'
import { FilterDrawer, type FilterState } from '@/components/ui/FilterDrawer'
import type { MerchantTile } from '@/components/ui/MerchantTile'

const DEFAULT_FILTERS: FilterState = {
  sortBy: 'relevance',
  voucherTypes: [],
  openNow: false,
}

const PAGE_SIZE = 20

export default function SearchPage() {
  const searchParams = useSearchParams()

  const [results, setResults] = useState<MerchantTile[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)

  const q = searchParams.get('q') ?? ''
  const categoryId = searchParams.get('categoryId') ?? undefined

  const activeFilterCount = [
    filters.sortBy !== 'relevance',
    filters.voucherTypes.length > 0,
    filters.openNow,
  ].filter(Boolean).length

  const fetchResults = useCallback(async (reset = true) => {
    setIsLoading(true)
    const currentOffset = reset ? 0 : offset
    try {
      const data = await discoveryApi.search({
        q: q || undefined,
        categoryId,
        sortBy: filters.sortBy,
        voucherTypes: filters.voucherTypes.length > 0 ? filters.voucherTypes : undefined,
        openNow: filters.openNow || undefined,
        limit: PAGE_SIZE,
        offset: currentOffset,
      })
      if (reset) {
        setResults(data.results)
        setOffset(PAGE_SIZE)
      } else {
        setResults(prev => [...prev, ...data.results])
        setOffset(o => o + PAGE_SIZE)
      }
      setTotal(data.total)
    } finally {
      setIsLoading(false)
    }
  }, [q, categoryId, filters, offset])

  useEffect(() => {
    fetchResults(true)
  }, [q, categoryId, filters]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFiltersChange = (next: FilterState) => {
    setFilters(next)
    setFilterOpen(false)
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <SearchBar
        activeFilterCount={activeFilterCount}
        onFilterToggle={() => setFilterOpen(o => !o)}
      />

      <div className="flex max-w-screen-xl mx-auto">
        <FilterDrawer
          isOpen={filterOpen}
          onClose={() => setFilterOpen(false)}
          filters={filters}
          onFiltersChange={handleFiltersChange}
        />

        <SearchResults
          results={results}
          total={total}
          hasMore={results.length < total}
          onLoadMore={() => fetchResults(false)}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
