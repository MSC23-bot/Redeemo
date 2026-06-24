'use client'

// Branches PR-1 F13: the shared disabled "coming in this Branches rollout" control.
// Every not-yet-safe Branches action (Add branch, Close branch, Opening-hours Edit,
// Multi-window, Redemption alerts, Live map / business lookup) renders through this so
// the UI matches the prototype while performing NO behaviour: the control is visually
// present, DISABLED, and forwards no onClick / never reaches the network.
//
// SCOPE / SECURITY (plan §6 #5): a locked affordance must read as intentionally
// "coming soon", never as a broken or wired-but-failing control. There is deliberately
// NO onClick prop on this component, so a caller cannot accidentally attach behaviour.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { Lock } from '@/lib/icons'

const ROLLOUT_COPY = 'Coming in this Branches rollout'

export function LockedAffordance({
  label,
  icon,
  variant = 'secondary',
  subtext = true,
  className,
  testId,
}: {
  label: string
  icon?: React.ReactNode
  // 'secondary' = a calm bordered pill (default); 'gradient' = the primary-styled CTA
  // used for the Add-branch / close-style controls; 'link' = an inline text affordance
  // (e.g. an Edit pencil that must look like the live Edit controls but stay disabled).
  variant?: 'secondary' | 'gradient' | 'link'
  // When false, only the title tooltip carries the rollout note (no visible subtext).
  subtext?: boolean
  className?: string
  testId?: string
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 font-semibold transition-colors disabled:cursor-not-allowed'

  const variantClass =
    variant === 'gradient'
      ? 'rounded-[12px] px-4 py-2 text-sm text-white opacity-60'
      : variant === 'link'
        ? 'text-sm opacity-50'
        : 'rounded-full px-3 py-1.5 text-[13px] opacity-60'

  const variantStyle: React.CSSProperties =
    variant === 'gradient'
      ? { background: 'linear-gradient(90deg, var(--rose), var(--coral, #E84A00))' }
      : variant === 'link'
        ? { color: 'var(--text-tertiary)' }
        : { background: 'var(--page)', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)' }

  return (
    <span className={`inline-flex flex-col gap-1 ${variant === 'gradient' ? 'items-end' : 'items-start'} ${className ?? ''}`}>
      <button
        type="button"
        disabled
        title={ROLLOUT_COPY}
        aria-label={`${label} (${ROLLOUT_COPY.toLowerCase()})`}
        data-testid={testId}
        className={`${base} ${variantClass}`}
        style={variantStyle}
      >
        {icon ?? <Lock size={14} aria-hidden />} {label}
      </button>
      {subtext ? <span className="text-[11px] text-muted-foreground">{ROLLOUT_COPY}</span> : null}
    </span>
  )
}
