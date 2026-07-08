'use client'

/**
 * M3 F1: the merchant Redemptions log surface. A merchant-wide, branch-aware log
 * of every redemption with branch / status / date-range / voucher-type / code
 * filters, pagination, and an Export CSV action. The primary action opens the
 * shared two-step Validate-a-code dialog (also reachable from the topbar).
 *
 * Privacy: every customer identity arrives pre-formatted as first name + last
 * initial from the API; this surface never receives or renders email/phone/PIN.
 */
import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LoadingStatus, SkeletonTable } from '@/components/ui/skeleton'
import { ScanLine, X, Info } from '@/lib/icons'
import { RedemptionsTable } from '@/components/redemptions/RedemptionsTable'
import { RedemptionFilters } from '@/components/redemptions/RedemptionFilters'
import { RedemptionDetail } from '@/components/redemptions/RedemptionDetail'
import { StatusPill } from '@/components/redemptions/StatusPill'
import { useValidateDialog } from '@/components/redemptions/validateDialogContext'
import {
  listRedemptions,
  downloadRedemptionsCsv,
  type RedemptionFilters as Filters,
  type RedemptionRow,
} from '@/lib/api/redemptions'
import { listBranches } from '@/lib/api/branch'
import { listCustomVouchers, listFlagshipVouchers } from '@/lib/api/voucher'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'

const PAGE_SIZE = 25

// The /vouchers surface is OWNER / BRANCH_MANAGER only (mirrors FULL_NAV_ROLES in
// components/shell/navItems.ts: /vouchers is NOT in the STAFF baseline). Redemptions
// itself is baseline-accessible to STAFF, so the drawer's "View voucher" link must
// be gated to full-nav viewers. Inlined (not imported from navItems) to avoid a
// cross-PR edit; fail closed on an absent/unknown role.
const FULL_NAV_ROLES = new Set(['OWNER', 'BRANCH_MANAGER'])

