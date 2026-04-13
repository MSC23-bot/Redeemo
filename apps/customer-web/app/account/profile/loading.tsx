import { AccountNav } from '@/components/account/AccountNav'

export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <AccountNav variant="mobile" />
      <div className="max-w-screen-xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        <AccountNav variant="desktop" />
        <main className="flex-1 animate-pulse">
          <div className="mb-8">
            <div className="h-3 w-16 bg-navy/[0.06] rounded mb-3" />
            <div className="h-9 w-40 bg-navy/[0.06] rounded" />
          </div>
          <div className="flex flex-col gap-5 max-w-lg">
            {[0, 1, 2, 3].map(i => (
              <div key={i}>
                <div className="h-3 w-20 bg-navy/[0.06] rounded mb-2" />
                <div className="h-10 w-full bg-navy/[0.04] rounded-xl" />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
