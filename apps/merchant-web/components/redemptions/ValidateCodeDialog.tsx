'use client'

/**
 * M3 F2: the two-step Validate-a-code dialog.
 *
 * State machine: entry -> preview -> done.
 *   - entry:   8-char code input, normalised (uppercase, strip non-alphanumerics)
 *              and displayed 4+4. Client-side format validation runs BEFORE any
 *              request (no network on an obviously wrong code).
 *   - preview: a read-only merchant-safe match from lookupRedemptionByCode. If the
 *              code is awaiting validation a Confirm action calls verify (method
 *              MANUAL); if it is already validated the details show with NO confirm
 *              (never double-validate).
 *   - done:    success state after a confirm. On success the ['redemptions'] query
 *              is invalidated so the log reflects the new state.
 *
 * Web is manual entry only; QR scanning is done in the Redeemo staff app at the
 * counter (forward-compat, no QR UI here).
 *
 * Privacy: the preview renders the customer's pre-formatted first name + last
 * initial; it never receives or displays email/phone/PIN.
 */
import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip } from '@/components/ui/chip'
import { CircleCheck } from '@/lib/icons'
import { ApiError } from '@/lib/api/client'
import { lookupRedemptionByCode, validateRedemptionCode, type RedemptionRow } from '@/lib/api/redemptions'
import {
  formatRedemptionCode,
  formatRedeemedAt,
  formatSaving,
  voucherTypeChip,
  voucherTypeLabel,
} from '@/lib/redemptions/display'

// Backend code alphabet (A-Z + 0-9 minus O,I), 8 chars. The client format check
// only needs the length + alphabet; the server is the source of truth.
const CODE_LENGTH = 8
const CODE_ALPHABET = /^[A-Z0-9]{8}$/

function normalizeCode(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)
}

// Maps a thrown error to user-facing copy. Cross-tenant lookups are masked as
// REDEMPTION_NOT_FOUND server-side, so the same not-found message covers them.
function messageForError(err: unknown): string {
  const code = err instanceof ApiError ? err.code : undefined
  switch (code) {
    case 'REDEMPTION_NOT_FOUND':
      return 'No redemption found for that code. Check it and try again.'
    case 'MERCHANT_SUSPENDED':
      // Prototype "Validation paused" copy: the Validate CTA stays enabled while
      // suspended; the pause is explained here, inside the dialog.
      return 'Your account is suspended at the moment, so codes cannot be validated. Resolve this with Redeemo to start validating again.'
    case 'BRANCH_UNAVAILABLE':
      return 'This branch is currently unavailable.'
    default:
      return 'Something went wrong. Please try again.'
  }
}

type Step = 'entry' | 'preview' | 'done'

const labelClass = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'

function PreviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <span className={labelClass}>{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{children}</span>
    </div>
  )
}

function PreviewBody({ row }: { row: RedemptionRow }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="font-semibold text-foreground">{row.voucher.title}</span>
        <Chip type={voucherTypeChip(row.voucher.type)}>{voucherTypeLabel(row.voucher.type)}</Chip>
      </div>
      <PreviewRow label="Code">{formatRedemptionCode(row.redemptionCode)}</PreviewRow>
      <PreviewRow label="Customer">{row.customerName}</PreviewRow>
      <PreviewRow label="Branch">{row.branch.name}</PreviewRow>
      <PreviewRow label="Redeemed">{formatRedeemedAt(row.redeemedAt)}</PreviewRow>
      <PreviewRow label="Saving">{formatSaving(row.estimatedSaving)}</PreviewRow>
      {row.status === 'VALIDATED' && (
        <>
          <PreviewRow label="Validated">{formatRedeemedAt(row.validatedAt)}</PreviewRow>
          {row.validatedByLabel && <PreviewRow label="By">{row.validatedByLabel}</PreviewRow>}
        </>
      )}
    </div>
  )
}

export function ValidateCodeDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [step, setStep] = React.useState<Step>('entry')
  const [code, setCode] = React.useState('')
  const [preview, setPreview] = React.useState<RedemptionRow | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const normalized = normalizeCode(code)

  async function handleLookup() {
    setError(null)
    if (!CODE_ALPHABET.test(normalized)) {
      setError('Enter the 8-character code (letters and numbers).')
      return
    }
    setBusy(true)
    try {
      const row = await lookupRedemptionByCode(normalized)
      setPreview(row)
      setStep('preview')
    } catch (err) {
      setError(messageForError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirm() {
    setError(null)
    setBusy(true)
    try {
      await validateRedemptionCode(normalized)
      await queryClient.invalidateQueries({ queryKey: ['redemptions'] })
      setStep('done')
    } catch (err) {
      // Defensive: a race could have validated the code between lookup and
      // confirm. Re-show the already-validated preview instead of an error.
      if (err instanceof ApiError && err.code === 'ALREADY_VALIDATED') {
        setPreview((p) => (p ? { ...p, status: 'VALIDATED' } : p))
        setStep('preview')
      } else {
        setError(messageForError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  function backToEntry() {
    setStep('entry')
    setPreview(null)
    setError(null)
  }

  const isAlreadyValidated = preview?.status === 'VALIDATED'

  return (
    <Dialog
      label="Validate a code"
      onClose={onClose}
      panelTestId="validate-code-dialog"
      scrimTestId="validate-code-scrim"
    >
      <div className="space-y-4">
        <header className="space-y-1">
          <h2 className="font-display text-lg font-semibold text-foreground">Validate a code</h2>
          <p className="text-sm text-muted-foreground">
            Enter the redemption code from the customer&apos;s bill. QR scanning is done in the
            Redeemo staff app at the counter.
          </p>
        </header>

        {error && (
          <div role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        {step === 'entry' && (
          <div className="space-y-4">
            <label className="block space-y-1">
              <span className={labelClass}>Redemption code</span>
              <Input
                type="text"
                inputMode="text"
                autoComplete="off"
                placeholder="A7K2 P9X4"
                aria-label="Redemption code"
                value={formatRedemptionCode(code)}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
                className="font-mono text-base tracking-widest"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="gradient" onClick={handleLookup} disabled={busy}>
                {busy ? 'Looking up...' : 'Look up'}
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            {isAlreadyValidated && (
              <p className="text-sm font-semibold text-foreground">
                This code is already validated.
              </p>
            )}
            <PreviewBody row={preview} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={backToEntry} disabled={busy}>
                Back
              </Button>
              {isAlreadyValidated ? (
                <Button variant="navy" onClick={onClose}>
                  Done
                </Button>
              ) : (
                <Button variant="gradient" onClick={handleConfirm} disabled={busy}>
                  {busy ? 'Validating...' : 'Confirm validation'}
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
              <CircleCheck size={28} aria-hidden="true" style={{ color: 'var(--success)' }} />
              <div>
                <p className="font-semibold text-foreground">Validated</p>
                <p className="text-sm text-muted-foreground">
                  {preview?.voucher.title} for {preview?.customerName} is now validated.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="navy" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
