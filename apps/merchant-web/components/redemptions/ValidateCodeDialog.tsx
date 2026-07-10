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
import { useToast } from '@/components/ui/toast'
import { CircleCheck, AlertTriangle, ScanLine, X } from '@/lib/icons'
import { ApiError } from '@/lib/api/client'
import { lookupRedemptionByCode, validateRedemptionCode, type RedemptionRow } from '@/lib/api/redemptions'
import {
  formatRedemptionCode,
  formatRedeemedAt,
  formatSaving,
  voucherTypeChip,
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

type Step = 'entry' | 'preview' | 'done' | 'error'

const labelClass = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'

function PreviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <span className={labelClass}>{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{children}</span>
    </div>
  )
}

// Prototype fidelity: the preview step leads with WHO is being validated (name +
// voucher chip), then a separate facts card for the rest. Same fields as before,
// just re-emphasised; no new/different data.
function CustomerCard({ row }: { row: RedemptionRow }) {
  return (
    <div className="rounded-lg border border-border bg-cream p-4">
      <p className="font-display text-base font-semibold text-foreground">{row.customerName}</p>
      <Chip type={voucherTypeChip(row.voucher.type)} className="mt-2">
        {row.voucher.title}
      </Chip>
    </div>
  )
}

function PreviewFacts({ row }: { row: RedemptionRow }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <PreviewRow label="Saving">{formatSaving(row.estimatedSaving)}</PreviewRow>
      <PreviewRow label="Branch">{row.branch.name}</PreviewRow>
      <PreviewRow label="Redeemed">{formatRedeemedAt(row.redeemedAt)}</PreviewRow>
      <PreviewRow label="Code">{formatRedemptionCode(row.redemptionCode)}</PreviewRow>
      {row.status === 'VALIDATED' && (
        <>
          <PreviewRow label="Validated">{formatRedeemedAt(row.validatedAt)}</PreviewRow>
          {row.validatedByLabel && <PreviewRow label="By">{row.validatedByLabel}</PreviewRow>}
        </>
      )}
    </div>
  )
}

// The verify response may carry the validator label; typed loosely so the
// success detail block can show it when present (never guessed).
type ValidateResult = { validatedByLabel?: string | null }

