'use client'

/**
 * The full Live Home dashboard (home-1), for canViewInsights viewers only. Reuse-only:
 * every element is wired to an existing operational endpoint (see the Slice-1 plan). The
 * parent (HomeDashboard) has already fetched /insights/overview (period all) and decided
 * this is NOT the just-started state, so here we fetch the rest and render.
 *
 * House style: no emojis (SVG icons), no em-dashes, tokens only. Action CTAs use the
 * brand-gradient Button, never navy (owner decision).
 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { getInsightsTrend, getInsightsBusyTimes, type InsightsOverview } from '@/lib/api/insights'
import { listCustomVouchers, listFlagshipVouchers } from '@/lib/api/voucher'
import { listRedemptions } from '@/lib/api/redemptions'
import { listBranches } from '@/lib/api/branch'
import type { MerchantProfile } from '@/lib/api/profile'
import { TrendChart } from '@/components/insights/TrendChart'
import { WelcomeHeader, DAY_FULL } from './shared'
import { HomeKpis } from './HomeKpis'
import { BusiestDays } from './BusiestDays'
import { NeedsAttention, type AttentionItem } from './NeedsAttention'
import { RecentRedemptions } from './RecentRedemptions'
import { LiveVouchers, type LiveVoucherRow } from './LiveVouchers'

const ALL_TIME = { period: 'all' } as const

// A small loading/error placeholder card, matching the surface chrome.
function ChartFallback({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="rounded-2xl border bg-card p-5 text-sm shadow-sm"
      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
    >
      {label}
    </div>
  )
}

export function LiveDashboard({
  profile,
  overview,
}: {
  profile: MerchantProfile
  overview: InsightsOverview
}) {
  const trend = useQuery({
    queryKey: ['home', 'trend', ALL_TIME],
    queryFn: () => getInsightsTrend(ALL_TIME),
    staleTime: 60_000,
  })
  const busy = useQuery({
    queryKey: ['home', 'busy-times', ALL_TIME],
    queryFn: () => getInsightsBusyTimes(ALL_TIME),
    staleTime: 60_000,
  })
  const customVouchers = useQuery({
    queryKey: ['merchantCustomVouchers'],
    queryFn: listCustomVouchers,
    staleTime: 60_000,
  })
  const flagshipVouchers = useQuery({
    queryKey: ['merchantFlagshipVouchers'],
    queryFn: listFlagshipVouchers,
    staleTime: 60_000,
  })
  const redemptions = useQuery({
    queryKey: ['home', 'recentRedemptions'],
    queryFn: () => listRedemptions({ sort: 'recent', limit: 5 }),
    staleTime: 30_000,
  })
  const branches = useQuery({
    queryKey: ['merchantBranches'],
    queryFn: listBranches,
    staleTime: 60_000,
  })

  const flagshipData = flagshipVouchers.data
  const customData = customVouchers.data
  const branchData = branches.data

  const allVouchers = React.useMemo(
    () => [...(flagshipData ?? []), ...(customData ?? [])],
    [flagshipData, customData],
  )

  // Live vouchers: ACTIVE only, ranked by redemptionCount desc (flagship + custom).
  const liveVouchers: LiveVoucherRow[] = React.useMemo(
    () =>
      allVouchers
        .filter((v) => v.status === 'ACTIVE')
        .map((v) => ({
          id: v.id,
          title: v.title,
          type: v.type,
          redemptionCount: v.redemptionCount ?? 0,
          isRmv: v.isRmv,
        }))
        .sort((a, b) => b.redemptionCount - a.redemptionCount),
    [allVouchers],
  )

  // Busiest weekday label (server busiest LOCATION; null when not yet known).
  const busiestDay =
    busy.data && 'mode' in busy.data && busy.data.busiest != null
      ? (DAY_FULL[busy.data.busiest.day] ?? null)
      : null

  // "Needs your attention", assembled client-side from the reads we hold.
  const attention: AttentionItem[] = React.useMemo(() => {
    const branchRows = branchData ?? []
    const items: AttentionItem[] = []
    if ((profile.pendingEdits?.length ?? 0) > 0) {
      items.push({
        key: 'profile-edit',
        title: 'A profile change is in review',
        subtitle: 'We will let you know once it is approved.',
        href: '/profile',
        icon: 'profile',
      })
    }
    if (branchRows.some((b) => b.locationConfidence === 'NEEDS_REVIEW')) {
      items.push({
        key: 'branch-location',
        title: 'Confirm a branch location',
        subtitle: 'A branch still needs its location confirmed.',
        href: '/branches',
        icon: 'location',
      })
    }
    if (branchRows.some((b) => (b.pendingEdits?.length ?? 0) > 0)) {
      items.push({
        key: 'branch-edit',
        title: 'A branch change is in review',
        subtitle: 'A branch edit is awaiting review.',
        href: '/branches',
        icon: 'branch',
      })
    }
    if (allVouchers.some((v) => v.approvalStatus === 'CHANGES_REQUESTED')) {
      items.push({
        key: 'voucher-changes',
        title: 'A voucher needs changes',
        subtitle: 'Open it to see what to update.',
        href: '/vouchers',
        icon: 'voucher',
      })
    }
    return items
  }, [profile.pendingEdits, branchData, allVouchers])

  return (
    <div className="flex flex-col gap-6" data-testid="home-live-dashboard">
      <WelcomeHeader profile={profile} />

      {/* Charts: redemptions over time + busiest days */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {trend.isLoading ? (
          <ChartFallback label="Loading the trend..." />
        ) : trend.isError || !trend.data ? (
          <ChartFallback label="We could not load the trend just now." />
        ) : (
          <TrendChart trend={trend.data} />
        )}

        {busy.isLoading ? (
          <ChartFallback label="Loading busiest days..." />
        ) : busy.isError || !busy.data ? (
          <ChartFallback label="We could not load busiest days just now." />
        ) : (
          <BusiestDays data={busy.data} />
        )}
      </div>

      {/* KPI tiles */}
      <HomeKpis
        customersBroughtIn={overview.distinctCustomers.logged}
        liveVouchers={liveVouchers.length}
        busiestDay={busiestDay}
      />

      {/* Attention + recent redemptions */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <NeedsAttention items={attention} />
        <RecentRedemptions rows={redemptions.data?.items ?? []} />
      </div>

      {/* Live vouchers ranked list */}
      <LiveVouchers vouchers={liveVouchers} />
    </div>
  )
}
