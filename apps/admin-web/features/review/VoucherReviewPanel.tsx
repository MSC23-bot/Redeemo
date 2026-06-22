'use client'

/**
 * VoucherReviewPanel (Day-2 Vouchers PR-C): self-contained VOUCHER review surface
 * for an AdminApproval{type:'VOUCHER'}. Owns the curated voucher-review fetch + the
 * Approve / Reject / Request-changes (concierge) dialog state, so the queue review
 * page only has to branch on the approval type and mount this. Mirrors EditReviewPanel.
 *
 * Approve / Reject / Request-changes are gated on the approval:action capability
 * (the action bar is hidden without it). The fetch is gated on approval:read
 * (passed in as canRead). No PII / no redemptionPin is present in the context.
 */
import { useState } from 'react'
import { Loader2, AlertCircle, HelpCircle, Clock, RefreshCw } from 'lucide-react'
import {
  useVoucherReview,
  useApproveVoucher,
  useRejectVoucher,
  useRequestVoucherChanges,
} from '@/lib/review/useVoucherReview'
import type { VoucherReviewContext, VoucherProposal } from '@/lib/api/voucherReview'
import { Badge } from '@/features/shared/Badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { NamedGateBanner } from './NamedGateBanner'

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

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  EXPIRED: 'Expired',
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayLabel(dayOfWeek: number): string {
  return DOW[dayOfWeek] ?? `Day ${dayOfWeek}`
}

function formatSaving(value: number): string {
  return `£${value.toFixed(2)}`
}

function formatCooldown(seconds: number): string {
  if (seconds % 86400 === 0) {
    const days = seconds / 86400
    return `${days} ${days === 1 ? 'day' : 'days'}`
  }
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  }
  return `${seconds} seconds`
}

/** Render any adminProposed value (string / number / null) as readable text. */
function renderProposedValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

// ── Open-dialog discriminant ──────────────────────────────────────────────────

type OpenDialog = 'approve' | 'reject' | 'request-changes' | null

interface VoucherReviewPanelProps {
  approvalId: string
  /** ready && can('approval:read'): gates the data fetch. */
  canRead: boolean
  /** can('approval:action'): gates the Approve / Reject / Request-changes actions. */
  canAction: boolean
}

