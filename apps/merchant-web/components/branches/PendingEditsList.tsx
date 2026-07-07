'use client'

// Branches PR-1 F7: the pending-edit banner + withdraw control (prototype 07). Given
// the branch's pendingEdits[] (PENDING-only on the payload, but we defensively filter
// status === 'PENDING' here too), it renders one banner per in-review identity edit
// with a Withdraw action for the owner. The withdraw goes through
// useWithdrawBranchEditRequest -> DELETE /edit-requests/:editId, invalidating the
// branch caches so the banner disappears once the server confirms. A non-owner sees
// the in-review banner but NO withdraw control (read-only).
//
// Fidelity polish (2026-07-07 audit): the banner used to show only generic copy
// ("A change is already in review") with no detail. It now diffs the edit's
// proposedChanges against the branch's CURRENT live values (computePendingEditDiff)
// and renders one "<Field label>: <old> -> <new>" row per changed field, plus the
// submission date (prototype 07's "Address awaiting review" banner). Image fields
// (logoUrl/bannerUrl) never print the raw URL - they get a friendly
// "<Field> image (change pending)" row instead.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Clock, ArrowRight } from '@/lib/icons'
import { useWithdrawBranchEditRequest } from '@/lib/branches/useBranches'
import { formatDateLabel } from '@/lib/business-profile/format'
import { computePendingEditDiff } from '@/lib/pendingEditDiff'
import type { Branch, BranchPendingEdit } from '@/lib/api/branch'

// The SENSITIVE_FIELDS this card knows how to label + diff (mirrors the backend
// allow-list the BranchDetailsEditModal submits from). Any other proposedChanges
// key (e.g. the photo edit's add/remove arrays, or a resolved lat/lng) is silently
// skipped by computePendingEditDiff - this is a display diff, not a payload dump.
const FIELD_LABELS: Record<string, string> = {
  name: 'Branch name',
  about: 'Description',
  addressLine1: 'Address line 1',
  addressLine2: 'Address line 2',
  city: 'Town or city',
  postcode: 'Postcode',
  logoUrl: 'Logo image',
  bannerUrl: 'Banner image',
}
const IMAGE_FIELDS = new Set(['logoUrl', 'bannerUrl'])

// Identity edits are the non-photo pending edits (photo edits surface via the F3
// review banner / F11 photo card, not here).
function identityPendingEdits(branch: Branch): BranchPendingEdit[] {
  return (branch.pendingEdits ?? []).filter((e) => e.status === 'PENDING' && !e.includesPhotos)
}

export function PendingEditsList({ branch, canManage }: { branch: Branch; canManage: boolean }) {
  const { toast } = useToast()
  const withdraw = useWithdrawBranchEditRequest()
  const [actionError, setActionError] = React.useState<string | null>(null)

  const pending = identityPendingEdits(branch)
  if (pending.length === 0) return null

  async function onWithdraw(editId: string) {
    setActionError(null)
    try {
      await withdraw.mutateAsync({ id: branch.id, editId })
      toast({ message: 'Edit withdrawn.', variant: 'success' })
    } catch {
      setActionError('We could not withdraw this change. Please try again.')
    }
  }

  return (
    <div className="space-y-3" data-testid="branch-pending-edits">
      {actionError ? (
        <p
          role="alert"
          className="rounded-[10px] border px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          {actionError}
        </p>
      ) : null}

      {pending.map((edit) => {
        const rows = computePendingEditDiff(edit.proposedChanges, branch, FIELD_LABELS, IMAGE_FIELDS)
        const submittedOn = formatDateLabel(edit.createdAt)
        // Mirrors the prototype's "<Field> awaiting review" heading tone: name the
        // single changed field when there is exactly one, otherwise a calm generic
        // heading for a multi-field edit.
        const heading = rows.length === 1 ? `${rows[0].label} awaiting review` : 'Branch details awaiting review'
        return (
          <div
            key={edit.id}
            data-testid="pending-edit-row"
            className="flex items-start justify-between gap-3 rounded-[14px] p-4"
            style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-3">
                <Clock size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--rose)' }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{heading}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Redeemo is reviewing the changes below. Your current details stay live for customers
                    until each is approved.
                    {submittedOn ? ` Submitted ${submittedOn}.` : null}
                  </p>
                </div>
              </div>

              {rows.length > 0 ? (
                <dl className="mt-3 space-y-1.5 pl-[30px]" data-testid="pending-edit-diff">
                  {rows.map((row) => (
                    <div key={row.field} className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                      <dt className="font-medium text-foreground">{row.label}:</dt>
                      {row.isImage ? (
                        <dd className="text-muted-foreground">{row.label} (change pending)</dd>
                      ) : (
                        <dd className="flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground">
                          <span className="line-through">{row.oldDisplay}</span>
                          <ArrowRight size={13} aria-hidden className="shrink-0" />
                          <span className="font-semibold text-foreground">{row.newDisplay}</span>
                        </dd>
                      )}
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
            {canManage ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onWithdraw(edit.id)}
                disabled={withdraw.isPending}
              >
                {withdraw.isPending ? 'Withdrawing...' : 'Withdraw'}
              </Button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
