'use client'

/**
 * Voucher governed flows (2026-07-07): the per-voucher kebab actions menu,
 * shared between the Vouchers list card and the voucher detail page header
 * (prototypes vouchers-2/4/11). Mirrors the StaffRowActions Popover pattern.
 *
 * Contents (never all at once - governed by the voucher's derived state):
 *   - flagship, LIVE, no open request: "Request a change" (opens RequestChangeModal)
 *   - custom, LIVE, no open request: "Request to end" (opens RequestEndModal) +
 *     a footer note ("Changes to live vouchers are reviewed before customers
 *     see them", prototype vouchers-4)
 *   - custom, IN REVIEW (PENDING_APPROVAL + approvalStatus PENDING, i.e. NOT
 *     approved-waiting): "Withdraw submission" (instant, confirm dialog)
 *   - View redemptions (a plain link; shown independent of canManage, matching
 *     the existing detail-page aside link) + Duplicate (canManage-gated,
 *     matching the existing custom detail-page Duplicate button)
 *
 * D4 pin: "Request to end" / any end affordance is NEVER rendered for a
 * flagship voucher, in the list OR on the detail page.
 *
 * canManage gates every MUTATING item (Request a change / Request to end /
 * Withdraw submission / Duplicate); View redemptions stays visible to any
 * viewer who can see the list, mirroring the existing ungated aside link on
 * VoucherDetail. Returns null when there is nothing at all to show (e.g. a
 * non-live, non-in-review custom voucher viewed with showDuplicate=false on
 * the detail page, where Duplicate/Edit/Submit/Delete already render as flat
 * buttons elsewhere).
 */
import * as React from 'react'
import Link from 'next/link'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { MoreVertical, MessageSquarePlus, Power, ExternalLink, Copy, Undo2 } from '@/lib/icons'
import { deriveDisplayState } from '@/lib/voucher/displayState'
import { useWithdrawVoucherSubmission } from '@/lib/voucher/useVoucherGovernedActions'
import { governedErrorMessage } from '@/lib/voucher/governedErrors'
import { ApiError } from '@/lib/api/client'
import { RequestChangeModal, type RequestChangeVoucher } from './RequestChangeModal'
import { RequestEndModal } from './RequestEndModal'
import type { PendingVoucherEdit } from '@/lib/api/voucher'

export interface GovernedMenuVoucher extends RequestChangeVoucher {
  status: string
  approvalStatus: string
  isRmv?: boolean
  pendingEdit?: PendingVoucherEdit | null
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-[var(--neutral)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
      style={{ color: 'var(--text-primary)' }}
    >
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      {label}
    </button>
  )
}

type ModalKind = 'request-change' | 'request-end' | 'withdraw-submission' | null

export function VoucherGovernedMenu({
  voucher,
  canManage,
  showDuplicate = true,
  showViewRedemptions = true,
  onDuplicate,
}: {
  voucher: GovernedMenuVoucher
  canManage: boolean
  showDuplicate?: boolean
  showViewRedemptions?: boolean
  onDuplicate: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [modal, setModal] = React.useState<ModalKind>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const close = () => setOpen(false)

  const withdrawSubmission = useWithdrawVoucherSubmission()

  const state = deriveDisplayState(voucher)
  const isFlagship = !!voucher.isRmv
  const pendingOpen = voucher.pendingEdit?.status === 'PENDING'

  // D4: request-to-end (and any end affordance) is NEVER offered for a
  // flagship voucher.
  const canRequestChange = canManage && isFlagship && state === 'live' && !pendingOpen
  const canRequestEnd = canManage && !isFlagship && state === 'live' && !pendingOpen
  const canWithdrawSubmission = canManage && !isFlagship && state === 'in-review'
  const effectiveShowDuplicate = canManage && showDuplicate

  const showPendingNote = (isFlagship ? state === 'live' : state === 'live') && pendingOpen && canManage

  const hasAnyItem =
    canRequestChange ||
    canRequestEnd ||
    canWithdrawSubmission ||
    showViewRedemptions ||
    effectiveShowDuplicate ||
    showPendingNote
  if (!hasAnyItem) return null

  async function confirmWithdrawSubmission() {
    setActionError(null)
    try {
      await withdrawSubmission.mutateAsync(voucher.id)
      setModal(null)
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined
      setActionError(governedErrorMessage(code, 'We could not withdraw this submission. Please try again.'))
    }
  }

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${voucher.title}`}
            className="inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-[var(--neutral)]"
          >
            <MoreVertical size={18} aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-1">
          <div role="menu" className="flex min-w-[230px] flex-col">
            {canRequestChange ? (
              <MenuItem
                icon={<MessageSquarePlus size={15} />}
                label="Request a change"
                onClick={() => {
                  close()
                  setModal('request-change')
                }}
              />
            ) : null}

            {canRequestEnd ? (
              <MenuItem
                icon={<Power size={15} />}
                label="Request to end"
                onClick={() => {
                  close()
                  setModal('request-end')
                }}
              />
            ) : null}

            {showPendingNote ? (
              <p className="px-3 py-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                A request is already awaiting review.
              </p>
            ) : null}

            {canWithdrawSubmission ? (
              <MenuItem
                icon={<Undo2 size={15} />}
                label="Withdraw submission"
                onClick={() => {
                  close()
                  setModal('withdraw-submission')
                }}
              />
            ) : null}

            {showViewRedemptions ? (
              <Link
                href={`/redemptions?voucherId=${voucher.id}`}
                role="menuitem"
                onClick={close}
                className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-[var(--neutral)]"
              >
                <ExternalLink size={15} aria-hidden="true" /> View redemptions
              </Link>
            ) : null}

            {effectiveShowDuplicate ? (
              <MenuItem
                icon={<Copy size={15} />}
                label="Duplicate"
                onClick={() => {
                  close()
                  onDuplicate()
                }}
              />
            ) : null}

            {canRequestChange || canRequestEnd ? (
              <p className="px-3 pb-1.5 pt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Changes to live vouchers are reviewed before customers see them.
              </p>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      {modal === 'request-change' ? (
        <RequestChangeModal voucher={voucher} onClose={() => setModal(null)} />
      ) : null}

      {modal === 'request-end' ? (
        <RequestEndModal voucherId={voucher.id} voucherTitle={voucher.title} onClose={() => setModal(null)} />
      ) : null}

      {modal === 'withdraw-submission' ? (
        <Dialog
          label="Withdraw this submission"
          onClose={() => (!withdrawSubmission.isPending ? setModal(null) : undefined)}
          panelTestId="withdraw-submission-dialog"
        >
          <h2 className="font-display text-xl font-semibold text-[#010C35]">Withdraw this submission?</h2>
          <p className="mt-2 text-sm text-[#4B5366]">
            &ldquo;{voucher.title}&rdquo; returns to draft instantly. You can edit it and resubmit any time.
          </p>
          {actionError ? (
            <p role="alert" className="mt-2 text-xs font-medium" style={{ color: 'var(--destructive)' }}>
              {actionError}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setModal(null)} disabled={withdrawSubmission.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmWithdrawSubmission} disabled={withdrawSubmission.isPending}>
              {withdrawSubmission.isPending ? 'Withdrawing...' : 'Withdraw submission'}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </span>
  )
}
