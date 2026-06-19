import * as React from 'react'

export type LifecycleState =
  | 'setup' | 'submitted' | 'in_review' | 'changes' | 'live' | 'live_new' | 'suspended'

interface PillStyle { label: string; dot: string; bg: string; fg: string; pulse?: boolean }

const STATUS: Record<LifecycleState, PillStyle> = {
  setup:     { label: 'Setting up',        dot: '#9CA3AF', bg: '#F3F4F6', fg: '#4B5563' },
  submitted: { label: 'Submitted',         dot: '#0E7490', bg: '#ECFEFF', fg: '#0E7490' },
  in_review: { label: 'In review',         dot: '#0E7490', bg: '#ECFEFF', fg: '#0E7490' },
  changes:   { label: 'Changes needed',    dot: '#B45309', bg: '#FEF6EC', fg: '#B45309' },
  live:      { label: 'Live',              dot: '#0F7A3E', bg: '#E9F7EF', fg: '#0F7A3E', pulse: true },
  live_new:  { label: 'Live, just started',dot: '#0F7A3E', bg: '#E9F7EF', fg: '#0F7A3E', pulse: true },
  suspended: { label: 'Suspended',         dot: '#B91C1C', bg: '#FEECEC', fg: '#B91C1C' },
}

/**
 * Sidebar business-status pill. M0 renders a static, prop-driven default; the live
 * state source (server merchant.status) is wired in a later milestone (M7).
 */
export function StatusPill({ state = 'setup' }: { state?: LifecycleState }) {
  const st = STATUS[state]
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', borderRadius: 13, background: st.bg, color: st.fg,
        fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)',
      }}
    >
      <span
        style={{
          width: 8, height: 8, borderRadius: 999, background: st.dot,
          animation: st.pulse ? 'rdmoPulse 2.2s infinite' : undefined,
        }}
      />
      {st.label}
    </span>
  )
}
