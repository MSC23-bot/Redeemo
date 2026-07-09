'use client'

// Branches PR-5 §6 (CREATE): the live owner-only add-branch modal (prototypes 01/02).
// It mirrors the onboarding BranchStepForm field set, MANUAL ADDRESS ONLY: name /
// addressLine1 / addressLine2 / city / postcode / phone / email / websiteUrl / about.
// There is NO lat/lng, no map, and no Google lookup here (PR-6). The backend resolves
// the location from the postcode itself (POSTCODE_CENTROID) and an admin confirms the
// precise spot before the branch goes live.
//
// LIFECYCLE: a merchant's FIRST/main branch is created INSTANT-LIVE on the backend;
// every SUBSEQUENT branch comes back lifecycleStatus PENDING_CREATE (customer-invisible,
// awaiting admin approval). On success we navigate to the new branch's detail page,
// where the awaiting-approval banner (for a pending branch) renders. The detail page is
// the single source of truth for the post-create state, so this modal only creates +
// navigates; it does not itself decide what banner to show.
//
// Branch Location Trust Slice 3 (pin-drop addendum §5.1): the CREATE flow is a
// two-step chain when the new branch was NOT auto-trusted by a Google pick. If
// the created branch comes back POSTCODE_CENTROID / NEEDS_REVIEW (no Google
// pick, or a pick that failed the cross-check), this modal offers the pin-drop
// step immediately, before navigating away, so it feels like one flow rather
// than a separate later trip to the branch page. An ADDRESS_GEOCODED branch
// (Google pick passed) skips straight to navigation, same as before -
// D-L5 already means pin-drop would be rejected on an already-confirmed branch.
//
// Error UX: the modal STAYS OPEN on every error and "Add branch" re-enables.
// POSTCODE_NOT_FOUND shows inline under the Postcode field; GAZETTEER_UNAVAILABLE shows
// a modal-level alert; everything else is a calm generic modal-level message.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Info, X } from '@/lib/icons'
import { useCreateBranch } from '@/lib/branches/useBranches'
import { ApiError } from '@/lib/api/client'
import type { Branch, BranchCreateBody } from '@/lib/api/branch'
import { LocationLookupField, type LocationPick } from '@/components/branches/LocationLookupField'
import { PinDropMap } from '@/components/branches/PinDropMap'

const PIN_DROP_ELIGIBLE = new Set(['POSTCODE_CENTROID', 'NEEDS_REVIEW'])

const ABOUT_MAX = 600

interface FieldErrors {
  name?: string
  addressLine1?: string
  city?: string
  postcode?: string
}

