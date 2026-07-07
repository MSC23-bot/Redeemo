'use client'

/**
 * "Busiest days" card (home-1): a per-weekday bar summary derived from the reused
 * /insights/busy-times INTENSITY grid (no raw counts; bands only). Bar height is the sum
 * of the day's daypart intensity bands; the server-provided busiest day is highlighted.
 * PRIVACY: this only ever reads the ordinal intensity band, never a count. House style:
 * no emojis, no em-dashes, tokens only.
 */
import * as React from 'react'
import { Clock } from '@/lib/icons'
import type { InsightsBusyTimes } from '@/lib/api/insights'
import { DAY_FULL } from './shared'

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

// Staging-acceptance A3: bar heights are computed in PIXELS against this fixed
// bar-area height. The previous percentage heights resolved against an
// auto-height flex column (the outer row aligned items-end, so the columns never
// stretched to the container's 160px), which collapses a percentage height to 0:
// the chart rendered as a blank box with only the day labels visible.
const BAR_AREA_H = 132

export function BusiestDays({ data }: { data: InsightsBusyTimes }) {
  const available = 'mode' in data
  const busiest = available ? data.busiest : null

  // Sum the ordinal intensity bands per day (Mon=0..Sun=6). Bands only, never a count.
  const perDay = React.useMemo(() => {
    const totals = new Array(7).fill(0) as number[]
    if (available) {
      for (const cell of data.grid) {
        if (cell.day >= 0 && cell.day < 7) totals[cell.day] += cell.intensity
      }
    }
    return totals
  }, [available, data])

  const maxTotal = Math.max(...perDay, 1)
  const hasAnyActivity = perDay.some((t) => t > 0)
  const busiestLabel = busiest != null ? (DAY_FULL[busiest.day] ?? null) : null

  return (
    <section
      data-testid="home-busiest-days"
      aria-labelledby="home-busiest-heading"
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
      style={{ borderColor: 'var(--border)' }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="home-busiest-heading" className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
            Busiest days
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Redemptions by day of the week.
          </p>
        </div>
        {busiestLabel ? (
          <span
            data-testid="home-busiest-badge"
            className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: 'var(--border)', background: 'var(--tint)', color: 'var(--navy)' }}
          >
            <Clock size={14} aria-hidden style={{ color: 'var(--coral)' }} />
            {busiestLabel} leads
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

      {available && hasAnyActivity ? (
        <div className="flex items-end justify-between gap-2" aria-hidden data-testid="home-busiest-bars">
          {perDay.map((total, day) => {
            const isBusiest = busiest != null && busiest.day === day
            // Pixel height against the fixed bar area (see BAR_AREA_H note):
            // active days get a visible floor of 8px; zero days a 4px stub.
            const barH = total > 0 ? Math.max(Math.round((total / maxTotal) * BAR_AREA_H), 8) : 4
            return (
              <div key={DAY_SHORT[day]} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full items-end justify-center" style={{ height: BAR_AREA_H }}>
                  <div
                    className="w-full max-w-[34px] rounded-t-md"
                    data-testid={`home-busiest-bar-${day}`}
                    style={{
                      height: barH,
                      background: isBusiest ? 'var(--brand-gradient)' : 'var(--chart-intensity-1)',
                    }}
                  />
                </div>
                <span
                  className="text-xs font-medium"
                  style={{ color: isBusiest ? 'var(--coral)' : 'var(--text-muted)' }}
                >
                  {DAY_SHORT[day]}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        // A3: the in-chart empty state (same presentation Insights' BarSeries
        // uses for an empty selection), with Home-context copy: never a blank box.
        <div
          className="flex h-32 items-center justify-center text-sm"
          style={{ color: 'var(--text-tertiary)' }}
          data-testid="home-busiest-empty"
        >
          Your first redemptions will show here.
        </div>
      )}

      {/* Screen-reader summary: qualitative only. */}
      <p className="sr-only">
        {busiestLabel
          ? `Busiest day so far: ${busiestLabel}.`
          : 'Not enough redemptions yet to show the busiest day.'}
      </p>
    </section>
  )
}
