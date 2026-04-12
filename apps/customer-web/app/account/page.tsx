import type { Metadata } from 'next'
import { profileApi, subscriptionApi } from '@/lib/api'
import { AccountNav } from '@/components/account/AccountNav'
import { SubscriptionCard } from '@/components/account/SubscriptionCard'
import Link from 'next/link'

export const metadata: Metadata = { title: 'My Account' }

function CompletenessArc({ pct }: { pct: number }) {
  const gradient = `conic-gradient(#E2000C 0%, #EE6904 ${pct}%, rgba(1,12,53,0.06) ${pct}% 100%)`
  return (
    <div className="relative w-[88px] h-[88px] flex-shrink-0">
      <div
        className="w-full h-full rounded-full"
        style={{ background: gradient }}
        role="progressbar"
        aria-label="Profile completeness"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
      <div className="absolute inset-[10px] rounded-full bg-[#FAF8F5] flex items-center justify-center">
        <span className="font-mono text-[14px] font-bold text-navy">{pct}%</span>
      </div>
    </div>
  )
}

export default async function AccountPage() {
  const [profile, subscription] = await Promise.allSettled([
    profileApi.get(),
    subscriptionApi.get(),
  ])

  const p = profile.status === 'fulfilled' ? profile.value : null
  const sub = subscription.status === 'fulfilled' ? subscription.value : null

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <AccountNav variant="mobile" />
      <div className="max-w-screen-xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        <AccountNav variant="desktop" />

        <main className="flex-1 max-w-2xl">
          {/* Greeting */}
          <div className="flex items-center gap-5 mb-10">
            {p && <CompletenessArc pct={p.profileCompleteness} />}
            <div>
              <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35 mb-1">Welcome back</p>
              <h1 className="font-display text-[clamp(28px,4vw,40px)] text-navy leading-none">
                {p ? p.firstName : 'Your account'}
              </h1>
              {p && p.profileCompleteness < 100 && (
                <Link
                  href="/account/profile"
                  className="text-[13px] text-orange-red hover:underline mt-1 block"
                >
                  Complete your profile →
                </Link>
              )}
            </div>
          </div>

          {/* Subscription card */}
          <div className="mb-6">
            <SubscriptionCard subscription={sub} />
          </div>

          {/* Quick links grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { href: '/account/savings',    icon: '£',  label: 'My Savings',   sub: "See what you've saved" },
              { href: '/account/favourites', icon: '♡',  label: 'Favourites',   sub: 'Saved merchants & vouchers' },
              { href: '/account/profile',    icon: (
                <svg width="22" height="22" viewBox="0 0 14 14" fill="none" aria-hidden><circle cx="7" cy="4.5" r="2.5" fill="currentColor"/><path d="M2 12c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              ), label: 'Edit Profile', sub: 'Name, address, interests' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group bg-white border border-navy/[0.08] rounded-2xl p-5 hover:border-navy/20 hover:shadow-sm transition-all no-underline"
              >
                <span className="text-2xl mb-3 block" aria-hidden>{item.icon}</span>
                <p className="font-display text-[17px] text-navy mb-1 group-hover:text-red transition-colors">{item.label}</p>
                <p className="text-[12px] text-navy/45">{item.sub}</p>
              </Link>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
