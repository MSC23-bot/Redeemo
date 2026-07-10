'use client'

/**
 * RedemptionsTable: the redemptions list table, extracted from the global
 * /redemptions page (D67) so the per-merchant Merchant 360 Redemptions tab (A3)
 * renders the SAME rows without forking.
 *
 * `hideMerchantColumn` drops the Merchant column: the global cross-merchant page
 * keeps it (default), the per-merchant tab hides it (every row is the same
 * merchant, so the column would be noise). The Branch cell is always a
 * quick-link (both surfaces benefit; the field is on every row regardless of
 * whether the Merchant column itself is shown).
 *
 * B3: the Merchant/Branch cells are quick-links into the Merchant 360
 * workspace, and clicking anywhere else on a row opens a read-only detail
 * drawer (RedemptionDetailDrawer) built entirely from that row's own data - no
 * new fetch. The drawer state is owned HERE (not lifted to the page) so both
 * consumers of this table get it for free without prop drilling. Link clicks
 * stopPropagation so they navigate instead of also opening the drawer.
 */
import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/features/shared/Badge'
import { RedemptionDetailDrawer } from './RedemptionDetailDrawer'
import {
  formatCode,
  formatRedeemedAt,
  formatSaving,
  merchantBranchesHref,
  merchantWorkspaceHref,
  statusLabel,
  statusTone,
  voucherTypeLabel,
} from './format'
import { cn } from '@/lib/utils'
import type { AdminRedemptionRow } from '@/lib/api/redemptions'

interface RedemptionsTableProps {
  items: AdminRedemptionRow[]
  /** Drop the Merchant column (per-merchant scoped view). Defaults false. */
  hideMerchantColumn?: boolean
}

// Quick-link cells stop the click from bubbling to the row's onClick, so a
// Merchant/Branch link navigates instead of also opening the detail drawer.
const quickLinkClass =
  'rounded-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function RedemptionsTable({ items, hideMerchantColumn = false }: RedemptionsTableProps) {
  const [selected, setSelected] = useState<AdminRedemptionRow | null>(null)

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">No redemptions match this search.</p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Code</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Redeemed at</th>
              {!hideMerchantColumn && (
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Merchant</th>
              )}
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
                onClick={() => setSelected(item)}
                className={cn(
                  'cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/40',
                  idx % 2 === 0 ? 'bg-card' : 'bg-secondary/10'
                )}
              >
                <td className="px-4 py-3 font-mono text-foreground">{formatCode(item.redemptionCode)}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatRedeemedAt(item.redeemedAt)}</td>
                {!hideMerchantColumn && (
                  <td className="px-4 py-3 text-foreground">
                    <Link
                      href={merchantWorkspaceHref(item.merchant.id)}
                      onClick={(e) => e.stopPropagation()}
                      className={quickLinkClass}
                      data-testid={`redemption-row-${item.id}-merchant-link`}
                    >
                      {item.merchant.businessName}
                    </Link>
                  </td>
                )}
                <td className="px-4 py-3 text-muted-foreground">
                  <Link
                    href={merchantBranchesHref(item.merchant.id)}
                    onClick={(e) => e.stopPropagation()}
                    className={quickLinkClass}
                    data-testid={`redemption-row-${item.id}-branch-link`}
                  >
                    {item.branch.name}
                  </Link>
                </td>
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

      {selected && (
        <RedemptionDetailDrawer row={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
