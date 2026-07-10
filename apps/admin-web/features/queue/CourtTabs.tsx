/**
 * CourtTabs — the two-court queue tab strip + the History affordance.
 *
 * "Needs you" (status PENDING, including claimed rows) / "Awaiting merchant"
 * (status CHANGES_REQUESTED) are PRESENTATION groupings over the existing
 * status filter semantics — no new API filter, no new state (design contract:
 * approval-queue-spec.md §A.1 pt.3). "History" is a B1 task-brief addition
 * (not in the design spec) so terminal-status approvals stay reachable once
 * the default view narrows to the two live courts.
 *
 * `counts[key] === undefined` renders a loading-skeleton placeholder in place
 * of the number, same convention as the pill of the old StatusFilter this
 * replaces — never flash a misleading 0 before data lands.
 */
import { cn } from '@/lib/utils'
import { COURT_TAB_LABEL } from '@/lib/ui/adminTones'
import type { CourtTabKey } from '@/lib/ui/adminTones'

export type CourtTabCounts = Record<CourtTabKey, number | undefined>

interface CourtTabsProps {
  active: CourtTabKey
  counts: CourtTabCounts
  onChange: (key: CourtTabKey) => void
}

const TAB_ORDER: CourtTabKey[] = ['needs', 'merchant', 'history']

export function CourtTabs({ active, counts, onChange }: CourtTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Approval queue courts"
      className="flex gap-6 border-b border-border"
    >
      {TAB_ORDER.map((key) => {
        const isActive = active === key
        const count = counts[key]
        return (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={cn(
              'flex items-center gap-2 border-b-2 pb-3 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive
                ? 'border-primary font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {COURT_TAB_LABEL[key]}
            <span
              className={cn(
                'inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs leading-none',
                isActive ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
              )}
            >
              {count === undefined ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-block h-2.5 w-3 animate-pulse rounded-sm',
                    isActive ? 'bg-primary/30' : 'bg-muted-foreground/30'
                  )}
                />
              ) : (
                count
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
