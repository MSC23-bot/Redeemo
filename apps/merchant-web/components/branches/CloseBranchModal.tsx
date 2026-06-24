'use client'

// Branches PR-5 §6 (CLOSE): the reason-collecting close-request modal (prototype 10).
// Heading "Request to close <branch>?"; explainer that the request goes to Redeemo and
// the branch stays live for customers until it is approved; a reason radio list
// (Permanently closed / Relocating to a new address / Temporary refurbishment / Other,
// with an Other free-text box); Cancel + "Send close request".
//
// On submit -> useRequestBranchClose. The branch STAYS live; the detail page re-reads
// (now PENDING_CLOSE) and the pending-close banner appears. The backend enforces the
// not-main / not-last-active rules at request time; this modal surfaces those calmly:
//   BRANCH_IS_MAIN     -> "make another branch your main branch first"
//   BRANCH_LAST_ACTIVE -> "this is your last active branch"
// (the modal stays open and "Send close request" re-enables on every error).
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Info, X } from '@/lib/icons'
import { useRequestBranchClose } from '@/lib/branches/useBranches'
import { ApiError } from '@/lib/api/client'
import type { Branch } from '@/lib/api/branch'

// The four prototype-10 reason options. The first three submit a fixed reason label;
// "other" submits the free-text the merchant typed. The backend requires a non-empty
// trimmed reason (audit-only, shown to the admin reviewer).
const PRESET_REASONS = [
  { id: 'permanently-closed', label: 'Permanently closed' },
  { id: 'relocating', label: 'Relocating to a new address' },
  { id: 'refurbishment', label: 'Temporary refurbishment' },
] as const

type ReasonId = (typeof PRESET_REASONS)[number]['id'] | 'other'

export function CloseBranchModal({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const request = useRequestBranchClose()

  const [reasonId, setReasonId] = React.useState<ReasonId | null>(null)
  const [otherText, setOtherText] = React.useState('')
  const [formError, setFormError] = React.useState<string | null>(null)
  const [modalError, setModalError] = React.useState<string | null>(null)

  function resolvedReason(): string | null {
    if (reasonId === 'other') return otherText.trim() || null
    const preset = PRESET_REASONS.find((r) => r.id === reasonId)
    return preset ? preset.label : null
  }

  async function submit() {
    setFormError(null)
    setModalError(null)
    const reason = resolvedReason()
    if (!reason) {
      setFormError(
        reasonId === 'other'
          ? 'Tell us why you are closing this branch.'
          : 'Choose a reason for closing this branch.',
      )
      return
    }
    try {
      await request.mutateAsync({ id: branch.id, reason })
      onClose()
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined
      if (code === 'BRANCH_IS_MAIN') {
        setModalError(
          'You cannot close your main branch. Make another branch your main branch first, then request to close this one.',
        )
        return
      }
      if (code === 'BRANCH_LAST_ACTIVE') {
        setModalError(
          'You cannot close your last active branch. Add or reactivate another branch first.',
        )
        return
      }
      if (code === 'BRANCH_CLOSE_REQUEST_EXISTS') {
        setModalError('A close request for this branch is already in review.')
        return
      }
      setModalError('We could not send your close request. Please try again.')
    }
  }

  return (
    <Dialog
      label={`Request to close ${branch.name}`}
      onClose={onClose}
      panelTestId="close-branch-modal"
      scrimTestId="close-branch-scrim"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-foreground">
          Request to close {branch.name}?
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-[#6B7390] hover:text-[#010C35]"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      {/* Prototype-10 explainer: the request is reviewed, the branch stays live until then. */}
      <div
        className="mt-4 flex items-start gap-3 rounded-[14px] p-4"
        style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
      >
        <Info size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--rose)' }} />
        <p className="text-sm text-muted-foreground">
          This goes to Redeemo to review. The branch stays live for customers until it is approved, so
          they are not caught out. Tell us why you are closing it.
        </p>
      </div>

      {modalError ? (
        <p
          role="alert"
          data-testid="close-branch-modal-error"
          className="mt-4 rounded-[10px] border px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          {modalError}
        </p>
      ) : null}

      <fieldset className="mt-4 space-y-2.5">
        <legend className="sr-only">Reason for closing this branch</legend>
        {PRESET_REASONS.map((r) => (
          <ReasonRow
            key={r.id}
            label={r.label}
            checked={reasonId === r.id}
            onSelect={() => {
              setReasonId(r.id)
              setFormError(null)
            }}
          />
        ))}
        <ReasonRow
          label="Other"
          checked={reasonId === 'other'}
          onSelect={() => {
            setReasonId('other')
            setFormError(null)
          }}
        />
        {reasonId === 'other' ? (
          <div className="pl-7">
            <Input
              data-testid="close-branch-other-text"
              aria-label="Reason for closing this branch"
              value={otherText}
              onChange={(e) => {
                setOtherText(e.target.value)
                setFormError(null)
              }}
              placeholder="Tell us why you are closing this branch."
            />
          </div>
        ) : null}
      </fieldset>

      {formError ? (
        <p
          role="alert"
          data-testid="close-branch-form-error"
          className="mt-2 text-xs font-medium"
          style={{ color: 'var(--destructive)' }}
        >
          {formError}
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={request.isPending}>
          Cancel
        </Button>
        <Button
          type="button"
          data-testid="send-close-request"
          onClick={submit}
          disabled={request.isPending}
        >
          {request.isPending ? 'Sending...' : 'Send close request'}
        </Button>
      </div>
    </Dialog>
  )
}

function ReasonRow({
  label,
  checked,
  onSelect,
}: {
  label: string
  checked: boolean
  onSelect: () => void
}) {
  return (
    <label
      className="flex cursor-pointer items-center gap-3 rounded-[12px] border px-3.5 py-3 text-sm font-medium transition-colors"
      style={{
        borderColor: checked ? 'var(--rose)' : 'var(--border-subtle)',
        background: checked ? 'var(--tint)' : 'var(--card, #fff)',
      }}
    >
      <input
        type="radio"
        name="close-branch-reason"
        checked={checked}
        onChange={onSelect}
        className="size-4 accent-[var(--rose)]"
      />
      <span className="text-foreground">{label}</span>
    </label>
  )
}
