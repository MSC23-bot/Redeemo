'use client'

// Branches PR-5 §6: the lifecycle banner that surfaces on a branch detail page when
// the branch is mid create/close review (prototype 07 awaiting-approval pattern). It
// mirrors ReviewStateBanners / PendingEditsList: a calm tinted card + a Clock icon +
// an owner-only action control. It renders ONE of:
//   - PENDING_CREATE: "Awaiting Redeemo approval" + a Cancel control (-> cancel the
//     pending create, hard-deleting the never-live branch). The branch is invisible to
//     customers until an admin approves.
//   - PENDING_CLOSE: "Close request awaiting approval" + a Withdraw control (-> revert
//     to live). The branch STAYS live for customers until an admin approves.
// A LIVE / CLOSED branch shows nothing here.
//
// Owner gate: the Cancel / Withdraw controls render only for the owner (the lifecycle
// actions are OWNER-only per D3 + the backend). A non-owner sees the banner copy but no
// action control. After the action succeeds we route back to the branches overview for
// a cancelled create (the branch no longer exists), and stay on the page for a withdrawn
// close (the branch is now live again).
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Clock } from '@/lib/icons'
import { useCancelPendingCreate, useWithdrawBranchClose } from '@/lib/branches/useBranches'
import type { Branch } from '@/lib/api/branch'

export function BranchLifecycleBanner({ branch, isOwner }: { branch: Branch; isOwner: boolean }) {
  const status = branch.lifecycleStatus
  if (status === 'PENDING_CREATE') {
    return <PendingCreateBanner branch={branch} isOwner={isOwner} />
  }
  if (status === 'PENDING_CLOSE') {
    return <PendingCloseBanner branch={branch} isOwner={isOwner} />
  }
  return null
}

function PendingCreateBanner({ branch, isOwner }: { branch: Branch; isOwner: boolean }) {
  const router = useRouter()
  const { toast } = useToast()
  const cancel = useCancelPendingCreate()
  const [actionError, setActionError] = React.useState<string | null>(null)

  async function onCancel() {
    setActionError(null)
    try {
      await cancel.mutateAsync(branch.id)
      toast({ message: 'New branch cancelled.', variant: 'success' })
      // The branch row is hard-deleted; there is no detail page to stay on.
      router.push('/branches')
    } catch {
      setActionError('We could not cancel this branch. Please try again.')
    }
  }

  return (
    <div className="space-y-3" data-testid="branch-awaiting-approval">
      <div
        role="status"
        className="flex flex-wrap items-start justify-between gap-3 rounded-[14px] p-4"
        style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex min-w-0 items-start gap-3">
          <Clock size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--rose)' }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Awaiting Redeemo approval</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              This branch is with Redeemo to review. It stays hidden from customers until it is approved.
              We confirm the exact location from the address as part of the review. You can cancel it before
              then.
            </p>
          </div>
        </div>
        {isOwner ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="cancel-pending-create"
            onClick={onCancel}
            disabled={cancel.isPending}
          >
            {cancel.isPending ? 'Cancelling...' : 'Cancel'}
          </Button>
        ) : null}
      </div>
      {actionError ? (
        <p
          role="alert"
          className="rounded-[10px] border px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          {actionError}
        </p>
      ) : null}
    </div>
  )
}

function PendingCloseBanner({ branch, isOwner }: { branch: Branch; isOwner: boolean }) {
  const { toast } = useToast()
  const withdraw = useWithdrawBranchClose()
  const [actionError, setActionError] = React.useState<string | null>(null)

  async function onWithdraw() {
    setActionError(null)
    try {
      await withdraw.mutateAsync(branch.id)
      toast({ message: 'Close request withdrawn.', variant: 'success' })
    } catch {
      setActionError('We could not withdraw this close request. Please try again.')
    }
  }

  return (
    <div className="space-y-3" data-testid="branch-pending-close">
      <div
        role="status"
        className="flex flex-wrap items-start justify-between gap-3 rounded-[14px] p-4"
        style={{ background: 'var(--warning-bg)', border: '1px solid #F4D9A8' }}
      >
        <div className="flex min-w-0 items-start gap-3">
          <Clock size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Close request awaiting approval</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              You asked Redeemo to close this branch. It stays live for customers until the request is
              approved. You can withdraw the request before then.
            </p>
          </div>
        </div>
        {isOwner ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="withdraw-pending-close"
            onClick={onWithdraw}
            disabled={withdraw.isPending}
          >
            {withdraw.isPending ? 'Withdrawing...' : 'Withdraw'}
          </Button>
        ) : null}
      </div>
      {actionError ? (
        <p
          role="alert"
          className="rounded-[10px] border px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          {actionError}
        </p>
      ) : null}
    </div>
  )
}
