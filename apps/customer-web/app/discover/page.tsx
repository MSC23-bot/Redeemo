import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { discoveryApi } from '@/lib/api'
import { DiscoverHero } from '@/components/discover/DiscoverHero'
import { CampaignBanner } from '@/components/discover/CampaignBanner'
import { CategoryFilterBar } from '@/components/discover/CategoryFilterBar'
import { MerchantRow } from '@/components/discover/MerchantRow'
import { MerchantTile } from '@/components/ui/MerchantTile'
import { NonMemberNudge } from '@/components/discover/NonMemberNudge'

export const metadata: Metadata = {
  title: 'Discover',
  description:
    'Discover independent local businesses with exclusive vouchers for Redeemo members.',
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

  const activeCategoryId = params.categoryId ?? null
  const categoryRows = feedData?.nearbyByCategory ?? []
  const activeCategory = activeCategoryId
    ? categories.find(c => c.id === activeCategoryId) ?? null
    : null

  const filteredRows = activeCategoryId
    ? categoryRows.filter(row => row.category.id === activeCategoryId)
    : categoryRows

  const hasAnyContent =
    (feedData?.featured?.length ?? 0) > 0 ||
    (feedData?.trending?.length ?? 0) > 0 ||
    filteredRows.length > 0 ||
    (feedData?.campaigns?.length ?? 0) > 0

  return (
    <div className="min-h-screen bg-white">
      <DiscoverHero
        locationContext={feedData?.locationContext ?? { city: null, source: 'none' }}
      />

      <Suspense fallback={<div className="h-14 border-b border-[#EDE8E8]" />}>
        <CategoryFilterBar categories={categories} />
      </Suspense>

      <NonMemberNudge />

      {/* Campaign banner — only shown when no category filter active */}
      {!activeCategoryId && feedData?.campaigns && feedData.campaigns.length > 0 && (
        <div className="pt-8">
          <CampaignBanner campaigns={feedData.campaigns} />
        </div>
      )}

      <div className="flex flex-col gap-12 md:gap-14 py-10 md:py-12">
        {/* Featured strip — unfiltered view only */}
        {!activeCategoryId && feedData?.featured && feedData.featured.length > 0 && (
          <MerchantRow
            title="Featured near you"
            subtitle="Promoted local businesses"
            merchants={feedData.featured}
            badge="featured"
          />
        )}

        {/* Trending strip — unfiltered view only */}
        {!activeCategoryId && feedData?.trending && feedData.trending.length > 0 && (
          <MerchantRow
            title="Trending this month"
            subtitle="Popular with Redeemo members near you"
            merchants={feedData.trending}
            badge="trending"
          />
        )}

        {/* Category grids (or single filtered category) */}
        {filteredRows.map(row => (
          <section key={row.category.id}>
            <div className="max-w-7xl mx-auto px-6 mb-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2
                    className="font-display text-[#010C35] leading-tight"
                    style={{ fontSize: 'clamp(22px, 2.6vw, 28px)', letterSpacing: '-0.2px' }}
                  >
                    {row.category.name}
                  </h2>
                  <p className="text-[13px] text-[#9CA3AF] mt-1">
                    {row.merchants.length} {row.merchants.length === 1 ? 'merchant' : 'merchants'} nearby
                  </p>
                </div>
                <Link
                  href={`/search?categoryId=${row.category.id}`}
                  className="text-[13px] font-semibold text-[#E20C04] no-underline hover:underline flex-shrink-0"
                >
                  See all &rarr;
                </Link>
              </div>
            </div>
            <div className="max-w-7xl mx-auto px-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {row.merchants.map((m, i) => (
                  <MerchantTile key={m.id} merchant={m} index={i} variant="grid" />
                ))}
              </div>
            </div>
          </section>
        ))}

        {/* Active category filter but no merchants */}
        {activeCategoryId && filteredRows.length === 0 && (
          <EmptyState
            title={`No ${activeCategory?.name ?? 'merchants'} near you yet`}
            body="We are growing fast. Try a different category, or clear the filter to see everything nearby."
            primary={{ href: '/discover', label: 'Clear filter' }}
            secondary={{ href: '/search', label: 'Advanced search' }}
          />
        )}

        {/* Full empty state */}
        {!hasAnyContent && (
          <EmptyState
            title="No merchants near you yet"
            body="We are growing across the UK. Check back soon, or use search to look in another city."
            primary={{ href: '/search', label: 'Open search' }}
            secondary={{ href: '/for-businesses', label: 'Know a business? Suggest one' }}
          />
        )}
      </div>
    </div>
  )
}

function EmptyState({
  title,
  body,
  primary,
  secondary,
}: {
  title: string
  body: string
  primary: { href: string; label: string }
  secondary?: { href: string; label: string }
}) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-20 md:py-24 text-center">
      <div
        className="w-14 h-14 mx-auto mb-6 rounded-full flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, #FEF0EE 0%, #FFE4DF 100%)',
        }}
        aria-hidden="true"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E20C04" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      </div>
      <h2
        className="font-display text-[#010C35] leading-[1.15] mb-3"
        style={{ fontSize: 'clamp(22px, 2.8vw, 30px)', letterSpacing: '-0.2px' }}
      >
        {title}
      </h2>
      <p className="text-[14.5px] text-[#4B5563] leading-[1.65] mb-7 max-w-[440px] mx-auto">
        {body}
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Link
          href={primary.href}
          className="inline-block text-white font-semibold text-[14px] px-6 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
          style={{ background: 'var(--brand-gradient)' }}
        >
          {primary.label}
        </Link>
        {secondary && (
          <Link
            href={secondary.href}
            className="inline-block text-[#010C35] font-semibold text-[14px] px-6 py-3 rounded-lg border border-[#EDE8E8] bg-white no-underline hover:border-[#010C35]/40 transition-colors"
          >
            {secondary.label}
          </Link>
        )}
      </div>
    </div>
  )
}
