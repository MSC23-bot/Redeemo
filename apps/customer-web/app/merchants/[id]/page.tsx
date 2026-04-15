import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { discoveryApi } from '@/lib/api'
import { MerchantProfileHeader } from '@/components/merchant-profile/MerchantProfileHeader'
import { MerchantInfoBar } from '@/components/merchant-profile/MerchantInfoBar'
import { PhotoGallerySection } from '@/components/merchant-profile/PhotoGallerySection'
import { VouchersSection } from '@/components/merchant-profile/VouchersSection'
import { AboutSection } from '@/components/merchant-profile/AboutSection'
import { HoursAndAmenitiesSection } from '@/components/merchant-profile/HoursAndAmenitiesSection'
import { BranchesSection } from '@/components/merchant-profile/BranchesSection'
import { ReviewsSection } from '@/components/merchant-profile/ReviewsSection'
import { GetTheAppSection } from '@/components/merchant-profile/GetTheAppSection'
import { SectionNav } from '@/components/merchant-profile/SectionNav'

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
      description:
        merchant.description ?? `Discover exclusive member vouchers from ${name} on Redeemo.`,
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

  let merchant: Awaited<ReturnType<typeof discoveryApi.getMerchant>>
  try {
    merchant = await discoveryApi.getMerchant(id, { lat, lng })
  } catch {
    notFound()
  }

  // Inactive merchant via deep link → named unavailable state
  if (merchant.status !== 'ACTIVE') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#9CA3AF] mb-4">
            Business
          </p>
          <h1
            className="font-display text-[#010C35] leading-[1.15] mb-4"
            style={{ fontSize: 'clamp(24px, 3vw, 30px)', letterSpacing: '-0.3px' }}
          >
            This business is no longer available
          </h1>
          <p className="text-[14.5px] text-[#4B5563] leading-[1.7] mb-7">
            They may have paused or removed their listing. Explore other businesses near you.
          </p>
          <Link
            href="/discover"
            className="inline-block text-white font-semibold text-[14px] px-6 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
            style={{ background: 'var(--brand-gradient)' }}
          >
            Browse businesses
          </Link>
        </div>
      </div>
    )
  }

  const displayName = merchant.tradingName ?? merchant.businessName
  const primaryBranch = merchant.branches[0] ?? null
  const directionsUrl = primaryBranch
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [
          primaryBranch.addressLine1,
          primaryBranch.addressLine2,
          primaryBranch.city,
          primaryBranch.postcode,
        ]
          .filter(Boolean)
          .join(', '),
      )}`
    : null

  const hasHoursOrAmenities = merchant.openingHours.length > 0 || merchant.amenities.length > 0

  const sections: { id: string; label: string; show: boolean }[] = [
    { id: 'photos', label: 'Photos', show: merchant.photos.length > 0 },
    { id: 'vouchers', label: 'Vouchers', show: merchant.vouchers.length > 0 },
    { id: 'about', label: 'About', show: Boolean(merchant.description) },
    { id: 'opening-hours', label: 'Hours', show: hasHoursOrAmenities },
    { id: 'branches', label: merchant.branches.length === 1 ? 'Find Us' : 'Branches', show: merchant.branches.length > 0 },
    { id: 'reviews', label: 'Reviews', show: merchant.reviewCount > 0 },
  ]
  const visibleSections = sections.filter(s => s.show)

  return (
    <div className="min-h-screen bg-white">
      <MerchantProfileHeader merchant={merchant} />

      <MerchantInfoBar
        merchantName={displayName}
        phone={merchant.nearestBranch?.phone ?? null}
        websiteUrl={merchant.websiteUrl}
        directionsUrl={directionsUrl}
      />

      {/* Sticky sub-nav */}
      <SectionNav sections={visibleSections} />

      <PhotoGallerySection photos={merchant.photos} merchantName={displayName} />
      <VouchersSection vouchers={merchant.vouchers} />
      <AboutSection about={merchant.description} />
      <HoursAndAmenitiesSection
        hours={merchant.openingHours}
        amenities={merchant.amenities}
        isOpenNow={merchant.isOpenNow}
      />
      <BranchesSection branches={merchant.branches} />
      <ReviewsSection
        merchantId={merchant.id}
        avgRating={merchant.avgRating}
        reviewCount={merchant.reviewCount}
      />

      <GetTheAppSection merchantName={displayName} />
    </div>
  )
}
