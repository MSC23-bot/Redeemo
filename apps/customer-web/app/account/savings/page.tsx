import type { Metadata } from 'next'
import { savingsApi } from '@/lib/api'
import { AccountNav } from '@/components/account/AccountNav'
import { SavingsChart } from '@/components/account/SavingsChart'
import { RedemptionList } from '@/components/account/RedemptionList'
import Image from 'next/image'

export const metadata: Metadata = { title: 'My Savings' }

function HeroStat({ label, value, prefix = '' }: { label: string; value: number; prefix?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/35">{label}</span>
      <span className="font-display text-[clamp(36px,5vw,60px)] text-white leading-none">
        {prefix}{value.toFixed(2)}
      </span>
    </div>
  )
}

export default async function SavingsPage() {
  const [summaryResult, redemptionsResult] = await Promise.allSettled([
    savingsApi.summary(),
    savingsApi.redemptions({ limit: 20, offset: 0 }),
  ])

  const summary = summaryResult.status === 'fulfilled' ? summaryResult.value : null
  const redemptions = redemptionsResult.status === 'fulfilled' ? redemptionsResult.value : null

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <AccountNav variant="mobile" />

      {/* Hero stat band — deep-navy background, full-width editorial */}
      <div className="bg-deep-navy px-6 py-12 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(135deg, rgba(226,0,12,0.06) 0%, transparent 60%)' }}
        />
        <div className="max-w-screen-xl mx-auto lg:flex lg:gap-12 relative z-10">
          <div className="hidden lg:block w-56 flex-shrink-0" />
          <div className="flex flex-col sm:flex-row gap-10 sm:gap-16">
            <HeroStat
              label="Lifetime savings"
              value={summary?.lifetimeSaving ?? 0}
              prefix="£"
            />
            <div className="w-px bg-white/[0.08] hidden sm:block" />
            <HeroStat
              label="This month"
              value={summary?.thisMonthSaving ?? 0}
              prefix="£"
            />
            <div className="w-px bg-white/[0.08] hidden sm:block" />
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/35">
                Redemptions this month
              </span>
              <span className="font-display text-[clamp(36px,5vw,60px)] text-white leading-none">
                {summary?.thisMonthRedemptionCount ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        <AccountNav variant="desktop" />
        <main className="flex-1 flex flex-col gap-8">
          {/* Monthly bar chart */}
          {summary?.monthlyBreakdown && summary.monthlyBreakdown.length > 0 && (
            <SavingsChart data={summary.monthlyBreakdown} />
          )}

          {/* By merchant this month */}
          {summary?.byMerchant && summary.byMerchant.length > 0 && (
            <div className="bg-[#F4F2EF] rounded-2xl p-6">
              <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35 mb-5">
                By merchant — this month
              </p>
              <div className="flex flex-col gap-3">
                {summary.byMerchant.map(m => (
                  <div key={m.merchantId} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white overflow-hidden flex-shrink-0 border border-navy/[0.06]">
                      {m.logoUrl && (
                        <Image src={m.logoUrl} alt="" width={32} height={32} className="object-cover" />
                      )}
                    </div>
                    <span className="flex-1 text-[14px] text-navy">{m.businessName}</span>
                    <span className="font-mono text-[13px] text-red font-bold">
                      £{m.saving.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Redemption history */}
          <div>
            <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35 mb-5">
              Redemption history
            </p>
            <RedemptionList
              initial={redemptions?.redemptions ?? []}
              total={redemptions?.total ?? 0}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
