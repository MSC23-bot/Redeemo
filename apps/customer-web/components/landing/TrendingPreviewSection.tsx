import Link from 'next/link'
import type { MerchantTileData } from '@/lib/api'
import { MerchantTile } from '@/components/ui/MerchantTile'

type TrendingResponse = {
  locationContext: { city: string | null; source: 'coordinates' | 'profile' | 'none' }
  trending: MerchantTileData[]
  featured: MerchantTileData[]
}

async function getTrending(): Promise<{ city: string | null; merchants: MerchantTileData[] }> {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'
    // Route verified against src/api/customer/discovery/routes.ts
    const res = await fetch(`${base}/api/v1/customer/home`, { next: { revalidate: 300 } })
    if (!res.ok) return { city: null, merchants: [] }
    const data = (await res.json()) as TrendingResponse
    // Prefer trending; fall back to featured if trending is empty so the strip never looks broken
    const merchants = (data.trending?.length ? data.trending : data.featured ?? []).slice(0, 3)
    return { city: data.locationContext?.city ?? null, merchants }
  } catch {
    return { city: null, merchants: [] }
  }
}


export async function TrendingPreviewSection() {
  const { city, merchants } = await getTrending()
  const heading = city ? `Trending in ${city}` : 'Trending near you'

  return (
    <section className="bg-[#FEF6F5] py-20 md:py-24 px-6">
      <div className="max-w-7xl mx-auto">

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <h2
              className="font-display text-[#010C35] leading-[1.1] mb-2"
              style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
            >
              {heading}
            </h2>
            <p className="text-[14px] text-[#4B5563]">
              {city ? `Not ${city}?` : 'Somewhere else?'}{' '}
              <Link href="/discover" className="text-[#E20C04] no-underline hover:underline font-medium">
                Enter your postcode
              </Link>
            </p>
          </div>
          <Link
            href="/discover"
            className="text-[14px] font-semibold text-[#E20C04] no-underline hover:underline self-start sm:self-auto"
          >
            See all &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {merchants.map((m, i) => (
            <MerchantTile key={m.id} merchant={m} index={i} variant="grid" />
          ))}
        </div>
      </div>
    </section>
  )
}
