/**
 * DocumentList — read-only list of uploaded merchant documents.
 *
 * Each document shows its type and upload date. Available documents link
 * to a short-lived presigned URL returned by the backend. Raw storage paths
 * are never exposed.
 */
import { Badge } from '@/features/shared/Badge'
import { cn } from '@/lib/utils'
import type { ReviewDocument } from '@/lib/api/review'

interface DocumentListProps {
  documents: ReviewDocument[]
}

function docTypeLabel(documentType: string): string {
  const map: Record<string, string> = {
    BUSINESS_VERIFICATION_1: 'Business verification (1)',
    BUSINESS_VERIFICATION_2: 'Business verification (2)',
    PRICE_LIST: 'Price list',
    AGREEMENT: 'Agreement',
  }
  return map[documentType] ?? documentType
}

export function DocumentList({ documents }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <section aria-labelledby="documents-heading" data-testid="document-list">
        <h2 id="documents-heading" className="text-sm font-semibold text-foreground mb-3">
          Documents
        </h2>
        <div className="rounded-lg border border-border bg-card px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">No documents uploaded.</p>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="documents-heading" data-testid="document-list">
      <h2 id="documents-heading" className="text-sm font-semibold text-foreground mb-3">
        Documents ({documents.length})
      </h2>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <ul role="list" className="divide-y divide-border">
          {documents.map((doc, idx) => {
            const uploadedDate = new Date(doc.uploadedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })

            return (
              <li
                key={doc.id}
                className={cn(
                  'flex items-center justify-between px-4 py-3',
                  idx % 2 === 0 ? 'bg-card' : 'bg-secondary/10'
                )}
                data-testid={`document-row-${doc.id}`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-medium text-foreground">
                    {docTypeLabel(doc.documentType)}
                  </span>
                  <span className="text-xs text-muted-foreground">Uploaded {uploadedDate}</span>
                </div>

                <div className="flex items-center gap-3 shrink-0 ml-4">
                  {doc.available && doc.url ? (
                    <>
                      <Badge tone="success">Available</Badge>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          'text-xs font-medium text-primary underline underline-offset-2',
                          'hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm'
                        )}
                        aria-label={`Open ${docTypeLabel(doc.documentType)} (opens in new tab)`}
                      >
                        Open
                      </a>
                    </>
                  ) : (
                    <Badge tone="neutral">Unavailable</Badge>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border bg-secondary/20">
          Opens via a short-lived signed link; raw storage paths are never exposed.
        </p>
      </div>
    </section>
  )
}
