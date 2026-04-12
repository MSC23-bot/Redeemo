import Link from 'next/link'
import Image from 'next/image'
import type { MerchantTileData } from '@/lib/api'

async function getFeaturedMerchants(): Promise<MerchantTileData[]> {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'
    // URL verified against src/api/customer/discovery/routes.ts — route is /api/v1/customer/home
    const res = await fetch(`${base}/api/v1/customer/home`, { next: { revalidate: 300 } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.featured ?? []).slice(0, 3)
  } catch {
    return []
  }
}

function PlaceholderTile({ index }: { index: number }) {
  const hue = 200 + index * 30
  return (
    <div className="rounded-2xl overflow-hidden border border-navy/[0.08] bg-white animate-pulse">
      <div className="h-40" style={{ background: `hsl(${hue}, 15%, 92%)` }} />
      <div className="p-5">
        <div className="w-12 h-12 rounded-xl mb-3" style={{ background: `hsl(${hue}, 20%, 85%)` }} />
        <div className="h-4 w-3/5 bg-navy/[0.08] rounded mb-2" />
        <div className="h-3 w-2/5 bg-navy/[0.05] rounded" />
      </div>
    </div>
  )
}

function MerchantTileCard({ merchant }: { merchant: MerchantTileData }) {
  return (
    <Link
      href={`/merchants/${merchant.id}`}
      className="block rounded-2xl overflow-hidden border border-navy/[0.08] bg-white hover:shadow-md transition-shadow no-underline"
    >
      <div className="h-40 bg-surface-muted relative">
        {merchant.bannerUrl && (
          <Image src={merchant.bannerUrl} alt="" fill className="object-cover" />
        )}
      </div>
      <div className="p-5">
        <div className="w-12 h-12 rounded-xl bg-surface-muted relative mb-3 overflow-hidden">
          {merchant.logoUrl && (
            <Image src={merchant.logoUrl} alt={merchant.businessName} fill className="object-cover" />
          )}
        </div>
        <p className="font-semibold text-navy text-sm mb-1">{merchant.businessName}</p>
        {merchant.primaryCategory && (
          <p className="text-xs text-navy/40 font-mono">{merchant.primaryCategory.name}</p>
        )}
      </div>
    </Link>
  )
}

export async function FeaturedMerchantsSection() {
  const merchants = await getFeaturedMerchants()

  return (
    <section className="bg-white py-24 px-6">
      <div className="max-w-screen-xl mx-auto">
        <div className="flex justify-between items-end mb-12">
          <div>
            <p className="font-mono text-xs font-medium tracking-widest uppercase text-red mb-3">Featured this week</p>
            <h2 className="font-display text-3xl lg:text-5xl text-navy leading-tight">Businesses near you</h2>
          </div>
          <Link href="/discover" className="text-sm font-semibold text-red no-underline">See all →</Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {merchants.length === 0
            ? [0, 1, 2].map(i => <PlaceholderTile key={i} index={i} />)
            : merchants.map(m => <MerchantTileCard key={m.id} merchant={m} />)
          }
        </div>
      </div>
    </section>
  )
}
