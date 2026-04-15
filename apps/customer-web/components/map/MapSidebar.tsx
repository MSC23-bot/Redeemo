'use client'
import Link from 'next/link'
import Image from 'next/image'
import type { MerchantTileData } from '@/lib/api'

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  return `${(metres / 1000).toFixed(1)}km`
}

export function MapSidebar({
  merchants,
  total,
  activeCategoryName,
}: {
  merchants: MerchantTileData[]
  total: number
  activeCategoryName: string | null
}) {
  const heading = activeCategoryName ?? 'Nearby'

  return (
    <aside
      aria-label="Nearby merchants"
      className="w-full lg:w-[380px] xl:w-[420px] lg:flex-shrink-0 bg-white lg:border-r lg:border-[#EDE8E8] flex flex-col"
    >
      <div className="px-6 py-4 border-b border-[#EDE8E8] bg-white sticky top-0 z-10">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#9CA3AF] mb-1">
          {heading}
        </p>
        <h2
          className="font-display text-[#010C35] leading-tight"
          style={{ fontSize: '20px', letterSpacing: '-0.2px' }}
        >
          {total} {total === 1 ? 'merchant' : 'merchants'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {merchants.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[14px] text-[#4B5563] leading-[1.6] max-w-[260px] mx-auto">
              No merchants in this area yet. Try clearing the category filter or switching to list view.
            </p>
            <Link
              href="/discover"
              className="inline-block mt-4 text-[13px] font-semibold text-[#E20C04] no-underline hover:underline"
            >
              Back to Discover &rarr;
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-[#EDE8E8]">
            {merchants.map(m => (
              <li key={m.id}>
                <SidebarCard merchant={m} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function SidebarCard({ merchant }: { merchant: MerchantTileData }) {
  const name = merchant.tradingName ?? merchant.businessName
  const category = merchant.primaryCategory?.name ?? 'Local business'
  const dist = formatDistance(merchant.distance)

  return (
    <Link
      href={`/merchants/${merchant.id}`}
      className="flex gap-4 px-6 py-4 no-underline hover:bg-[#FEF6F5] transition-colors"
    >
      {/* Thumbnail */}
      <div className="relative w-[72px] h-[72px] flex-shrink-0 rounded-lg overflow-hidden bg-[#F8F9FA]">
        {merchant.logoUrl ? (
          <Image
            src={merchant.logoUrl}
            alt=""
            fill
            sizes="72px"
            className="object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center font-display text-[#010C35]"
            style={{ fontSize: '24px' }}
            aria-hidden="true"
          >
            {name.charAt(0)}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <h3 className="text-[15px] font-semibold text-[#010C35] leading-snug truncate">
          {name}
        </h3>
        <p className="text-[12.5px] text-[#9CA3AF] mt-0.5 truncate">
          {category}
          {dist && ` · ${dist}`}
          {merchant.avgRating !== null && ` · ★ ${merchant.avgRating.toFixed(1)}`}
        </p>

        <div className="flex items-center gap-3 mt-2">
          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#16A34A]">
            {merchant.voucherCount} {merchant.voucherCount === 1 ? 'voucher' : 'vouchers'}
          </span>
          {merchant.maxEstimatedSaving !== null && merchant.maxEstimatedSaving > 0 && (
            <span className="text-[11.5px] text-[#4B5563]">
              Save up to £{Math.round(merchant.maxEstimatedSaving)}
            </span>
          )}
        </div>
      </div>

      {/* Chevron */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="text-[#9CA3AF] flex-shrink-0 self-center"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  )
}
