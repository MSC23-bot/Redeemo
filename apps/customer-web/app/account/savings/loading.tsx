import { AccountNav } from '@/components/account/AccountNav'

export default function SavingsLoading() {
  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <AccountNav variant="mobile" />
      <div className="bg-deep-navy px-6 py-12">
        <div className="max-w-screen-xl mx-auto lg:flex lg:gap-12">
          <div className="hidden lg:block w-56 flex-shrink-0" />
          <div className="flex flex-col sm:flex-row gap-10 sm:gap-16 animate-pulse">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex flex-col gap-2">
                <div className="h-2 w-24 bg-white/10 rounded" />
                <div className="h-12 w-32 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="max-w-screen-xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        <AccountNav variant="desktop" />
        <main className="flex-1 flex flex-col gap-8 animate-pulse">
          <div className="h-[160px] bg-navy/[0.04] rounded-2xl" />
          <div className="h-[100px] bg-navy/[0.04] rounded-2xl" />
        </main>
      </div>
    </div>
  )
}
