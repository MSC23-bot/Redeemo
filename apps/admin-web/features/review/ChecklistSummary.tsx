/**
 * ChecklistSummary — read-only go-live gate checklist.
 *
 * Shows whether the four onboarding gates pass. Green check when satisfied,
 * amber alert icon when not. Gates inform the decision but are not the whole
 * basis for it; the server re-checks them on approve.
 */
import type { ReviewChecklist } from '@/lib/api/review'
import { cn } from '@/lib/utils'

interface ChecklistSummaryProps {
  checklist: ReviewChecklist
}

interface GateRowProps {
  label: string
  complete: boolean
}

function GateRow({ label, complete }: GateRowProps) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-5 items-center justify-center rounded-full shrink-0 text-xs font-bold',
          complete
            ? 'bg-green-100 text-green-700'
            : 'bg-amber-100 text-amber-700'
        )}
      >
        {complete ? '✓' : '!'}
      </span>
      <span
        className={cn(
          'text-sm',
          complete ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {label}
      </span>
      <span className="sr-only">{complete ? 'Complete' : 'Incomplete'}</span>
    </div>
  )
}

export function ChecklistSummary({ checklist }: ChecklistSummaryProps) {
  const allComplete = checklist.all_complete

  return (
    <section aria-labelledby="checklist-heading" data-testid="checklist-summary">
      <h2 id="checklist-heading" className="text-sm font-semibold text-foreground mb-3">
        Go-live gates
      </h2>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="px-4 py-1">
          <GateRow label="Main branch added" complete={checklist.branch_created} />
          <GateRow label="Contract signed" complete={checklist.contract_signed} />
          <GateRow label="Mandatory vouchers configured (RMV-001 + RMV-002)" complete={checklist.rmv_configured} />
        </div>

        <div
          className={cn(
            'px-4 py-3 border-t border-border',
            allComplete
              ? 'bg-green-50'
              : 'bg-amber-50'
          )}
          data-testid="checklist-summary-row"
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex size-5 items-center justify-center rounded-full text-xs font-bold shrink-0',
                allComplete
                  ? 'bg-green-200 text-green-800'
                  : 'bg-amber-200 text-amber-800'
              )}
            >
              {allComplete ? '✓' : '!'}
            </span>
            <span
              className={cn(
                'text-sm font-medium',
                allComplete ? 'text-green-800' : 'text-amber-800'
              )}
            >
              {allComplete ? 'All gates passed' : 'Gates incomplete'}
            </span>
          </div>
        </div>

        <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border bg-secondary/20">
          Gates inform the decision; they are not the whole basis for it. The server re-checks them on approve.
        </p>
      </div>
    </section>
  )
}
