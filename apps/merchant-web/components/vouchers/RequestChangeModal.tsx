'use client'

/**
 * Voucher governed flows (2026-07-07): the flagship "Request a change" modal
 * (prototype vouchers-6). A LIVE (ACTIVE) flagship voucher is interactive but
 * never directly editable - the merchant proposes new title/description/
 * estimatedSaving/terms values + a MANDATORY reason, and Redeemo reviews it
 * before the voucher changes for customers. Only the CHANGED fields (vs the
 * voucher's current values) are ever sent; PENDING_EDIT_EXISTS (one open
 * request per voucher) surfaces as a dedicated notice, not a generic error.
 *
 * P3 modal-hardening (mirrors ChangePasswordModal): every dismissal path (X,
 * Escape, scrim click, Cancel) is blocked while the request is in flight, so a
 * mid-request dismiss can never leave the merchant unsure whether it sent.
 */
import * as React from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { X } from '@/lib/icons'
import { useRequestFlagshipChange } from '@/lib/voucher/useVoucherGovernedActions'
import { governedErrorMessage } from '@/lib/voucher/governedErrors'
import { ApiError } from '@/lib/api/client'

export interface RequestChangeVoucher {
  id: string
  title: string
  description?: string | null
  terms?: string | null
  estimatedSaving: number
}

function val(v: string | null | undefined): string {
  return (v ?? '').trim()
}

export function RequestChangeModal({
  voucher,
  onClose,
}: {
  voucher: RequestChangeVoucher
  onClose: () => void
}) {
  const request = useRequestFlagshipChange()

  const [title, setTitle] = React.useState(val(voucher.title))
  const [description, setDescription] = React.useState(val(voucher.description))
  const [terms, setTerms] = React.useState(val(voucher.terms))
  const [saving, setSaving] = React.useState(String(voucher.estimatedSaving ?? ''))
  const [reason, setReason] = React.useState('')

  const [fieldError, setFieldError] = React.useState<string | null>(null)
  const [modalError, setModalError] = React.useState<string | null>(null)
  const [pendingExists, setPendingExists] = React.useState(false)

  // P3 modal-hardening: a ref mirrors the latest pending state so the close
  // guard reads it even if Dialog memoised onClose at mount.
  const busyRef = React.useRef(false)
  busyRef.current = request.isPending
  const requestClose = React.useCallback(() => {
    if (!busyRef.current) onClose()
  }, [onClose])

  function changedFields(): {
    title?: string
    description?: string
    terms?: string
    estimatedSaving?: number
  } {
    const fields: { title?: string; description?: string; terms?: string; estimatedSaving?: number } = {}
    const nextTitle = title.trim()
    if (nextTitle !== val(voucher.title)) fields.title = nextTitle

    const nextDescription = description.trim()
    if (nextDescription !== val(voucher.description)) fields.description = nextDescription

    const nextTerms = terms.trim()
    if (nextTerms !== val(voucher.terms)) fields.terms = nextTerms

    const trimmedSaving = saving.trim()
    if (trimmedSaving.length > 0) {
      const parsed = Math.round(Number(trimmedSaving) * 100) / 100
      if (Number.isFinite(parsed) && parsed !== voucher.estimatedSaving) fields.estimatedSaving = parsed
    }
    return fields
  }

  async function submit() {
    setModalError(null)
    setFieldError(null)
    setPendingExists(false)

    const trimmedReason = reason.trim()
    if (!trimmedReason) {
      setFieldError('Tell Redeemo why you want to change this voucher.')
      return
    }
    if (!title.trim()) {
      setFieldError('Give this voucher a title.')
      return
    }
    const trimmedSaving = saving.trim()
    if (trimmedSaving.length > 0 && !(Number(trimmedSaving) > 0)) {
      setFieldError('Enter a saving amount greater than 0, or leave it as it is.')
      return
    }

    const fields = changedFields()
    if (Object.keys(fields).length === 0) {
      setModalError('Change at least one field before sending a request.')
      return
    }

    try {
      await request.mutateAsync({ id: voucher.id, reason: trimmedReason, ...fields })
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
      label="Request a change"
      onClose={requestClose}
      panelTestId="request-change-modal"
      scrimTestId="request-change-scrim"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-foreground">Request a change</h2>
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
        This voucher stays live for customers exactly as it is until Redeemo approves your change.
      </p>

      {pendingExists ? (
        <p
          role="alert"
          data-testid="request-change-pending-exists"
          className="mt-4 rounded-[10px] border px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          A change request is already awaiting review. Withdraw it before sending a new one.
        </p>
      ) : null}

      {modalError ? (
        <p
          role="alert"
          data-testid="request-change-modal-error"
          className="mt-4 rounded-[10px] border px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          {modalError}
        </p>
      ) : null}

      {fieldError ? (
        <p role="alert" data-testid="request-change-field-error" className="mt-2 text-xs font-medium" style={{ color: 'var(--destructive)' }}>
          {fieldError}
        </p>
      ) : null}

      <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          <Label htmlFor="request-change-title">Title</Label>
          <Input
            id="request-change-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5">
          <Textarea
            id="request-change-description"
            label="Description"
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="request-change-saving">Estimated saving (GBP)</Label>
          <Input
            id="request-change-saving"
            inputMode="decimal"
            value={saving}
            onChange={(e) => setSaving(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5">
          <Textarea
            id="request-change-terms"
            label="Terms"
            maxLength={2000}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5">
          <Textarea
            id="request-change-reason"
            label="Why do you want this change?"
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            hint="Required. Redeemo's reviewer sees this."
          />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={requestClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={busy || pendingExists}>
          {busy ? 'Sending...' : 'Send request'}
        </Button>
      </div>
    </Dialog>
  )
}
