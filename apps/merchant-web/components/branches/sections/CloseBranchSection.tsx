'use client'

// Branches PR-1 F13: the "Permanently close this branch" section (prototype 06/09/10).
// It carries the prototype warning copy + red styling so the surface matches, but the
// close control is a DISABLED locked affordance: the add/close lifecycle ships in PR-5.
// It performs NO network/action. The close modal (screenshot 10) is NOT built here; the
// disabled control simply reads as "coming in this Branches rollout".
//
// CLOSE-ELIGIBILITY COPY (display only in PR-1): the main branch and the last remaining
// branch cannot be removed (the live rule lands with PR-5).
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import { AlertTriangle } from '@/lib/icons'
import { LockedAffordance } from '@/components/branches/LockedAffordance'

export function CloseBranchSection({ isOwner }: { isOwner: boolean }) {
  // The close lifecycle is owner-only (PR-5); a non-owner sees nothing.
  if (!isOwner) return null

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
            takes effect, and the branch stays live for customers until it is approved. Your main branch and
            your last branch cannot be removed.
          </p>
        </div>
      </div>
      <LockedAffordance label="Request to close permanently" variant="gradient" />
    </div>
  )
}