export function ValidateCodeDialog({
  onClose,
  initialCode = '',
}: {
  onClose: () => void
  // Pre-seeds the entry input (the detail drawer's "Validate this code" action).
  initialCode?: string
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [step, setStep] = React.useState<Step>('entry')
  const [code, setCode] = React.useState(() => normalizeCode(initialCode))
  const [preview, setPreview] = React.useState<RedemptionRow | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  // The dedicated "Check the code" warning-state message (format-invalid or
  // not-found); distinct from the inline `error` used for suspended / branch /
  // generic failures on the entry + preview steps.
  const [warning, setWarning] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<ValidateResult | null>(null)
  const [busy, setBusy] = React.useState(false)
  // The new header close button is the first focusable element in the panel.
  // Dialog's default "focus the first focusable" fallback would land there
  // instead of the code input, so explicitly refocus the input on mount (this
  // effect runs after Dialog's own mount-focus effect, since Dialog is the
  // child here) to preserve the existing entry-step focus behaviour.
  const inputWrapRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    inputWrapRef.current?.querySelector<HTMLInputElement>('input')?.focus()
    // Mount only.
  }, [])

  const normalized = normalizeCode(code)

  async function handleLookup() {
    setError(null)
    if (!CODE_ALPHABET.test(normalized)) {
      setWarning(
        'A redemption code is eight characters, shown as two groups of four. Enter all eight to continue.',
      )
      setStep('error')
      return
    }
    setBusy(true)
    try {
      const row = await lookupRedemptionByCode(normalized)
      setPreview(row)
      setStep('preview')
    } catch (err) {
      // A not-found code is a "check the code" problem, so it goes to the same
      // dedicated warning state as a malformed code. Other failures (suspended,
      // branch unavailable, generic) stay as an inline note on the entry step.
      if (err instanceof ApiError && err.code === 'REDEMPTION_NOT_FOUND') {
        setWarning(messageForError(err))
        setStep('error')
      } else {
        setError(messageForError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirm() {
    setError(null)
    setBusy(true)
    try {
      const res = (await validateRedemptionCode(normalized)) as ValidateResult
      // The backend has already validated the code at this point, so the success
      // step must show immediately: never make it wait on the log refetch below.
      // A stalled invalidation used to leave the merchant staring at a spinner
      // with no feedback even though validation had already succeeded.
      setResult(res ?? null)
      setStep('done')
      toast({ message: 'Redemption validated.', variant: 'success' })
      void queryClient.invalidateQueries({ queryKey: ['redemptions'] })
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

  // Reset to a fresh entry step (Back, "Try another code", "Validate another").
  function backToEntry() {
    setStep('entry')
    setPreview(null)
    setResult(null)
    setError(null)
    setWarning(null)
    setCode('')
  }

  const isAlreadyValidated = preview?.status === 'VALIDATED'
  const validatedByLabel = result?.validatedByLabel ?? preview?.validatedByLabel ?? null

  return (
    <Dialog
      label="Validate a code"
      onClose={onClose}
      panelTestId="validate-code-dialog"
      scrimTestId="validate-code-scrim"
    >
      <div className="space-y-4">
        <header className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-navy text-white"
            >
              <ScanLine size={20} aria-hidden="true" />
            </span>
            <h2 className="font-display text-lg font-semibold text-foreground">Validate a code</h2>
          </div>
          <Button variant="secondary" size="icon" className="size-8" aria-label="Close" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </Button>
        </header>

        {error && step !== 'error' && (
          <div role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        {step === 'entry' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the redemption code from the customer&apos;s bill to confirm their redemption
              in store.
            </p>
            <div ref={inputWrapRef} className="space-y-1.5">
              <Input
                type="text"
                inputMode="text"
                autoComplete="off"
                placeholder="A7K2 P9X4"
                aria-label="Redemption code"
                value={formatRedemptionCode(code)}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
                className="h-14 text-center font-mono text-2xl tracking-[0.2em]"
              />
              <p className="text-center text-xs text-muted-foreground">
                Two groups of four, letters and numbers. Never the letters O or I.
              </p>
            </div>
            <Button variant="gradient" className="w-full" onClick={handleLookup} disabled={busy}>
              {busy ? 'Looking up...' : 'Look up code'}
            </Button>
            <div
              className="flex items-start gap-3 rounded-xl border px-4 py-3"
              style={{ borderColor: 'rgba(1,12,53,0.12)', background: 'rgba(1,12,53,0.03)' }}
            >
              <ScanLine size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-navy" />
              <p className="text-sm text-muted-foreground">
                On the web, enter the code by hand. QR scanning is done in the Redeemo staff app
                at the counter.
              </p>
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <p
              className={
                isAlreadyValidated
                  ? 'text-sm font-semibold text-foreground'
                  : 'text-sm text-foreground'
              }
            >
              {isAlreadyValidated
                ? 'This code is already validated.'
                : 'Check this is the customer in front of you, then confirm.'}
            </p>
            <CustomerCard row={preview} />
            <PreviewFacts row={preview} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={backToEntry} disabled={busy}>
                {isAlreadyValidated ? 'Back' : 'Not this person'}
              </Button>
              {isAlreadyValidated ? (
                <Button variant="secondary" onClick={onClose}>
                  Done
                </Button>
              ) : (
                <Button variant="gradient" onClick={handleConfirm} disabled={busy}>
                  {busy ? 'Validating...' : 'Confirm redemption'}
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2 pt-2 text-center">
              <span
                className="flex size-20 items-center justify-center rounded-full"
                style={{ background: 'rgba(15,122,62,0.10)' }}
              >
                <CircleCheck size={40} aria-hidden="true" style={{ color: 'var(--success)' }} />
              </span>
              <p className="font-display text-xl font-semibold text-foreground">
                Validated for {preview?.customerName}
              </p>
              <p className="text-sm text-muted-foreground">
                {preview?.voucher.title}. The customer can enjoy their voucher now.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-cream px-4 py-1">
              {validatedByLabel && <PreviewRow label="Validated by">{validatedByLabel}</PreviewRow>}
              <PreviewRow label="When">Just now</PreviewRow>
              <PreviewRow label="Method">Manual code entry</PreviewRow>
            </div>

            <div className="flex justify-end gap-2">
              {/* Dismiss = secondary (owner no-navy-CTA direction); the primary
                  forward action (Validate another) keeps the brand gradient. */}
              <Button variant="secondary" onClick={onClose}>
                Done
              </Button>
              <Button variant="gradient" onClick={backToEntry}>
                Validate another
              </Button>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2 pt-2 text-center">
              <span
                className="flex size-20 items-center justify-center rounded-2xl"
                style={{ background: 'rgba(232,74,0,0.10)' }}
              >
                <AlertTriangle size={36} aria-hidden="true" style={{ color: 'var(--coral)' }} />
              </span>
              <p className="font-display text-xl font-semibold text-foreground">Check the code</p>
              <p className="text-sm text-muted-foreground">{warning}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button variant="gradient" onClick={backToEntry}>
                Try another code
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
