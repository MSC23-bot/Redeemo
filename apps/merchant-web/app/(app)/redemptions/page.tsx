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
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScanLine } from '@/lib/icons'
import { RedemptionsTable } from '@/components/redemptions/RedemptionsTable'
import { RedemptionFilters } from '@/components/redemptions/RedemptionFilters'
import { RedemptionDetail } from '@/components/redemptions/RedemptionDetail'
import { useValidateDialog } from '@/components/redemptions/validateDialogContext'
import {
  listRedemptions,
  downloadRedemptionsCsv,
  type RedemptionFilters as Filters,
  type RedemptionRow,
} from '@/lib/api/redemptions'
import { listBranches } from '@/lib/api/branch'

const PAGE_SIZE = 25

export default function RedemptionsPage() {
  const { openValidate } = useValidateDialog()
  const [filters, setFilters] = React.useState<Filters>({})
  const [offset, setOffset] = React.useState(0)
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

  // A filter change resets pagination to the first page.
  function patchFilters(patch: Partial<Filters>) {
    setFilters((prev) => ({ ...prev, ...patch }))
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
          <Button variant="navy" onClick={openValidate}>
            <ScanLine size={16} /> Validate a code
          </Button>
        </div>
      </header>

      {exportError && (
        <div role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>
          {exportError}
        </div>
      )}

      <RedemptionFilters filters={filters} branches={branchOptions} onChange={patchFilters} />

      {list.isLoading ? (
        <Card>
          <div role="status" aria-live="polite" className="px-6 text-sm text-muted-foreground">
            Loading your redemptions...
          </div>
        </Card>
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

      {selected && <RedemptionDetail row={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
