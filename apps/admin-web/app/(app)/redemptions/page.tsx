'use client'

/**
 * D67: read-only admin redemptions list.
 * (docs/superpowers/plans/2026-07-09-d67-admin-redemption-visibility.md)
 *
 * Gated on the `redemption:read` capability. Cross-merchant, LIST-ONLY: no
 * detail page, no CSV export (D67-b); the row carries what the staging-
 * acceptance walk needs). Filters: status (All / Awaiting / Validated), a code
 * search (redemption code prefix OR voucher title, submit on Enter), and an
 * "Include test data" toggle that defaults ON (D67-c: this ops view exists to
 * verify redemptions during the staging-acceptance walk, where the rows being
 * verified ARE test rows; hiding them by default would defeat the feature).
 *
 * A3: the table / status chips / filter bar / pager now live in
 * features/redemptions/ so the per-merchant Merchant 360 Redemptions tab composes
 * the SAME presentation. This page keeps the Merchant column (cross-merchant) and
 * every behaviour + test id unchanged.
 */
import { useEffect, useMemo, useState } from 'react'
import { Receipt, Loader2 } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import { useRedemptions } from '@/lib/redemptions/useRedemptions'
import { RedemptionsFilterBar } from '@/features/redemptions/RedemptionsFilterBar'
import { RedemptionsTable } from '@/features/redemptions/RedemptionsTable'
import { RedemptionsPagination } from '@/features/redemptions/RedemptionsPagination'
import { ForbiddenState } from '@/features/shared/ForbiddenState'
import { ErrorState } from '@/features/shared/ErrorState'
import type { StatusChipValue } from '@/features/redemptions/StatusChips'

const PAGE_SIZE = 25

// ── States ──────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RedemptionsPage() {
  const { ready, can } = useSession()
  const canRead = ready && can('redemption:read')

  const [statusFilter, setStatusFilter] = useState<StatusChipValue>('all')
  const [codeInput, setCodeInput] = useState('')
  const [submittedCode, setSubmittedCode] = useState('')
  const [includeTest, setIncludeTest] = useState(true)
  const [offset, setOffset] = useState(0)

  // Any filter change resets to the first page.
  useEffect(() => {
    setOffset(0)
  }, [statusFilter, submittedCode, includeTest])

  const filters = useMemo(
    () => ({
      status: statusFilter === 'all' ? undefined : statusFilter,
      code: submittedCode || undefined,
      includeTest,
      limit: PAGE_SIZE,
      offset,
    }),
    [statusFilter, submittedCode, includeTest, offset]
  )

  const { data, isLoading, isError, refetch } = useRedemptions(filters, { enabled: canRead })

  if (!ready) {
    return <LoadingState />
  }
  if (!can('redemption:read')) {
    return (
      <ForbiddenState
        heading="You do not have access to redemptions."
        capability="redemption:read"
        testId="redemptions-forbidden"
      />
    )
  }

  const items = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Receipt className="size-4" aria-hidden="true" />
            </span>
            <h1 className="text-xl font-semibold text-foreground">Redemptions</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Cross-merchant, read-only visibility of every voucher redemption
          </p>
        </div>
      </div>

      {/* Filters */}
      <RedemptionsFilterBar
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        codeInput={codeInput}
        onCodeInputChange={setCodeInput}
        onCodeSubmit={setSubmittedCode}
        includeTest={includeTest}
        onIncludeTestChange={setIncludeTest}
      />

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState subject="redemptions" onRetry={refetch} testId="redemptions-error" />
      ) : (
        <>
          <RedemptionsTable items={items} />
          <RedemptionsPagination
            offset={offset}
            total={total}
            pageSize={PAGE_SIZE}
            onPrev={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            onNext={() => setOffset((o) => (o + PAGE_SIZE < total ? o + PAGE_SIZE : o))}
          />
        </>
      )}
    </div>
  )
}
