import * as React from 'react'

export type LifecycleState =
  | 'setup' | 'submitted' | 'in_review' | 'changes' | 'live' | 'live_new' | 'suspended' | 'rejected'

interface PillStyle { label: string; dot: string; bg: string; fg: string; pulse?: boolean }

const STATUS: Record<LifecycleState, PillStyle> = {
  setup:     { label: 'Setting up',        dot: '#9CA3AF', bg: '#F3F4F6', fg: '#4B5563' },
  submitted: { label: 'Submitted',         dot: '#0E7490', bg: '#ECFEFF', fg: '#0E7490' },
  in_review: { label: 'In review',         dot: '#0E7490', bg: '#ECFEFF', fg: '#0E7490' },
  changes:   { label: 'Changes needed',    dot: '#B45309', bg: '#FEF6EC', fg: '#B45309' },
  live:      { label: 'Live',              dot: '#0F7A3E', bg: '#E9F7EF', fg: '#0F7A3E', pulse: true },
  live_new:  { label: 'Live, just started',dot: '#0F7A3E', bg: '#E9F7EF', fg: '#0F7A3E', pulse: true },
  suspended: { label: 'Suspended',         dot: '#B91C1C', bg: '#FEECEC', fg: '#B91C1C' },
  rejected:  { label: 'Not approved',      dot: '#B91C1C', bg: '#FEECEC', fg: '#B91C1C' },
}

/**
 * Sidebar business-status pill (prototype-faithful two-line variant): a
 * "BUSINESS STATUS" micro-label over the status text, with the lifecycle dot.
 * `dotOnly` renders just the (centred) dot for the collapsed 72px icon rail.
 */
export function StatusPill({ state = 'setup', dotOnly = false }: { state?: LifecycleState; dotOnly?: boolean }) {
  const st = STATUS[state]
  const dot = (
    <span
      aria-hidden
      style={{
        width: dotOnly ? 10 : 8, height: dotOnly ? 10 : 8, borderRadius: 999, background: st.dot,
        flexShrink: 0,
        animation: st.pulse ? 'rdmoPulse 2.2s infinite' : undefined,
      }}
    />
  )
  if (dotOnly) {
    return (
      <span
        role="img"
        aria-label={`Business status: ${st.label}`}
        title={st.label}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 34, borderRadius: 13, background: st.bg,
        }}
      >
        {dot}
      </span>
    )
  }
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 9,
        padding: '7px 13px', borderRadius: 13, background: st.bg, color: st.fg,
        fontFamily: 'var(--font-body)',
      }}
    >
      {dot}
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.65 }}>
          Business status
        </span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{st.label}</span>
      </span>
    </span>
  )
}
