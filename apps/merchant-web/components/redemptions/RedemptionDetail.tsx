'use client'

/**
 * M3 F3: the merchant-safe redemption detail surface (a dialog opened by a row
 * click on the Redemptions log). Shows the voucher (title, type, and the optional
 * description / terms when the backend payload carries them), branch, customer
 * (first name + last initial), redeemed-at, status + validation details, saving,
 * and the redemption code.
 *
 * Privacy: this surface only ever receives the curated merchant-safe row (no
 * email / phone / PIN); customerName is pre-formatted first name + last initial.
 */
import * as React from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Chip } from '@/components/ui/chip'
import {
  formatRedemptionCode,
  formatRedeemedAt,
  formatSaving,
  voucherTypeChip,
  voucherTypeLabel,
  statusLabel,
} from '@/lib/redemptions/display'
import type { RedemptionRow } from '@/lib/api/redemptions'

const labelClass = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <span className={labelClass}>{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{children}</span>
    </div>
  )
}

function StatusPill({ status }: { status: RedemptionRow['status'] }) {
  if (status === 'VALIDATED') {
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
        style={{ background: 'rgba(15,122,62,0.10)', color: 'var(--success)' }}
      >
        {statusLabel(status)}
      </span>
    )
  }
  return <Badge variant="caution">{statusLabel(status)}</Badge>
}

export function RedemptionDetail({
  row,
  onClose,
}: {
  row: RedemptionRow
  onClose: () => void
}) {
  // description / terms are optional passthrough fields (the curated redemption
  // row does not always carry them); render only when present.
  const voucher = row.voucher as RedemptionRow['voucher'] & {
    description?: string | null
    terms?: string | null
  }

  return (
    <Dialog
      label="Redemption detail"
      onClose={onClose}
      panelTestId="redemption-detail-dialog"
      scrimTestId="redemption-detail-scrim"
    >
      <div className="space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-semibold text-foreground">{voucher.title}</h2>
            <Chip type={voucherTypeChip(voucher.type)}>{voucherTypeLabel(voucher.type)}</Chip>
          </div>
          <StatusPill status={row.status} />
        </header>

        {voucher.description && (
          <p className="text-sm text-muted-foreground">{voucher.description}</p>
        )}

        <div className="rounded-lg border border-border bg-card p-4">
          <DetailRow label="Code">{formatRedemptionCode(row.redemptionCode)}</DetailRow>
          <DetailRow label="Customer">{row.customerName}</DetailRow>
          <DetailRow label="Branch">{row.branch.name}</DetailRow>
          <DetailRow label="Redeemed">{formatRedeemedAt(row.redeemedAt)}</DetailRow>
          <DetailRow label="Saving">{formatSaving(row.estimatedSaving)}</DetailRow>
          {row.status === 'VALIDATED' && (
            <>
              <DetailRow label="Validated">{formatRedeemedAt(row.validatedAt)}</DetailRow>
              {row.validationMethod && <DetailRow label="Method">{row.validationMethod}</DetailRow>}
              {row.validatedByLabel && <DetailRow label="By">{row.validatedByLabel}</DetailRow>}
            </>
          )}
        </div>

        {voucher.terms && (
          <div className="space-y-1">
            <p className={labelClass}>Terms</p>
            <p className="text-sm text-muted-foreground">{voucher.terms}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="navy" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
