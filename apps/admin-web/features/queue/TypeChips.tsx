/**
 * TypeChips — "All" + the four spec type groups, composing WITH CourtTabs.
 *
 * Counts are scoped to whichever court tab is currently active (design
 * contract: approval-queue-spec.md §A.1 pt.4 "Counts are scoped to the
 * ACTIVE court tab"); the caller recomputes `counts` per active court and
 * resets `active` to 'all' whenever the court tab changes (spec: "Selecting
 * a tab also resets qFilter:'all'").
 *
 * Active-chip fill uses the existing navy `foreground` token (spec's
 * "navy fill" chipStyle) rather than the brand-red `primary` CourtTabs use —
 * a deliberate hierarchy cue (court = red accent, type = navy fill) built
 * entirely from tokens already in `app/globals.css`, no new colour.
 */
import { cn } from '@/lib/utils'
import { ALL_TYPE_GROUPS, TYPE_GROUP_LABEL } from '@/lib/ui/adminTones'
import type { TypeGroup } from '@/lib/ui/adminTones'

export type TypeFilterValue = 'all' | TypeGroup
export type TypeChipCounts = { all: number } & Record<TypeGroup, number>

interface TypeChipsProps {
  active: TypeFilterValue
  /** `undefined` (the whole set, not per-chip) renders every chip's loading skeleton. */
  counts: TypeChipCounts | undefined
  onChange: (value: TypeFilterValue) => void
}

export function TypeChips({ active, counts, onChange }: TypeChipsProps) {
  const chips: { value: TypeFilterValue; label: string; count: number | undefined }[] = [
    { value: 'all', label: 'All', count: counts?.all },
    ...ALL_TYPE_GROUPS.map((group) => ({
      value: group as TypeFilterValue,
      label: TYPE_GROUP_LABEL[group],
      count: counts?.[group],
    })),
  ]

  return (
    <div role="tablist" aria-label="Filter by type" className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const isActive = active === chip.value
        return (
          <button
            key={chip.value}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(chip.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            {chip.label}
            <span
              className={cn(
                'inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs leading-none',
                isActive ? 'bg-background/20 text-background' : 'bg-secondary text-muted-foreground'
              )}
            >
              {chip.count === undefined ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-block h-2.5 w-3 animate-pulse rounded-sm',
                    isActive ? 'bg-background/40' : 'bg-muted-foreground/30'
                  )}
                />
              ) : (
                chip.count
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
