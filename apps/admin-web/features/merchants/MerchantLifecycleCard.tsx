'use client'

/**
 * MerchantLifecycleCard: sidebar control for suspend / reactivate.
 *
 * Gated on can('merchant:suspend') by the parent (this component assumes the
 * capability has already been checked; it renders the affordance only).
 * The action shown depends on the live merchant status:
 *
 *   ACTIVE     -> "Suspend merchant" (danger tone) -> onSuspend()
 *   SUSPENDED  -> "Reactivate merchant"            -> onReactivate()
 *   otherwise  -> no action; a calm current-status label
 *
 * Backend enforcement stays defence-in-depth; this is UI gating only.
 */
import { Badge } from '@/features/shared/Badge'
import { Button } from '@/components/ui/button'
import type { BadgeTone } from '@/features/shared/Badge'

interface MerchantLifecycleCardProps {
  status: string
  onSuspend: () => void
  onReactivate: () => void
}

function statusTone(status: string): BadgeTone {
  if (status === 'ACTIVE') return 'success'
  if (status === 'SUSPENDED') return 'danger'
  if (status === 'PENDING_APPROVAL') return 'warn'
  return 'neutral'
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'Active',
    SUSPENDED: 'Suspended',
    PENDING_APPROVAL: 'Pending approval',
    REGISTERED: 'Registered',
    INACTIVE: 'Inactive',
    DELETED: 'Deleted',
  }
  return map[status] ?? status
}

export function MerchantLifecycleCard({
  status,
  onSuspend,
  onReactivate,
}: MerchantLifecycleCardProps) {
  return (
    <section aria-labelledby="lifecycle-heading" data-testid="merchant-lifecycle-card">
      <h2 id="lifecycle-heading" className="mb-3 text-sm font-semibold text-foreground">
        Merchant lifecycle
      </h2>

      <div className="space-y-3 rounded-lg border border-border bg-card px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Current status</span>
          <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
        </div>

        {status === 'ACTIVE' && (
          <>
            <p className="text-xs text-muted-foreground">
              Suspending stops this merchant&apos;s offers and signs out their team immediately.
            </p>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onSuspend}
              data-testid="lifecycle-suspend-btn"
            >
              Suspend merchant
            </Button>
          </>
        )}

        {status === 'SUSPENDED' && (
          <>
            <p className="text-xs text-muted-foreground">
              Reactivating restores this merchant&apos;s access and offers.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={onReactivate}
              data-testid="lifecycle-reactivate-btn"
            >
              Reactivate merchant
            </Button>
          </>
        )}

        {status !== 'ACTIVE' && status !== 'SUSPENDED' && (
          <p className="text-xs text-muted-foreground" data-testid="lifecycle-no-action">
            No lifecycle action is available for this merchant yet.
          </p>
        )}
      </div>
    </section>
  )
}
