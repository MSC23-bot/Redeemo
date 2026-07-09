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
 */
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Receipt, Loader2, AlertCircle, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import { useRedemptions } from '@/lib/redemptions/useRedemptions'
import { Badge } from '@/features/shared/Badge'
import { cn } from '@/lib/utils'
import type { BadgeTone } from '@/features/shared/Badge'
import type { AdminRedemptionRow, RedemptionStatusFilter } from '@/lib/api/redemptions'

const PAGE_SIZE = 25

// ── States ──────────────────────────────────────────────────────────────────

function ForbiddenState() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center" data-testid="redemptions-forbidden">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mb-2 text-lg font-semibold text-foreground">Access denied</h2>
      <p className="text-sm text-muted-foreground">
        You do not have permission to view redemptions. Contact your administrator.
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
        Could not load redemptions. Check your connection and try again.
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

// ── Status filter chips ───────────────────────────────────────────────────────

type StatusChipValue = 'all' | RedemptionStatusFilter

function StatusChips({
  active,
  onChange,
}: {
  active: StatusChipValue
  onChange: (value: StatusChipValue) => void
}) {
  const chips: { value: StatusChipValue; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'awaiting', label: 'Awaiting' },
    { value: 'validated', label: 'Validated' },
  ]
  return (
    <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.value}
          role="tab"
          type="button"
          aria-selected={active === chip.value}
          onClick={() => onChange(chip.value)}
          className={cn(
            'inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            active === chip.value
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}

// ── Row formatting helpers ────────────────────────────────────────────────────

// 8-char codes display grouped 4+4 (e.g. "A7K2 P9X4"); non-8 inputs pass
// through uppercased-as-is (defensive; the backend always returns 8 chars).
function formatCode(raw: string): string {
  const code = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code
}

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
function formatRedeemedAt(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '-' : dateTimeFmt.format(d)
}

const gbpFmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
function formatSaving(value: number): string {
  return gbpFmt.format(value)
}

function statusLabel(status: string): string {
  return status === 'VALIDATED' ? 'Validated' : 'Awaiting validation'
}
function statusTone(status: string): BadgeTone {
  return status === 'VALIDATED' ? 'success' : 'warn'
}

const VOUCHER_TYPE_LABEL_OVERRIDE: Record<string, string> = { BOGO: 'BOGO' }
function voucherTypeLabel(type: string): string {
  if (VOUCHER_TYPE_LABEL_OVERRIDE[type]) return VOUCHER_TYPE_LABEL_OVERRIDE[type]
  const words = type.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// ── Table ─────────────────────────────────────────────────────────────────────

function RedemptionsTable({ items }: { items: AdminRedemptionRow[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">No redemptions match this search.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/40">
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Code</th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Redeemed at</th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Merchant</th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Branch</th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Voucher</th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Saving</th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr
              key={item.id}
              data-testid={`redemption-row-${item.id}`}
              className={cn(
                'border-b border-border last:border-0',
                idx % 2 === 0 ? 'bg-card' : 'bg-secondary/10'
              )}
            >
              <td className="px-4 py-3 font-mono text-foreground">{formatCode(item.redemptionCode)}</td>
              <td className="px-4 py-3 text-muted-foreground">{formatRedeemedAt(item.redeemedAt)}</td>
              <td className="px-4 py-3 text-foreground">{item.merchant.businessName}</td>
              <td className="px-4 py-3 text-muted-foreground">{item.branch.name}</td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <span className="text-foreground">{item.voucher.title}</span>
                  <Badge tone="info" className="w-fit">{voucherTypeLabel(item.voucher.type)}</Badge>
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{item.customerName}</td>
              <td className="px-4 py-3 text-foreground">{formatSaving(item.estimatedSaving)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                  {item.isTestData && <Badge tone="neutral">Test</Badge>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
    return <ForbiddenState />
  }

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function onCodeKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      setSubmittedCode(codeInput.trim())
    }
  }

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
      <div className="flex flex-wrap items-center gap-3">
        <StatusChips active={statusFilter} onChange={setStatusFilter} />

        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            onKeyDown={onCodeKeyDown}
            placeholder="Search by code or voucher title (press Enter)"
            aria-label="Search redemptions by code or voucher title"
            data-testid="redemptions-search-input"
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={includeTest}
            onChange={(e) => setIncludeTest(e.target.checked)}
            aria-label="Include test data"
            data-testid="redemptions-include-test-toggle"
            className="size-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          Include test data
        </label>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <>
          <RedemptionsTable items={items} />

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {page} of {totalPages} · {total} {total === 1 ? 'redemption' : 'redemptions'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  disabled={offset <= 0}
                  data-testid="redemptions-prev-page"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setOffset((o) => (o + PAGE_SIZE < total ? o + PAGE_SIZE : o))}
                  disabled={offset + PAGE_SIZE >= total}
                  data-testid="redemptions-next-page"
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
    </div>
  )
}
