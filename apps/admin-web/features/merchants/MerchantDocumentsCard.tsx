'use client'

/**
 * MerchantDocumentsCard (B4-web): the Documents surface on /merchants/[id].
 *
 * Read is gated on `merchant:read` (the page itself), so the card always renders
 * for an admin who can view the page. Upload + per-document Delete affordances are
 * gated on `merchant:manage-documents` (SUPER_ADMIN) via the `canManage` prop.
 *
 * Documents open via a short-lived signed link returned by the backend; raw
 * storage paths are never exposed (the backend redacts them). `available:false`
 * rows (storage dark / presign failed) show an Unavailable badge instead of a link.
 *
 * The card self-manages its upload + delete dialogs; their mutations invalidate the
 * documents query, so the list refetches automatically on success.
 */
import { useState } from 'react'
import { Loader2, AlertCircle, Plus, Trash2, FileText } from 'lucide-react'
import { Badge } from '@/features/shared/Badge'
import { Button } from '@/components/ui/button'
import { useMerchantDocuments } from '@/lib/merchants/useMerchantDocuments'
import { docTypeLabel, type MerchantDocument } from '@/lib/api/documents'
import { UploadDocumentDialog } from '@/features/merchants/UploadDocumentDialog'
import { DeleteDocumentConfirm } from '@/features/merchants/DeleteDocumentConfirm'

type DocDialog = { kind: 'upload' } | { kind: 'delete'; doc: MerchantDocument } | null

export function MerchantDocumentsCard({
  merchantId,
  canManage,
}: {
  merchantId: string
  canManage: boolean
}) {
  const { data, isLoading, isError, refetch } = useMerchantDocuments(merchantId, true)
  const [dialog, setDialog] = useState<DocDialog>(null)

  const documents = data?.documents ?? []

  return (
    <section className="rounded-lg border border-border bg-card p-4" data-testid="merchant-documents-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Documents{!isLoading && !isError ? ` (${documents.length})` : ''}
        </h2>
        {canManage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDialog({ kind: 'upload' })}
            data-testid="merchant-documents-upload"
          >
            <Plus className="size-4" aria-hidden="true" />
            Upload
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8" data-testid="merchant-documents-loading">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading documents" />
        </div>
      ) : isError ? (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-6 text-center" data-testid="merchant-documents-error">
          <AlertCircle className="mx-auto mb-2 size-5 text-destructive" aria-hidden="true" />
          <p className="text-sm text-destructive">Could not load documents.</p>
          <button type="button" onClick={() => refetch()} className="mt-2 text-sm font-medium text-primary hover:underline">
            Retry
          </button>
        </div>
      ) : documents.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="merchant-documents-empty">
          No documents uploaded.
        </p>
      ) : (
        <ul role="list" className="mt-3 divide-y divide-border rounded-md border border-border">
          {documents.map((doc) => {
            const uploaded = new Date(doc.uploadedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
            return (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
                data-testid={`merchant-document-row-${doc.id}`}
              >
                <div className="flex min-w-0 items-start gap-2">
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{docTypeLabel(doc.documentType)}</span>
                    <span className="text-xs text-muted-foreground">Uploaded {uploaded}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {doc.available && doc.url ? (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-sm text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Open ${docTypeLabel(doc.documentType)} (opens in new tab)`}
                      data-testid={`merchant-document-open-${doc.id}`}
                    >
                      Open
                    </a>
                  ) : (
                    <Badge tone="neutral">Unavailable</Badge>
                  )}
                  {canManage && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setDialog({ kind: 'delete', doc })}
                      data-testid={`merchant-document-delete-${doc.id}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Documents open via a short-lived signed link; raw storage paths are never exposed.
      </p>

      {dialog?.kind === 'upload' && (
        <UploadDocumentDialog
          merchantId={merchantId}
          onSuccess={() => setDialog(null)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteDocumentConfirm
          merchantId={merchantId}
          document={dialog.doc}
          onSuccess={() => setDialog(null)}
          onCancel={() => setDialog(null)}
        />
      )}
    </section>
  )
}
