'use client'

/**
 * The "Live, just started" Home (home-2): a live business with zero all-time redemptions.
 * Celebratory banner + a placeholder (no charts-with-data) + first-run tiles + a static
 * "Ways to bring in more customers" tips grid. House style: no emojis (SVG icons), no
 * em-dashes, tokens only. Action links use the brand-gradient CTA style where they are
 * buttons; the tip cards are plain navigational cards.
 */
import * as React from 'react'
import Link from 'next/link'
import { TrendingUp, Plus, Image as ImageIcon, Star, Clock, Smartphone } from '@/lib/icons'
import { formatCount } from '@/lib/insights/format'
import type { MerchantProfile } from '@/lib/api/profile'
import { greetingName } from './shared'

interface Tip {
  key: string
  title: string
  body: string
  href: string
  icon: React.ReactNode
}

const TIPS: Tip[] = [
  {
    key: 'vouchers',
    title: 'Add more vouchers',
    body: 'Beyond your two flagship vouchers, try a Discount, a Freebie, a Spend and save, or a Time-limited voucher to give customers more reasons to visit.',
    href: '/vouchers',
    icon: <Plus size={18} />,
  },
  {
    key: 'photo',
    title: 'Add a strong photo',
    body: 'Vouchers with a clear, appetising photo catch the eye first.',
    href: '/branches',
    icon: <ImageIcon size={18} />,
  },
  {
    key: 'featured',
    title: 'Consider featured placement',
    body: 'Stand out to more nearby customers browsing Redeemo.',
    href: '/promote',
    icon: <Star size={18} />,
  },
  {
    key: 'hours',
    title: 'Check your opening hours',
    body: 'Make sure customers know exactly when to visit.',
    href: '/branches',
    icon: <Clock size={18} />,
  },
]

export function JustStartedHome({
  profile,
  liveVouchersReady,
}: {
  profile: MerchantProfile
  liveVouchersReady: number
}) {
  return (
    <div className="flex flex-col gap-6" data-testid="home-just-started">
      {/* Celebratory banner */}
      <section
        className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full w-1"
          style={{ background: 'var(--brand-gradient)' }}
        />
        <div className="flex flex-col gap-3 pl-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ background: '#E9F7EF', color: '#0F7A3E' }}
            >
              <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: '#0F7A3E' }} />
              Live
            </span>
            <span
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--coral)' }}
            >
              Approved and listed
            </span>
          </div>
          <h1 className="font-display text-2xl font-semibold" style={{ color: 'var(--navy)' }}>
            {profile.businessName} is live on Redeemo
          </h1>
          <p className="max-w-[62ch] text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Nice work, {greetingName(profile)}. Your vouchers are now on the app and website, and
            your first customers will start coming through soon. Here is where you will watch it
            happen.
          </p>
        </div>
      </section>

      {/* Placeholder chart (no data yet) */}
      <section
        className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
            Redemptions over time
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Last 30 days, all branches.
          </p>
        </div>
        <div
          data-testid="home-placeholder-chart"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center"
          style={{ borderColor: 'var(--border-strong)', background: 'var(--tint)' }}
        >
          <span
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ background: 'var(--card)', color: 'var(--coral)' }}
            aria-hidden
          >
            <TrendingUp size={22} />
          </span>
          <span className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
            Your first redemptions will show here
          </span>
          <span className="max-w-[46ch] text-sm" style={{ color: 'var(--text-secondary)' }}>
            The moment a customer redeems one of your vouchers, it appears on this chart. Your
            first one is on its way.
          </span>
        </div>
      </section>

      {/* First-run tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div
          className="flex flex-col gap-1.5 rounded-2xl border p-5 shadow-sm"
          style={{ borderColor: 'var(--tint-deep)', background: 'var(--tint)' }}
        >
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Live vouchers ready
          </span>
          <span className="text-4xl font-semibold leading-none" style={{ color: 'var(--navy)' }}>
            {formatCount(liveVouchersReady)}
          </span>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Vouchers out there working for you.
          </span>
        </div>

        <div
          className="flex flex-col gap-1.5 rounded-2xl border bg-card p-5 shadow-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Your first redemption
          </span>
          <span className="text-2xl font-semibold leading-none" style={{ color: 'var(--navy)' }}>
            On its way
          </span>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            We will celebrate it with you here.
          </span>
        </div>

        <div
          className="flex flex-col gap-1.5 rounded-2xl border bg-card p-5 shadow-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            <span aria-hidden style={{ color: 'var(--coral)' }}>
              <Smartphone size={14} />
            </span>
            Now visible on
          </span>
          <span className="text-2xl font-semibold leading-none" style={{ color: 'var(--navy)' }}>
            App and website
          </span>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Customers near you can find you now.
          </span>
        </div>
      </div>

      {/* Tips grid */}
      <section
        className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
        style={{ borderColor: 'var(--border)' }}
        data-testid="home-tips-grid"
      >
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
            Ways to bring in more customers
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            A few simple things that help your vouchers get noticed.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {TIPS.map((tip) => (
            <Link
              key={tip.key}
              href={tip.href}
              className="flex flex-col gap-2 rounded-xl border p-4 transition-colors hover:bg-[color-mix(in_srgb,var(--tint)_60%,transparent)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ background: 'var(--tint)', color: 'var(--coral)' }}
                aria-hidden
              >
                {tip.icon}
              </span>
              <span className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>
                {tip.title}
              </span>
              <span className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {tip.body}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
