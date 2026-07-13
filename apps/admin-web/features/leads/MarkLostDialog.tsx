'use client'

/**
 * MarkLostDialog : mark a prospect as Lost (spec §c). A reason is REQUIRED (the
 * backend 400s LEAD_LOST_REASON_REQUIRED without one) and is audited. Carries the
 * owner-queue no-personal-data hint (closes the #500 owner-queue item): the reason
 * is retained for analytics and OUTLIVES the lead's own 6-month PII anonymisation,
 * so it must never contain contact detail.
 */
import { useRef, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { useUpdateLead } from '@/lib/leads/useLeadMutations'
import type { Lead } from '@/lib/api/leads'

interface MarkLostDialogProps {
  lead: Lead
  onSuccess: () => void
  onCancel: () => void
}

export function MarkLostDialog({ lead, onSuccess, onCancel }: MarkLostDialogProps) {
  const [reason, setReason] = useState('')
  const mutation = useUpdateLead()
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  const canSubmit = reason.trim().length > 0 && !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      await mutation.mutateAsync({ leadId: lead.id, input: { stage: 'LOST', lostReason: reason.trim() } })
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Mark lead as lost"
      onClose={onCancel}
      scrimTestId="mark-lost-scrim"
      panelTestId="mark-lost-dialog"
      initialFocusRef={reasonRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Mark as lost</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Record why {lead.businessName} did not progress. This is audited and kept for analytics.
      </p>

      <label htmlFor="mark-lost-reason" className="mb-1.5 block text-sm font-medium text-foreground">
        Reason
      </label>
      <textarea
        id="mark-lost-reason"
        ref={reasonRef}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Not interested in a subscription model right now."
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="mark-lost-reason"
      />
      <p className="mt-1.5 text-xs text-muted-foreground">
        Do not put personal or contact details in the reason: it is kept for analytics.
      </p>

      {mutation.error && (
        <div className="mt-3">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending} data-testid="mark-lost-cancel">
          Cancel
        </Button>
        <Button type="button" variant="destructive" onClick={handleSubmit} disabled={!canSubmit} data-testid="mark-lost-submit">
          {mutation.isPending ? 'Saving...' : 'Mark as lost'}
        </Button>
      </div>
    </Dialog>
  )
}
