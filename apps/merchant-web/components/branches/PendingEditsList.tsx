'use client'

// Branches PR-1 F7: the pending-edit banner + withdraw control (prototype 07). Given
// the branch's pendingEdits[] (PENDING-only on the payload, but we defensively filter
// status === 'PENDING' here too), it renders one banner per in-review identity edit
// with a Withdraw action for the owner. The withdraw goes through
// useWithdrawBranchEditRequest -> DELETE /edit-requests/:editId, invalidating the
// branch caches so the banner disappears once the server confirms. A non-owner sees
// the in-review banner but NO withdraw control (read-only).
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Clock } from '@/lib/icons'
import { useWithdrawBranchEditRequest } from '@/lib/branches/useBranches'
import type { Branch, BranchPendingEdit } from '@/lib/api/branch'

// Identity edits are the non-photo pending edits (photo edits surface via the F3
// review banner / F11 photo card, not here).
function identityPendingEdits(branch: Branch): BranchPendingEdit[] {
  return (branch.pendingEdits ?? []).filter((e) => e.status === 'PENDING' && !e.includesPhotos)
}

export function PendingEditsList({ branch, isOwner }: { branch: Branch; isOwner: boolean }) {
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

      {pending.map((edit) => (
        <div
          key={edit.id}
          data-testid="pending-edit-row"
          className="flex items-start justify-between gap-3 rounded-[14px] p-4"
          style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex min-w-0 items-start gap-3">
            <Clock size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--rose)' }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">A change is already in review</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                We are reviewing your branch detail changes. Your current details stay live for customers
                until they are approved. You can withdraw before then.
              </p>
            </div>
          </div>
          {isOwner ? (
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
      ))}
    </div>
  )
}
