'use client'

/**
 * PR-B Task B6a: the Insights Vouchers tab (spec 9 / 1.8, screenshot 05).
 *
 * Two cards driven by /vouchers:
 *   1) "Top vouchers": a ranked list (by logged, descending) with the staff-confirmed
 *      subset shown per row and an optional estimated-savings secondary. The list is
 *      re-sorted by logged client-side as defence-in-depth so the rank is honest even
 *      if the API ever returns rows out of order. Confirmed is always a subset of
 *      logged, never additive.
 *   2) "By voucher type": a stacked ShareBar + per-type legend whose shares are
 *      computed over the LOGGED denominator (the ShareBar derives widths from the
 *      logged values directly, so the displayed share never drifts from the bar). When
 *      a SINGLE voucher-type filter is active the surface explains the unavoidable
 *      100% (it is the only type in view, not a real dominance) rather than implying
 *      one type dominates.
 *
 * Copy guards (spec 2.4): the word "Delivered" / "Value delivered" must not appear.
 * Estimated savings are SECONDARY and read as "estimated", never "delivered".
 *
 * House style: no em dashes; no emojis; icons via @/lib/icons; colour via CSS var()
 * tokens (never hardcoded hex).
 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ticket, BarChart3 } from '@/lib/icons'
import { getInsightsVouchers, type InsightsFilters } from '@/lib/api/insights'
import { voucherTypeLabel } from '@/lib/redemptions/display'
import { formatCount, formatGbp } from '@/lib/insights/format'
import { MetricInfo } from '../MetricInfo'
import { ShareBar, type ShareSegment } from '../charts/ShareBar'

export interface VouchersTabProps {
  filters: InsightsFilters
}

// The per-type accent token ramp (functional, non-CTA colours), matched to the
// ShareBar palette order so the legend dot and bar segment agree per type.
const VT_TOKEN: Record<string, string> = {
  BOGO: 'var(--vt-bogo)',
  FREEBIE: 'var(--vt-freebie)',
  REUSABLE: 'var(--vt-reusable)',
  SPEND_AND_SAVE: 'var(--vt-spendsave)',
  PACKAGE_DEAL: 'var(--vt-package)',
  TIME_LIMITED: 'var(--vt-timelimited)',
  DISCOUNT: 'var(--vt-discount)',
}

function CardShell({
  testId,
  title,
  subtitle,
  icon,
  info,
  children,
}: {
  testId: string
  title: string
  subtitle: string
  icon: React.ReactNode
  info: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      data-testid={testId}
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
      style={{ borderColor: 'var(--border)' }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
              {title}
            </h2>
            {info}
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </p>
        </div>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: 'var(--tint)', color: 'var(--coral)' }}
          aria-hidden
        >
          {icon}
        </span>
      </header>
      {children}
    </section>
  )
}

export function VouchersTab({ filters }: VouchersTabProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['insights', 'vouchers', filters],
    queryFn: () => getInsightsVouchers(filters),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Loading vouchers...
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
        We could not load voucher activity just now. Please try again.
      </div>
    )
  }

  // Defence-in-depth: re-sort the top list by logged (descending) so the rank is
  // honest even if the API order ever drifts.
  const top = [...data.top].sort((a, b) => b.logged - a.logged)

  // The ShareBar segments are derived from the LOGGED values directly so the share is
  // always over the logged denominator (the bar and the legend cannot disagree).
  const segments: ShareSegment[] = data.byType.map((t) => ({
    label: voucherTypeLabel(t.type7),
    value: t.logged,
    color: VT_TOKEN[t.type7],
  }))

  // A single voucher-type filter makes the by-type share trivially 100% (only one type
  // is in view). Explain it so the merchant does not read it as a real dominance.
  const singleTypeFilter = Boolean(filters.voucherType)

  const noTopActivity = top.length === 0
  const noTypeActivity = segments.length === 0

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {/* 1) Top vouchers ----------------------------------------------------- */}
      <CardShell
        testId="top-vouchers-card"
        title="Top vouchers"
        subtitle="Which vouchers drive the most redemptions."
        icon={<Ticket size={18} />}
        info={
          <MetricInfo
            label="About top vouchers"
            ariaLabel="How top vouchers are ranked"
          >
            Vouchers are ranked by how many redemptions customers logged in this
            selection. Confirmed is the subset later validated by staff. Estimated
            savings are an estimate of the potential customer saving, based on each
            voucher value. Excludes test, deleted, and removed records.
          </MetricInfo>
        }
      >
        {noTopActivity ? (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            No voucher activity for this selection yet.
          </p>
        ) : (
          <ul data-testid="top-vouchers-list" className="flex flex-col gap-3.5">
            {top.map((v) => {
              const headMax = top[0]?.logged ?? 1
              const widthPct = headMax > 0 ? Math.round((v.logged / headMax) * 100) : 0
              return (
                <li key={v.voucherId} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: VT_TOKEN[v.type7] ?? 'var(--coral)' }}
                      />
                      <span
                        className="truncate text-sm font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {v.title}
                      </span>
                    </span>
                    <span
                      className="shrink-0 text-base font-semibold tabular-nums"
                      style={{ color: 'var(--navy)' }}
                    >
                      {formatCount(v.logged)}
                    </span>
                  </div>
                  {/* the proportional bar (rank visual; widest = the top voucher) */}
                  <div
                    aria-hidden
                    className="h-2 w-full overflow-hidden rounded-full"
                    style={{ background: 'var(--chart-awaiting)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${widthPct}%`,
                        background: VT_TOKEN[v.type7] ?? 'var(--coral)',
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {formatCount(v.confirmed)} confirmed
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {formatGbp(v.estimatedLogged)} estimated savings
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardShell>

      {/* 2) By voucher type ------------------------------------------------- */}
      <CardShell
        testId="by-type-card"
        title="By voucher type"
        subtitle="The share of redemptions by the kind of voucher."
        icon={<BarChart3 size={18} />}
        info={
          <MetricInfo
            label="About the voucher-type share"
            ariaLabel="How the voucher-type share is calculated"
          >
            Each share is that type as a proportion of all redemptions customers logged
            in this selection. Shares are over the logged total, so they add up to 100
            percent. Excludes test, deleted, and removed records.
          </MetricInfo>
        }
      >
        {noTypeActivity ? (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            No voucher activity for this selection yet.
          </p>
        ) : (
          <>
            {singleTypeFilter ? (
              <p
                data-testid="single-type-note"
                className="text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                This view is filtered to a single voucher type, so it is the whole 100
                percent. Clear the voucher-type filter to compare across types.
              </p>
            ) : null}
            <ShareBar segments={segments} />
          </>
        )}
      </CardShell>
    </div>
  )
}
