/**
 * PR-B Task B2: BarSeries - a hand-rolled SVG vertical bar chart for the Insights
 * trend (no charting dependency).
 *
 * Each month draws ONE bar whose full height is the LOGGED total, with the CONFIRMED
 * subset overlaid over the bottom portion of the same bar. The overlay is NEVER
 * additive: confirmed <= logged, so the upper remainder (logged minus confirmed) is
 * the neutral "awaiting" band of the same bar. This is the logged-primary dual-layer
 * reading: the bar is the full logged activity; the darker base is the part staff
 * later confirmed.
 *
 * Accessibility: the SVG is role="img" with a summarising aria-label, and a
 * visually-hidden <table> carries the same numbers for screen readers. There is no
 * essential animation, so prefers-reduced-motion needs no special handling.
 */
import { cn } from '@/lib/utils'

export interface BarSeriesDatum {
  label: string
  logged: number
  confirmed: number
  /** The current, still-accumulating period (rendered with a hatched/dashed accent). */
  inProgress?: boolean
}

export interface BarSeriesProps {
  data: BarSeriesDatum[]
  className?: string
  /** SVG viewBox height (logical units; the chart scales responsively to width). */
  height?: number
}

const VIEW_W = 720
const PAD_TOP = 28
const PAD_BOTTOM = 28
const GAP_RATIO = 0.32 // proportion of each slot left as the inter-bar gap
// Staging-acceptance A3: cap the per-bar width. Without a cap a 1-2 month series
// gets a slot of 720/1 (or /2) logical units and the bar renders as a near
// full-bleed block (with the height also at the relative max, the chart read as
// ONE SOLID BLOCK). 64 units keeps a tiny series looking like a normal centered
// bar while leaving a typical 8-12 month series (slot <= 90, bar <= 61.2)
// untouched.
const MAX_BAR_W = 64

export function BarSeries({ data, className, height = 220 }: BarSeriesProps) {
  if (data.length === 0) {
    return (
      <div
        className={cn('flex h-32 items-center justify-center text-sm', className)}
        style={{ color: 'var(--text-tertiary)' }}
      >
        No data for this selection yet.
      </div>
    )
  }

  const maxLogged = Math.max(...data.map((d) => d.logged), 1)
  const plotH = height - PAD_TOP - PAD_BOTTOM
  const slot = VIEW_W / data.length
  const barW = Math.min(slot * (1 - GAP_RATIO), MAX_BAR_W)

  const ariaLabel =
    `Redemption trend by month. ` +
    data.map((d) => `${d.label}: ${d.logged} logged, ${d.confirmed} confirmed`).join('. ') +
    '.'

  return (
    <div className={cn('w-full', className)}>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${VIEW_W} ${height}`}
        width="100%"
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        {/* baseline */}
        <line
          x1={0}
          y1={height - PAD_BOTTOM}
          x2={VIEW_W}
          y2={height - PAD_BOTTOM}
          stroke="var(--chart-grid)"
          strokeWidth={1}
        />
        {data.map((d, i) => {
          const x = i * slot + (slot - barW) / 2
          const loggedH = Math.max((d.logged / maxLogged) * plotH, d.logged > 0 ? 2 : 0)
          const confirmedH =
            d.logged > 0 ? Math.min((d.confirmed / maxLogged) * plotH, loggedH) : 0
          const yLogged = height - PAD_BOTTOM - loggedH
          const yConfirmed = height - PAD_BOTTOM - confirmedH
          return (
            <g key={`${d.label}-${i}`} data-in-progress={d.inProgress ? 'true' : undefined}>
              {/* logged total (awaiting reads as the upper remainder) */}
              <rect
                data-series="logged"
                x={x}
                y={yLogged}
                width={barW}
                height={loggedH}
                rx={4}
                fill="var(--chart-logged)"
                fillOpacity={d.inProgress ? 0.55 : 1}
              />
              {/* confirmed subset (bottom portion of the SAME bar; never additive) */}
              {confirmedH > 0 && (
                <rect
                  data-series="confirmed"
                  x={x}
                  y={yConfirmed}
                  width={barW}
                  height={confirmedH}
                  rx={4}
                  fill="var(--chart-confirmed)"
                  fillOpacity={d.inProgress ? 0.55 : 1}
                />
              )}
              {/* value label */}
              <text
                x={x + barW / 2}
                y={yLogged - 6}
                textAnchor="middle"
                fontSize={11}
                fill="var(--text-secondary)"
              >
                {d.logged}
              </text>
              {/* month label */}
              <text
                x={x + barW / 2}
                y={height - 9}
                textAnchor="middle"
                fontSize={11}
                fill="var(--chart-axis)"
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Screen-reader equivalent. */}
      <table className="sr-only">
        <caption>Redemption trend by month: logged total and confirmed subset.</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Logged</th>
            <th scope="col">Confirmed</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={`${d.label}-row-${i}`}>
              <th scope="row">
                {d.label}
                {d.inProgress ? ' (in progress)' : ''}
              </th>
              <td>{d.logged}</td>
              <td>{d.confirmed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
