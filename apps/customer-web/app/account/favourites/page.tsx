import type { Metadata } from 'next'
import { favouritesApi } from '@/lib/api'
import { AccountNav } from '@/components/account/AccountNav'
import { FavouritesList } from '@/components/account/FavouritesList'

export const metadata: Metadata = { title: 'Favourites' }

export default async function FavouritesPage() {
  const [merchantsResult, vouchersResult] = await Promise.allSettled([
    favouritesApi.listMerchants(),
    favouritesApi.listVouchers(),
  ])

  // Both APIs return wrapped objects: { merchants: [...] } and { vouchers: [...] }
  const merchantsData = merchantsResult.status === 'fulfilled' ? merchantsResult.value : null
  const vouchersData = vouchersResult.status === 'fulfilled' ? vouchersResult.value : null

  const merchants = merchantsData?.merchants ?? []
  const vouchers = vouchersData?.vouchers ?? []

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <AccountNav variant="mobile" />
      <div className="max-w-screen-xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        <AccountNav variant="desktop" />
        <main className="flex-1">
          <div className="mb-8">
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-2">Account</p>
            <h1 className="font-display text-[clamp(26px,4vw,38px)] text-navy leading-none">Favourites</h1>
          </div>
          <FavouritesList merchants={merchants} vouchers={vouchers} />
        </main>
      </div>
    </div>
  )
}