export function AddBranchModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const create = useCreateBranch()

  const [draft, setDraft] = React.useState({
    name: '',
    about: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    postcode: '',
    phone: '',
    email: '',
    websiteUrl: '',
  })
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({})
  const [postcodeError, setPostcodeError] = React.useState<string | null>(null)
  const [modalError, setModalError] = React.useState<string | null>(null)
  // PR-6: the opaque token from a Google location pick (resolved server-side to
  // admin-review metadata; NEVER lat/lng). Cleared on any manual address edit so a
  // stale token never rides along with a hand-typed address.
  const [candidateToken, setCandidateToken] = React.useState<string | null>(null)
  // Slice 3: once create() succeeds on a not-yet-confirmed branch, we switch this
  // modal to the pin-drop step instead of closing immediately.
  const [createdBranch, setCreatedBranch] = React.useState<Branch | null>(null)

  function field(key: keyof typeof draft) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.target.value
      setDraft((d) => ({ ...d, [key]: value }))
      // A manual edit to an address field invalidates the picked token.
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
    setFieldErrors({})
    setPostcodeError(null)
  }

  // The backend requires name + address; mirror the BranchStepForm create-minimum.
  function validate(): FieldErrors {
    const errs: FieldErrors = {}
    if (!draft.name.trim()) errs.name = 'Branch name is required.'
    if (!draft.addressLine1.trim()) errs.addressLine1 = 'Address line 1 is required.'
    if (!draft.city.trim()) errs.city = 'Town or city is required.'
    if (!draft.postcode.trim()) errs.postcode = 'Postcode is required.'
    return errs
  }

  // Only the filled keys are sent; the backend resolves location from the postcode and
  // drops any lat/lng (we never send coordinates).
  function body(): BranchCreateBody {
    const b: BranchCreateBody = {
      name: draft.name.trim(),
      addressLine1: draft.addressLine1.trim(),
      city: draft.city.trim(),
      postcode: draft.postcode.trim(),
    }
    if (draft.addressLine2.trim()) b.addressLine2 = draft.addressLine2.trim()
    if (draft.phone.trim()) b.phone = draft.phone.trim()
    if (draft.email.trim()) b.email = draft.email.trim()
    if (draft.websiteUrl.trim()) b.websiteUrl = draft.websiteUrl.trim()
    if (draft.about.trim()) b.about = draft.about.trim()
    // PR-6: the Google-pick token rides along (server resolves it to admin-review
    // metadata; never lat/lng). Omitted on a hand-typed address.
    if (candidateToken) b.candidateToken = candidateToken
    return b
  }

  // The detail page resolves the post-create state (awaiting-approval banner for a
  // PENDING_CREATE branch, normal layout for an instant first/main branch).
  function finishAndNavigate(branchId: string) {
    onClose()
    router.push(`/branches/${branchId}`)
  }

  async function submit() {
    setPostcodeError(null)
    setModalError(null)
    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    try {
      const branch = await create.mutateAsync(body())
      // Slice 3 (addendum §5.1): a branch that did NOT auto-trust via a Google
      // pick (POSTCODE_CENTROID) or that failed the cross-check (NEEDS_REVIEW)
      // gets an immediate pin-drop offer, chained into this same modal, before
      // we navigate away. An ADDRESS_GEOCODED branch (Google pick passed) skips
      // straight to navigation.
      if (PIN_DROP_ELIGIBLE.has(branch.locationConfidence ?? '')) {
        setCreatedBranch(branch)
        return
      }
      finishAndNavigate(branch.id)
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined
      if (code === 'POSTCODE_NOT_FOUND') {
        setPostcodeError('We could not find that postcode. Check it and try again.')
        return
      }
      if (code === 'GAZETTEER_UNAVAILABLE') {
        setModalError('Address lookup is temporarily unavailable. Please try again shortly.')
        return
      }
      setModalError('We could not add this branch. Please try again.')
    }
  }

  // Slice 3: the chained pin-drop step, rendered instead of the create form once
  // the branch exists. The merchant can set a pin now or skip and do it later
  // from the branch's Location card (LocationCard offers the same entry point
  // for any POSTCODE_CENTROID / NEEDS_REVIEW branch).
  if (createdBranch) {
    return (
      <Dialog
        label="Set your location pin"
        onClose={() => finishAndNavigate(createdBranch.id)}
        panelTestId="add-branch-pin-drop-modal"
        scrimTestId="add-branch-pin-drop-scrim"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-foreground">Set your location pin</h2>
          <button
            type="button"
            onClick={() => finishAndNavigate(createdBranch.id)}
            aria-label="Close"
            className="text-[#6B7390] hover:text-[#010C35]"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Your branch is saved. Can&apos;t find your business on a map search? Drop a pin at your exact
          spot now, or skip this and do it later from the branch page.
        </p>
        <div className="mt-4">
          <PinDropMap
            branch={createdBranch}
            onDone={() => finishAndNavigate(createdBranch.id)}
            onCancel={() => finishAndNavigate(createdBranch.id)}
          />
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      label="Add a branch"
      onClose={onClose}
      panelTestId="add-branch-modal"
      scrimTestId="add-branch-scrim"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-foreground">Add a branch</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-[#6B7390] hover:text-[#010C35]"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      {/* Reviewed-by-Redeemo explainer: a subsequent branch is reviewed before it goes
          live, so customers never see it until then. */}
      <div
        className="mt-4 flex items-start gap-3 rounded-[14px] p-4"
        style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
      >
        <Info size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--rose)' }} />
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Redeemo reviews each new branch.</span> We
          confirm the exact location from the address before it goes live, so the pin is spot on for
          customers. You can add hours, photos and a PIN once it is created.
        </p>
      </div>

      {modalError ? (
        <p
          role="alert"
          data-testid="add-branch-modal-error"
          className="mt-4 rounded-[10px] border px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          {modalError}
        </p>
      ) : null}

      <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          <Label htmlFor="add-branch-name">Branch name</Label>
          <Input
            id="add-branch-name"
            value={draft.name}
            onChange={field('name')}
            placeholder="Old Foundry Kitchen, Huddersfield"
            aria-invalid={fieldErrors.name ? true : undefined}
          />
          <FieldError testId="add-branch-name-error" message={fieldErrors.name} />
        </div>

        <Textarea
          id="add-branch-about"
          label="Branch description (optional)"
          maxLength={ABOUT_MAX}
          value={draft.about}
          onChange={field('about')}
          placeholder="Anything specific to this location, like parking, accessibility, or what makes it special."
        />

        {/* PR-6: business / address lookup. Picking a result autofills the address
            fields below + holds the token for submit. The merchant reviews/edits
            before saving. No map, no pin, no coordinates. */}
        <LocationLookupField id="add-branch-location" onPick={applyPick} />

        <div className="space-y-1.5">
          <Label htmlFor="add-branch-address1">Address line 1</Label>
          <Input
            id="add-branch-address1"
            value={draft.addressLine1}
            onChange={field('addressLine1')}
            placeholder="12 Mill Lane"
            aria-invalid={fieldErrors.addressLine1 ? true : undefined}
          />
          <FieldError testId="add-branch-address1-error" message={fieldErrors.addressLine1} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="add-branch-address2">Address line 2 (optional)</Label>
          <Input
            id="add-branch-address2"
            value={draft.addressLine2}
            onChange={field('addressLine2')}
            placeholder="Unit, floor, or building"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="add-branch-city">Town or city</Label>
            <Input
              id="add-branch-city"
              value={draft.city}
              onChange={field('city')}
              placeholder="Huddersfield"
              aria-invalid={fieldErrors.city ? true : undefined}
            />
            <FieldError testId="add-branch-city-error" message={fieldErrors.city} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-branch-postcode">Postcode</Label>
            <Input
              id="add-branch-postcode"
              value={draft.postcode}
              onChange={field('postcode')}
              placeholder="HD1 1AA"
              aria-invalid={fieldErrors.postcode || postcodeError ? true : undefined}
            />
            <FieldError testId="add-branch-postcode-error" message={fieldErrors.postcode} />
            {postcodeError ? (
              <p
                role="alert"
                data-testid="add-branch-postcode-lookup-error"
                className="text-xs font-medium"
                style={{ color: 'var(--destructive)' }}
              >
                {postcodeError}
              </p>
            ) : null}
          </div>
        </div>

        {/* Customer contact (all optional, same as the onboarding branch step). */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="add-branch-phone">Branch phone (optional)</Label>
            <Input
              id="add-branch-phone"
              type="tel"
              value={draft.phone}
              onChange={field('phone')}
              placeholder="+44 1484 000000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-branch-email">Branch email (optional)</Label>
            <Input
              id="add-branch-email"
              type="email"
              value={draft.email}
              onChange={field('email')}
              placeholder="hello@oldfoundry.co.uk"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="add-branch-website">Branch website (optional)</Label>
          <Input
            id="add-branch-website"
            type="url"
            value={draft.websiteUrl}
            onChange={field('websiteUrl')}
            placeholder="oldfoundry.co.uk"
          />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={create.isPending}>
          {create.isPending ? 'Adding...' : 'Add branch'}
        </Button>
      </div>
    </Dialog>
  )
}

function FieldError({ message, testId }: { message?: string; testId?: string }) {
  if (!message) return null
  return (
    <p role="alert" data-testid={testId} className="text-xs font-medium" style={{ color: 'var(--destructive)' }}>
      {message}
    </p>
  )
}
