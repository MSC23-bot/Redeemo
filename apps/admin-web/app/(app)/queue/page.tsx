'use client'

/**
 * Approval queue page (B1: two-court fidelity).
 *
 * Gated on the `approval:read` capability. Renders one PENDING +
 * CHANGES_REQUESTED work list, grouped by two "courts" — Needs you / Awaiting
 * merchant — plus a History affordance for terminal-status approvals
 * (APPROVED / REJECTED / WITHDRAWN). Courts are a PRESENTATION grouping over
 * the existing status filter semantics: `useQueue`'s fetch (and its 45s poll)
 * is unchanged; History is a separate, lazily-fetched, unpolled read (an
 * archive view, not a live work list). Type chips (the 4 spec groups folded
 * from the real ApprovalType set) compose with whichever court is active, and
 * reset to "all" whenever the court tab changes.
 */
import { useState } from 'react'
import Link from 'next/link'
import { ClipboardList, Loader2, AlertCircle, UserPlus } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import { useQueue } from '@/lib/queue/useQueue'
import { useQueueHistory } from '@/lib/queue/useQueueHistory'
import { CourtTabs } from '@/features/queue/CourtTabs'
import { TypeChips } from '@/features/queue/TypeChips'
import { QueueTable } from '@/features/queue/QueueTable'
import { LastUpdated } from '@/features/queue/LastUpdated'
import { RefreshButton } from '@/features/queue/RefreshButton'
import { Button } from '@/components/ui/button'
import { inAwaitingMerchantTab, inNeedsYouTab, typeGroupOf } from '@/lib/ui/adminTones'
import type { CourtTabCounts } from '@/features/queue/CourtTabs'
import type { TypeChipCounts, TypeFilterValue } from '@/features/queue/TypeChips'
import type { CourtTabKey } from '@/lib/ui/adminTones'
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
      <AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden="true" />
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

// ── Type-chip counts, scoped to whatever row set is passed in ────────────────

function computeTypeCounts(items: AdminApproval[] | undefined): TypeChipCounts | undefined {
  if (items === undefined) return undefined
  const counts: TypeChipCounts = {
    all: items.length,
    onboarding: 0,
    voucher: 0,
    merchantEdit: 0,
    branchLifecycle: 0,
  }
  for (const item of items) {
    counts[typeGroupOf(item.type)] += 1
  }
  return counts
}

function filterByType(items: AdminApproval[], active: TypeFilterValue): AdminApproval[] {
  if (active === 'all') return items
  return items.filter((i) => typeGroupOf(i.type) === active)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function QueuePage() {
  const { ready, can, adminId } = useSession()
  const canRead = ready && can('approval:read')
  const { items, isLoading, isError, isFetching, refetch, dataUpdatedAt } = useQueue({
    enabled: canRead,
  })

  const [activeCourt, setActiveCourt] = useState<CourtTabKey>('needs')
  const [activeType, setActiveType] = useState<TypeFilterValue>('all')

  const history = useQueueHistory({ enabled: canRead && activeCourt === 'history' })

  if (!ready) {
    return <LoadingState />
  }

  if (!can('approval:read')) {
    return <ForbiddenState />
  }

  function handleCourtChange(court: CourtTabKey) {
    setActiveCourt(court)
    // approval-queue-spec.md §A.1 pt.3: selecting a court tab resets the type filter.
    setActiveType('all')
  }

  const needsItems = items.filter(inNeedsYouTab)
  const merchantItems = items.filter(inAwaitingMerchantTab)

  const courtCounts: CourtTabCounts = {
    needs: isLoading ? undefined : needsItems.length,
    merchant: isLoading ? undefined : merchantItems.length,
    history: history.hasLoaded ? history.items.length : undefined,
  }

  const activeCourtItems =
    activeCourt === 'needs' ? needsItems : activeCourt === 'merchant' ? merchantItems : history.items

  // History is loading/erroring independently of the live queue: the two
  // fetches are unrelated (one polls, one is a lazy archive read), so the
  // page's loading/error/retry all scope to whichever data source backs the
  // active court.
  const isCourtLoading = activeCourt === 'history' ? !history.hasLoaded && history.isLoading : isLoading
  const isCourtError = activeCourt === 'history' ? history.isError : isError
  const retryActiveCourt = activeCourt === 'history' ? history.refetch : refetch

  const typeCounts = computeTypeCounts(isCourtLoading ? undefined : activeCourtItems)
  const filteredItems = filterByType(activeCourtItems, activeType)

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
            One list across onboarding, voucher, merchant-edit and branch-lifecycle approvals.
            Oldest first; you judge priority, there is no countdown.
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

      {/* Two-court tabs + History */}
      <CourtTabs active={activeCourt} counts={courtCounts} onChange={handleCourtChange} />

      {/* Type chips — composed with whichever court is active. */}
      <TypeChips active={activeType} counts={typeCounts} onChange={setActiveType} />

      {/* Content */}
      {isCourtLoading ? (
        <LoadingState />
      ) : isCourtError ? (
        <ErrorState onRetry={retryActiveCourt} />
      ) : (
        <QueueTable
          items={filteredItems}
          currentAdminId={adminId}
          onClearFilter={activeType !== 'all' ? () => setActiveType('all') : undefined}
        />
      )}

      {filteredItems.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Read and triage only. Selecting a row opens it in Review / Actioner; no actions are
          taken here.
        </p>
      )}
    </div>
  )
}
