'use client'

// Branches PR-1 F7: the reviewed branch-details edit modal (prototype 11). For a LIVE
// merchant, sensitive identity edits do NOT write directly; they go through the
// admin-reviewed edit-request lane. The form fields are EXACTLY the prototype set:
//   Branch name (name), Description (about), Address line 1 (addressLine1),
//   Address line 2 (addressLine2), Town or city (city), Postcode (postcode),
//   plus a new logo + banner via the shared FileUpload control (logoUrl / bannerUrl).
// All are members of the backend SENSITIVE_FIELDS allow-list. We submit ONLY the
// changed subset and NEVER lat/lng (the backend resolves location from the postcode).
//
// The "Location on the map" preview is a designed READ-ONLY placeholder: a greyed
// bordered card with a centred pin SVG. It makes ZERO network calls and offers NO
// coordinate input (consistent with F9 + plan §6 #6). The live map / lookup is PR-6.
//
// Error UX (plan §F7): the modal STAYS OPEN on every error and "Send for review"
// re-enables, EXCEPT PENDING_EDIT_EXISTS which blocks a second concurrent submit and
// points to the pending item. POSTCODE_NOT_FOUND shows inline under the Postcode
// field; GAZETTEER_UNAVAILABLE shows a modal-level alert.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FileUpload } from '@/components/ui/file-upload'
import { MapPin, Info, X } from '@/lib/icons'
import { useCreateBranchEditRequest } from '@/lib/branches/useBranches'
import { ApiError } from '@/lib/api/client'
import type { Branch, BranchEditRequestBody } from '@/lib/api/branch'
import { LocationLookupField, type LocationPick } from '@/components/branches/LocationLookupField'

const ABOUT_MAX = 600

function val(v: string | null | undefined): string {
  return (v ?? '').trim()
}

