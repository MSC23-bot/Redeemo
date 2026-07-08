'use client'

// B3 - Merchant Documents MVP (Option 1): the OWNER-only upload dialog. Mirrors
// admin-web's UploadDocumentDialog.tsx minus the mandatory `reason` field (this is
// a self-serve upload, not an "on behalf of" action) and minus the AGREEMENT
// option (D2: merchants may only upload BUSINESS_VERIFICATION_1/2, PRICE_LIST).
import { useRef, useState } from 'react'
import { useUploadDocument } from '@/lib/documents/useDocuments'
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  type DocumentTypeValue,
} from '@/lib/api/documents'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface UploadDocumentDialogProps {
  onSuccess: () => void
  onCancel: () => void
}

// Honest degrade when storage is dark (feature-flagged off), mirroring
// components/ui/file-upload.tsx's duck-typed err.code check.
function uploadErrorMessage(err: unknown): string {
  const code = (err as { code?: unknown } | null | undefined)?.code
  if (code === 'STORAGE_NOT_ENABLED') return 'Document upload is not available yet. Please try again later.'
  if (code === 'FILE_TOO_LARGE') return 'That file is too large. The maximum size is 10 MB.'
  if (code === 'UNSUPPORTED_FILE_TYPE') return 'Unsupported file type. Upload a PDF, JPG, or PNG.'
  return 'Upload failed. Please try again.'
}

export function UploadDocumentDialog({ onSuccess, onCancel }: UploadDocumentDialogProps) {
  const [documentType, setDocumentType] = useState<DocumentTypeValue>('BUSINESS_VERIFICATION_1')
  const [file, setFile] = useState<File | null>(null)
  const mutation = useUploadDocument()
  const selectRef = useRef<HTMLSelectElement>(null)

  const tooLarge = file != null && file.size > DOCUMENT_MAX_BYTES
  const canSubmit = file != null && !tooLarge && !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit || !file) return
    try {
      await mutation.mutateAsync({ documentType, file })
      onSuccess()
    } catch {
      // Error is available via mutation.error; rendered below.
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
      <h2 className="mb-1 font-display text-lg font-semibold text-foreground">Upload document</h2>
      <p className="mb-4 text-sm text-muted-foreground">PDF, JPG, or PNG, up to 10 MB.</p>

      <label htmlFor="upload-document-type" className="mb-1.5 block text-sm font-medium text-foreground">
        Document type
      </label>
      <select
        id="upload-document-type"
        ref={selectRef}
        value={documentType}
        onChange={(e) => setDocumentType(e.target.value as DocumentTypeValue)}
        className="w-full rounded-[10px] border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        className="block w-full text-sm text-foreground"
        data-testid="upload-document-file"
      />
      {tooLarge && (
        <p className="mt-1 text-xs" style={{ color: '#B91C1C' }} data-testid="upload-document-too-large">
          That file is too large. The maximum size is 10 MB.
        </p>
      )}

      {mutation.error ? (
        <p role="alert" className="mt-3 text-sm" style={{ color: '#B91C1C' }} data-testid="upload-document-error">
          {uploadErrorMessage(mutation.error)}
        </p>
      ) : null}

      <div className="mt-5 flex justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
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