export function VoucherReviewPanel({ approvalId, canRead, canAction }: VoucherReviewPanelProps) {
  const { data, isLoading, isError, refetch } = useVoucherReview(approvalId, canRead)
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null)

  function handleDialogSuccess() {
    setOpenDialog(null)
    refetch()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="voucher-review-loading">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading voucher review" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div
        className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
        data-testid="voucher-review-error"
      >
        <AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden="true" />
        <p className="mb-4 text-sm text-destructive">
          Could not load this voucher submission. Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={refetch}
          className="text-sm font-medium text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  const { voucher, merchant, goLive } = data
  const askHelp = voucher.merchantFields?.askHelp === true
  const adminProposed =
    voucher.merchantFields && typeof voucher.merchantFields.adminProposed === 'object' && voucher.merchantFields.adminProposed !== null
      ? (voucher.merchantFields.adminProposed as Record<string, unknown>)
      : null
  const adminNote =
    voucher.merchantFields && typeof voucher.merchantFields.adminNote === 'string'
      ? (voucher.merchantFields.adminNote as string)
      : null

  return (
    <div className="space-y-6" data-testid="voucher-review-panel">
      <div className="rounded-lg border border-border bg-card p-6">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Voucher submission
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-foreground">{voucher.title}</h2>
            {merchant && (
              <p className="mt-1 text-sm text-muted-foreground">{merchant.businessName}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge tone="neutral">{voucherTypeLabel(voucher.type)}</Badge>
            <Badge tone="info">{statusLabel(voucher.status)}</Badge>
          </div>
        </div>

        {askHelp && (
          <p
            className="mb-4 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800"
            data-testid="voucher-ask-help"
          >
            <HelpCircle className="size-4 shrink-0" aria-hidden="true" />
            The merchant asked the Redeemo team to help with this offer.
          </p>
        )}

        {/* Core details */}
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Saving</dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">{formatSaving(voucher.estimatedSaving)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {voucher.description ?? <span className="text-muted-foreground">(none)</span>}
            </dd>
          </div>
          {voucher.terms && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Terms</dt>
              <dd className="mt-0.5 text-sm italic text-muted-foreground">{voucher.terms}</dd>
            </div>
          )}
        </dl>

        {/* TIME_LIMITED availability windows */}
        {voucher.availabilityWindows.length > 0 && (
          <div className="mt-5 border-t border-border pt-4" data-testid="voucher-availability-windows">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Clock className="size-3.5" aria-hidden="true" />
              Availability windows
            </p>
            <ul className="space-y-1">
              {voucher.availabilityWindows.map((w, i) => (
                <li key={`${w.dayOfWeek}-${i}`} className="text-sm text-foreground">
                  {dayLabel(w.dayOfWeek)}: {w.openTime} to {w.closeTime}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* REUSABLE cooldown */}
        {voucher.cooldownSeconds != null && (
          <div className="mt-5 border-t border-border pt-4" data-testid="voucher-cooldown">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Reuse cooldown
            </p>
            <p className="text-sm text-foreground">{formatCooldown(voucher.cooldownSeconds)}</p>
          </div>
        )}

        {/* Customer preview */}
        <div
          className="mt-5 rounded-lg border border-dashed border-border bg-secondary/30 p-4"
          data-testid="voucher-customer-preview"
        >
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Customer preview
          </p>
          <p className="text-base font-semibold text-foreground">{voucher.title}</p>
          {voucher.description && (
            <p className="mt-1 text-sm text-muted-foreground">{voucher.description}</p>
          )}
          <p className="mt-2 text-sm font-medium text-primary">
            Save {formatSaving(voucher.estimatedSaving)}
          </p>
        </div>

        {/* Existing concierge proposal (a CHANGES_REQUESTED voucher carries the
            prior round's adminProposed + adminNote in merchantFields). */}
        {(adminProposed && Object.keys(adminProposed).length > 0) || adminNote ? (
          <div
            className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4"
            data-testid="voucher-admin-proposed"
          >
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-800">
              Changes already requested
            </p>
            {adminProposed && Object.keys(adminProposed).length > 0 && (
              <ul className="mb-2 space-y-1">
                {Object.entries(adminProposed).map(([field, value]) => (
                  <li key={field} className="text-sm text-amber-900">
                    <span className="font-medium">{field}:</span> {renderProposedValue(value)}
                  </li>
                ))}
              </ul>
            )}
            {adminNote && <p className="text-xs italic text-amber-800">Note: {adminNote}</p>}
          </div>
        ) : null}
      </div>

      {/* Action bar: gated on approval:action. Hidden entirely without the cap. */}
      {canAction && (
        <div className="flex flex-wrap justify-end gap-3" data-testid="voucher-review-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpenDialog('reject')}
            data-testid="voucher-reject-btn"
          >
            Reject
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpenDialog('request-changes')}
            data-testid="voucher-request-changes-btn"
          >
            Request changes
          </Button>
          <Button
            type="button"
            onClick={() => setOpenDialog('approve')}
            data-testid="voucher-approve-btn"
          >
            Approve
          </Button>
        </div>
      )}

      {openDialog === 'approve' && (
        <ApproveVoucherDialog
          approvalId={approvalId}
          goLive={goLive}
          onSuccess={handleDialogSuccess}
          onCancel={() => setOpenDialog(null)}
        />
      )}
      {openDialog === 'reject' && (
        <RejectVoucherDialog
          approvalId={approvalId}
          onSuccess={handleDialogSuccess}
          onCancel={() => setOpenDialog(null)}
        />
      )}
      {openDialog === 'request-changes' && (
        <RequestVoucherChangesDialog
          approvalId={approvalId}
          context={data}
          onSuccess={handleDialogSuccess}
          onCancel={() => setOpenDialog(null)}
        />
      )}
    </div>
  )
}

// ── Approve dialog (Model 1 hint) ─────────────────────────────────────────────

function ApproveVoucherDialog({
  approvalId,
  goLive,
  onSuccess,
  onCancel,
}: {
  approvalId: string
  goLive: boolean
  onSuccess: () => void
  onCancel: () => void
}) {
  const mutation = useApproveVoucher(approvalId)

  async function handleApprove() {
    if (mutation.isPending) return
    try {
      await mutation.mutateAsync()
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Approve this voucher?"
      onClose={onCancel}
      scrimTestId="voucher-approve-scrim"
      panelTestId="voucher-approve-dialog"
    >
      <h2 className="mb-3 text-base font-semibold text-foreground">Approve this voucher?</h2>
      <p className="text-sm text-foreground" data-testid="voucher-approve-hint">
        {goLive
          ? 'This voucher will go live now: members in this area can find and redeem it from today.'
          : 'This voucher will be approved now and will go live when the merchant is live and their flagship vouchers are live.'}
      </p>

      {mutation.error && (
        <div className="mt-4" data-testid="voucher-approve-error-banner">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
          data-testid="voucher-approve-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleApprove}
          disabled={mutation.isPending}
          data-testid="voucher-approve-confirm"
        >
          {mutation.isPending ? 'Approving...' : 'Approve voucher'}
        </Button>
      </div>
    </Dialog>
  )
}

// ── Reject dialog ─────────────────────────────────────────────────────────────

const REASON_SOFT_MIN = 15

function RejectVoucherDialog({
  approvalId,
  onSuccess,
  onCancel,
}: {
  approvalId: string
  onSuccess: () => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  const mutation = useRejectVoucher(approvalId)

  const trimmed = reason.trim()
  const belowMin = trimmed.length < REASON_SOFT_MIN
  const canSubmit = !belowMin && !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      await mutation.mutateAsync(trimmed)
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Reject voucher"
      onClose={onCancel}
      scrimTestId="voucher-reject-scrim"
      panelTestId="voucher-reject-dialog"
    >
      <h2 className="mb-4 text-base font-semibold text-foreground">Reject this voucher</h2>
      <label htmlFor="voucher-reject-reason" className="mb-1.5 block text-sm font-medium text-foreground">
        Reason for rejecting (shared with the merchant)
      </label>
      <textarea
        id="voucher-reject-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain clearly why this voucher cannot be approved."
        rows={4}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="voucher-reject-reason"
      />
      {belowMin && trimmed.length > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground" data-testid="voucher-reject-min-nudge">
          Add a little more detail so the merchant understands.
        </p>
      )}

      {mutation.error && (
        <div className="mt-3">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
          data-testid="voucher-reject-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="voucher-reject-submit"
        >
          {mutation.isPending ? 'Rejecting...' : 'Reject voucher'}
        </Button>
      </div>
    </Dialog>
  )
}

// ── Request-changes (concierge) dialog ────────────────────────────────────────

/** Trim a string to undefined when empty. */
function nonEmpty(value: string): string | undefined {
  const t = value.trim()
  return t.length > 0 ? t : undefined
}

function RequestVoucherChangesDialog({
  approvalId,
  context,
  onSuccess,
  onCancel,
}: {
  approvalId: string
  context: VoucherReviewContext
  onSuccess: () => void
  onCancel: () => void
}) {
  const { voucher } = context
  const mutation = useRequestVoucherChanges(approvalId)

  // Correction inputs are pre-filled with the current values; the proposal sends
  // ONLY the fields the admin actually changed (allow-listed: title / description
  // / terms / estimatedSaving). The backend allow-lists + type-guards too.
  const [title, setTitle] = useState(voucher.title)
  const [description, setDescription] = useState(voucher.description ?? '')
  const [terms, setTerms] = useState(voucher.terms ?? '')
  const [saving, setSaving] = useState(String(voucher.estimatedSaving))
  const [note, setNote] = useState('')

  const trimmedNote = note.trim()
  const canSubmit = trimmedNote.length > 0 && !mutation.isPending

  function buildProposed(): VoucherProposal | undefined {
    const proposed: VoucherProposal = {}
    const titleVal = nonEmpty(title)
    if (titleVal !== undefined && titleVal !== voucher.title) proposed.title = titleVal

    const descVal = description.trim()
    if (descVal !== (voucher.description ?? '').trim() && descVal.length > 0) {
      proposed.description = descVal
    }

    const termsVal = terms.trim()
    if (termsVal !== (voucher.terms ?? '').trim() && termsVal.length > 0) {
      proposed.terms = termsVal
    }

    const savingNum = Number(saving)
    if (Number.isFinite(savingNum) && savingNum > 0 && savingNum !== voucher.estimatedSaving) {
      proposed.estimatedSaving = savingNum
    }

    return Object.keys(proposed).length > 0 ? proposed : undefined
  }

  async function handleSubmit() {
    if (!canSubmit) return
    const proposed = buildProposed()
    try {
      await mutation.mutateAsync(proposed !== undefined ? { proposed, note: trimmedNote } : { note: trimmedNote })
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  const fieldClass =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <Dialog
      label="Request changes"
      onClose={onCancel}
      scrimTestId="voucher-rc-scrim"
      panelTestId="voucher-request-changes-dialog"
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Request changes</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Edit any fields you want to suggest a correction for. Only changed fields are proposed to the merchant; they apply or edit them before resubmitting.
      </p>

      <div className="space-y-3">
        <div>
          <label htmlFor="voucher-rc-title" className="mb-1 block text-xs font-medium text-foreground">Title</label>
          <input
            id="voucher-rc-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={fieldClass}
            data-testid="voucher-rc-title"
          />
        </div>
        <div>
          <label htmlFor="voucher-rc-description" className="mb-1 block text-xs font-medium text-foreground">Description</label>
          <textarea
            id="voucher-rc-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={`${fieldClass} resize-none`}
            data-testid="voucher-rc-description"
          />
        </div>
        <div>
          <label htmlFor="voucher-rc-terms" className="mb-1 block text-xs font-medium text-foreground">Terms</label>
          <textarea
            id="voucher-rc-terms"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={2}
            className={`${fieldClass} resize-none`}
            data-testid="voucher-rc-terms"
          />
        </div>
        <div>
          <label htmlFor="voucher-rc-saving" className="mb-1 block text-xs font-medium text-foreground">Estimated saving (£)</label>
          <input
            id="voucher-rc-saving"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={saving}
            onChange={(e) => setSaving(e.target.value)}
            className={fieldClass}
            data-testid="voucher-rc-saving"
          />
        </div>
        <div>
          <label htmlFor="voucher-rc-note" className="mb-1 block text-xs font-medium text-foreground">
            Note to the merchant (required)
          </label>
          <textarea
            id="voucher-rc-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain what you would like the merchant to change."
            rows={3}
            className={`${fieldClass} resize-none`}
            data-testid="voucher-rc-note"
          />
        </div>
      </div>

      {mutation.error && (
        <div className="mt-3">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
          data-testid="voucher-rc-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="voucher-rc-submit"
        >
          {mutation.isPending ? 'Sending...' : 'Send to merchant'}
        </Button>
      </div>
    </Dialog>
  )
}
