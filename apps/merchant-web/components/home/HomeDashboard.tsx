'use client'

/**
 * Home dashboard entry (Slice 1, reuse-only). Rendered by app/(app)/page.tsx for the
 * LIVE lifecycle (live / live_new) ONLY; all pre-live / read-only states stay on the
 * existing LifecycleHome / StaircaseHub and are untouched.
 *
 * GATING:
 *   - The full dashboard consumes /insights/* endpoints that require OWNER /
 *     BRANCH_MANAGER (canViewInsights). A STAFF viewer (canViewInsights false, or absent
 *     -> FAIL CLOSED) gets the LEAN live home and NEVER fires an insights read.
 *   - For a canViewInsights viewer, the module fetches /insights/overview (period all)
 *     once. All-time redemptions === 0 -> the celebratory "just started" home (home-2);
 *     otherwise the full live dashboard (home-1).
 *
 * House style: no emojis, no em-dashes, tokens only.
 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { getInsightsOverview } from '@/lib/api/insights'
import { listCustomVouchers, listFlagshipVouchers } from '@/lib/api/voucher'
import type { MerchantProfile } from '@/lib/api/profile'
import { LeanLiveHome } from './LeanLiveHome'
import { LiveDashboard } from './LiveDashboard'
import { JustStartedHome } from './JustStartedHome'

const ALL_TIME = { period: 'all' } as const

export default function HomeDashboard({ profile }: { profile: MerchantProfile }) {
  // FAIL CLOSED: absent capability -> no insights, lean home. A STAFF viewer never
  // reaches an insights endpoint (they would 403).
  const canViewInsights = profile.viewerCapabilities?.canViewInsights ?? false
  if (!canViewInsights) {
    return <LeanLiveHome profile={profile} />
  }
  return <InsightsHome profile={profile} />
}

function InsightsHome({ profile }: { profile: MerchantProfile }) {
  const overview = useQuery({
    queryKey: ['home', 'overview', ALL_TIME],
    queryFn: () => getInsightsOverview(ALL_TIME),
    staleTime: 60_000,
  })

  if (overview.isLoading) {
    return (
      <div role="status" aria-live="polite" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Loading your dashboard...
      </div>
    )
  }

  if (overview.isError || !overview.data) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-6 shadow-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-lg font-semibold" style={{ color: 'var(--navy)' }}>
          We could not load your dashboard
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          There was a problem reaching Redeemo. Please try again.
        </p>
        <button
          type="button"
          onClick={() => overview.refetch()}
          className="inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white"
          style={{ background: 'var(--brand-gradient)' }}
        >
          Try again
        </button>
      </div>
    )
  }

  // Just-started threshold (owner to confirm): zero all-time redemptions.
  const justStarted = overview.data.redemptionActivity.logged === 0
  if (justStarted) {
    return <JustStartedContainer profile={profile} />
  }

  return <LiveDashboard profile={profile} overview={overview.data} />
}

/**
 * The just-started home needs the live (ACTIVE) voucher count for its "Live vouchers
 * ready" tile, but no chart data (it is the zero-redemptions state). Fetch just the
 * voucher lists here so the celebratory home never mounts the chart/redemptions reads.
 */
function JustStartedContainer({ profile }: { profile: MerchantProfile }) {
  const custom = useQuery({
    queryKey: ['merchantCustomVouchers'],
    queryFn: listCustomVouchers,
    staleTime: 60_000,
  })
  const flagship = useQuery({
    queryKey: ['merchantFlagshipVouchers'],
    queryFn: listFlagshipVouchers,
    staleTime: 60_000,
  })
  const ready = [...(flagship.data ?? []), ...(custom.data ?? [])].filter(
    (v) => v.status === 'ACTIVE',
  ).length
  return <JustStartedHome profile={profile} liveVouchersReady={ready} />
}
