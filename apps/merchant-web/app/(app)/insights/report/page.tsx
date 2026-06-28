'use client'

/**
 * PR-B Task B7: the client-rendered printable performance summary (spec 10.2).
 *
 * AGGREGATE-ONLY. It separates Logged / Confirmed / Awaiting totals, states the active
 * period, the server-resolved branch scope, the voucher-type filter, and a generation
 * date, with a "Print or save report" affordance that calls window.print() (browser
 * Save-as-PDF; spec 10.3 defers any server-side PDF or "email me" promise).
 *
 * It carries NO event-level / per-customer rows, so it needs no identifiability caveat
 * (the caveat in spec 10.2 is conditional on event-level detail, which this page does
 * not render). It uses the Decision-11 savings terminology: estimated, never "delivered".
 *
 * The active filters are read from the URL so the Reports card can deep-link the
 * printable to the same selection. The summary is driven by the SAME /overview contract
 * the dashboard uses, so figures are consistent with the live surface.
 *
 * House style: no em dashes; no emojis; icons via @/lib/icons; colour via CSS var()
 * tokens. No new dependency.
 */
import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { getInsightsOverview, type InsightsFilters } from '@/lib/api/insights'
import { parseFilters, serialiseFilters } from '@/lib/insights/filters'
import { formatCount, formatGbp, periodLabel } from '@/lib/insights/format'
import { voucherTypeLabel } from '@/lib/redemptions/display'

/** Format the generation date in en-GB (London-rendered, day month year). */
function generatedOn(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)
}

function AggregateTile({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-2xl border bg-card p-5"
      style={{ borderColor: 'var(--border)' }}
    >
      <span
        className="text-4xl font-semibold leading-none tabular-nums"
        style={{ color: 'var(--navy)' }}
      >
        {value}
      </span>
      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        {label}
      </span>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {hint}
      </span>
    </div>
  )
}

export default function InsightsReportPage() {
  const searchParams = useSearchParams()

  // Parse the active filters from the URL (forward-safe: unknown values are dropped).
  const filterState = React.useMemo(
    () => parseFilters(new URLSearchParams(searchParams?.toString() ?? '')),
    [searchParams],
  )
  const filters: InsightsFilters = React.useMemo(
    () => serialiseFilters(filterState),
    [filterState],
  )

  const { data, isLoading, isError } = useQuery({
    queryKey: ['insights', 'overview', filters],
    queryFn: () => getInsightsOverview(filters),
    staleTime: 60_000,
  })

  // The generation date is computed once on mount (stable across re-renders).
  const generated = React.useMemo(() => generatedOn(), [])

  if (isLoading) {
    return (
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Preparing your report...
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
        We could not prepare your report just now. Please try again.
      </div>
    )
  }

  const ra = data.redemptionActivity
  const scopeLabel = data.meta.scopeLabel
  const period = periodLabel(filters.period ?? 'this_month', filters.from, filters.to)
  const voucherFilter = filters.voucherType ? voucherTypeLabel(filters.voucherType) : 'All voucher types'

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 print:max-w-none">
      {/* The print stylesheet: hide the non-printing action and tighten the page. */}
      <style>{`
        @media print {
          .insights-report-noprint { display: none !important; }
          body { background: #fff; }
        }
      `}</style>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold" style={{ color: 'var(--navy)' }}>
            Performance summary
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Your headline figures for the selected period.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="insights-report-noprint inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--navy)' }}
        >
          Print or save report
        </button>
      </header>

      {/* Scope statement: period / branch scope / voucher filter / generation date. */}
      <section
        className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-2xl border bg-card p-5 text-sm sm:grid-cols-2"
        style={{ borderColor: 'var(--border)' }}
        aria-label="Report scope"
      >
        <div className="flex justify-between gap-3">
          <span style={{ color: 'var(--text-muted)' }}>Period</span>
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {period}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span style={{ color: 'var(--text-muted)' }}>Branches</span>
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {scopeLabel}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span style={{ color: 'var(--text-muted)' }}>Voucher type</span>
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {voucherFilter}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span style={{ color: 'var(--text-muted)' }}>Generated</span>
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {generated}
          </span>
        </div>
      </section>

      {/* Aggregate redemption activity: Logged / Confirmed / Awaiting. */}
      <section className="flex flex-col gap-3" aria-label="Redemption activity">
        <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
          Redemption activity
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AggregateTile
            label="Logged"
            value={formatCount(ra.logged)}
            hint="Redemptions your customers logged."
          />
          <AggregateTile
            label="Confirmed"
            value={formatCount(ra.confirmed)}
            hint="The subset validated by staff."
          />
          <AggregateTile
            label="Awaiting"
            value={formatCount(ra.awaiting)}
            hint="Logged, not yet confirmed."
          />
        </div>
      </section>

      {/* Estimated savings (secondary aggregate; never "delivered"). */}
      <section className="flex flex-col gap-3" aria-label="Estimated savings">
        <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
          Estimated customer savings
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AggregateTile
            label="Estimated customer savings"
            value={formatGbp(data.savings.estimatedLogged)}
            hint="An estimate of the potential customer saving across logged redemptions."
          />
          <AggregateTile
            label="Estimated savings on confirmed redemptions"
            value={formatGbp(data.savings.estimatedConfirmed)}
            hint="The estimate across the subset confirmed by staff."
          />
        </div>
      </section>

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Figures are aggregate totals for the selection above. Estimated savings are an
        estimate of the potential customer saving, based on each voucher value. Excludes
        test, deleted, and removed records.
      </p>
    </div>
  )
}
