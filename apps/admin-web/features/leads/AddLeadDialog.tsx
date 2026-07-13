'use client'

/**
 * AddLeadDialog : capture a prospect (spec §c, OD1). Only the business name is
 * required; everything else (category guess, location, contact, source, next
 * action + due date) is optional. Free-text fields carry the no-personal-data
 * hint. On create the backend may return a non-blocking duplicateWarning (a
 * similar business + location already in the pipeline); it never blocks the
 * create, so it is surfaced as an amber notice in a brief "added" view afterwards.
 */
import { useRef, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { useCreateLead } from '@/lib/leads/useLeadMutations'
import { LEAD_SOURCES, type LeadSource, type DuplicateWarning } from '@/lib/api/leads'
import { sourceLabel } from './pipelineFormat'

interface AddLeadDialogProps {
  onSuccess: () => void
  onCancel: () => void
}

function trimOrUndefined(value: string): string | undefined {
  const t = value.trim()
  return t.length > 0 ? t : undefined
}

export function AddLeadDialog({ onSuccess, onCancel }: AddLeadDialogProps) {
  const [businessName, setBusinessName] = useState('')
  const [categoryGuess, setCategoryGuess] = useState('')
  const [locationHint, setLocationHint] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [source, setSource] = useState<LeadSource | ''>('')
  const [nextAction, setNextAction] = useState('')
  const [dueDate, setDueDate] = useState('')
  // Set once the lead is created; drives the brief "added" confirmation view.
  const [created, setCreated] = useState<{ warning: DuplicateWarning } | null>(null)

  const mutation = useCreateLead()
  const nameRef = useRef<HTMLInputElement>(null)

  const canSubmit = businessName.trim().length > 0 && !mutation.isPending

  async function handleSubmit() {
    if (!canSubmit) return
    try {
      const result = await mutation.mutateAsync({
        businessName: businessName.trim(),
        categoryGuess: trimOrUndefined(categoryGuess),
        locationHint: trimOrUndefined(locationHint),
        contactName: trimOrUndefined(contactName),
        contactEmail: trimOrUndefined(contactEmail),
        contactPhone: trimOrUndefined(contactPhone),
        source: source === '' ? undefined : source,
        nextAction: trimOrUndefined(nextAction),
        dueDate: trimOrUndefined(dueDate),
      })
      setCreated({ warning: result.duplicateWarning })
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  if (created) {
    return (
      <Dialog label="Lead added" onClose={onSuccess} scrimTestId="add-lead-scrim" panelTestId="add-lead-dialog">
        <h2 className="mb-1 text-base font-semibold text-foreground">Lead added</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {businessName.trim()} is now in the Lead lane.
        </p>
        {created.warning && created.warning.count > 0 && (
          <div
            className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
            data-testid="add-lead-duplicate-warning"
          >
            <p className="font-medium">
              {created.warning.count === 1
                ? 'A similar prospect is already in the pipeline.'
                : `${created.warning.count} similar prospects are already in the pipeline.`}
            </p>
            <p className="mt-1">This did not block the new lead. Check for a duplicate:</p>
            <ul className="mt-1 list-disc pl-5">
              {created.warning.sample.map((dupe) => (
                <li key={dupe.id}>
                  {dupe.businessName}
                  {dupe.locationHint ? ` · ${dupe.locationHint}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end">
          <Button type="button" onClick={onSuccess} data-testid="add-lead-done">
            Done
          </Button>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      label="Add lead"
      onClose={onCancel}
      scrimTestId="add-lead-scrim"
      panelTestId="add-lead-dialog"
      initialFocusRef={nameRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Add lead</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Capture a prospect before anyone creates a draft. Only the business name is required.
      </p>

      <div className="grid gap-3">
        <Field id="add-lead-business" label="Business name" testId="add-lead-business" value={businessName} onChange={setBusinessName} inputRef={nameRef} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="add-lead-category" label="Category guess (optional)" testId="add-lead-category" value={categoryGuess} onChange={setCategoryGuess} />
          <Field id="add-lead-location" label="Location (optional)" testId="add-lead-location" value={locationHint} onChange={setLocationHint} />
        </div>
        <Field id="add-lead-contact-name" label="Contact name (optional)" testId="add-lead-contact-name" value={contactName} onChange={setContactName} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="add-lead-contact-email" label="Contact email (optional)" testId="add-lead-contact-email" value={contactEmail} onChange={setContactEmail} type="email" />
          <Field id="add-lead-contact-phone" label="Contact phone (optional)" testId="add-lead-contact-phone" value={contactPhone} onChange={setContactPhone} />
        </div>

        <div>
          <label htmlFor="add-lead-source" className="mb-1.5 block text-sm font-medium text-foreground">
            Source (optional)
          </label>
          <select
            id="add-lead-source"
            value={source}
            onChange={(e) => setSource(e.target.value as LeadSource | '')}
            data-testid="add-lead-source"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Not set</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {sourceLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <Field id="add-lead-next-action" label="Next action (optional)" testId="add-lead-next-action" value={nextAction} onChange={setNextAction} />
        <div>
          <label htmlFor="add-lead-due-date" className="mb-1.5 block text-sm font-medium text-foreground">
            Due date (optional)
          </label>
          <Input id="add-lead-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} data-testid="add-lead-due-date" />
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Do not put personal or contact details in the category, location, or next-action fields:
        they are kept for analytics.
      </p>

      {mutation.error && (
        <div className="mt-3">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending} data-testid="add-lead-cancel">
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={!canSubmit} data-testid="add-lead-submit">
          {mutation.isPending ? 'Adding...' : 'Add lead'}
        </Button>
      </div>
    </Dialog>
  )
}

function Field({
  id, label, testId, value, onChange, inputRef, type = 'text',
}: {
  id: string; label: string; testId: string; value: string
  onChange: (v: string) => void; inputRef?: React.RefObject<HTMLInputElement | null>; type?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      <Input id={id} ref={inputRef} type={type} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
    </div>
  )
}
