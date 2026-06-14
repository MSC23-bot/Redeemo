'use client'

/**
 * Approval queue page.
 *
 * Gated on the `approval:read` capability. Renders the work list (PENDING +
 * CHANGES_REQUESTED) with client-side status filter chips, urgency indicators,
 * and a manual refresh button. Auto-polls every 45 seconds.
 */
import { useState } from 'react'
import Link from 'next/link'
import { ClipboardList, Loader2, AlertCircle, UserPlus } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import { useQueue } from '@/lib/queue/useQueue'
import { StatusFilter } from '@/features/queue/StatusFilter'
import { QueueTable } from '@/features/queue/QueueTable'
import { LastUpdated } from '@/features/queue/LastUpdated'
import { RefreshButton } from '@/features/queue/RefreshButton'
import { Button } from '@/components/ui/button'
import type { StatusFilterValue } from '@/features/queue/StatusFilter'
import type { AdminApproval } from '@/lib/api/approvals'

// ── Forbidden state ───────────────────────────────────────────────────────────

function ForbiddenState() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mb-2 text-lg font-semibold text-foreground">Access denied</h2>
      <p className="text-sm text-muted-foreground">
        You do not have permission to view the approval queue. Contact your administrator.
      </p>
    </div>
  )
}

// ── Loading state ─────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

// ── Error state ───────────────────────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertCircle
        className="mx-auto mb-3 size-6 text-destructive"
        aria-hidden="true"
      />
      <p className="mb-4 text-sm text-destructive">
        Could not load the approval queue. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm font-medium text-primary hover:underline"
      >
        Retry
      </button>
    </div>
  )
}

// ── Filter helper ─────────────────────────────────────────────────────────────

function filterItems(items: AdminApproval[], active: StatusFilterValue): AdminApproval[] {
  if (active === 'all') return items
  if (active === 'submitted')
    return items.filter((i) => i.status === 'PENDING' && i.claimedById == null)
  if (active === 'underReview')
    return items.filter((i) => i.status === 'PENDING' && i.claimedById != null)
  if (active === 'changesRequested')
    return items.filter((i) => i.status === 'CHANGES_REQUESTED')
  return items
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function QueuePage() {
  const { ready, can, adminId } = useSession()
  const canRead = ready && can('approval:read')
  const { items, counts, isLoading, isError, isFetching, refetch, dataUpdatedAt } =
    useQueue({ enabled: canRead })
  const [activeFilter, setActiveFilter] = useState<StatusFilterValue>('all')

  if (!ready) {
    return <LoadingState />
  }

  if (!can('approval:read')) {
    return <ForbiddenState />
  }

  const filtered = filterItems(items, activeFilter)

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ClipboardList className="size-4" aria-hidden="true" />
            </span>
            <h1 className="text-xl font-semibold text-foreground">Approval queue</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Pending merchant onboarding and voucher submissions
          </p>
        </div>

        <div className="flex items-center gap-3">
          <LastUpdated dataUpdatedAt={dataUpdatedAt} />
          <RefreshButton onRefresh={refetch} isFetching={isFetching} />
          {can('merchant:create-draft') && (
            <Link href="/merchants/new" data-testid="create-draft-entry">
              <Button type="button" size="sm">
                <UserPlus className="size-4" aria-hidden="true" />
                Create merchant draft
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Status filter chips */}
      <StatusFilter active={activeFilter} counts={counts} onChange={setActiveFilter} />

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <QueueTable items={filtered} currentAdminId={adminId} />
      )}
    </div>
  )
}
