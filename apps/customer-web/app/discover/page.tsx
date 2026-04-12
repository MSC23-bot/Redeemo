import type { Metadata } from 'next'
import { discoveryApi } from '@/lib/api'
import { DiscoverHero } from '@/components/discover/DiscoverHero'
import { CampaignBanner } from '@/components/discover/CampaignBanner'
import { CategoryFilterBar } from '@/components/discover/CategoryFilterBar'
import { MerchantRow } from '@/components/discover/MerchantRow'

export const metadata: Metadata = {
  title: 'Discover',
  description: 'Discover local businesses and exclusive vouchers near you.',
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lng?: string; categoryId?: string }>
}) {
  const params = await searchParams
  const lat = params.lat ? parseFloat(params.lat) : undefined
  const lng = params.lng ? parseFloat(params.lng) : undefined

  const [feed, categoriesResult] = await Promise.allSettled([
    discoveryApi.homeFeed({ lat, lng }),
    discoveryApi.categories(),
  ])

  const feedData = feed.status === 'fulfilled' ? feed.value : null
  const categories = categoriesResult.status === 'fulfilled' ? categoriesResult.value.categories : []

  const activeCategory = params.categoryId
  const categoryRows = feedData?.nearbyByCategory ?? []
  const filteredRows = activeCategory
    ? categoryRows.filter((row: { category: { id: string } }) => row.category.id === activeCategory)
    : categoryRows

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <DiscoverHero locationContext={feedData?.locationContext ?? { city: null, source: 'none' }} />

      <CategoryFilterBar categories={categories} />

      {feedData?.campaigns && feedData.campaigns.length > 0 && (
        <div className="pt-6">
          <CampaignBanner campaigns={feedData.campaigns} />
        </div>
      )}

      <div className="flex flex-col gap-8 py-8">
        {!activeCategory && feedData?.featured && feedData.featured.length > 0 && (
          <MerchantRow
            title="Featured near you"
            subtitle={`${feedData.featured.length} merchants`}
            merchants={feedData.featured}
          />
        )}

        {!activeCategory && feedData?.trending && feedData.trending.length > 0 && (
          <MerchantRow
            title="Trending this month"
            merchants={feedData.trending}
          />
        )}

        {filteredRows.map((row: { category: { id: string; name: string }; merchants: unknown[] }) => (
          <MerchantRow
            key={row.category.id}
            title={row.category.name}
            subtitle={`${row.merchants.length} merchants`}
            merchants={row.merchants as Parameters<typeof MerchantRow>[0]['merchants']}
          />
        ))}

        {filteredRows.length === 0 && !feedData?.featured?.length && !feedData?.trending?.length && (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
            <span className="text-5xl mb-4" aria-hidden>🏪</span>
            <h2 className="font-display text-[28px] text-navy mb-2">No merchants near you yet</h2>
            <p className="text-[15px] text-navy/50 max-w-sm">
              We&apos;re growing — check back soon, or browse all merchants below.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
