'use client'

// Branches PR-5 §6 (CLOSE): the "Permanently close this branch" section (prototype
// 06/09/10). It carries the prototype warning copy + red styling, and the close control
// is now LIVE (was a PR-1 disabled affordance): it opens the reason-collecting
// CloseBranchModal (prototype 10). The close lifecycle is OWNER-only (D3 + the backend),
// so a non-owner sees nothing.
//
// State-aware:
//   - LIVE non-main branch: the "Request to close permanently" button opens the modal.
//   - Main branch: the button is disabled with the "make another branch your main first"
//     copy (the backend BRANCH_IS_MAIN guard is the real boundary; this explains it
//     before the merchant even opens the modal, matching prototype 06).
//   - PENDING_CLOSE: the close request is already in review; the pending-close banner at
//     the top of the page owns the Withdraw control, so this section shows a calm
//     "already in review" note instead of a second close button.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { AlertTriangle } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { CloseBranchModal } from '@/components/branches/CloseBranchModal'
import type { Branch } from '@/lib/api/branch'

export function CloseBranchSection({ branch, isOwner }: { branch: Branch; isOwner: boolean }) {
  // The close lifecycle is owner-only (PR-5); a non-owner sees nothing.
  const [modalOpen, setModalOpen] = React.useState(false)
  if (!isOwner) return null

  const isMain = branch.isMainBranch === true
  const pendingClose = branch.lifecycleStatus === 'PENDING_CLOSE'

  return (
    <div
      data-testid="branch-close-section"
      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5"
      style={{ background: 'var(--danger-bg)', borderColor: '#FBCED0' }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--destructive)' }} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Permanently close this branch</p>
          <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
            This permanently removes the branch from Redeemo. It is a request reviewed by Redeemo before it
            takes effect, and the branch stays live for customers until it is approved.{' '}
            {isMain
              ? 'You cannot close your main branch. Make another branch your main branch first.'
              : 'Your last branch cannot be removed.'}
          </p>
        </div>
      </div>

      {pendingClose ? (
        <span
          data-testid="branch-close-in-review"
          className="text-sm font-semibold text-muted-foreground"
        >
          Close request in review
        </span>
      ) : (
        <Button
          type="button"
          data-testid="request-close-branch"
          onClick={() => setModalOpen(true)}
          disabled={isMain}
          title={isMain ? 'Make another branch your main branch first' : undefined}
        >
          Request to close permanently
        </Button>
      )}

      {modalOpen ? <CloseBranchModal branch={branch} onClose={() => setModalOpen(false)} /> : null}
    </div>
  )
}
