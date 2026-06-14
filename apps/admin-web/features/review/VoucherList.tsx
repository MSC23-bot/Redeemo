/**
 * VoucherList — read-only list of merchant vouchers.
 *
 * Shows vouchers grouped by type (mandatory / custom). Includes voucher type,
 * approval status, estimated saving, and any admin comment. No action buttons.
 */
import { Badge } from '@/features/shared/Badge'
import { cn } from '@/lib/utils'
import type { ReviewVoucher } from '@/lib/api/review'
import type { BadgeTone } from '@/features/shared/Badge'

interface VoucherListProps {
  vouchers: ReviewVoucher[]
}

// Intentionally always 'neutral' today: every voucher-type chip is neutral. This
// is a seam for future per-type tones — do not infer per-type styling from it yet.
function voucherTypeTone(): BadgeTone {
  return 'neutral'
}

function approvalTone(approvalStatus: string): BadgeTone {
  if (approvalStatus === 'APPROVED') return 'success'
  if (approvalStatus === 'REJECTED') return 'danger'
  if (approvalStatus === 'PENDING') return 'warn'
  return 'neutral'
}

function approvalLabel(approvalStatus: string): string {
  const map: Record<string, string> = {
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    PENDING: 'Pending approval',
    NOT_REQUIRED: 'No approval needed',
  }
  return map[approvalStatus] ?? approvalStatus
}

function voucherTypeLabel(type: string): string {
  const map: Record<string, string> = {
    BOGO: 'BOGO',
    DISCOUNT: 'Discount',
    FREEBIE: 'Freebie',
    SPEND_AND_SAVE: 'Spend and save',
    PACKAGE_DEAL: 'Package deal',
    TIME_LIMITED: 'Time limited',
    REUSABLE: 'Reusable',
  }
  return map[type] ?? type
}

function VoucherRow({ voucher }: { voucher: ReviewVoucher }) {
  const saving = `£${voucher.estimatedSaving.toFixed(2)}`

  return (
    <li
      className="px-4 py-4 border-b border-border last:border-0"
      data-testid={`voucher-row-${voucher.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center flex-wrap gap-2 mb-1">
            <span className="text-sm font-medium text-foreground">{voucher.title}</span>
            {voucher.isRmv && (
              <Badge tone="info">Mandatory</Badge>
            )}
          </div>

          {voucher.description && (
            <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
              {voucher.description}
            </p>
          )}

          {voucher.terms && (
            <p className="text-xs text-muted-foreground italic mb-2">
              Terms: {voucher.terms}
            </p>
          )}

          {voucher.approvalComment && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
              Admin note: {voucher.approvalComment}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <Badge tone={voucherTypeTone()}>{voucherTypeLabel(voucher.type)}</Badge>
          <Badge tone={approvalTone(voucher.approvalStatus)}>
            {approvalLabel(voucher.approvalStatus)}
          </Badge>
          <span
            className="text-sm font-semibold text-foreground tabular-nums"
            aria-label={`Estimated saving ${saving}`}
          >
            {saving}
          </span>
        </div>
      </div>
    </li>
  )
}

export function VoucherList({ vouchers }: VoucherListProps) {
  if (vouchers.length === 0) {
    return (
      <section aria-labelledby="vouchers-heading" data-testid="voucher-list">
        <h2 id="vouchers-heading" className="text-sm font-semibold text-foreground mb-3">
          Vouchers
        </h2>
        <div className="rounded-lg border border-border bg-card px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">No vouchers configured yet.</p>
        </div>
      </section>
    )
  }

  const mandatory = vouchers.filter((v) => v.isRmv)
  const custom = vouchers.filter((v) => !v.isRmv)

  return (
    <section aria-labelledby="vouchers-heading" data-testid="voucher-list">
      <h2 id="vouchers-heading" className="text-sm font-semibold text-foreground mb-3">
        Vouchers ({vouchers.length})
      </h2>

      <div className={cn('overflow-hidden rounded-lg border border-border bg-card')}>
        {mandatory.length > 0 && (
          <>
            <div className="px-4 py-2 bg-secondary/40 border-b border-border">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Mandatory vouchers ({mandatory.length} / 2)
              </span>
            </div>
            <ul role="list">
              {mandatory.map((v) => (
                <VoucherRow key={v.id} voucher={v} />
              ))}
            </ul>
          </>
        )}

        {custom.length > 0 && (
          <>
            <div
              className={cn(
                'px-4 py-2 bg-secondary/40 border-b border-border',
                mandatory.length > 0 && 'border-t border-border'
              )}
            >
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Custom vouchers ({custom.length})
              </span>
            </div>
            <ul role="list">
              {custom.map((v) => (
                <VoucherRow key={v.id} voucher={v} />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}
