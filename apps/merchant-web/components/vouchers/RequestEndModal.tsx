'use client'

/**
 * Voucher governed flows (2026-07-07): the custom-voucher "Request to end"
 * modal (prototype vouchers-4's live-custom kebab). A LIVE (ACTIVE) custom
 * voucher's deactivation is governed - the merchant gives a MANDATORY reason
 * and Redeemo reviews it; the voucher stays live for customers until approved.
 * Never offered on a flagship voucher (D4: flagship can never be ended - the
 * caller never mounts this for one, and the backend re-rejects with
 * VOUCHER_EDIT_NOT_ALLOWED as defence-in-depth).
 *
 * Same P3 modal-hardening as RequestChangeModal: no dismissal while in flight.
 */
import * as React from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { X } from '@/lib/icons'
import { useRequestVoucherEnd } from '@/lib/voucher/useVoucherGovernedActions'
import { governedErrorMessage } from '@/lib/voucher/governedErrors'
import { ApiError } from '@/lib/api/client'

export function RequestEndModal({
  voucherId,
  voucherTitle,
  onClose,
}: {
  voucherId: string
  voucherTitle: string
  onClose: () => void
}) {
  const request = useRequestVoucherEnd()

  const [reason, setReason] = React.useState('')
  const [fieldError, setFieldError] = React.useState<string | null>(null)
  const [modalError, setModalError] = React.useState<string | null>(null)
  const [pendingExists, setPendingExists] = React.useState(false)

  const busyRef = React.useRef(false)
  busyRef.current = request.isPending
  const requestClose = React.useCallback(() => {
    if (!busyRef.current) onClose()
  }, [onClose])

  async function submit() {
    setModalError(null)
    setFieldError(null)
    setPendingExists(false)

    const trimmed = reason.trim()
    if (!trimmed) {
      setFieldError('Tell Redeemo why you want to end this voucher.')
      return
    }

    try {
      await request.mutateAsync({ id: voucherId, reason: trimmed })
      onClose()
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined
      if (code === 'PENDING_EDIT_EXISTS') {
        setPendingExists(true)
        return
      }
      setModalError(governedErrorMessage(code, 'We could not send your request. Please try again.'))
    }
  }

  const busy = request.isPending

  return (
    <Dialog
      label={`Request to end ${voucherTitle}`}
      onClose={requestClose}
      panelTestId="request-end-modal"
      scrimTestId="request-end-scrim"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-foreground">
          Request to end {voucherTitle}?
        </h2>
        <button
          type="button"
          onClick={requestClose}
          disabled={busy}
          aria-label="Close"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        This goes to Redeemo to review. The voucher stays live for customers until it is approved.
      </p>

      {pendingExists ? (
        <p
          role="alert"
          data-testid="request-end-pending-exists"
          className="mt-4 rounded-[10px] border px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          A request for this voucher is already awaiting review.
        </p>
      ) : null}

      {modalError ? (
        <p
          role="alert"
          data-testid="request-end-modal-error"
          className="mt-4 rounded-[10px] border px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          {modalError}
        </p>
      ) : null}

      <div className="mt-4 space-y-1.5">
        <Textarea
          id="request-end-reason"
          label="Why do you want to end this voucher?"
          maxLength={2000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
        />
        {fieldError ? (
          <p role="alert" data-testid="request-end-field-error" className="text-xs font-medium" style={{ color: 'var(--destructive)' }}>
            {fieldError}
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" onClick={requestClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" onClick={submit} disabled={busy || pendingExists}>
          {busy ? 'Sending...' : 'Send request'}
        </Button>
      </div>
    </Dialog>
  )
}
