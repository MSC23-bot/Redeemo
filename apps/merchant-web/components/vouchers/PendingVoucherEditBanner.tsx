'use client'

/**
 * Voucher governed flows (2026-07-07): the "awaiting Redeemo review" banner
 * for a voucher with an open (PENDING) VoucherPendingEdit - either kind CHANGE
 * (a flagship's requested field edits, rendered as a proposed-vs-current diff
 * via ConciergeDiff's shared buildRows) or kind END (a custom voucher's
 * requested deactivation, a plain notice + the merchant's reason). Reused by
 * both the flagship and the custom voucher detail page (one shared model, D1).
 *
 * Withdraw is self-service (D2/withdrawVoucherPendingEdit) behind a confirm
 * dialog; disables opening a second request implicitly (the caller never
 * offers "Request a change"/"Request to end" again while this banner shows).
 */
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Clock, ArrowRight } from '@/lib/icons'
import { buildRows } from './ConciergeDiff'
import { useWithdrawVoucherPendingEdit } from '@/lib/voucher/useVoucherGovernedActions'
import type { PendingVoucherEdit } from '@/lib/api/voucher'

export interface PendingBannerVoucher {
  id: string
  title: string
  description?: string | null
  terms?: string | null
  estimatedSaving: number
  pendingEdit?: PendingVoucherEdit | null
}

export function PendingVoucherEditBanner({
  voucher,
  canManage,
}: {
  voucher: PendingBannerVoucher
  canManage: boolean
}) {
  const edit = voucher.pendingEdit
  const withdraw = useWithdrawVoucherPendingEdit()
  const [confirming, setConfirming] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

  if (!edit || edit.status !== 'PENDING') return null

  const rows =
    edit.kind === 'CHANGE'
      ? buildRows(
          // proposedChanges is a subset of the same fields ConciergeDiff's
          // AdminProposed already knows how to label/format (title/description/
          // terms/estimatedSaving); an unrelated key is silently ignored.
          (edit.proposedChanges ?? {}) as Parameters<typeof buildRows>[0],
          {
            title: voucher.title,
            description: voucher.description ?? undefined,
            terms: voucher.terms ?? undefined,
            estimatedSaving: voucher.estimatedSaving,
          },
        )
      : []

  async function confirmWithdraw() {
    setActionError(null)
    try {
      await withdraw.mutateAsync({ editId: edit!.id, voucherId: voucher.id })
      setConfirming(false)
    } catch {
      setActionError('We could not withdraw this request. Please try again.')
    }
  }

  return (
    <div
      data-testid="voucher-pending-edit-banner"
      data-pending-kind={edit.kind}
      className="rounded-[16px] p-4"
      style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-start gap-3">
        <Clock size={16} aria-hidden style={{ color: 'var(--text-tertiary)', marginTop: 2 }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {edit.kind === 'CHANGE' ? 'Change awaiting review' : 'End request awaiting review'}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {edit.kind === 'CHANGE'
              ? 'You asked to change this voucher. It stays live exactly as it is for customers until Redeemo reviews your request.'
              : 'You asked to end this voucher. It stays live for customers until Redeemo reviews your request.'}
          </p>
          {edit.reason ? (
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Your reason: </span>
              {edit.reason}
            </p>
          ) : null}
        </div>
      </div>

      {rows.length > 0 ? (
        <dl className="mt-3 space-y-1.5 pl-[30px]" data-testid="voucher-pending-edit-diff">
          {rows.map((r) => (
            <div key={r.key} className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
              <dt className="font-medium text-foreground">{r.label}:</dt>
              <dd className="flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground">
                <span data-testid={`voucher-pending-edit-current-${r.key}`} className="line-through">
                  {r.current}
                </span>
                <ArrowRight size={13} aria-hidden className="shrink-0" />
                <span data-testid={`voucher-pending-edit-proposed-${r.key}`} className="font-semibold text-foreground">
                  {r.proposed}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {actionError ? (
        <p role="alert" className="mt-2 text-xs font-medium" style={{ color: 'var(--destructive)' }}>
          {actionError}
        </p>
      ) : null}

      {canManage ? (
        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setConfirming(true)}
            disabled={withdraw.isPending}
          >
            Withdraw request
          </Button>
        </div>
      ) : null}

      {confirming ? (
        <Dialog
          label="Withdraw this request"
          onClose={() => (!withdraw.isPending ? setConfirming(false) : undefined)}
          panelTestId="withdraw-pending-edit-dialog"
        >
          <h2 className="font-display text-xl font-semibold text-[#010C35]">Withdraw this request?</h2>
          <p className="mt-2 text-sm text-[#4B5366]">
            Redeemo will no longer review it. You can send a new request any time.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={withdraw.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmWithdraw} disabled={withdraw.isPending}>
              {withdraw.isPending ? 'Withdrawing...' : 'Withdraw request'}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}
