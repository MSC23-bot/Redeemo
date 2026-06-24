'use client'

/**
 * EditReviewDiff (Option B B1 + Branches PR-3 §8): the merchant-requested
 * identity / photo edit review.
 *
 * Renders the field-by-field diff (current vs proposed), a photo-change display
 * for photo edits (added URLs as previews; removed BranchPhoto IDs listed), and
 * the Approve-edit / Reject-edit actions. Approve is gated on the
 * approval:apply-edit capability (hidden without it).
 *
 * Branches PR-3: the backend now APPLIES photo edits on approve (the old
 * EDIT_PHOTO_APPLY_NOT_SUPPORTED throw is gone), so Approve is ENABLED for a
 * photo edit; the disabled "applied in a follow-up" note is removed. Reject stays
 * enabled (rejecting touches no live data). The remove list shows the
 * BranchPhoto IDs from the edit (the backend does not resolve them to URLs;
 * acceptable per PR-3 §8). The merchant add-via-review flow only ever populates
 * `add`, so `remove` is empty in practice.
 */
import { ImagePlus, ImageMinus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/features/shared/Badge'
import type { EditReviewContext, EditReviewField } from '@/lib/api/editReview'

/** Render any diff value (string / number / null) as readable text. */
function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function FieldRow({ field }: { field: EditReviewField }) {
  return (
    <tr className="border-b border-border last:border-0" data-testid={`edit-field-row-${field.field}`}>
      <td className="py-2.5 pr-4 align-top">
        <span className="text-sm font-medium text-foreground">{field.field}</span>
        {field.isCustomerVisible && (
          <span className="ml-2 align-middle">
            <Badge tone="info">Customer-visible</Badge>
          </span>
        )}
      </td>
      <td className="py-2.5 pr-4 align-top">
        <span
          className="text-sm text-muted-foreground line-through decoration-muted-foreground/60"
          data-testid={`edit-field-current-${field.field}`}
        >
          {renderValue(field.current)}
        </span>
      </td>
      <td className="py-2.5 align-top">
        <span
          className="text-sm font-medium text-foreground"
          data-testid={`edit-field-proposed-${field.field}`}
        >
          {renderValue(field.proposed)}
        </span>
      </td>
    </tr>
  )
}

function PhotoChanges({ add, remove }: { add: string[]; remove: string[] }) {
  return (
    <div className="space-y-3" data-testid="edit-photo-changes">
      {add.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <ImagePlus className="size-4 text-emerald-600" aria-hidden="true" />
            Photos to add ({add.length})
          </p>
          <ul className="space-y-1 pl-6" data-testid="edit-photo-add-list">
            {add.map((url) => (
              <li key={url} className="truncate text-xs text-muted-foreground">{url}</li>
            ))}
          </ul>
        </div>
      )}
      {remove.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <ImageMinus className="size-4 text-destructive" aria-hidden="true" />
            Photos to remove ({remove.length})
          </p>
          <ul className="space-y-1 pl-6" data-testid="edit-photo-remove-list">
            {remove.map((url) => (
              <li key={url} className="truncate text-xs text-muted-foreground">{url}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

interface EditReviewDiffProps {
  context: EditReviewContext
  canApplyEdit: boolean
  onApprove: () => void
  onReject: () => void
}

export function EditReviewDiff({ context, canApplyEdit, onApprove, onReject }: EditReviewDiffProps) {
  const isPending = context.status === 'PENDING'
  // Branches PR-3 §8: photo edits are now applied on approve, so Approve is only
  // gated on the edit still being PENDING (same as an identity edit).
  const approveDisabled = !isPending

  return (
    <div
      className="rounded-lg border border-border bg-card p-6"
      data-testid="edit-review-diff"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">
          {context.kind === 'merchant' ? 'Merchant identity edit' : 'Branch identity edit'}
        </h2>
        <Badge tone={isPending ? 'warn' : 'neutral'}>{context.status}</Badge>
      </div>

      {/* Field diff */}
      {context.fields.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" data-testid="edit-field-table">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Field</th>
                <th className="py-2 pr-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Current</th>
                <th className="py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Proposed</th>
              </tr>
            </thead>
            <tbody>
              {context.fields.map((field) => (
                <FieldRow key={field.field} field={field} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !context.includesPhotos && (
          <p className="text-sm text-muted-foreground" data-testid="edit-no-fields">
            This edit request has no identity-field changes.
          </p>
        )
      )}

      {/* Photo changes (PR-3: applied on approve). */}
      {context.includesPhotos && context.photoChanges && (
        <div className="mt-5 border-t border-border pt-5">
          <PhotoChanges add={context.photoChanges.add} remove={context.photoChanges.remove} />
        </div>
      )}

      {/* Actions: gated on approval:apply-edit. Hidden entirely without the cap. */}
      {canApplyEdit && (
        <div className="mt-6 flex justify-end gap-3" data-testid="edit-review-actions">
          <Button
            type="button"
            variant="outline"
            onClick={onReject}
            disabled={!isPending}
            data-testid="edit-reject-btn"
          >
            Reject edit
          </Button>
          <Button
            type="button"
            onClick={onApprove}
            disabled={approveDisabled}
            data-testid="edit-approve-btn"
          >
            Approve edit
          </Button>
        </div>
      )}
    </div>
  )
}
