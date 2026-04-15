'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { savingsApi, subscriptionApi, ApiError } from '@/lib/api'
import { AccountNav } from '@/components/account/AccountNav'
import { SavingsChart } from '@/components/account/SavingsChart'
import { RedemptionList } from '@/components/account/RedemptionList'
import Image from 'next/image'
import { TrendingUp, ArrowUp, ArrowDown, Minus } from 'lucide-react'

/* ── Animated counter ────────────────────────────────────────────────────── */
function AnimatedCounter({ to, prefix = '', decimals = 2, delay = 0 }: {
  to: number; prefix?: string; decimals?: number; delay?: number
}) {
  const [current, setCurrent] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (to === 0) return
    startRef.current = null
    let frame: number
    const duration = 1200
    const startTime = performance.now() + delay * 1000
    const animate = (ts: number) => {
      if (ts < startTime) { frame = requestAnimationFrame(animate); return }
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      setCurrent(to * (1 - Math.pow(1 - progress, 3)))
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [to, delay])

  return <>{prefix}{current.toFixed(decimals)}</>
}

/* ── Hero stat ───────────────────────────────────────────────────────────── */
function HeroStat({ label, value, prefix = '', decimals, delay = 0, accent = 'text-white' }: {
  label: string; value: number; prefix?: string; decimals?: number; delay?: number; accent?: string
}) {
  const dp = decimals !== undefined ? decimals : prefix === '£' ? 2 : 0
  return (
    <motion.div
      className="flex flex-col gap-1"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/35">{label}</span>
      <span className={`font-display text-[clamp(30px,4vw,50px)] leading-none ${accent}`}>
        <AnimatedCounter to={value} prefix={prefix} decimals={dp} delay={delay} />
      </span>
    </motion.div>
  )
}

/* ── Skeletons ───────────────────────────────────────────────────────────── */
function HeroSkeleton() {
  return (
    <div className="animate-pulse flex flex-col sm:flex-row gap-10 sm:gap-16">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex flex-col gap-2">
          <div className="h-2 w-24 bg-white/10 rounded" />
          <div className="h-10 w-32 bg-white/10 rounded" />
        </div>
      ))}
    </div>
  )
}

/* ── Types ───────────────────────────────────────────────────────────────── */
type Summary = {
  lifetimeSaving: number
  thisMonthSaving: number
  thisMonthRedemptionCount: number
  monthlyBreakdown: { month: string; saving: number; count: number }[]
  byMerchant: { merchantId: string; businessName: string; logoUrl: string | null; saving: number; count: number }[]
}
type RedemptionsData = {
  redemptions: Parameters<typeof RedemptionList>[0]['initial']
  total: number
}