export function BranchDetailsEditModal({
  branch,
  onClose,
}: {
  branch: Branch
  onClose: () => void
}) {
  const create = useCreateBranchEditRequest()

  const [draft, setDraft] = React.useState({
    name: val(branch.name),
    about: val(branch.about),
    addressLine1: val(branch.addressLine1),
    addressLine2: val(branch.addressLine2),
    city: val(branch.city),
    postcode: val(branch.postcode),
  })
  // Uploaded image urls (set only when an upload completes). When non-null they are
  // submitted; when null they are left untouched so the live value stays.
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = React.useState<string | null>(null)

  // Three distinct error surfaces: under the postcode field, modal-level, and a
  // "blocked: already in review" notice that also disables submit.
  const [postcodeError, setPostcodeError] = React.useState<string | null>(null)
  const [modalError, setModalError] = React.useState<string | null>(null)
  const [pendingExists, setPendingExists] = React.useState(false)
  // PR-6: the opaque token from a Google location pick (resolved server-side to
  // admin-review metadata in the BranchPendingEdit; NEVER lat/lng). Cleared on any
  // manual address edit so a stale token never rides with a hand-typed address.
  const [candidateToken, setCandidateToken] = React.useState<string | null>(null)

  function field(key: keyof typeof draft) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.target.value
      setDraft((d) => ({ ...d, [key]: value }))
      if (key === 'addressLine1' || key === 'addressLine2' || key === 'city' || key === 'postcode') {
        setCandidateToken(null)
      }
    }
  }

  // PR-6: autofill the existing address fields from a Google pick + hold the token.
  function applyPick(pick: LocationPick) {
    setDraft((d) => ({
      ...d,
      addressLine1: pick.addressParts.addressLine1 ?? d.addressLine1,
      city: pick.addressParts.city ?? d.city,
      postcode: pick.addressParts.postcode ?? d.postcode,
    }))
    setCandidateToken(pick.candidateToken)
    setPostcodeError(null)
  }

  // Build a body of ONLY the changed SENSITIVE text fields + any freshly uploaded
  // image. Never includes lat/lng.
  function changedBody(): BranchEditRequestBody {
    const body: BranchEditRequestBody = {}
    const original = {
      name: val(branch.name),
      about: val(branch.about),
      addressLine1: val(branch.addressLine1),
      addressLine2: val(branch.addressLine2),
      city: val(branch.city),
      postcode: val(branch.postcode),
    }
    ;(Object.keys(original) as (keyof typeof original)[]).forEach((k) => {
      const next = draft[k].trim()
      if (next !== original[k]) body[k] = next
    })
    if (logoUrl) body.logoUrl = logoUrl
    if (bannerUrl) body.bannerUrl = bannerUrl
    // PR-6: attach the Google-pick token ONLY when an address field actually changed,
    // so an unrelated identity edit never carries a stale suggestion. The reviewed
    // lane resolves it to admin-review metadata (never lat/lng). The token is already
    // cleared on any manual address edit, so it is only set when the autofilled values
    // are still intact.
    const addressChanged =
      body.addressLine1 !== undefined ||
      body.addressLine2 !== undefined ||
      body.city !== undefined ||
      body.postcode !== undefined
    if (candidateToken && addressChanged) body.candidateToken = candidateToken
    return body
  }

  async function submit() {
    setPostcodeError(null)
    setModalError(null)
    const body = changedBody()
    if (Object.keys(body).length === 0) {
      setModalError('Change at least one detail before sending for review.')
      return
    }
    try {
      await create.mutateAsync({ id: branch.id, changes: body })
      onClose()
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined
      if (code === 'PENDING_EDIT_EXISTS') {
        // A change is already in review: block a second concurrent request.
        setPendingExists(true)
        return
      }
      if (code === 'POSTCODE_NOT_FOUND') {
        setPostcodeError('We could not find that postcode. Check it and try again.')
        return
      }
      if (code === 'GAZETTEER_UNAVAILABLE') {
        setModalError('Address lookup is temporarily unavailable. Please try again shortly.')
        return
      }
      setModalError('We could not send your change for review. Please try again.')
    }
  }

  const submitDisabled = create.isPending || pendingExists

  return (
    <Dialog
      label="Edit branch details"
      onClose={onClose}
      panelTestId="branch-details-edit-modal"
      scrimTestId="branch-details-edit-scrim"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-foreground">Edit branch details</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-[#6B7390] hover:text-[#010C35]"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      {/* Reviewed-by-Redeemo warning banner. */}
      <div
        className="mt-4 flex items-start gap-3 rounded-[14px] p-4"
        style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
      >
        <Info size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--rose)' }} />
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">This change is reviewed by Redeemo.</span> Your
          current details stay live for customers until it is approved. You can withdraw before then.
        </p>
      </div>

      {/* Blocked: an edit is already in review (PENDING_EDIT_EXISTS). */}
      {pendingExists ? (
        <p
          role="alert"
          data-testid="pending-exists-notice"
          className="mt-4 rounded-[10px] border px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          A change is already in review. Withdraw the pending change on the branch page before sending a
          new one.
        </p>
      ) : null}

      {/* Modal-level error (e.g. gazetteer unavailable, generic failures). */}
      {modalError ? (
        <p
          role="alert"
          data-testid="modal-error"
          className="mt-4 rounded-[10px] border px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          {modalError}
        </p>
      ) : null}

      <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          <Label htmlFor="edit-branch-name">Branch name</Label>
          <Input id="edit-branch-name" value={draft.name} onChange={field('name')} />
        </div>

        <Textarea
          id="edit-branch-about"
          label="Description"
          maxLength={ABOUT_MAX}
          value={draft.about}
          onChange={field('about')}
        />

        {/* PR-6: business / address lookup. Picking a result autofills the address
            fields below + holds the token for the reviewed submit. The merchant
            reviews/edits before sending. No map, no pin, no coordinates. */}
        <LocationLookupField id="edit-branch-location" onPick={applyPick} />

        <div className="space-y-1.5">
          <Label htmlFor="edit-branch-address1">Address line 1</Label>
          <Input id="edit-branch-address1" value={draft.addressLine1} onChange={field('addressLine1')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-branch-address2">Address line 2 (optional)</Label>
          <Input id="edit-branch-address2" value={draft.addressLine2} onChange={field('addressLine2')} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-branch-city">Town or city</Label>
            <Input id="edit-branch-city" value={draft.city} onChange={field('city')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-branch-postcode">Postcode</Label>
            <Input id="edit-branch-postcode" value={draft.postcode} onChange={field('postcode')} />
            {postcodeError ? (
              <p
                role="alert"
                data-testid="postcode-error"
                className="text-xs font-medium"
                style={{ color: 'var(--destructive)' }}
              >
                {postcodeError}
              </p>
            ) : null}
          </div>
        </div>

        {/* Logo + banner uploads (logoUrl / bannerUrl, SENSITIVE, reviewed). */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FileUpload
            kind="logo"
            label="Upload a new logo"
            hint="PNG or JPG, up to 2MB."
            onUploaded={setLogoUrl}
          />
          <FileUpload
            kind="banner"
            label="Upload a new banner"
            hint="PNG or JPG, up to 5MB."
            onUploaded={setBannerUrl}
          />
        </div>

        {/* Read-only "Location on the map" placeholder. No network, no coordinates. */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-[#010C35]">Location on the map</p>
          <div
            data-testid="edit-modal-map-placeholder"
            className="flex h-32 w-full items-center justify-center rounded-[14px] border"
            style={{ background: 'var(--page)', borderColor: 'var(--border-subtle)' }}
          >
            <MapPin size={28} aria-hidden style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <p className="text-xs text-muted-foreground">
            Worked out from the address. You did not enter coordinates.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={submitDisabled}>
          {create.isPending ? 'Sending...' : 'Send for review'}
        </Button>
      </div>
    </Dialog>
  )
}
