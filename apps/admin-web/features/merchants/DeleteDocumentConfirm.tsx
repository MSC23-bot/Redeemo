'use client'

/**
 * DeleteDocumentConfirm (B4-web): a SUPER_ADMIN deletes a merchant document on the
 * merchant's behalf (merchant:manage-documents). Reason is mandatory (audited).
 * Deleting removes the document permanently; replacement is delete + upload.
 */
import { useRef, useState } from 'react'
import { useDeleteDocument } from '@/lib/merchants/useMerchantDocuments'
import { docTypeLabel, type MerchantDocument } from '@/lib/api/documents'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface DeleteDocumentConfirmProps {
  merchantId: string
  document: MerchantDocument
  onSuccess: () => void
  onCancel: () => void
}

export function DeleteDocumentConfirm({
  merchantId,
  document,
  onSuccess,
  onCancel,
}: DeleteDocumentConfirmProps) {
  const [reason, setReason] = useState('')
  const mutation = useDeleteDocument(merchantId)
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  const trimmedReason = reason.trim()
  const canSubmit = trimmedReason.length > 0 && !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      await mutation.mutateAsync({ documentId: document.id, reason: trimmedReason })
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Delete document"
      onClose={onCancel}
      scrimTestId="delete-document-scrim"
      panelTestId="delete-document-dialog"
      initialFocusRef={reasonRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Delete document</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Permanently delete <span className="font-medium text-foreground">{docTypeLabel(document.documentType)}</span> on
        the merchant&apos;s behalf. This cannot be undone. Recorded in the audit log.
      </p>

      <label htmlFor="delete-document-reason" className="mb-1.5 block text-sm font-medium text-foreground">
        Reason (recorded in the audit log)
      </label>
      <textarea
        id="delete-document-reason"
        ref={reasonRef}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain why you are deleting this document."
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="delete-document-reason"
      />

      {mutation.error && (
        <div className="mt-3">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
          data-testid="delete-document-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="delete-document-submit"
        >
          {mutation.isPending ? 'Deleting...' : 'Delete document'}
        </Button>
      </div>
    </Dialog>
  )
}