/* ── Trend badge ─────────────────────────────────────────────────────────── */
function Trend({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  const up = pct > 0
  const flat = Math.abs(pct) < 1
  if (flat) return (
    <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-white/35">
      <Minus size={10} />–
    </span>
  )
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono text-[10px] ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
      {Math.abs(pct).toFixed(0)}% vs last month
    </span>
  )
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function SavingsPage() {
  const router = useRouter()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [redemptions, setRedemptions] = useState<RedemptionsData | null>(null)
  const [planName, setPlanName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([
      savingsApi.summary(),
      savingsApi.redemptions({ limit: 20, offset: 0 }),
      subscriptionApi.get(),
    ]).then(([summaryResult, redemptionsResult, subResult]) => {
      if (
        summaryResult.status === 'rejected' &&
        summaryResult.reason instanceof ApiError &&
        summaryResult.reason.statusCode === 401
      ) {
        router.push('/login?next=/account/savings')
        return
      }
      if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value as Summary)
      if (redemptionsResult.status === 'fulfilled') setRedemptions(redemptionsResult.value as RedemptionsData)
      if (subResult.status === 'fulfilled') {
        const sub = subResult.value as { plan?: { name: string } | null }
        setPlanName(sub?.plan?.name ?? null)
      }
      setIsLoading(false)
    })
  }, [router])

  // ── Derived values ──
  const monthPriceGbp = planName === 'Annual' ? 69.99 / 12 : 6.99
  const activeMonths = summary?.monthlyBreakdown?.length ?? 0
  const totalPaid = activeMonths * monthPriceGbp
  const roiMultiplier = totalPaid > 0 ? (summary?.lifetimeSaving ?? 0) / totalPaid : 0

  // Cycle comparison: [0] = current month, [1] = previous month
  const breakdown = summary?.monthlyBreakdown ?? []
  const lastMonthData = breakdown[1] ?? null
  const totalRedemptions = redemptions?.total ?? 0

  // Month label helpers
  const thisMonthLabel = breakdown[0]
    ? new Date(breakdown[0].month + '-01').toLocaleDateString('en-GB', { month: 'long' })
    : 'This month'
  const lastMonthLabel = lastMonthData
    ? new Date(lastMonthData.month + '-01').toLocaleDateString('en-GB', { month: 'long' })
    : 'Last month'

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <AccountNav variant="mobile" />

      {/* ── Hero band ── */}
      <div className="bg-navy px-6 py-12 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(135deg, rgba(226,0,12,0.07) 0%, transparent 60%)' }}
        />
        <div className="max-w-screen-xl mx-auto lg:flex lg:gap-12 relative z-10">
          <div className="hidden lg:block w-56 flex-shrink-0" />
          {isLoading ? (
            <HeroSkeleton />
          ) : (
            <div className="flex flex-wrap gap-x-16 gap-y-8">
              <HeroStat label="Lifetime savings" value={summary?.lifetimeSaving ?? 0} prefix="£" delay={0.05} />
              <div className="w-px bg-white/[0.07] hidden sm:block self-stretch" />
              <HeroStat label="This month" value={summary?.thisMonthSaving ?? 0} prefix="£" delay={0.15} />
              <div className="w-px bg-white/[0.07] hidden sm:block self-stretch" />
              <HeroStat label="Redemptions" value={totalRedemptions} delay={0.25} decimals={0} />
              {roiMultiplier >= 1 && (
                <>
                  <div className="w-px bg-white/[0.07] hidden sm:block self-stretch" />
                  <motion.div
                    className="flex flex-col gap-1"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/35">
                      Return on subscription
                    </span>
                    <span className="font-display text-[clamp(30px,4vw,50px)] leading-none text-green-400">
                      {roiMultiplier.toFixed(1)}×
                    </span>
                    <span className="font-mono text-[10px] text-white/30 mt-0.5">
                      Paid ~£{totalPaid.toFixed(2)} · Saved £{(summary?.lifetimeSaving ?? 0).toFixed(2)}
                    </span>
                  </motion.div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="max-w-screen-xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        <AccountNav variant="desktop" />
        <main className="flex-1 flex flex-col gap-8">
          {isLoading ? (
            <div className="animate-pulse flex flex-col gap-6">
              {[160, 100, 200, 120].map((h, i) => (
                <div key={i} className="rounded-2xl bg-navy/[0.04]" style={{ height: h }} />
              ))}
            </div>
          ) : (
            <>
              {/* ── Month comparison ── */}
              {lastMonthData && (
                <div>
                  <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35 mb-4">
                    Month comparison
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    {/* This month */}
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      className="bg-navy rounded-2xl p-5 relative overflow-hidden"
                    >
                      <div
                        aria-hidden
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: 'linear-gradient(135deg, rgba(226,0,12,0.10) 0%, transparent 60%)' }}
                      />
                      <div className="relative z-10">
                        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/35 mb-1">{thisMonthLabel}</p>
                        <p className="font-display text-[28px] text-white leading-none mb-1">
                          £{(summary?.thisMonthSaving ?? 0).toFixed(2)}
                        </p>
                        <p className="text-[12px] text-white/40 mb-3">
                          {summary?.thisMonthRedemptionCount ?? 0} redemption{(summary?.thisMonthRedemptionCount ?? 0) !== 1 ? 's' : ''}
                        </p>
                        <Trend current={summary?.thisMonthSaving ?? 0} previous={lastMonthData.saving} />
                      </div>
                    </motion.div>

                    {/* Last month */}
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
                      className="bg-white border border-navy/[0.07] rounded-2xl p-5"
                    >
                      <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-navy/35 mb-1">{lastMonthLabel}</p>
                      <p className="font-display text-[28px] text-navy leading-none mb-1">
                        £{lastMonthData.saving.toFixed(2)}
                      </p>
                      <p className="text-[12px] text-navy/40 mb-3">
                        {lastMonthData.count} redemption{lastMonthData.count !== 1 ? 's' : ''}
                      </p>
                      {lastMonthData.saving >= (summary?.thisMonthSaving ?? 0) && (
                        <span className="font-mono text-[10px] text-navy/30">Best month so far</span>
                      )}
                    </motion.div>
                  </div>
                </div>
              )}

              {/* ── Monthly chart ── */}
              {breakdown.length > 1 && (
                <SavingsChart data={breakdown} />
              )}

              {/* ── Top merchants this month ── */}
              {summary?.byMerchant && summary.byMerchant.length > 0 && (
                <div>
                  <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35 mb-4">
                    Top merchants — this month
                  </p>
                  <div className="bg-white border border-navy/[0.07] rounded-2xl overflow-hidden">
                    {summary.byMerchant.map((m, i) => {
                      const maxSaving = summary.byMerchant[0]?.saving ?? 1
                      const barPct = (m.saving / maxSaving) * 100
                      const accentColors = ['#E20C04', '#E84A00', '#D97706', '#16A34A', '#0891B2']
                      const accent = accentColors[i % accentColors.length]
                      return (
                        <div
                          key={m.merchantId}
                          className={`flex items-center gap-4 px-5 py-4 ${i < summary.byMerchant.length - 1 ? 'border-b border-navy/[0.05]' : ''}`}
                        >
                          {/* Rank */}
                          <span className="font-mono text-[12px] text-navy/25 w-4 flex-shrink-0 text-right">{i + 1}</span>

                          {/* Logo */}
                          <div className="w-8 h-8 rounded-full bg-navy/[0.06] overflow-hidden flex-shrink-0 border border-navy/[0.06]">
                            {m.logoUrl
                              ? <Image src={m.logoUrl} alt="" width={32} height={32} className="object-cover" />
                              : <div className="w-full h-full flex items-center justify-center">
                                  <TrendingUp size={12} className="text-navy/20" />
                                </div>
                            }
                          </div>

                          {/* Name + bar */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] text-navy font-medium leading-none mb-1.5 truncate">{m.businessName}</p>
                            <div className="h-1.5 bg-navy/[0.06] rounded-full overflow-hidden">
                              <motion.div
                                className="h-full rounded-full"
                                style={{ background: accent }}
                                initial={{ width: 0 }}
                                animate={{ width: `${barPct}%` }}
                                transition={{ duration: 0.6, delay: i * 0.08, ease: 'easeOut' }}
                              />
                            </div>
                            <p className="font-mono text-[10px] text-navy/30 mt-1">
                              {m.count} redemption{m.count !== 1 ? 's' : ''}
                            </p>
                          </div>

                          {/* Saving amount */}
                          <span className="font-mono text-[14px] font-bold flex-shrink-0 ml-2" style={{ color: accent }}>
                            £{m.saving.toFixed(2)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Redemption history ── */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35">
                    Redemption history
                    {totalRedemptions > 0 && (
                      <span className="ml-2 normal-case font-sans text-[11px] text-navy/30">
                        — {totalRedemptions} total
                      </span>
                    )}
                  </p>
                </div>
                <RedemptionList
                  initial={redemptions?.redemptions ?? []}
                  total={redemptions?.total ?? 0}
                />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
