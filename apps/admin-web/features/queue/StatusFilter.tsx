/**
 * StatusFilter — 4 chip tabs for the queue work list.
 *
 * Chips: All, Submitted, Under review, Changes requested.
 * Each chip shows its count. Clicking calls onChange with the new active value.
 *
 * `counts` is optional: pass `undefined` while the first fetch is in flight so
 * the chips render with a subtle skeleton in place of the numbers, rather than
 * flashing 0/0/0/0 before the data lands.
 */
import { cn } from '@/lib/utils'
import type { QueueCounts } from '@/lib/queue/useQueue'

export type StatusFilterValue = 'all' | 'submitted' | 'underReview' | 'changesRequested'

interface StatusFilterProps {
  active: StatusFilterValue
  counts: QueueCounts | undefined
  onChange: (value: StatusFilterValue) => void
}

interface Chip {
  value: StatusFilterValue
  label: string
  /** Undefined while counts are loading -> render the skeleton placeholder. */
  count: number | undefined
}

export function StatusFilter({ active, counts, onChange }: StatusFilterProps) {
  const chips: Chip[] = [
    { value: 'all', label: 'All', count: counts?.all },
    { value: 'submitted', label: 'Submitted', count: counts?.submitted },
    { value: 'underReview', label: 'Under review', count: counts?.underReview },
    {
      value: 'changesRequested',
      label: 'Changes requested',
      count: counts?.changesRequested,
    },
  ]

  return (
    <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.value}
          role="tab"
          type="button"
          aria-selected={active === chip.value}
          onClick={() => onChange(chip.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            active === chip.value
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'
          )}
        >
          {chip.label}
          <span
            className={cn(
              'inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs leading-none',
              active === chip.value
                ? 'bg-primary-foreground/20 text-primary-foreground'
                : 'bg-secondary text-muted-foreground'
            )}
          >
            {chip.count === undefined ? (
              <span
                aria-hidden="true"
                className={cn(
                  'inline-block h-2.5 w-3 animate-pulse rounded-sm',
                  active === chip.value ? 'bg-primary-foreground/40' : 'bg-muted-foreground/30'
                )}
              />
            ) : (
              chip.count
            )}
          </span>
        </button>
      ))}
    </div>
  )
}
