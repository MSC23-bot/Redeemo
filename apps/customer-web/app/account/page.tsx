'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { profileApi, subscriptionApi, savingsApi, ApiError } from '@/lib/api'
import { AccountNav } from '@/components/account/AccountNav'
import { SubscriptionCard } from '@/components/account/SubscriptionCard'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { TrendingUp, Heart, User, ArrowRight } from 'lucide-react'

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

/* ── Animated counter ────────────────────────────────────────────────────── */

function AnimatedNumber({ to, prefix = '', decimals = 0, duration = 1200 }: {
  to: number; prefix?: string; decimals?: number; duration?: number
}) {
  const [current, setCurrent] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (to === 0) return
    startRef.current = null
    let frame: number

    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(to * eased)
      if (progress < 1) frame = requestAnimationFrame(animate)
    }

    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [to, duration])

  return (
    <span>
      {prefix}{current.toFixed(decimals)}
    </span>
  )
}

/* ── Profile completeness ring ───────────────────────────────────────────── */

function CompletenessRing({ pct, name, imageUrl }: { pct: number; name?: string; imageUrl?: string | null }) {
  const r = 34
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  const initials = name ? name.trim().split(/\s+/).map(p => p[0]).join('').toUpperCase().slice(0, 2) : '?'

  return (
    <div className="relative w-[88px] h-[88px] flex-shrink-0">
      <svg width="88" height="88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(1,12,53,0.06)" strokeWidth="6" />
        <motion.circle
          cx="44" cy="44" r={r}
          fill="none"
          stroke="url(#ring-gradient)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${circ}`}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
        <defs>
          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#E20C04" />
            <stop offset="100%" stopColor="#E84A00" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {imageUrl ? (
          <div className="w-[68px] h-[68px] rounded-full overflow-hidden">
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ) : name ? (
          <div
            className="w-[68px] h-[68px] rounded-full flex items-center justify-center font-bold text-white text-[22px] select-none"
            style={{ background: 'var(--brand-gradient)' }}
          >
            {initials}
          </div>
        ) : (
          <span className="font-mono text-[13px] font-bold text-navy">{pct}%</span>
        )}
      </div>
      {(imageUrl || name) && (
        <div className="absolute -bottom-1 -right-1 bg-white rounded-full px-1.5 py-0.5 shadow-sm border border-navy/[0.08]">
          <span className="font-mono text-[10px] font-bold text-navy/60">{pct}%</span>
        </div>
      )}
    </div>
  )
}

/* ── Skeleton ────────────────────────────────────────────────────────────── */

function AccountSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Greeting */}
      <div className="space-y-3">
        <div className="h-3 w-28 bg-navy/[0.06] rounded" />
        <div className="h-10 w-56 bg-navy/[0.06] rounded" />
      </div>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map(i => <div key={i} className="h-[90px] bg-navy/[0.04] rounded-2xl" />)}
      </div>
      {/* Sub card */}
      <div className="h-[130px] bg-navy/[0.04] rounded-2xl" />
      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => <div key={i} className="h-[100px] bg-navy/[0.04] rounded-2xl" />)}
      </div>
    </div>
  )
}

/* ── Stat card ───────────────────────────────────────────────────────────── */

function StatCard({ label, value, prefix = '', suffix = '', accent, delay = 0 }: {
  label: string; value: number; prefix?: string; suffix?: string;
  accent: string; delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className="bg-white border border-navy/[0.07] rounded-2xl px-5 py-4 flex flex-col gap-1"
    >
      <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-navy/35">{label}</span>
      <span className="font-display text-[28px] leading-none text-navy" style={{ color: accent }}>
        <AnimatedNumber to={value} prefix={prefix} decimals={prefix === '£' ? 2 : 0} duration={1100} />
        {suffix && <span className="text-[16px] text-navy/40 ml-1">{suffix}</span>}
      </span>
    </motion.div>
  )
}

/* ── Quick link card ─────────────────────────────────────────────────────── */

