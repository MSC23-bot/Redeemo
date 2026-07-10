'use client'

/**
 * StatusChips: All / Awaiting / Validated filter chips for the redemptions list.
 * Extracted from the global /redemptions page (D67) so the per-merchant Merchant
 * 360 Redemptions tab (A3) shares one chip control. Presentational only; the
 * caller owns the active value + change handler.
 */
import { cn } from '@/lib/utils'
import type { RedemptionStatusFilter } from '@/lib/api/redemptions'

export type StatusChipValue = 'all' | RedemptionStatusFilter

const CHIPS: { value: StatusChipValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'awaiting', label: 'Awaiting' },
  { value: 'validated', label: 'Validated' },
]

export function StatusChips({
  active,
  onChange,
}: {
  active: StatusChipValue
  onChange: (value: StatusChipValue) => void
}) {
  return (
    <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-2">
      {CHIPS.map((chip) => (
        <button
          key={chip.value}
          role="tab"
          type="button"
          aria-selected={active === chip.value}
          onClick={() => onChange(chip.value)}
          className={cn(
            'inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            active === chip.value
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}
