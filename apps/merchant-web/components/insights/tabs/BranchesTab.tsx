'use client'

/**
 * PR-B Task B6a: the Insights Branches tab (spec 9 / 1.8, screenshot 06).
 *
 * A ranked branch list (by logged, descending) with the staff-confirmed subset and an
 * estimated-savings secondary per row.
 *
 * SCOPED (the load-bearing privacy contract): this tab renders ONLY the rows the API
 * returns. The backend insightsScope already restricts the rows to the authorised
 * branches, so a Branch Manager scoped to one branch receives exactly one row, and
 * this component never invents, names, counts, or ranks an out-of-scope sibling. The
 * prototype's "Branch performance always compares all your locations" caption is
 * BANNED: it would tell a scoped user that other locations exist.
 *
 * Copy guards (spec 2.4): "Delivered" / "Value delivered" must not appear. Estimated
 * savings read as "estimated", never "delivered".
 *
 * House style: no em dashes; no emojis; icons via @/lib/icons; colour via CSS var()
 * tokens (never hardcoded hex).
 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapPin } from '@/lib/icons'
import { getInsightsBranches, type InsightsFilters } from '@/lib/api/insights'
import { formatCount, formatGbp } from '@/lib/insights/format'
import { MetricInfo } from '../MetricInfo'

export interface BranchesTabProps {
  filters: InsightsFilters
}

export function BranchesTab({ filters }: BranchesTabProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['insights', 'branches', filters],
    queryFn: () => getInsightsBranches(filters),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Loading branches...
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
        We could not load branch activity just now. Please try again.
      </div>
    )
  }

  // Defence-in-depth: re-sort by logged (descending) so the rank is honest even if the
  // API order ever drifts. We only ever sort the rows the API returned; we never add a
  // row.
  const rows = [...data.rows].sort((a, b) => b.logged - a.logged)
  const headMax = rows[0]?.logged ?? 1

  return (
    <section
      data-testid="branches-card"
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
      style={{ borderColor: 'var(--border)' }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
              Branch activity
            </h2>
            <MetricInfo
              label="About branch activity"
              ariaLabel="How branch activity is counted"
            >
              Redemptions and estimated savings by location, for the branches you can
              see. Confirmed is the subset later validated by staff. Estimated savings
              are an estimate of the potential customer saving. Excludes test, deleted,
              and removed records.
            </MetricInfo>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Redemptions and estimated savings by location.
          </p>
        </div>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: 'var(--tint)', color: 'var(--coral)' }}
          aria-hidden
        >
          <MapPin size={18} />
        </span>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          No branch activity for this selection yet.
        </p>
      ) : (
        <ul data-testid="branches-list" className="flex flex-col gap-4">
          {rows.map((b) => {
            const widthPct = headMax > 0 ? Math.round((b.logged / headMax) * 100) : 0
            return (
              <li key={b.branchId} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden style={{ color: 'var(--coral)' }}>
                      <MapPin size={16} />
                    </span>
                    <span
                      className="truncate text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {b.name}
                    </span>
                  </span>
                  <span
                    className="shrink-0 text-base font-semibold tabular-nums"
                    style={{ color: 'var(--navy)' }}
                  >
                    {formatCount(b.logged)}{' '}
                    <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                      redemptions
                    </span>
                  </span>
                </div>
                <div
                  aria-hidden
                  className="h-2 w-full overflow-hidden rounded-full"
                  style={{ background: 'var(--chart-awaiting)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${widthPct}%`, background: 'var(--coral)' }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {formatCount(b.confirmed)} confirmed
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {formatGbp(b.estimatedLogged)} estimated savings
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
