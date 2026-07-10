'use client'

/**
 * InboundPointerCard : Leads & Onboarding hub, SECTION 1(a) (C1, spec §A1 pt.1).
 *
 * A READ-ONLY pointer at the self-serve registration flow: merchants who
 * signed up themselves and are waiting for approval in the Approval Queue.
 * This card never lets an admin act on anything : it only shows the current
 * awaiting-review count and links out to /queue, where the existing queue
 * gating and actions apply.
 *
 * The count fetch is gated on `canReadApprovals` (mirrors `approval:read`,
 * the capability that already guards the approvals list elsewhere): when the
 * admin lacks it, the card shows an honest "Needs approval:read" note instead
 * of a live number rather than firing a request that is bound to 403 : the
 * link to /queue still renders (that page has its own gate).
 */
import Link from 'next/link'
import { Inbox, ArrowRight, Loader2 } from 'lucide-react'
import { Badge } from '@/features/shared/Badge'
import { Button } from '@/components/ui/button'

export interface InboundPointerCardProps {
  count: number | undefined
  isLoading: boolean
  isError: boolean
  canReadApprovals: boolean
}

export function InboundPointerCard({
  count,
  isLoading,
  isError,
  canReadApprovals,
}: InboundPointerCardProps) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-5"
      data-testid="leads-inbound-card"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"
          aria-hidden="true"
        >
          <Inbox className="size-4" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Inbound &middot; self-serve registrations
            </h3>
            <Badge tone="success">Live</Badge>
          </div>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Merchants who signed up on their own and are waiting for approval. They onboard
            themselves; you review and approve in the queue. This is a read-only pointer.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {!canReadApprovals ? (
          <span className="text-xs text-muted-foreground" data-testid="leads-inbound-count-restricted">
            Needs approval:read
          </span>
        ) : isLoading ? (
          <Loader2
            className="size-5 animate-spin text-muted-foreground"
            aria-label="Loading awaiting-review count"
          />
        ) : isError ? (
          <span className="text-sm text-muted-foreground" data-testid="leads-inbound-count-error">
            Count unavailable
          </span>
        ) : (
          <div className="text-right" data-testid="leads-inbound-count">
            <div className="text-2xl font-semibold leading-none text-foreground">{count ?? 0}</div>
            <div className="mt-1 text-xs text-muted-foreground">awaiting review</div>
          </div>
        )}

        <Link href="/queue" data-testid="leads-inbound-queue-link">
          <Button type="button" variant="outline" size="sm">
            View in queue
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </Link>
      </div>
    </div>
  )
}
