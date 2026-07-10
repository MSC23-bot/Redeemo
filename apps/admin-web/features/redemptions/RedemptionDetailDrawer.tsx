'use client'

/**
 * RedemptionDetailDrawer (B3): read-only detail view for a single redemption
 * row, opened by clicking a row in RedemptionsTable.
 *
 * Composed ONLY of fields already present on the AdminRedemptionRow the table
 * already fetched (D67 list-only contract:
 * docs/superpowers/plans/2026-07-09-d67-admin-redemption-visibility.md says v1
 * is list-only, no detail PAGE. This is a client-side panel over data already
 * in memory - no new route, no new fetch - so it stays inside that contract).
 * No new PII: customer identity stays the existing masked "First L." mask
 * (D48 reveal tiers are a separate, not-yet-built decision; see the Phase B
 * plan's OD4). Reuses the shared `Dialog` primitive (placement="right") for
 * Escape/scrim dismissal, the Tab focus-trap, and focus restoration instead of
 * hand-rolling them a second time.
 */
import Link from 'next/link'
import { ArrowUpRight, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/features/shared/Badge'
import {
  formatCode,
  formatRedeemedAt,
  formatSaving,
  merchantBranchesHref,
  merchantWorkspaceHref,
  statusLabel,
  statusTone,
  validationMethodLabel,
  voucherTypeLabel,
} from './format'
import type { AdminRedemptionRow } from '@/lib/api/redemptions'

const sectionLabelClass = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const linkClass = 'font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm'

export function RedemptionDetailDrawer({
  row,
  onClose,
}: {
  row: AdminRedemptionRow
  onClose: () => void
}) {
  const merchantHref = merchantWorkspaceHref(row.merchant.id)
  const branchHref = merchantBranchesHref(row.merchant.id)

  return (
    <Dialog
      label="Redemption detail"
      onClose={onClose}
      placement="right"
      panelTestId="redemption-detail-drawer"
      scrimTestId="redemption-detail-scrim"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Redemption detail</h2>
          <p className="mt-0.5 font-mono text-sm text-muted-foreground" data-testid="redemption-detail-code">
            {formatCode(row.redemptionCode)}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 space-y-5 px-5 py-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
          {row.isTestData && <Badge tone="neutral">Test</Badge>}
        </div>

        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className={sectionLabelClass}>Voucher</h3>
          <p className="mt-2 text-sm font-medium text-foreground" data-testid="redemption-detail-voucher-title">
            {row.voucher.title}
          </p>
          <Badge tone="info" className="mt-1.5 w-fit">
            {voucherTypeLabel(row.voucher.type)}
          </Badge>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className={sectionLabelClass}>Where</h3>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Merchant</dt>
              <dd>
                <Link href={merchantHref} className={linkClass} data-testid="redemption-detail-merchant-link">
                  {row.merchant.businessName}
                </Link>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Branch</dt>
              <dd>
                <Link href={branchHref} className={linkClass} data-testid="redemption-detail-branch-link">
                  {row.branch.name}
                </Link>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Customer</dt>
              <dd className="font-medium text-foreground" data-testid="redemption-detail-customer">
                {row.customerName}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className={sectionLabelClass}>Validation</h3>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Redeemed</dt>
              <dd className="font-medium text-foreground">{formatRedeemedAt(row.redeemedAt)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Validated</dt>
              <dd className="font-medium text-foreground" data-testid="redemption-detail-validated-at">
                {row.validatedAt ? formatRedeemedAt(row.validatedAt) : 'Not yet validated'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Method</dt>
              <dd className="font-medium text-foreground" data-testid="redemption-detail-method">
                {validationMethodLabel(row.validationMethod)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Validated by</dt>
              <dd className="font-medium text-foreground" data-testid="redemption-detail-validated-by">
                {row.validatedByLabel ?? '-'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Saving</dt>
              <dd className="font-medium text-foreground">{formatSaving(row.estimatedSaving)}</dd>
            </div>
          </dl>
        </section>

        <Link
          href={merchantHref}
          data-testid="redemption-detail-view-merchant"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View merchant
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>

        <p className="text-xs text-muted-foreground">Read-only detail. Customer identity stays masked.</p>
      </div>
    </Dialog>
  )
}
