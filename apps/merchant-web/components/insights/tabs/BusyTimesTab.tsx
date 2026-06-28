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

/**
 * The four ordinal intensity bands, paired with the matching ramp token. The heatmap
 * conveys intensity by colour only, which fails the spec MUST for a clear, sighted
 * legend (the band words otherwise live solely in the sr-only table + the hover/focus
 * popover). This always-visible legend gives every cell colour a text meaning. Order +
 * tokens mirror the Heatmap's --chart-intensity-0..3 ramp exactly.
 */
const BAND_LEGEND: ReadonlyArray<{ label: string; token: string }> = [
  { label: 'No redemptions', token: 'var(--chart-intensity-0)' },
  { label: 'Quiet', token: 'var(--chart-intensity-1)' },
  { label: 'Steady', token: 'var(--chart-intensity-2)' },
  { label: 'Busy', token: 'var(--chart-intensity-3)' },
]

/** The always-visible colour-swatch + text-label legend for the intensity ramp. */
function HeatmapLegend() {
  return (
    <ul
      data-testid="busy-times-legend"
      aria-label="Intensity bands"
      className="flex flex-wrap items-center gap-x-4 gap-y-2"
    >
      {BAND_LEGEND.map((band) => (
        <li key={band.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-3 w-3 shrink-0 rounded"
            style={{ background: band.token, border: '1px solid var(--border)' }}
          />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {band.label}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Exact-mode supplement: the logged COUNT per cell. Rendered ONLY when the server
 * returns `mode:'exact'` (an approved PR-0a D6 exact-count policy). Intensity mode
 * (the default, and the only mode the AS-BUILT service emits) NEVER reaches here,
 * so exact counts can only ever appear under that policy.
 */
function ExactCounts({
  grid,
}: {
  grid: ReadonlyArray<{ day: number; daypart: number; logged: number }>
}) {
  const byKey = new Map<string, number>()
  for (const cell of grid) byKey.set(`${cell.day}-${cell.daypart}`, cell.logged)
  // The exact-mode payload is a DENSE 7x6 grid (enforced by busyTimesSchema), so
  // every cell is present. We never fabricate 0 for a missing cell - a missing cell
  // is unknown data, not a measured zero - so the defensive fallback is an em dash.
  const countAt = (day: number, daypart: number): number | undefined =>
    byKey.get(`${day}-${daypart}`)
  return (
    <div data-testid="busy-times-exact-counts" className="overflow-x-auto">
      <p className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        Exact counts: logged redemptions per slot, in UK time.
      </p>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th scope="col" className="px-2 py-1 text-left" style={{ color: 'var(--text-muted)' }}>
              Day
            </th>
            {DAYPART_LABELS.map((label) => (
              <th
                key={`ec-h-${label}`}
                scope="col"
                className="px-2 py-1 text-right"
                style={{ color: 'var(--text-muted)' }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAY_LABELS.map((dayLabel, r) => (
            <tr key={`ec-tr-${dayLabel}`}>
              <th
                scope="row"
                className="px-2 py-1 text-left font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {dayLabel}
              </th>
              {DAYPART_LABELS.map((_, c) => (
                <td
                  key={`ec-td-${r}-${c}`}
                  className="px-2 py-1 text-right tabular-nums"
                  style={{ color: 'var(--navy)' }}
                >
                  {countAt(r, c) ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

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
  const exact = available && data.mode === 'exact'
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
              {exact ? (
                <>
                  Darker cells are busier. In this view each slot shows the exact
                  number of logged redemptions, not just a band. The six columns cover
                  the whole day: Overnight, Morning, Lunch, Afternoon, Evening, and
                  Late, in UK time, with after-midnight activity shown as Overnight.
                  Excludes test accounts, QA accounts, and deleted customers.
                </>
              ) : (
                <>
                  Darker cells are busier. These are relative intensity bands, not exact
                  counts. The six columns cover the whole day: Overnight, Morning,
                  Lunch, Afternoon, Evening, and Late, in UK time, with after-midnight
                  activity shown as Overnight. We show bands rather than exact numbers so
                  quiet slots cannot be traced back to individual customers. Excludes
                  test accounts, QA accounts, and deleted customers.
                </>
              )}
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
        <div className="flex flex-col gap-3">
          <Heatmap grid={data.grid} busiest={data.busiest} />
          <HeatmapLegend />
          {data.mode === 'exact' ? <ExactCounts grid={data.grid} /> : null}
        </div>
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Not available for this selection.
        </p>
      )}
    </section>
  )
}
