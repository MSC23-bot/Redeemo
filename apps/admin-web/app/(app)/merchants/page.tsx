'use client'

/**
 * Merchants directory page: /merchants (WP2).
 *
 * Gated on the `merchant:read` capability (the read route + this view + the nav
 * link). The per-row Suspend / Reactivate actions additionally gate on
 * `merchant:suspend`, so a read-only admin browses the directory without the
 * lifecycle buttons. Search is debounced; a status filter narrows the list;
 * pagination walks the pages. The suspend / reactivate dialogs are mounted at
 * page level keyed by the selected merchant (no approval context here, so the
 * dialogs run in their list-context mode and only invalidate the directory).
 *
 * Backend `requireAdminCapability` stays the enforcement; the client gate is UX.
 */
import { useEffect, useMemo, useState } from 'react'
import { Store, Loader2, AlertCircle, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import { useMerchantsList } from '@/lib/merchants/useMerchantsList'
import { MerchantsTable } from '@/features/merchants/MerchantsTable'
import { SuspendDialog } from '@/features/merchants/SuspendDialog'
import { ReactivateConfirm } from '@/features/merchants/ReactivateConfirm'
import { MERCHANT_STATUSES } from '@/lib/api/merchants'
import type { MerchantStatusFilter, MerchantSummary } from '@/lib/api/merchants'

const PAGE_SIZE = 20

const STATUS_OPTIONS: { value: '' | MerchantStatusFilter; label: string }[] = [
  { value: '', label: 'All statuses' },
  ...MERCHANT_STATUSES.map((s) => ({
    value: s,
    label:
      s === 'PENDING_APPROVAL'
        ? 'Pending approval'
        : s.charAt(0) + s.slice(1).toLowerCase(),
  })),
]

// ── States ──────────────────────────────────────────────────────────────────

function ForbiddenState() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center" data-testid="merchants-forbidden">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mb-2 text-lg font-semibold text-foreground">Access denied</h2>
      <p className="text-sm text-muted-foreground">
        You do not have permission to view the merchants directory. Contact your administrator.
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden="true" />
      <p className="mb-4 text-sm text-destructive">
        Could not load the merchants directory. Check your connection and try again.
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MerchantsPage() {
  const { ready, can } = useSession()
  const canRead = ready && can('merchant:read')
  const canSuspend = can('merchant:suspend')

  const [searchInput, setSearchInput] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [status, setStatus] = useState<'' | MerchantStatusFilter>('')
  const [page, setPage] = useState(1)

  // Debounce the search box (300ms) so each keystroke does not fire a request.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Any filter change resets to page 1.
  useEffect(() => {
    setPage(1)
  }, [debouncedQ, status])

  const filters = useMemo(
    () => ({
      q: debouncedQ || undefined,
      status: status || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedQ, status, page]
  )

  const { data, isLoading, isError, refetch } = useMerchantsList(filters, { enabled: canRead })

  // Dialog state: the merchant a lifecycle action targets + which action.
  const [dialog, setDialog] = useState<{ merchant: MerchantSummary; kind: 'suspend' | 'reactivate' } | null>(null)

  if (!ready) {
    return <LoadingState />
  }
  if (!can('merchant:read')) {
    return <ForbiddenState />
  }

  const merchants = data?.merchants ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function closeDialog() {
    setDialog(null)
  }
  function onDialogSuccess() {
    setDialog(null)
    void refetch()
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Store className="size-4" aria-hidden="true" />
            </span>
            <h1 className="text-xl font-semibold text-foreground">Merchants</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Search and review every merchant on the platform
          </p>
        </div>
      </div>

      {/* Search + status filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by business or trading name"
            aria-label="Search merchants"
            data-testid="merchants-search-input"
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as '' | MerchantStatusFilter)}
          aria-label="Filter by status"
          data-testid="merchants-status-filter"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <>
          <MerchantsTable
            items={merchants}
            canSuspend={canSuspend}
            onSuspend={(m) => setDialog({ merchant: m, kind: 'suspend' })}
            onReactivate={(m) => setDialog({ merchant: m, kind: 'reactivate' })}
          />

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {page} of {totalPages} · {total} {total === 1 ? 'merchant' : 'merchants'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  data-testid="merchants-prev-page"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  data-testid="merchants-next-page"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Lifecycle dialogs — list context (no approvalId → invalidates the directory only) */}
      {dialog?.kind === 'suspend' && (
        <SuspendDialog
          merchantId={dialog.merchant.id}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'reactivate' && (
        <ReactivateConfirm
          merchantId={dialog.merchant.id}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
    </div>
  )
}
