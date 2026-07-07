'use client'

/**
 * The LEAN live Home for a STAFF viewer (canViewInsights false). The full dashboard
 * consumes Insights endpoints that require OWNER / BRANCH_MANAGER and 403 for STAFF, so
 * this fallback NEVER calls any /insights/* endpoint. Staff Home proper is a separate
 * not-started surface; this is only a safe, welcoming placeholder + the quick actions a
 * staff member needs. House style: no emojis, no em-dashes, tokens only.
 */
import * as React from 'react'
import Link from 'next/link'
import { ScanLine, LifeBuoy, ArrowRight } from '@/lib/icons'
import type { MerchantProfile } from '@/lib/api/profile'
import { greetingName, LiveBadge } from './shared'

interface QuickAction {
  key: string
  title: string
  body: string
  href: string
  icon: React.ReactNode
}

const ACTIONS: QuickAction[] = [
  {
    key: 'redemptions',
    title: 'Redemptions',
    body: 'See what customers have redeemed and validate a code in store.',
    href: '/redemptions',
    icon: <ScanLine size={18} />,
  },
  {
    key: 'help',
    title: 'Help & support',
    body: 'Find answers or contact the Redeemo team.',
    href: '/help',
    icon: <LifeBuoy size={18} />,
  },
]

export function LeanLiveHome({ profile }: { profile: MerchantProfile }) {
  return (
    <div className="flex flex-col gap-6" data-testid="home-lean">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold" style={{ color: 'var(--navy)' }}>
            Welcome back, {greetingName(profile)}
          </h1>
          <LiveBadge />
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {profile.businessName} is live on Redeemo.
        </p>
      </header>

      <section
        className="flex flex-col gap-1.5 rounded-2xl border bg-card p-5 shadow-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
          Your business is live
        </h2>
        <p className="max-w-[62ch] text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Customers can discover and redeem your vouchers. Use the quick actions below for the
          day-to-day.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ACTIONS.map((action) => (
          <Link
            key={action.key}
            href={action.href}
            className="flex items-start gap-3 rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:bg-[color-mix(in_srgb,var(--tint)_60%,transparent)]"
            style={{ borderColor: 'var(--border)' }}
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'var(--tint)', color: 'var(--coral)' }}
              aria-hidden
            >
              {action.icon}
            </span>
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--navy)' }}>
                {action.title}
                <ArrowRight size={14} aria-hidden style={{ color: 'var(--text-muted)' }} />
              </span>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {action.body}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
