'use client'

/**
 * RedemptionsTab: the per-merchant slice of the D67 admin redemptions list
 * (spec merchant-360-spec.md, Tab 6). Zero backend work: it embeds the existing
 * `GET /admin/redemptions` scoped with `merchantId`, reusing the shared
 * features/redemptions/ table + filter bar + pager. The Merchant column is hidden
 * (every row is this merchant); a "View all redemptions" link crosses over to the
 * global cross-merchant page.
 *
 * Fail-closed capability gate: the list read is enforced on `redemption:read` by
 * the backend (same as the global page). An admin with `merchant:read` and NOT
 * `redemption:read` must not fire the request, so this tab renders a denied panel
 * that names the capability and passes `enabled=false` down (UI-gate + never-fire).
 * The merchantId is ALWAYS pinned into the filters (scope safety).
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowUpRight } from 'lucide-react'
import { useRedemptions } from '@/lib/redemptions/useRedemptions'
import { RedemptionsFilterBar } from '@/features/redemptions/RedemptionsFilterBar'
import { RedemptionsTable } from '@/features/redemptions/RedemptionsTable'
import { RedemptionsPagination } from '@/features/redemptions/RedemptionsPagination'
import { ForbiddenState } from '@/features/shared/ForbiddenState'
import { ErrorState } from '@/features/shared/ErrorState'
import type { StatusChipValue } from '@/features/redemptions/StatusChips'

const PAGE_SIZE = 25

interface RedemptionsTabProps {
  merchantId: string
  canReadRedemptions: boolean
}

export function RedemptionsTab({ merchantId, canReadRedemptions }: RedemptionsTabProps) {
  const [statusFilter, setStatusFilter] = useState<StatusChipValue>('all')
  const [codeInput, setCodeInput] = useState('')
  const [submittedCode, setSubmittedCode] = useState('')
  const [includeTest, setIncludeTest] = useState(true)
  const [offset, setOffset] = useState(0)

  // Any filter change resets to the first page.
  useEffect(() => {
    setOffset(0)
  }, [statusFilter, submittedCode, includeTest])

  // merchantId is ALWAYS pinned (per-merchant scope; never a cross-merchant read).
  const filters = useMemo(
    () => ({
      merchantId,
      status: statusFilter === 'all' ? undefined : statusFilter,
      code: submittedCode || undefined,
      includeTest,
      limit: PAGE_SIZE,
      offset,
    }),
    [merchantId, statusFilter, submittedCode, includeTest, offset]
  )

  // Hooks run unconditionally (rules of hooks); `enabled` fail-closes the request
  // when the admin lacks redemption:read, so a denied admin never fires it.
  const { data, isLoading, isError, refetch } = useRedemptions(filters, {
    enabled: canReadRedemptions,
  })

  if (!canReadRedemptions) {
    return (
      <ForbiddenState
        variant="section"
        heading="Redemptions"
        subject="this merchant's redemptions"
        capability="redemption:read"
        testId="workspace-redemptions-denied"
      />
    )
  }

  const items = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <div className="space-y-4" data-testid="workspace-redemptions">
      {/* Header + cross-link to the global list */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Redemptions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This merchant&apos;s redemption history (read-only). Per-merchant aggregation and
            role-gated customer identity are still to build (a later slice).
          </p>
        </div>
        <Link
          href="/redemptions"
          data-testid="redemptions-view-all-link"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View all redemptions
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <RedemptionsFilterBar
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        codeInput={codeInput}
        onCodeInputChange={setCodeInput}
        onCodeSubmit={setSubmittedCode}
        includeTest={includeTest}
        onIncludeTestChange={setIncludeTest}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
        </div>
      ) : isError ? (
        <ErrorState subject="redemptions" onRetry={refetch} testId="workspace-redemptions-error" />
      ) : (
        <>
          <RedemptionsTable items={items} hideMerchantColumn />
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
