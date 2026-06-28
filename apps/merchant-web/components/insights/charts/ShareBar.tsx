/**
 * PR-B Task B2: ShareBar - a single horizontal stacked bar for the "by voucher type"
 * share (segments sum to 100% over the logged denominator), with a per-type legend.
 * Hand-rolled SVG, no charting dependency.
 *
 * Segment widths are proportional to each segment's share of the total of the
 * provided values, so the caller can pass either raw shares (that sum to ~100) or
 * raw counts and the widths stay proportional either way.
 *
 * Accessibility: role="img" SVG with a summarising aria-label plus a visually-hidden
 * <table> carrying each label and its percentage. No essential animation.
 */
import { cn } from '@/lib/utils'

export interface ShareSegment {
  label: string
  /** The segment's share (or raw count); widths are computed proportionally. */
  value: number
  /** Optional explicit fill (CSS var() or colour); defaults to the palette ramp. */
  color?: string
}

export interface ShareBarProps {
  segments: ShareSegment[]
  className?: string
}

/**
 * A functional, distinct palette for stacked segments. These reuse the voucher-type
 * accent tokens (already functional, non-CTA colours) so a segment per type reads
 * consistently with the rest of the surface; they cycle if there are more segments
 * than tokens.
 */
const PALETTE = [
  'var(--vt-bogo)',
  'var(--vt-freebie)',
  'var(--vt-reusable)',
  'var(--vt-spendsave)',
  'var(--vt-package)',
  'var(--vt-timelimited)',
  'var(--vt-discount)',
]

const VIEW_W = 720
const BAR_H = 16

export function ShareBar({ segments, className }: ShareBarProps) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0)
  if (segments.length === 0 || total <= 0) {
    return (
      <div
        className={cn('flex h-12 items-center text-sm', className)}
        style={{ color: 'var(--text-tertiary)' }}
      >
        No data for this selection yet.
      </div>
    )
  }

  const withPct = segments.map((s, i) => ({
    ...s,
    pct: (Math.max(0, s.value) / total) * 100,
    fill: s.color ?? PALETTE[i % PALETTE.length],
  }))

  const ariaLabel =
    'Share of redemptions by voucher type. ' +
    withPct.map((s) => `${s.label}: ${Math.round(s.pct)} percent`).join('. ') +
    '.'

  // Build the cumulative x offsets for the stacked bar.
  let cursor = 0

  return (
    <div className={cn('w-full', className)}>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${VIEW_W} ${BAR_H}`}
        width="100%"
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        {withPct.map((s, i) => {
          const w = (s.pct / 100) * VIEW_W
          const x = cursor
          cursor += w
          return (
            <rect
              key={`${s.label}-${i}`}
              data-segment="true"
              data-label={s.label}
              x={x}
              y={0}
              width={w}
              height={BAR_H}
              fill={s.fill}
            />
          )
        })}
      </svg>

      {/* Legend. */}
      <ul className="mt-3 flex flex-col gap-1.5" aria-hidden="true">
        {withPct.map((s, i) => (
          <li key={`legend-${s.label}-${i}`} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 3,
                background: s.fill,
                flex: '0 0 auto',
              }}
            />
            <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
              {s.label}
            </span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {Math.round(s.pct)}%
            </span>
          </li>
        ))}
      </ul>

      {/* Screen-reader equivalent. */}
      <table className="sr-only">
        <caption>Share of redemptions by voucher type.</caption>
        <thead>
          <tr>
            <th scope="col">Voucher type</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {withPct.map((s, i) => (
            <tr key={`row-${s.label}-${i}`}>
              <th scope="row">{s.label}</th>
              <td>{Math.round(s.pct)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
