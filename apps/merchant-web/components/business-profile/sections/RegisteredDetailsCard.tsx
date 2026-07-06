'use client'

// Business Profile M2/M3: the "Registered details" card (prototype 01/03) - website,
// company number, VAT number. These are the simple-DIRECT fields (M2 F3 backend
// note: they always write direct, no admin review) - the "Saves instantly" badge
// mirrors the exact style Branches' ContactCard already uses for the identical
// copy.
//
// M3: an OWNER viewer (`profile.viewerCapabilities.role === 'OWNER'`) gets a LIVE
// Edit affordance - inline edit mode mirrors Branches' ContactCard exactly (Edit
// pencil -> labelled inputs + Save/Cancel -> PATCH ONLY the changed subset via
// useUpdateMerchantProfile -> toast + back to view). A non-owner (BRANCH_MANAGER /
// STAFF / absent viewerCapabilities - fail-closed) sees the card fully read-only:
// no Edit button renders at all (not even disabled). The backend
// `updateMerchantProfileDirectCore` remains the real security boundary; this is a
// UX-only gate.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { Pencil } from '@/lib/icons'
import { useUpdateMerchantProfile } from '@/lib/business-profile/useUpdateMerchantProfile'
import {
  validateRegisteredDetails,
  hasRegisteredDetailsErrors,
  type RegisteredDetailsDraft,
  type RegisteredDetailsErrors,
} from '@/lib/business-profile/validateRegisteredDetails'
import type { MerchantProfile } from '@/lib/api/profile'

function val(v: string | null | undefined): string {
  return (v ?? '').trim()
}

const EMPTY_ERRORS: RegisteredDetailsErrors = { websiteUrl: null, companyNumber: null, vatNumber: null }

export function RegisteredDetailsCard({ profile }: { profile: MerchantProfile }) {
  const { toast } = useToast()
  const update = useUpdateMerchantProfile()
  const isOwner = profile.viewerCapabilities?.role === 'OWNER'

  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState<RegisteredDetailsDraft>({
    websiteUrl: val(profile.websiteUrl),
    companyNumber: val(profile.companyNumber),
    vatNumber: val(profile.vatNumber),
  })
  const [fieldErrors, setFieldErrors] = React.useState<RegisteredDetailsErrors>(EMPTY_ERRORS)
  const [actionError, setActionError] = React.useState<string | null>(null)

  function startEdit() {
    setDraft({
      websiteUrl: val(profile.websiteUrl),
      companyNumber: val(profile.companyNumber),
      vatNumber: val(profile.vatNumber),
    })
    setFieldErrors(EMPTY_ERRORS)
    setActionError(null)
    setEditing(true)
  }

  function cancel() {
    setFieldErrors(EMPTY_ERRORS)
    setActionError(null)
    setEditing(false)
  }

  // Build a body of ONLY the changed direct-simple fields. Empty strings clear a
  // value (the backend treats null as "clear"; the merchant PATCH accepts either,
  // and the profile schema already reads back trimmed/empty as unset).
  function changedBody(): { websiteUrl?: string | null; companyNumber?: string | null; vatNumber?: string | null } {
    const body: { websiteUrl?: string | null; companyNumber?: string | null; vatNumber?: string | null } = {}
    const original = {
      websiteUrl: val(profile.websiteUrl),
      companyNumber: val(profile.companyNumber),
      vatNumber: val(profile.vatNumber),
    }
    ;(['websiteUrl', 'companyNumber', 'vatNumber'] as const).forEach((f) => {
      const next = draft[f].trim()
      if (next !== original[f]) body[f] = next.length > 0 ? next : null
    })
    return body
  }

  async function save() {
    const errors = validateRegisteredDetails(draft)
    if (hasRegisteredDetailsErrors(errors)) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors(EMPTY_ERRORS)

    const body = changedBody()
    if (Object.keys(body).length === 0) {
      // Nothing changed: treat Save as a calm no-op back to view (no network call).
      setEditing(false)
      return
    }
    setActionError(null)
    try {
      await update.mutateAsync(body)
      toast({ message: 'Registered details saved.', variant: 'success' })
      setEditing(false)
    } catch {
      setActionError('We could not save your changes. Check the details and try again.')
    }
  }

  return (
    <Card className="gap-4" data-testid="business-profile-registered-details-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Registered details</h2>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: 'rgba(15, 122, 62, 0.10)', color: 'var(--success)' }}
          >
            Saves instantly
          </span>
          {isOwner && !editing ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={startEdit}
              data-testid="registered-details-edit"
            >
              <Pencil size={14} aria-hidden />
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="space-y-4 px-6">
          {actionError ? (
            <p
              role="alert"
              className="rounded-[10px] border px-3 py-2 text-sm font-medium"
              style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
            >
              {actionError}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="registered-details-website">Website</Label>
            <Input
              id="registered-details-website"
              type="text"
              value={draft.websiteUrl}
              onChange={(e) => setDraft((d) => ({ ...d, websiteUrl: e.target.value }))}
              placeholder="yourbusiness.co.uk"
            />
            {fieldErrors.websiteUrl ? <FieldError message={fieldErrors.websiteUrl} /> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="registered-details-company-number">Company number</Label>
            <Input
              id="registered-details-company-number"
              type="text"
              value={draft.companyNumber}
              onChange={(e) => setDraft((d) => ({ ...d, companyNumber: e.target.value }))}
              placeholder="09872341"
            />
            {fieldErrors.companyNumber ? <FieldError message={fieldErrors.companyNumber} /> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="registered-details-vat-number">VAT number</Label>
            <Input
              id="registered-details-vat-number"
              type="text"
              value={draft.vatNumber}
              onChange={(e) => setDraft((d) => ({ ...d, vatNumber: e.target.value }))}
              placeholder="GB 213 9874 22"
            />
            {fieldErrors.vatNumber ? <FieldError message={fieldErrors.vatNumber} /> : null}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button type="button" onClick={save} disabled={update.isPending}>
              {update.isPending ? 'Saving...' : 'Save'}
            </Button>
            <Button type="button" variant="secondary" onClick={cancel} disabled={update.isPending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 px-6">
          <Field label="Website" value={val(profile.websiteUrl)} empty="No website added" />
          <Field label="Company number" value={val(profile.companyNumber)} empty="No company number added" />
          <Field label="VAT number" value={val(profile.vatNumber)} empty="Not VAT registered" />
        </div>
      )}
    </Card>
  )
}

function Field({ label, value, empty }: { label: string; value: string; empty: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {value ? (
        <p className="text-sm text-foreground">{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  )
}

function FieldError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-xs font-medium" style={{ color: 'var(--destructive)' }}>
      {message}
    </p>
  )
}
