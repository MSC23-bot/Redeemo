'use client'

/**
 * UploadDocumentDialog (B4-web): a SUPER_ADMIN uploads a verification document on
 * the merchant's behalf (merchant:manage-documents).
 *
 *   - documentType picker (the current categories; none is required - the admin
 *     chooses), a file input (PDF / JPG / PNG, <=10 MB), and a mandatory reason.
 *   - Client-side type + size hints; the backend HARD-enforces both server-side.
 *   - No legal-signature flow: AGREEMENT is just a category.
 *   - On error: NamedGateBanner inside the dialog.
 *   - Shared Dialog primitive (focus-trap, Escape + scrim close, focus-restore).
 */
import { useRef, useState } from 'react'
import { useUploadDocument } from '@/lib/merchants/useMerchantDocuments'
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  type DocumentTypeValue,
} from '@/lib/api/documents'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface UploadDocumentDialogProps {
  merchantId: string
  onSuccess: () => void
  onCancel: () => void
}

export function UploadDocumentDialog({ merchantId, onSuccess, onCancel }: UploadDocumentDialogProps) {
  const [documentType, setDocumentType] = useState<DocumentTypeValue>('BUSINESS_VERIFICATION_1')
  const [file, setFile] = useState<File | null>(null)
  const [reason, setReason] = useState('')
  const mutation = useUploadDocument(merchantId)
  const selectRef = useRef<HTMLSelectElement>(null)

  const trimmedReason = reason.trim()
  const tooLarge = file != null && file.size > DOCUMENT_MAX_BYTES
  const canSubmit = file != null && !tooLarge && trimmedReason.length > 0 && !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit || !file) return
    try {
      await mutation.mutateAsync({ documentType, reason: trimmedReason, file })
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Upload document"
      onClose={onCancel}
      scrimTestId="upload-document-scrim"
      panelTestId="upload-document-dialog"
      initialFocusRef={selectRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Upload document</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Upload a verification document on the merchant&apos;s behalf. Recorded in the audit log. PDF,
        JPG, or PNG, up to 10 MB.
      </p>

      <label htmlFor="upload-document-type" className="mb-1.5 block text-sm font-medium text-foreground">
        Document type
      </label>
      <select
        id="upload-document-type"
        ref={selectRef}
        value={documentType}
        onChange={(e) => setDocumentType(e.target.value as DocumentTypeValue)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="upload-document-type"
      >
        {DOCUMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {DOCUMENT_TYPE_LABELS[t]}
          </option>
        ))}
      </select>

      <label htmlFor="upload-document-file" className="mb-1.5 mt-4 block text-sm font-medium text-foreground">
        File
      </label>
      <input
        id="upload-document-file"
        type="file"
        accept={DOCUMENT_ACCEPT}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-secondary/30 file:px-3 file:py-1.5 file:text-sm file:font-medium"
        data-testid="upload-document-file"
      />
      {tooLarge && (
        <p className="mt-1 text-xs text-destructive" data-testid="upload-document-too-large">
          That file is too large. The maximum size is 10 MB.
        </p>
      )}

      <label htmlFor="upload-document-reason" className="mb-1.5 mt-4 block text-sm font-medium text-foreground">
        Reason (recorded in the audit log)
      </label>
      <textarea
        id="upload-document-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain why you are uploading this on the merchant's behalf."
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="upload-document-reason"
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
          data-testid="upload-document-cancel"
        >
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={!canSubmit} data-testid="upload-document-submit">
          {mutation.isPending ? 'Uploading...' : 'Upload'}
        </Button>
      </div>
    </Dialog>
  )
}
