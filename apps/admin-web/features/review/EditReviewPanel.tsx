'use client'

/**
 * EditReviewPanel (Option B B1 + Voucher governed-flows PR-B): self-contained
 * edit-review surface for a MERCHANT_IDENTITY_EDIT / BRANCH_IDENTITY_EDIT /
 * VOUCHER_EDIT approval. Owns the field-diff fetch + the Approve-edit /
 * Reject-edit dialog state, so the queue review page only has to branch on the
 * approval type and mount this.
 *
 * Dispatches on `data.kind`: 'merchant' | 'branch' render the original
 * EditReviewDiff; 'voucher' renders VoucherEditReviewDiff (its own field shape
 * and CHANGE/END treatment). Approve/Reject dialogs are shared (ApproveEditConfirm
 * / RejectEditDialog) with copy overridden for the voucher case.
 *
 * Approve/Reject actions are gated on the approval:apply-edit capability.
 */
import { useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { useEditReview } from '@/lib/review/useEditReview'
import { EditReviewDiff } from './EditReviewDiff'
import { VoucherEditReviewDiff } from './VoucherEditReviewDiff'
import { ApproveEditConfirm } from './ApproveEditConfirm'
import { RejectEditDialog } from './RejectEditDialog'

interface EditReviewPanelProps {
  approvalId: string
  /** ready && can('approval:read'): gates the data fetch. */
  canRead: boolean
  /** can('approval:apply-edit'): gates the Approve/Reject actions. */
  canApplyEdit: boolean
}

type OpenDialog = 'approve' | 'reject' | null

export function EditReviewPanel({ approvalId, canRead, canApplyEdit }: EditReviewPanelProps) {
  const { data, isLoading, isError, refetch } = useEditReview(approvalId, canRead)
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null)

  function handleDialogSuccess() {
    setOpenDialog(null)
    refetch()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="edit-review-loading">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading edit review" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div
        className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
        data-testid="edit-review-error"
      >
        <AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden="true" />
        <p className="mb-4 text-sm text-destructive">
          Could not load this edit request. Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={refetch}
          className="text-sm font-medium text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  const isVoucherEdit = data.kind === 'voucher'
  const isEndRequest = isVoucherEdit && data.voucherEditKind === 'END'

  return (
    <div className="space-y-6">
      {isVoucherEdit ? (
        <VoucherEditReviewDiff
          context={data}
          canApplyEdit={canApplyEdit}
          onApprove={() => setOpenDialog('approve')}
          onReject={() => setOpenDialog('reject')}
        />
      ) : (
        <EditReviewDiff
          context={data}
          canApplyEdit={canApplyEdit}
          onApprove={() => setOpenDialog('approve')}
          onReject={() => setOpenDialog('reject')}
        />
      )}

      {openDialog === 'approve' && (
        <ApproveEditConfirm
          approvalId={approvalId}
          onSuccess={handleDialogSuccess}
          onCancel={() => setOpenDialog(null)}
          {...(isVoucherEdit
            ? {
                title: isEndRequest ? 'End this voucher?' : 'Apply this voucher change?',
                consequenceCopy: isEndRequest
                  ? 'This voucher will stop being available to customers. The merchant owner is emailed.'
                  : 'The requested changes are applied to this voucher and the merchant owner is emailed. Only the fields shown in the diff are changed.',
              }
            : {})}
        />
      )}
      {openDialog === 'reject' && (
        <RejectEditDialog
          approvalId={approvalId}
          onSuccess={handleDialogSuccess}
          onCancel={() => setOpenDialog(null)}
          {...(isVoucherEdit
            ? {
                title: isEndRequest ? 'Reject end request' : 'Reject voucher change',
                placeholder: isEndRequest
                  ? 'Explain clearly why this voucher cannot be ended. The voucher stays live.'
                  : 'Explain clearly why this change cannot be applied. The voucher will not change.',
                helperCopy: isEndRequest
                  ? 'The voucher stays live. This message is emailed to the merchant.'
                  : 'The voucher is not changed. This message is emailed to the merchant.',
              }
            : {})}
        />
      )}
    </div>
  )
}
