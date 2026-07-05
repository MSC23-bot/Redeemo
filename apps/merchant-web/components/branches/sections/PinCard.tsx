'use client'

// Branches PR-1 F6: the owner-only Redemption PIN card (prototype 04/08). The PIN is
// MASKED by default (dots). The decrypted value is fetched ON DEMAND via GET /pin
// (the getBranchPin client) only when the owner taps Reveal: NEVER from the list
// payload (since #377 the payload carries only the derived `redemptionPinSet`
// boolean; the ciphertext no longer rides the wire). Change validates /^\d{4}$/ then PUTs (useSetBranchPin); Send
// dispatches the PIN to the branch (useSendBranchPin). The whole section is
// owner-only (all PIN routes are owner-only); a non-owner sees nothing.
//
// SECURITY (wire hygiene 2026-07-05, revising plan §6 #3/#4): set/not-set comes
// from the shared branchPinSet bridge (explicit server boolean wins; legacy
// presence-only fallback covers old-backend deploy skew); the decrypted value
// comes solely from the explicit-reveal GET /pin.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { Eye, EyeOff, KeyRound, Pencil, Send } from '@/lib/icons'
import { useSetBranchPin, useSendBranchPin } from '@/lib/branches/useBranches'
import { getBranchPin, type Branch } from '@/lib/api/branch'
import { branchPinSet } from '@/lib/branches/pinSet'
import { ApiError } from '@/lib/api/client'

// Bridge fields (see lib/branches/pinSet.ts removal trigger for the legacy one).
type BranchWithPin = Branch & { redemptionPinSet?: boolean; redemptionPin?: string | null }

const PIN_RE = /^\d{4}$/

function pinErrorMessage(err: unknown, fallback: string): string {
  const code = err instanceof ApiError ? err.code : undefined
  if (code === 'INVALID_PIN_FORMAT') return 'The PIN must be exactly 4 digits.'
  if (code === 'PIN_NOT_CONFIGURED') return 'No PIN is set yet. Set a PIN before sending it to the branch.'
  return fallback
}

export function PinCard({ branch, canManage }: { branch: Branch; canManage: boolean }) {
  const { toast } = useToast()
  const change = useSetBranchPin()
  const send = useSendBranchPin()

  const pinSet = branchPinSet(branch as BranchWithPin)

  const [revealed, setRevealed] = React.useState<string | null>(null)
  const [revealing, setRevealing] = React.useState(false)
  const [changing, setChanging] = React.useState(false)
  const [draftPin, setDraftPin] = React.useState('')
  const [actionError, setActionError] = React.useState<string | null>(null)

  // Quick-Action deep-link: /branches/{id}#pin loads the branch page async, so
  // the browser's native hash scroll fires before this card exists. Scroll on
  // mount when the hash targets us. (Effect sits above the owner early-return
  // to satisfy the rules of hooks; it no-ops when the card never renders.)
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#pin') {
      document.getElementById('pin')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  // The whole section is owner-only.
  if (!canManage) return null

  async function reveal() {
    if (revealed) {
      setRevealed(null) // toggle hide
      return
    }
    setActionError(null)
    setRevealing(true)
    try {
      const res = await getBranchPin(branch.id)
      setRevealed(res.pin ?? null)
    } catch (err) {
      setActionError(pinErrorMessage(err, 'We could not reveal the PIN. Please try again.'))
    } finally {
      setRevealing(false)
    }
  }

  function startChange() {
    setDraftPin('')
    setActionError(null)
    setChanging(true)
  }

  function cancelChange() {
    setActionError(null)
    setChanging(false)
  }

  async function saveChange() {
    if (!PIN_RE.test(draftPin)) {
      setActionError('Enter exactly 4 digits (numbers only).')
      return
    }
    setActionError(null)
    try {
      await change.mutateAsync({ id: branch.id, pin: draftPin })
      toast({ message: 'PIN updated.', variant: 'success' })
      // After a change the revealed value is stale; collapse back to masked.
      setRevealed(null)
      setChanging(false)
    } catch (err) {
      setActionError(pinErrorMessage(err, 'We could not update the PIN. Please try again.'))
    }
  }

  async function dispatchToBranch() {
    setActionError(null)
    try {
      await send.mutateAsync(branch.id)
      toast({ message: 'PIN sent to the branch.', variant: 'success' })
    } catch (err) {
      setActionError(pinErrorMessage(err, 'We could not send the PIN. Please try again.'))
    }
  }

  return (
    // id="pin": the topbar Quick Action deep-links to /branches/{id}#pin so the
    // browser lands on this card; the PIN itself still reveals only on demand.
    <Card className="gap-4" data-testid="branch-pin-card" id="pin" style={{ scrollMarginTop: 80 }}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <div className="flex items-center gap-2">
          <KeyRound size={16} aria-hidden style={{ color: 'var(--text-tertiary)' }} />
          <h2 className="font-display text-lg font-semibold text-foreground">Redemption PIN</h2>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: 'rgba(15, 122, 62, 0.10)', color: 'var(--success)' }}
        >
          Saves instantly
        </span>
      </div>

      <div className="space-y-4 px-6">
        <p className="text-sm text-muted-foreground">
          The 4 digit PIN a customer enters in their app to redeem here. Keep it private.
        </p>

        {actionError ? (
          <p
            role="alert"
            className="rounded-[10px] border px-3 py-2 text-sm font-medium"
            style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
          >
            {actionError}
          </p>
        ) : null}

        {/* Masked PIN display (or the revealed value on demand). */}
        {pinSet ? (
          <PinDots revealed={revealed} />
        ) : (
          <p className="text-sm font-semibold text-foreground">No PIN set yet</p>
        )}

        {/* Change-PIN inline form. */}
        {changing ? (
          <div className="space-y-3 rounded-[12px] border p-3" style={{ borderColor: 'var(--border-subtle)', background: 'var(--cream)' }}>
            <div className="space-y-1.5">
              <Label htmlFor="branch-pin-new">New 4-digit PIN</Label>
              <Input
                id="branch-pin-new"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={draftPin}
                onChange={(e) => setDraftPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="0000"
                className="w-28 tracking-[0.4em]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" onClick={saveChange} disabled={change.isPending}>
                {change.isPending ? 'Saving...' : 'Save PIN'}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={cancelChange} disabled={change.isPending}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {/* Actions: Reveal (toggle) / Change / Send. */}
        {!changing ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={reveal}
              disabled={!pinSet || revealing}
            >
              {revealed ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
              {revealing ? 'Revealing...' : revealed ? 'Hide' : 'Reveal'}
            </Button>
            <Button type="button" variant="secondary" onClick={startChange}>
              <Pencil size={15} aria-hidden /> {pinSet ? 'Change PIN' : 'Set PIN'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={dispatchToBranch}
              disabled={!pinSet || send.isPending}
            >
              <Send size={15} aria-hidden /> {send.isPending ? 'Sending...' : 'Send to branch'}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  )
}

// The masked / revealed PIN display. When not revealed we show four neutral dots so
// the value never appears until an explicit reveal.
function PinDots({ revealed }: { revealed: string | null }) {
  if (revealed) {
    return (
      <p className="font-display text-2xl font-semibold tracking-[0.4em] text-foreground" data-testid="branch-pin-value">
        {revealed}
      </p>
    )
  }
  return (
    <div className="flex items-center gap-2" aria-label="PIN hidden" data-testid="branch-pin-masked">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          aria-hidden
          className="inline-block size-3 rounded-full"
          style={{ background: 'var(--navy)' }}
        />
      ))}
    </div>
  )
}
