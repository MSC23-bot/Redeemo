'use client'

// B3 - Merchant Documents MVP (Option 1): the real Documents list + upload
// affordance inside the Business Profile Compliance section (D4), replacing the
// honest-placeholder block M2 shipped. D1: view is OWNER + BRANCH_MANAGER (the
// backend denies STAFF; this page is already nav-excluded for STAFF, and the
// query error path below degrades calmly if it is ever reached anyway); upload
// is OWNER only, gated here by `profile.viewerCapabilities.role` and re-enforced
// server-side. Documents open via a short-lived signed link; raw storage paths
// are never exposed by the backend.
import { useState } from 'react'
import { useMerchantDocuments } from '@/lib/documents/useDocuments'
import { docTypeLabel, type MerchantDocument } from '@/lib/api/documents'
import { UploadDocumentDialog } from '@/components/business-profile/sections/UploadDocumentDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateLabel } from '@/lib/business-profile/format'
import { Plus } from '@/lib/icons'
import type { MerchantProfile } from '@/lib/api/profile'

export function DocumentsCard({ profile }: { profile: MerchantProfile }) {
  const canUpload = profile.viewerCapabilities?.role === 'OWNER'
  const [uploadOpen, setUploadOpen] = useState(false)
  const { data, isLoading, isError, refetch } = useMerchantDocuments()
  const documents = data?.documents ?? []

  return (
    <div className="space-y-3 border-t border-border px-6 pt-4" data-testid="documents-card">
      <div className="flex items-start justify-between gap-2.5">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-foreground">Documents</p>
          <p className="text-sm text-muted-foreground">
            Documents Redeemo holds for your business.
          </p>
        </div>
        {canUpload ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setUploadOpen(true)}
            data-testid="documents-upload-trigger"
          >
            <Plus size={14} aria-hidden /> Upload
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground" data-testid="documents-loading">
          Loading documents...
        </p>
      ) : isError ? (
        <div role="alert" className="space-y-2" data-testid="documents-error">
          <p className="text-sm text-muted-foreground">We could not load your documents.</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="documents-empty">
          No documents uploaded yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-[10px] border border-border" data-testid="documents-list">
          {documents.map((doc: MerchantDocument) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
              data-testid={`documents-row-${doc.id}`}
            >
              <div className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{docTypeLabel(doc.documentType)}</span>
                <span className="text-xs text-muted-foreground">
                  Uploaded {formatDateLabel(doc.uploadedAt) ?? doc.uploadedAt}
                </span>
              </div>
              {doc.available && doc.url ? (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-medium text-primary underline underline-offset-2"
                  aria-label={`Open ${docTypeLabel(doc.documentType)} (opens in new tab)`}
                  data-testid={`documents-open-${doc.id}`}
                >
                  Open
                </a>
              ) : (
                <Badge variant="neutral" data-testid={`documents-unavailable-${doc.id}`}>
                  Unavailable
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      {uploadOpen ? (
        <UploadDocumentDialog onSuccess={() => setUploadOpen(false)} onCancel={() => setUploadOpen(false)} />
      ) : null}
    </div>
  )
}
