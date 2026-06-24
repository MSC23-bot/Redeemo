'use client'

/**
 * ApproveBranchLifecycleConfirm (Branches PR-5): admin approves a branch CREATE
 * or CLOSE request.
 *
 * CREATE -> the branch goes live and becomes visible to customers (the server
 * re-checks the confirmed-location gate; an unconfirmed location surfaces
 * MAIN_BRANCH_LOCATION_UNCONFIRMED). CLOSE -> the branch is deactivated and its
 * staff logins are disabled (the server re-checks not-main / not-last-active).
 * On a gate/state error: NamedGateBanner inside the dialog. Mirrors
 * ApproveEditConfirm; never optimistically marks applied.
 */
import { useRef } from 'react'
import { useApproveBranchLifecycle } from '@/lib/review/useBranchLifecycleReview'
import { NamedGateBanner } from './NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ApproveBranchLifecycleConfirmProps {
  approvalId: string
  kind: 'create' | 'close'
  onSuccess: () => void
  onCancel: () => void
}

export function ApproveBranchLifecycleConfirm({
  approvalId,
  kind,
  onSuccess,
  onCancel,
}: ApproveBranchLifecycleConfirmProps) {
  const mutation = useApproveBranchLifecycle(approvalId)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const title = kind === 'create' ? 'Approve new branch?' : 'Approve close request?'
  const consequences =
    kind === 'create'
      ? 'The branch goes live and becomes visible to customers. The merchant owner is notified.'
      : 'The branch is deactivated and its staff logins are disabled. The merchant owner is notified.'
  const submitIdle = kind === 'create' ? 'Approve branch' : 'Approve close'
  const submitBusy = kind === 'create' ? 'Approving...' : 'Closing...'

  async function handleApprove() {
    if (mutation.isPending) return
    try {
      await mutation.mutateAsync()
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label={title}
      onClose={onCancel}
      scrimTestId="approve-branch-lifecycle-scrim"
      panelTestId="approve-branch-lifecycle-dialog"
      initialFocusRef={cancelRef}
    >
      <h2 className="mb-3 text-base font-semibold text-foreground">{title}</h2>

      <p
        id="approve-branch-lifecycle-consequences-copy"
        className="text-sm text-foreground"
        data-testid="approve-branch-lifecycle-consequences-copy"
      >
        {consequences}
      </p>

      {mutation.error && (
        <div className="mt-4" data-testid="approve-branch-lifecycle-error-banner">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Button
          ref={cancelRef}
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
          data-testid="approve-branch-lifecycle-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleApprove}
          disabled={mutation.isPending}
          aria-describedby="approve-branch-lifecycle-consequences-copy"
          data-testid="approve-branch-lifecycle-submit"
        >
          {mutation.isPending ? submitBusy : submitIdle}
        </Button>
      </div>
    </Dialog>
  )
}
