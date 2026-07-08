/**
 * PR-B final-review: the shared Insights lifecycle / page-level state surfaces.
 *
 * Extracted from app/(app)/insights/page.tsx so the dashboard page AND the printable
 * report page render the SAME lifecycle treatment (a SUSPENDED merchant sees the
 * suspension screen, a pre-live merchant sees the lock, a STAFF caller sees the
 * server-denied notice) rather than each surface inventing its own gate. These are the
 * exact components the dashboard used; only their location changed.
 *
 * House style: no em dashes; no emojis; icons via @/lib/icons; colour via CSS var()
 * tokens (never hardcoded hex).
 */
import * as React from 'react'
import Link from 'next/link'
import { Clock, ArrowRight, Lock } from '@/lib/icons'
import { LoadingStatus, SkeletonKpiRow, SkeletonChartBlock } from '@/components/ui/skeleton'

/** The Insights page header (logged-primary sub-headline; never "honoured"). */
export function PageHeader() {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="font-display text-2xl font-semibold" style={{ color: 'var(--navy)' }}>
        Insights and reports
      </h1>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        How your vouchers are performing. Figures count the redemptions your customers
        logged, with the subset later confirmed by staff shown alongside.
      </p>
    </header>
  )
}

/** The lifecycle "unlocks when you go live" lock (pre-live / non-ACTIVE merchant). */
export function InsightsLocked() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader />
      <section
        data-testid="insights-locked"
        role="status"
        className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-6 shadow-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <span
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: 'var(--tint)', color: 'var(--coral)' }}
          aria-hidden
        >
          <Lock size={22} />
        </span>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--navy)' }}>
          Insights unlock when your business is live
        </h2>
        <p className="max-w-[60ch] text-sm" style={{ color: 'var(--text-secondary)' }}>
          Once your business is approved and live, this is where you will see how your
          vouchers are performing: redemptions, your busiest times, your top vouchers,
          and downloadable reports. Finish setting up your business to get there.
        </p>
        <Link
          href="/"
          className="mt-1 inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--navy)' }}
        >
          Go to your business setup
        </Link>
      </section>
    </div>
  )
}

/** The STAFF server-denied notice (the portal has no STAFF session; this is the
 * defence-in-depth response if a STAFF caller somehow reaches the route server-side). */
export function InsightsAccessDenied() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader />
      <section
        data-testid="insights-denied"
        role="status"
        className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-6 shadow-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <span
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: 'var(--tint)', color: 'var(--coral)' }}
          aria-hidden
        >
          <Lock size={22} />
        </span>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--navy)' }}>
          You do not have access to Insights
        </h2>
        <p className="max-w-[60ch] text-sm" style={{ color: 'var(--text-secondary)' }}>
          Insights and reports are available to business owners and branch managers. If
          you need access, ask the account owner.
        </p>
      </section>
    </div>
  )
}

/** The early-life "warming up" empty state (screenshot 01; dashboard-only). */
export function InsightsWarmingUp() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader />
      <section
        data-testid="insights-warming-up"
        role="status"
        className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-6 shadow-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <span
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: 'var(--tint)', color: 'var(--coral)' }}
          aria-hidden
        >
          <Clock size={22} />
        </span>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--navy)' }}>
          Your insights are warming up
        </h2>
        <p className="max-w-[60ch] text-sm" style={{ color: 'var(--text-secondary)' }}>
          We will start showing your figures here as soon as customers begin redeeming
          your vouchers. Make sure your vouchers are live and ready, and check back once
          you have your first redemptions.
        </p>
        <Link
          href="/vouchers"
          className="mt-1 inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--navy)' }}
        >
          Manage your vouchers
          <ArrowRight size={16} aria-hidden />
        </Link>
      </section>
    </div>
  )
}

/** The page-level loading state: a skeleton matching the eventual KPI row + trend
 * chart + tabbed-section layout, so the surface never flashes bare text while it
 * still does not know whether it will land on the dashboard, the lock, or an
 * empty state. */
export function InsightsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader />
      <LoadingStatus label="Loading your insights...">
        <div className="flex flex-col gap-6">
          <SkeletonKpiRow />
          <SkeletonChartBlock />
        </div>
      </LoadingStatus>
    </div>
  )
}

/** The page-level friendly-error with retry. */
export function InsightsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader />
      <section
        role="alert"
        className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-6 shadow-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
          We could not load your insights
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          There was a problem reaching Redeemo. Please try again.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--navy)' }}
        >
          Try again
        </button>
      </section>
    </div>
  )
}
