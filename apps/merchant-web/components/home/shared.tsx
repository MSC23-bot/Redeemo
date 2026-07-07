'use client'

/**
 * Home dashboard shared primitives (reuse-only Slice 1). House style: no emojis (SVG
 * icons via @/lib/icons), no em-dashes, colour via CSS var() tokens only.
 */
import * as React from 'react'
import type { MerchantProfile } from '@/lib/api/profile'

/** Full weekday names, indexed Mon=0..Sun=6 (the busy-times grid row order). */
export const DAY_FULL = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

/**
 * The greeting name: the viewer's own display name (first word), falling back to the
 * business name. Never fabricated - a viewer with no resolvable display name simply
 * greets by business.
 */
export function greetingName(profile: MerchantProfile): string {
  const display = profile.viewerCapabilities?.displayName?.trim()
  if (display && display.length > 0) return display.split(/\s+/)[0]
  return profile.businessName
}

/** The small "Live" status treatment (green dot + label), tokens only. */
export function LiveBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: '#E9F7EF', color: '#0F7A3E' }}
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: '#0F7A3E' }}
      />
      Live
    </span>
  )
}

/** The dashboard welcome header: greeting + Live badge + business subtitle. */
export function WelcomeHeader({ profile }: { profile: MerchantProfile }) {
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold" style={{ color: 'var(--navy)' }}>
          Welcome back, {greetingName(profile)}
        </h1>
        <LiveBadge />
      </div>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Here is how Redeemo is bringing customers to {profile.businessName}.
      </p>
    </header>
  )
}

/** A section card matching the Insights surface chrome (border + card bg + soft shadow). */
export function HomeCard({
  className,
  children,
  testId,
  labelledBy,
}: {
  className?: string
  children: React.ReactNode
  testId?: string
  labelledBy?: string
}) {
  return (
    <section
      data-testid={testId}
      aria-labelledby={labelledBy}
      className={['rounded-2xl border bg-card p-5 shadow-sm', className].filter(Boolean).join(' ')}
      style={{ borderColor: 'var(--border)' }}
    >
      {children}
    </section>
  )
}
