'use client'

/**
 * PR-B Task B6b: the Insights Busy-times tab (spec 8 / 1.7, screenshot 09).
 *
 * Renders the busy-times Heatmap from server-computed INTENSITY bands only. The 7-day x
 * 6-daypart grid is owned by the shared <Heatmap> chart; this tab adds the card chrome,
 * the busiest badge, and the MetricInfo explainer.
 *
 * Locked deltas vs the prototype (spec 2.4):
 *   - SIX daypart columns covering 24h: Overnight / Morning / Lunch / Afternoon /
 *     Evening / Late. The prototype's FOUR columns + "Late morning" labels are BANNED.
 *   - Intensity bands only: NO raw counts are rendered or reconstructable. The
 *     prototype's "Figures are validated redemptions" count caption is BANNED.
 *   - "Busiest: <day> <daypart>" badge from the server busiest LOCATION (day+daypart,
 *     never a count); OMITTED when busiest is null.
 *   - Gate-closed ({ available:false }) shows a calm "Not available" treatment.
 *
 * House style: no em dashes; no emojis; icons via @/lib/icons; colour via CSS var()
 * tokens (never hardcoded hex).
 */
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock } from '@/lib/icons'
import { getInsightsBusyTimes, type InsightsFilters } from '@/lib/api/insights'
import { Heatmap } from '../charts/Heatmap'
import { MetricInfo } from '../MetricInfo'

export interface BusyTimesTabProps {
  filters: InsightsFilters
}

/** Row order Mon=0..Sun=6 (mirrors the Heatmap row order the server emits). */
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** The six locked owner-facing dayparts (NOT the prototype's four columns). */
const DAYPART_LABELS = ['Overnight', 'Morning', 'Lunch', 'Afternoon', 'Evening', 'Late'] as const

export function BusyTimesTab({ filters }: BusyTimesTabProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['insights', 'busy-times', filters],
    queryFn: () => getInsightsBusyTimes(filters),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Loading busy times...
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
        We could not load busy times just now. Please try again.
      </div>
    )
  }

  const available = 'mode' in data
  const busiest = available ? data.busiest : null
  const busiestLabel =
    busiest != null
      ? `${DAY_LABELS[busiest.day] ?? ''} ${DAYPART_LABELS[busiest.daypart] ?? ''}`.trim()
      : null

  return (
    <section
      data-testid="busy-times-card"
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
      style={{ borderColor: 'var(--border)' }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
              Busiest days and times
            </h2>
            <MetricInfo
              label="About busiest days and times"
              ariaLabel="How busiest days and times are shown"
            >
              Darker cells are busier. These are relative intensity bands, not exact
              counts. The six columns cover the whole day: Overnight, Morning, Lunch,
              Afternoon, Evening, and Late, in UK time, with after-midnight activity
              shown as Overnight. We show bands rather than exact numbers so quiet slots
              cannot be traced back to individual customers. Excludes test, deleted, and
              removed records.
            </MetricInfo>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            When redemptions happen across the week, to help plan staffing and stock.
          </p>
        </div>

        {busiestLabel ? (
          <span
            data-testid="busy-times-busiest"
            className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--tint)',
              color: 'var(--navy)',
            }}
          >
            <Clock size={14} aria-hidden style={{ color: 'var(--coral)' }} />
            Busiest: {busiestLabel}
          </span>
        ) : (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'var(--tint)', color: 'var(--coral)' }}
            aria-hidden
          >
            <Clock size={18} />
          </span>
        )}
      </header>

      {available ? (
        <Heatmap grid={data.grid} busiest={data.busiest} />
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Not available for this selection.
        </p>
      )}
    </section>
  )
}
