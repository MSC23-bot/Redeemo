'use client'

// Branches PR-1 F8: the asymmetric "main branch" control (prototype 02/07). It sits
// in the detail header next to the branch name and renders ONE of:
//   - a non-clickable "Main branch" badge when branch.isMainBranch (shown to everyone),
//   - a "Make main branch" action when NOT main AND the viewer is the owner, which on
//     confirm PATCHes { isMainBranch: true } via the useSetMainBranch hook (atomic
//     single-main promotion on the backend), or
//   - nothing (a non-owner on a non-main branch sees no control).
//
// CLOSE-ELIGIBILITY COUPLING (PR-5, display note only here): the main branch cannot be
// closed. The PR-5 close flow will surface that copy ("you cannot close the main
// branch") and disable the close action for whichever branch is main. PR-1 only sets
// the main branch; it does NOT expose any close affordance.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Star } from '@/lib/icons'
import { useSetMainBranch } from '@/lib/branches/useBranches'
import type { Branch } from '@/lib/api/branch'

export function MainBranchControl({ branch, isOwner }: { branch: Branch; isOwner: boolean }) {
  const { toast } = useToast()
  const setMain = useSetMainBranch()

  const [confirming, setConfirming] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

  // Already main: a calm non-clickable badge for everyone.
  if (branch.isMainBranch) {
    return (
      <span
        data-testid="main-branch-badge"
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
        style={{ background: 'var(--tint-deep)', color: 'var(--rose)' }}
      >
        <Star size={13} aria-hidden style={{ fill: 'var(--rose)' }} /> Main branch
      </span>
    )
  }

  // Not main + not owner: read-only, nothing to show.
  if (!isOwner) return null

  async function promote() {
    setActionError(null)
    try {
      await setMain.mutateAsync(branch.id)
      toast({ message: 'Main branch updated.', variant: 'success' })
      setConfirming(false)
    } catch {
      setActionError('We could not update the main branch. Please try again.')
    }
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-col gap-1.5" data-testid="main-branch-confirm">
        <span className="inline-flex items-center gap-2">
          <Button type="button" size="sm" onClick={promote} disabled={setMain.isPending}>
            {setMain.isPending ? 'Updating...' : 'Make main branch'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setActionError(null)
              setConfirming(false)
            }}
            disabled={setMain.isPending}
          >
            Cancel
          </Button>
        </span>
        {actionError ? (
          <span role="alert" className="text-xs font-medium" style={{ color: 'var(--destructive)' }}>
            {actionError}
          </span>
        ) : null}
      </span>
    )
  }

  return (
    <button
      type="button"
      data-testid="main-branch-action"
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors"
      style={{ background: 'var(--page)', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)' }}
    >
      <Star size={13} aria-hidden /> Make main branch
    </button>
  )
}