function QuickLink({ href, label, sub, Icon, delay }: {
  href: string; label: string; sub: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={href}
        className="group bg-white border border-navy/[0.07] rounded-2xl p-5 hover:border-navy/20 hover:shadow-md transition-all duration-200 no-underline flex flex-col h-full"
      >
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--bg-tint)' }}
          >
            <Icon size={16} strokeWidth={1.8} className="text-[#E20C04]" />
          </div>
          <ArrowRight
            size={14}
            strokeWidth={2}
            className="text-navy/20 group-hover:text-navy/50 group-hover:translate-x-0.5 transition-all duration-200"
          />
        </div>
        <p className="font-display text-[16px] text-navy mb-0.5 group-hover:text-[#E20C04] transition-colors">{label}</p>
        <p className="text-[12px] text-navy/45 leading-relaxed">{sub}</p>
      </Link>
    </motion.div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────────── */

type Profile = {
  firstName: string
  lastName: string
  profileCompleteness: number
  profileImageUrl: string | null
}
type Subscription = Parameters<typeof SubscriptionCard>[0]['subscription']

export default function AccountPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [subscription, setSubscription] = useState<Subscription>(null)
  const [lifetimeSaving, setLifetimeSaving] = useState(0)
  const [redemptionCount, setRedemptionCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  const greeting = getGreeting()
  const displayName = user?.name ? getFirstName(user.name) : (profile?.firstName ?? '')

  useEffect(() => {
    Promise.allSettled([
      profileApi.get(),
      subscriptionApi.get(),
      savingsApi.summary(),
    ]).then(([profileResult, subResult, savingsResult]) => {
      if (
        profileResult.status === 'rejected' &&
        profileResult.reason instanceof ApiError &&
        profileResult.reason.statusCode === 401
      ) {
        router.push('/login?next=/account')
        return
      }
      if (profileResult.status === 'fulfilled') setProfile(profileResult.value as Profile)
      if (subResult.status === 'fulfilled') setSubscription(subResult.value as Subscription)
      if (savingsResult.status === 'fulfilled') {
        setLifetimeSaving(savingsResult.value.lifetimeSaving)
        setRedemptionCount(savingsResult.value.thisMonthRedemptionCount)
      }
      setIsLoading(false)
    })
  }, [router])

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <AccountNav variant="mobile" />
      <div className="max-w-screen-xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        <AccountNav variant="desktop" />

        <main className="flex-1 max-w-2xl">
          {isLoading ? (
            <AccountSkeleton />
          ) : (
            <>
              {/* ── Greeting hero ─────────────────────────────────── */}
              <div className="flex items-center gap-5 mb-8">
                {profile && (
  <CompletenessRing
    pct={profile.profileCompleteness}
    name={`${profile.firstName} ${profile.lastName}`.trim()}
    imageUrl={profile.profileImageUrl}
  />
)}
                <div>
                  <motion.p
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-1"
                  >
                    {greeting}
                  </motion.p>
                  <motion.h1
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.05 }}
                    className="font-display text-[clamp(28px,4vw,42px)] text-navy leading-none"
                  >
                    {displayName}.
                  </motion.h1>
                  {profile && profile.profileCompleteness < 100 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      <Link
                        href="/account/profile"
                        className="inline-flex items-center gap-1 text-[12px] text-[#E20C04] hover:underline mt-1.5 no-underline"
                      >
                        Complete your profile
                        <ArrowRight size={11} strokeWidth={2} />
                      </Link>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* ── Stats row ─────────────────────────────────────── */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <StatCard
                  label="Lifetime saved"
                  value={lifetimeSaving}
                  prefix="£"
                  accent="#16A34A"
                  delay={0.1}
                />
                <StatCard
                  label="This month"
                  value={redemptionCount}
                  suffix="uses"
                  accent="#010C35"
                  delay={0.16}
                />
                <StatCard
                  label="Profile"
                  value={profile?.profileCompleteness ?? 0}
                  suffix="%"
                  accent={profile && profile.profileCompleteness === 100 ? '#16A34A' : '#E20C04'}
                  delay={0.22}
                />
              </div>

              {/* ── Subscription card ─────────────────────────────── */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.28 }}
                className="mb-6"
              >
                <SubscriptionCard subscription={subscription} />
              </motion.div>

              {/* ── Quick links ───────────────────────────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <QuickLink
                  href="/account/savings"
                  Icon={TrendingUp}
                  label="My Savings"
                  sub="See your lifetime and monthly savings"
                  delay={0.34}
                />
                <QuickLink
                  href="/account/favourites"
                  Icon={Heart}
                  label="Favourites"
                  sub="Saved merchants and vouchers"
                  delay={0.40}
                />
                <QuickLink
                  href="/account/profile"
                  Icon={User}
                  label="Edit Profile"
                  sub="Name, address, interests"
                  delay={0.46}
                />
              </div>

            </>
          )}
        </main>
      </div>
    </div>
  )
}