// Today's LOCAL calendar date serialized as UTC midnight - the exact shape a
// manual "From" pick produces (see RedemptionFilters), so display + query
// semantics match a hand-picked "today" in every timezone.
function todayFromIso(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}T00:00:00.000Z`
}

export default function RedemptionsPage() {
  const { openValidate } = useValidateDialog()
  const session = useSession()
  const profile = useMerchantProfile(session.isAuthenticated)
  const viewerRole = profile.data?.viewerCapabilities?.role ?? null
  const canViewVoucher = viewerRole !== null && FULL_NAV_ROLES.has(viewerRole)
  const searchParams = useSearchParams()
  // B-2: a /redemptions?voucherId=<id> deep-link (from the Voucher Detail "View
  // redemptions" link) seeds the filter so the log opens scoped to that voucher.
  const initialVoucherId = searchParams?.get('voucherId') ?? undefined
  // Shell wave: /redemptions?range=today (the topbar Quick Action) seeds the
  // From filter to today's LOCAL calendar date, serialized exactly the way a
  // manual "From" pick is (UTC midnight of that date, see RedemptionFilters) -
  // so the displayed date and the query semantics match a hand-picked "today".
  const rangeParam = searchParams?.get('range') ?? null
  const [filters, setFilters] = React.useState<Filters>(() => {
    if (initialVoucherId) return { voucherId: initialVoucherId }
    if (rangeParam === 'today') return { from: todayFromIso() }
    return {}
  })
  const [offset, setOffset] = React.useState(0)
  // The Quick Action must also work SAME-PAGE (fired while already on
  // /redemptions, page stays mounted). React only to the param TRANSITION to
  // 'today': the quick-action intent is "show today's redemptions", so it
  // REPLACES the current filter set and resets pagination. Because it fires on
  // the transition (tracked via ref), not on every render, it never overwrites
  // filters the user edits afterwards while the param sits unchanged in the URL.
  const lastRangeRef = React.useRef(rangeParam)
  React.useEffect(() => {
    if (rangeParam === 'today' && lastRangeRef.current !== 'today') {
      setFilters({ from: todayFromIso() })
      setOffset(0)
    }
    lastRangeRef.current = rangeParam
  }, [rangeParam])
  const [selected, setSelected] = React.useState<RedemptionRow | null>(null)
  const [exporting, setExporting] = React.useState(false)
  const [exportError, setExportError] = React.useState<string | null>(null)

  // The active query filters: the user-set filters plus pagination.
  const queryFilters = React.useMemo<Filters>(
    () => ({ ...filters, limit: PAGE_SIZE, offset }),
    [filters, offset],
  )

  const list = useQuery({
    queryKey: ['redemptions', queryFilters],
    queryFn: () => listRedemptions(queryFilters),
    staleTime: 30_000,
  })

  // Branches power the filter selector. A failure here is non-fatal (the filter
  // simply falls back to All branches), so its error is not surfaced.
  const branches = useQuery({
    queryKey: ['merchantBranches'],
    queryFn: listBranches,
    staleTime: 60_000,
  })

  // Redemptions fidelity: vouchers power the per-voucher filter (custom +
  // flagship merged, title-sorted). Same non-fatal contract as branches -
  // PARTIAL settlement (Codex round 2): one source failing must not discard
  // the other; both failing degrades to the empty-options hidden-select state.
  // Raw errors are never surfaced.
  const voucherOptions = useQuery({
    queryKey: ['merchantVoucherOptions'],
    queryFn: async () => {
      const settled = await Promise.allSettled([listFlagshipVouchers(), listCustomVouchers()])
      return settled
        .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
        .map((v) => ({ id: v.id, title: v.title }))
        .sort((a, b) => a.title.localeCompare(b.title))
    },
    staleTime: 60_000,
  })

  // A filter change resets pagination to the first page.
  function patchFilters(patch: Partial<Filters>) {
    setFilters((prev) => ({ ...prev, ...patch }))
    setOffset(0)
  }

  // B-2: drop the voucher deep-link filter (the removable chip). The voucherId key
  // is omitted entirely so the list query reverts to the merchant-wide log.
  function clearVoucherFilter() {
    setFilters((prev) => {
      const next = { ...prev }
      delete next.voucherId
      return next
    })
    setOffset(0)
  }

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      await downloadRedemptionsCsv(filters)
    } catch {
      setExportError('We could not export your redemptions just now. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const total = list.data?.total ?? 0
  const items = list.data?.items ?? []
  const branchOptions = branches.data ?? []
  const hasPrev = offset > 0
  const hasNext = offset + PAGE_SIZE < total
  // The awaiting-validation nudge counts the loaded rows on this page (there is
  // no server-side status aggregate; a full cross-page count would need a
  // backend total, which is out of scope for this presentation slice).
  const awaitingCount = items.filter((r) => r.status === 'AWAITING_VALIDATION').length

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold text-foreground">Redemptions</h1>
          <p className="text-sm text-muted-foreground">
            See and reconcile every voucher your customers have redeemed across your branches.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
          <Button variant="gradient" onClick={() => openValidate()}>
            <ScanLine size={16} /> Validate a code
          </Button>
        </div>
      </header>

      {exportError && (
        <div role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>
          {exportError}
        </div>
      )}

      {filters.voucherId ? (
        <button
          type="button"
          onClick={clearVoucherFilter}
          className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#E20C04]/30 bg-[#E20C04]/10 px-3 py-1 text-[13px] font-semibold text-[#E20C04] hover:bg-[#E20C04]/15"
        >
          Filtered to this voucher
          <X size={14} aria-hidden />
          <span className="sr-only">Clear the voucher filter</span>
        </button>
      ) : null}

      <RedemptionFilters filters={filters} branches={branchOptions} vouchers={voucherOptions.data ?? []} onChange={patchFilters} />

      {/* Definition cards: what each status means (Reversed is intentionally
          omitted; there is no reversed state in the schema). */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <StatusPill status="AWAITING_VALIDATION" />
          <p className="text-sm text-muted-foreground">
            The customer redeemed in the app and has a code. It has not been validated yet.
          </p>
        </div>
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <StatusPill status="VALIDATED" />
          <p className="text-sm text-muted-foreground">
            Staff confirmed the code, by QR scan in person or by entering the code, at the counter
            or later.
          </p>
        </div>
      </div>

      {awaitingCount > 0 && (
        <div
          className="flex items-start gap-3 rounded-xl border px-4 py-3"
          style={{ borderColor: 'rgba(1,12,53,0.12)', background: 'rgba(1,12,53,0.03)' }}
        >
          <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-navy" />
          <p className="text-sm text-foreground">
            <span className="font-semibold">
              {awaitingCount} {awaitingCount === 1 ? 'code is' : 'codes are'} awaiting validation.
            </span>{' '}
            Validate each one when staff confirm it, at the counter or later from a code your team
            noted down.
          </p>
        </div>
      )}

      {list.isLoading ? (
        <LoadingStatus label="Loading your redemptions...">
          <SkeletonTable rows={6} columns={7} />
        </LoadingStatus>
      ) : list.isError ? (
        <Card>
          <div role="alert" className="space-y-3 px-6">
            <p className="text-sm text-foreground">We could not load your redemptions.</p>
            <Button variant="secondary" onClick={() => list.refetch()}>
              Try again
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <RedemptionsTable rows={items} onRowClick={setSelected} />
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {items.length === 0 ? 0 : offset + 1} to {offset + items.length} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!hasPrev}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!hasNext}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {selected && (
        <RedemptionDetail
          row={selected}
          onClose={() => setSelected(null)}
          canViewVoucher={canViewVoucher}
        />
      )}
    </div>
  )
}
