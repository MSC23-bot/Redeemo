/**
 * VoucherEditReviewDiff (Voucher governed-flows PR-B): the merchant-requested
 * voucher CHANGE / END review surface, for an AdminApproval{type:'VOUCHER_EDIT'}.
 *
 * CHANGE renders a field-by-field diff (current vs proposed), mirroring
 * EditReviewDiff's table but adapted to the narrower {key,label,current,
 * proposed} field shape the backend returns for a voucher edit (no
 * isCustomerVisible — everything on a live voucher is customer-visible).
 *
 * END renders no field diff; instead a clear "requests to end this voucher"
 * notice stating the consequence (the voucher becomes inactive for customers).
 *
 * The merchant's mandatory reason is always shown prominently above the
 * kind-specific content.
 *
 * A WITHDRAWN approval (the merchant withdrew the request before an admin
 * acted) renders a neutral "Withdrawn" status badge and NO action buttons at
 * all — distinct from a merely-disabled non-pending state, because a withdrawn
 * request is never actionable again. Approve / Reject are otherwise gated on
 * the approval:apply-edit capability (hidden without it) and disabled once the
 * request is no longer PENDING.
 */
import { Ticket, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/features/shared/Badge'
import type { BadgeTone } from '@/features/shared/Badge'
import type { VoucherEditField, VoucherEditReviewContext } from '@/lib/api/editReview'

// ── Display helpers ───────────────────────────────────────────────────────────

const VOUCHER_TYPE_LABELS: Record<string, string> = {
  BOGO: 'BOGO',
  DISCOUNT: 'Discount',
  FREEBIE: 'Freebie',
  SPEND_AND_SAVE: 'Spend and save',
  PACKAGE_DEAL: 'Package deal',
  TIME_LIMITED: 'Time limited',
  REUSABLE: 'Reusable',
}

function voucherTypeLabel(type: string): string {
  return VOUCHER_TYPE_LABELS[type] ?? type
}

/** Render any diff value (string / number / boolean / null) as readable text. */
function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function statusLabel(status: string): string {
  return status === 'WITHDRAWN' ? 'Withdrawn' : status
}

function statusTone(status: string): BadgeTone {
  if (status === 'PENDING') return 'warn'
  return 'neutral'
}

// ── Field diff (CHANGE) ───────────────────────────────────────────────────────

function VoucherFieldRow({ field }: { field: VoucherEditField }) {
  return (
    <tr className="border-b border-border last:border-0" data-testid={`voucher-edit-field-row-${field.key}`}>
      <td className="py-2.5 pr-4 align-top">
        <span className="text-sm font-medium text-foreground">{field.label}</span>
      </td>
      <td className="py-2.5 pr-4 align-top">
        <span
          className="text-sm text-muted-foreground line-through decoration-muted-foreground/60"
          data-testid={`voucher-edit-field-current-${field.key}`}
        >
          {renderValue(field.current)}
        </span>
      </td>
      <td className="py-2.5 align-top">
        <span
          className="text-sm font-medium text-foreground"
          data-testid={`voucher-edit-field-proposed-${field.key}`}
        >
          {renderValue(field.proposed)}
        </span>
      </td>
    </tr>
  )
}

function VoucherFieldDiff({ fields }: { fields: VoucherEditField[] }) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="voucher-edit-no-fields">
        This request has no field changes.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" data-testid="voucher-edit-field-table">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Field</th>
            <th className="py-2 pr-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Current</th>
            <th className="py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <VoucherFieldRow key={field.key} field={field} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── END notice ─────────────────────────────────────────────────────────────────

function VoucherEndNotice() {
  return (
    <div
      className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4"
      data-testid="voucher-edit-end-notice"
    >
      <XCircle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-amber-900">Requests to end this voucher</p>
        <p className="mt-1 text-sm text-amber-800">
          If approved, this voucher becomes inactive and is no longer available to customers.
        </p>
      </div>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

interface VoucherEditReviewDiffProps {
  context: VoucherEditReviewContext
  canApplyEdit: boolean
  onApprove: () => void
  onReject: () => void
}

export function VoucherEditReviewDiff({
  context,
  canApplyEdit,
  onApprove,
  onReject,
}: VoucherEditReviewDiffProps) {
  const { voucher, voucherEditKind, reason, status, fields } = context
  const isPending = status === 'PENDING'
  const isWithdrawn = status === 'WITHDRAWN'

  return (
    <div className="rounded-lg border border-border bg-card p-6" data-testid="voucher-edit-review-diff">
      {/* Header: voucher identity */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Ticket className="size-3.5" aria-hidden="true" />
            {voucherEditKind === 'END' ? 'Voucher end request' : 'Voucher change request'}
          </p>
          <h2 className="mt-0.5 text-lg font-semibold text-foreground">{voucher.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="voucher-edit-code">
            {voucher.code}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge tone="neutral">{voucherTypeLabel(voucher.type)}</Badge>
            {voucher.isRmv && (
              <span data-testid="voucher-edit-flagship-badge">
                <Badge tone="info">Flagship</Badge>
              </span>
            )}
          </div>
          <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
        </div>
      </div>

      {/* Merchant's mandatory reason: shown prominently above the kind-specific content. */}
      <div
        className="mb-5 rounded-md border border-border bg-secondary/30 p-4"
        data-testid="voucher-edit-reason"
      >
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Merchant&apos;s reason
        </p>
        <p className="text-sm text-foreground">{reason}</p>
      </div>

      {/* Kind-specific content. */}
      {voucherEditKind === 'END' ? (
        <VoucherEndNotice />
      ) : (
        <VoucherFieldDiff fields={fields} />
      )}

      {/* Actions: gated on approval:apply-edit; hidden entirely without the cap
          AND when the request has been withdrawn (never actionable again). */}
      {canApplyEdit && !isWithdrawn && (
        <div className="mt-6 flex justify-end gap-3" data-testid="voucher-edit-review-actions">
          <Button
            type="button"
            variant="outline"
            onClick={onReject}
            disabled={!isPending}
            data-testid="voucher-edit-reject-btn"
          >
            Reject
          </Button>
          <Button
            type="button"
            onClick={onApprove}
            disabled={!isPending}
            data-testid="voucher-edit-approve-btn"
          >
            {voucherEditKind === 'END' ? 'End voucher' : 'Apply change'}
          </Button>
        </div>
      )}
    </div>
  )
}
