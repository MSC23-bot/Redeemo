import { AccountNav } from '@/components/account/AccountNav'

export default function AccountLoading() {
  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <AccountNav variant="mobile" />
      <div className="max-w-screen-xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        <AccountNav variant="desktop" />
        <main className="flex-1 max-w-2xl animate-pulse">
          <div className="flex items-center gap-5 mb-10">
            <div className="w-[88px] h-[88px] rounded-full bg-navy/[0.06] flex-shrink-0" />
            <div className="flex-1">
              <div className="h-3 w-24 bg-navy/[0.06] rounded mb-3" />
              <div className="h-9 w-48 bg-navy/[0.06] rounded" />
            </div>
          </div>
          <div className="h-[120px] bg-navy/[0.04] rounded-2xl mb-6" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-[100px] bg-navy/[0.04] rounded-2xl" />
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
