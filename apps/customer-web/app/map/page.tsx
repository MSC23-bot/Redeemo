import type { Metadata } from 'next'
import { Suspense } from 'react'
import { discoveryApi } from '@/lib/api'
import { DiscoverHero } from '@/components/discover/DiscoverHero'
import { CategoryFilterBar } from '@/components/discover/CategoryFilterBar'
import { MapCanvas } from '@/components/map/MapCanvas'
import { MapSidebar } from '@/components/map/MapSidebar'

export const metadata: Metadata = {
  title: 'Map',
  description:
    'Find independent local businesses on the Redeemo map and browse nearby merchants offering exclusive member vouchers.',
}

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lng?: string; categoryId?: string }>
}) {
  const params = await searchParams
  const lat = params.lat ? parseFloat(params.lat) : undefined
  const lng = params.lng ? parseFloat(params.lng) : undefined
  const categoryId = params.categoryId ?? null

  // We fetch home feed purely for the locationContext + category list;
  // search powers the sidebar so category filters compose cleanly.
  const [feedResult, categoriesResult, searchResult] = await Promise.allSettled([
    discoveryApi.homeFeed({ lat, lng }),
    discoveryApi.categories(),
    discoveryApi.search({
      categoryId: categoryId ?? undefined,
      sortBy: 'nearest',
      limit: 40,
      offset: 0,
    }),
  ])

  const locationContext =
    feedResult.status === 'fulfilled'
      ? feedResult.value.locationContext
      : { city: null, source: 'none' as const }

  const categories =
    categoriesResult.status === 'fulfilled' ? categoriesResult.value.categories : []

  const merchants = searchResult.status === 'fulfilled' ? searchResult.value.results : []
  const total = searchResult.status === 'fulfilled' ? searchResult.value.total : 0

  const activeCategory = categoryId
    ? categories.find(c => c.id === categoryId) ?? null
    : null

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <DiscoverHero locationContext={locationContext} activeView="map" />

      <Suspense fallback={<div className="h-14 border-b border-[#EDE8E8]" />}>
        <CategoryFilterBar categories={categories} />
      </Suspense>

      <div className="flex-1 flex flex-col-reverse lg:flex-row min-h-[70vh] lg:min-h-[calc(100dvh-240px)]">
        <MapSidebar
          merchants={merchants}
          total={total}
          activeCategoryName={activeCategory?.name ?? null}
        />
        <MapCanvas />
      </div>
    </div>
  )
}
