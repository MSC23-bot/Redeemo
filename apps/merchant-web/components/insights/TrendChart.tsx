'use client'

/**
 * PR-B Task B5: the Insights trend chart card (spec 2.4, screenshots 02 / 04).
 *
 * Monthly redemption series from /trend, drawn via the hand-rolled BarSeries primitive
 * (no charting dependency). Each month is ONE bar whose full height is the LOGGED
 * total, with the CONFIRMED subset overlaid over the bottom portion of the SAME bar.
 * The overlay is NEVER additive: confirmed <= logged, so the upper remainder is the
 * neutral "awaiting" band. This is the logged-primary dual-layer reading.
 *
 * The current (incomplete) London month is flagged "in progress" (BarSeries renders it
 * with a hatched/faded accent + an "(in progress)" note in its <table> fallback).
 *
 * Copy guards (spec 2.4):
 *   - The subtitle is LOGGED-PRIMARY. The prototype's "Validated redemptions per month"
 *     subtitle is BANNED.
 *   - "Delivered" / "Value delivered" must not appear anywhere on the surface.
 *
 * A MetricInfo explainer notes that a PAST month's confirmed portion can rise later
 * (retroactive staff validation) while its logged total does not move.
 *
 * House style: no em dashes; no emojis; icons via @/lib/icons; colour via CSS var()
 * tokens (never hardcoded hex).
 */
import * as React from 'react'
import { BarChart3 } from '@/lib/icons'
import { MetricInfo } from './MetricInfo'
import { BarSeries, type BarSeriesDatum } from './charts/BarSeries'
import { currentLondonMonth } from '@/lib/insights/filters'
import type { InsightsTrend } from '@/lib/api/insights'

export interface TrendChartProps {
  trend: InsightsTrend
  /** Injectable clock for deterministic in-progress detection (defaults to now). */
  now?: Date
  className?: string
}

// Short month labels for the bar/table axis (Jan..Dec). monthStartLondon is YYYY-MM-01.
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** Map a YYYY-MM-01 (or YYYY-MM) string to a short month label, with the year suffix
 * shown only at January / the first bar so a multi-year range stays readable. */
function monthLabel(monthStartLondon: string): string {
  // monthStartLondon is the London month start, e.g. "2025-11-01". Parse the numeric
  // month directly (no timezone shift) so the label is exactly the stated month.
  const [, mm] = monthStartLondon.split('-')
  const idx = Number(mm) - 1
  return MONTH_SHORT[idx] ?? monthStartLondon
}

/** YYYY-MM prefix of a YYYY-MM-01 month-start string. */
function monthKey(monthStartLondon: string): string {
  return monthStartLondon.slice(0, 7)
}

export function TrendChart({ trend, now, className }: TrendChartProps) {
  const currentMonth = currentLondonMonth(now ?? new Date())

  const data: BarSeriesDatum[] = React.useMemo(
    () =>
      trend.months.map((m) => ({
        label: monthLabel(m.monthStartLondon),
        logged: m.logged,
        confirmed: m.confirmed,
        inProgress: monthKey(m.monthStartLondon) === currentMonth,
      })),
    [trend.months, currentMonth],
  )

  return (
    <section
      data-testid="trend-chart"
      className={['rounded-2xl border bg-card p-5 shadow-sm', className].filter(Boolean).join(' ')}
      style={{ borderColor: 'var(--border)' }}
      aria-labelledby="trend-chart-heading"
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <h2
              id="trend-chart-heading"
              className="text-base font-semibold"
              style={{ color: 'var(--navy)' }}
            >
              Redemptions over time
            </h2>
            <MetricInfo
              label="About the redemptions trend"
              ariaLabel="How the redemptions trend over time is counted"
            >
              Each bar is the redemptions customers logged that month. The darker base is
              the subset later confirmed by staff. Confirmed is always a part of logged,
              never added on top. A past month can confirm more later as staff catch up,
              so its confirmed portion may rise over time while its logged total stays
              fixed. The current month is still filling in.
            </MetricInfo>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Redemptions logged per month, with the staff-confirmed subset shaded in.
          </p>
        </div>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: 'var(--tint)', color: 'var(--coral)' }}
          aria-hidden
        >
          <BarChart3 size={18} />
        </span>
      </header>

      <BarSeries data={data} />

      {/* Legend: logged (the full bar) + confirmed (the shaded subset). The current
          month's lighter rendering is the in-progress signal. */}
      <div
        data-testid="trend-legend"
        className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
        style={{ color: 'var(--text-secondary)' }}
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: 'var(--chart-logged)' }}
            aria-hidden
          />
          Logged
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: 'var(--chart-confirmed)' }}
            aria-hidden
          />
          Confirmed by staff
        </span>
        <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: 'var(--chart-logged)', opacity: 0.55 }}
            aria-hidden
          />
          Current month, still in progress
        </span>
      </div>
    </section>
  )
}
