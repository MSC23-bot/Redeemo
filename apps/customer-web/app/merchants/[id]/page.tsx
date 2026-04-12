import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { discoveryApi } from '@/lib/api'
import { MerchantProfileHeader } from '@/components/merchant-profile/MerchantProfileHeader'
import { VouchersSection } from '@/components/merchant-profile/VouchersSection'
import { BranchesSection } from '@/components/merchant-profile/BranchesSection'
import { AboutSection } from '@/components/merchant-profile/AboutSection'
import { ReviewsSection } from '@/components/merchant-profile/ReviewsSection'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ lat?: string; lng?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  try {
    const merchant = await discoveryApi.getMerchant(id)
    const name = merchant.tradingName ?? merchant.businessName
    return {
      title: name,
      description: merchant.description ?? `Discover vouchers from ${name} on Redeemo.`,
    }
  } catch {
    return { title: 'Merchant' }
  }
}

export default async function MerchantProfilePage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = await searchParams
  const lat = sp.lat ? parseFloat(sp.lat) : undefined
  const lng = sp.lng ? parseFloat(sp.lng) : undefined

  let merchant
  try {
    merchant = await discoveryApi.getMerchant(id, { lat, lng })
  } catch {
    notFound()
  }

  // Inactive merchant via deep link → named unavailable state, not 404
  if (merchant.status !== 'ACTIVE') {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-4">Merchant</p>
          <h1 className="font-display text-[28px] text-navy leading-tight mb-4">
            This merchant is no longer available
          </h1>
          <p className="text-[15px] text-navy/55 mb-8">
            They may have paused or removed their listing. Explore other businesses near you.
          </p>
          <Link
            href="/discover"
            className="inline-block bg-navy text-white font-medium text-[14px] px-6 py-3 rounded-xl no-underline hover:opacity-90 transition-opacity"
          >
            Browse merchants
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <MerchantProfileHeader merchant={merchant} />

      {/* Mobile sticky tab bar — smooth scroll to sections */}
      <nav className="sticky top-[64px] z-10 bg-[#FAF8F5] border-b border-navy/[0.06] overflow-x-auto scrollbar-none lg:hidden">
        <div className="flex gap-1 px-6 py-2" style={{ width: 'max-content' }}>
          {[
            { label: 'Vouchers', href: '#vouchers' },
            { label: 'About', href: '#about' },
            { label: 'Branches', href: '#branches' },
            { label: 'Reviews', href: '#reviews' },
          ].map(tab => (
            <a
              key={tab.href}
              href={tab.href}
              className="font-mono text-[11px] tracking-[0.08em] uppercase text-navy/55 px-4 py-2 rounded-full hover:bg-navy/[0.06] hover:text-navy transition-colors whitespace-nowrap"
            >
              {tab.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Page sections */}
      <div className="max-w-screen-xl mx-auto">
        <VouchersSection vouchers={merchant.vouchers} />
        <AboutSection
          about={merchant.description}
          websiteUrl={merchant.websiteUrl}
          amenities={merchant.amenities}
          openingHours={merchant.openingHours}
        />
        <BranchesSection branches={merchant.branches} />
        <ReviewsSection
          merchantId={merchant.id}
          avgRating={merchant.avgRating}
          reviewCount={merchant.reviewCount}
        />
      </div>
    </div>
  )
}
