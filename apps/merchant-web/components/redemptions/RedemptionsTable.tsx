'use client'

/**
 * F1: the merchant Redemptions log table. Columns: status pill, redemption code
 * (4+4), voucher (title + type chip), branch, customer (first + last initial),
 * redeemed-at, validated-at + validatedByLabel, saving. Rows are clickable (the
 * detail surface is wired by the page). House style: no em dashes; brand tokens.
 *
 * Privacy: customerName arrives pre-formatted as first name + last initial; this
 * component renders it verbatim and never has access to email/phone/PIN.
 */
import * as React from 'react'
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from '@/components/ui/table'
import { Chip } from '@/components/ui/chip'
import { StatusPill } from '@/components/redemptions/StatusPill'
import {
  formatRedemptionCode,
  formatRedeemedAt,
  formatSaving,
  voucherTypeChip,
  voucherTypeLabel,
} from '@/lib/redemptions/display'
import type { RedemptionRow } from '@/lib/api/redemptions'

export function RedemptionsTable({
  rows,
  onRowClick,
}: {
  rows: RedemptionRow[]
  onRowClick: (row: RedemptionRow) => void
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <TableEmpty>Redemptions appear once customers start redeeming your vouchers.</TableEmpty>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table>
        <THead>
          <TR>
            <TH>Status</TH>
            <TH>Code</TH>
            <TH>Voucher</TH>
            <TH>Branch</TH>
            <TH>Customer</TH>
            <TH>Redeemed</TH>
            <TH>Validated at</TH>
            <TH className="text-right">Saving</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR
              key={r.id}
              onClick={() => onRowClick(r)}
              className="cursor-pointer transition-colors hover:bg-[#F8F9FA]"
            >
              <TD>
                <StatusPill status={r.status} />
              </TD>
              <TD className="font-mono text-[13px] font-semibold tracking-wide text-foreground">
                {formatRedemptionCode(r.redemptionCode)}
              </TD>
              <TD>
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-foreground">{r.voucher.title}</span>
                  <Chip type={voucherTypeChip(r.voucher.type)} className="self-start">
                    {voucherTypeLabel(r.voucher.type)}
                  </Chip>
                </div>
              </TD>
              <TD className="text-foreground">{r.branch.name}</TD>
              <TD className="text-foreground">{r.customerName}</TD>
              <TD className="whitespace-nowrap text-muted-foreground">
                {formatRedeemedAt(r.redeemedAt)}
              </TD>
              <TD className="whitespace-nowrap text-muted-foreground">
                {r.status === 'VALIDATED' ? (
                  <div className="flex flex-col gap-0.5">
                    <span>{formatRedeemedAt(r.validatedAt)}</span>
                    {r.validatedByLabel && (
                      <span className="text-[12px] text-muted-foreground">{r.validatedByLabel}</span>
                    )}
                  </div>
                ) : (
                  <span aria-hidden="true">·</span>
                )}
              </TD>
              <TD className="whitespace-nowrap text-right font-semibold text-foreground">
                {formatSaving(r.estimatedSaving)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  )
}
