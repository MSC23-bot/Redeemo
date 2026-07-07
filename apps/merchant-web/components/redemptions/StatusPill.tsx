'use client'

/**
 * Redemptions status pill with a leading glyph (prototype fidelity):
 *   - VALIDATED           -> a success tick (Check SVG) + green pill.
 *   - AWAITING_VALIDATION -> a caution dot + amber pill.
 * No emoji; the glyphs are SVG / a CSS dot. Shared by the log table and the
 * detail drawer so both surfaces read identically.
 */
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Check } from '@/lib/icons'
import { statusLabel } from '@/lib/redemptions/display'
import type { RedemptionRow } from '@/lib/api/redemptions'

export function StatusPill({ status }: { status: RedemptionRow['status'] }) {
  if (status === 'VALIDATED') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
        style={{ background: 'rgba(15,122,62,0.10)', color: 'var(--success)' }}
      >
        <Check size={11} strokeWidth={3} aria-hidden="true" />
        {statusLabel(status)}
      </span>
    )
  }
  return (
    <Badge variant="caution" className="gap-1">
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor' }}
      />
      {statusLabel(status)}
    </Badge>
  )
}
