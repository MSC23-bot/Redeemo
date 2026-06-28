/**
 * PR-B Task B2: Heatmap - the busy-times grid (7 days x 6 dayparts), rendered from
 * server-computed INTENSITY bands (0..3) only.
 *
 * PRIVACY CONTRACT (mirrors PR-A busy-times): this component accepts an intensity
 * band per cell and NOTHING ELSE that could be a raw count. The grid cell type is
 * exactly { day, daypart, intensity }; any stray field on the wire object is ignored.
 * The cell fill comes from the intensity ramp tokens (--chart-intensity-0..3); the
 * client never thresholds on, displays, or reconstructs a raw count.
 *
 * Axes: rows are days Mon=0..Sun=6 (the grid row order the server emits, deliberately
 * different from getLondonClock's Sun=0..Sat=6); columns are the six locked
 * owner-facing dayparts.
 *
 * Accessibility: role="img" SVG with a summarising aria-label plus a visually-hidden
 * <table> whose data cells describe the band qualitatively (never a number). No
 * essential animation.
 */
import { cn } from '@/lib/utils'

/** Only the band is read; never a count. */
export interface HeatmapCell {
  day: number // Mon=0..Sun=6
  daypart: number // 0..5
  intensity: number // ordinal band 0..3
}

export interface HeatmapProps {
  grid: HeatmapCell[]
  /** Server-provided peak LOCATION (never a count) or null. */
  busiest?: { day: number; daypart: number } | null
  className?: string
}

/** Row order Mon=0..Sun=6. */
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** The six locked owner-facing dayparts (NOT the prototype's four columns). */
const DAYPART_LABELS = ['Overnight', 'Morning', 'Lunch', 'Afternoon', 'Evening', 'Late'] as const

/** Qualitative band wording (the table never carries a numeric count). */
const BAND_WORDS = ['No redemptions', 'Quiet', 'Steady', 'Busy'] as const

function bandWord(intensity: number): string {
  return BAND_WORDS[Math.max(0, Math.min(3, Math.round(intensity)))]
}

function intensityFill(intensity: number): string {
  const band = Math.max(0, Math.min(3, Math.round(intensity)))
  return `var(--chart-intensity-${band})`
}

const COLS = DAYPART_LABELS.length // 6
const ROWS = DAY_LABELS.length // 7
const CELL_W = 110
const CELL_H = 34
const GAP = 6
const LABEL_COL_W = 44
const HEADER_H = 24

export function Heatmap({ grid, busiest, className }: HeatmapProps) {
  // Index by day,daypart -> intensity (ignore any stray fields).
  const byKey = new Map<string, number>()
  for (const cell of grid) {
    byKey.set(`${cell.day}-${cell.daypart}`, cell.intensity)
  }
  const intensityAt = (day: number, daypart: number) => byKey.get(`${day}-${daypart}`) ?? 0

  const width = LABEL_COL_W + COLS * (CELL_W + GAP)
  const height = HEADER_H + ROWS * (CELL_H + GAP)

  const busiestLabel =
    busiest != null
      ? `Busiest: ${DAY_LABELS[busiest.day] ?? '?'} ${DAYPART_LABELS[busiest.daypart] ?? '?'}.`
      : ''
  const ariaLabel = `Busiest days and times, shown as relative intensity bands across the week. ${busiestLabel}`.trim()

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ display: 'block', minWidth: width }}
      >
        {/* column headers */}
        {DAYPART_LABELS.map((label, c) => (
          <text
            key={`col-${label}`}
            x={LABEL_COL_W + c * (CELL_W + GAP) + CELL_W / 2}
            y={HEADER_H - 8}
            textAnchor="middle"
            fontSize={11}
            fill="var(--chart-axis)"
          >
            {label}
          </text>
        ))}
        {DAY_LABELS.map((dayLabel, r) => (
          <g key={`row-${dayLabel}`}>
            {/* row label */}
            <text
              x={LABEL_COL_W - 10}
              y={HEADER_H + r * (CELL_H + GAP) + CELL_H / 2 + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--text-secondary)"
            >
              {dayLabel}
            </text>
            {DAYPART_LABELS.map((_, c) => {
              const intensity = intensityAt(r, c)
              const isBusiest = busiest != null && busiest.day === r && busiest.daypart === c
              return (
                <rect
                  key={`cell-${r}-${c}`}
                  data-cell="true"
                  data-day={r}
                  data-daypart={c}
                  data-intensity={Math.max(0, Math.min(3, Math.round(intensity)))}
                  data-busiest={isBusiest ? 'true' : undefined}
                  x={LABEL_COL_W + c * (CELL_W + GAP)}
                  y={HEADER_H + r * (CELL_H + GAP)}
                  width={CELL_W}
                  height={CELL_H}
                  rx={8}
                  fill={intensityFill(intensity)}
                  stroke={isBusiest ? 'var(--navy)' : 'transparent'}
                  strokeWidth={isBusiest ? 2 : 0}
                />
              )
            })}
          </g>
        ))}
      </svg>

      {/* Screen-reader equivalent: qualitative bands, never raw counts. */}
      <table className="sr-only">
        <caption>
          Busiest days and times by relative intensity band.
          {busiest != null
            ? ` Busiest: ${DAY_LABELS[busiest.day] ?? ''} ${DAYPART_LABELS[busiest.daypart] ?? ''}.`
            : ''}
        </caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {DAYPART_LABELS.map((label) => (
              <th key={`h-${label}`} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAY_LABELS.map((dayLabel, r) => (
            <tr key={`tr-${dayLabel}`}>
              <th scope="row">{dayLabel}</th>
              {DAYPART_LABELS.map((_, c) => (
                <td key={`td-${r}-${c}`}>{bandWord(intensityAt(r, c))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
