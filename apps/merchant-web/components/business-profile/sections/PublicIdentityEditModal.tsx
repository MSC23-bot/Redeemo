'use client'

// Business Profile M4: the "Public identity" edit modal (businessName, tradingName,
// description, logoUrl, bannerUrl - the backend SENSITIVE_FIELDS set). OWNER-only
// (gated by the card before this mounts).
//
// Lane selection (D1, backend-locked, do not change without a backend contract
// change): a SENSITIVE-field save writes DIRECTLY via PATCH /merchant/profile
// (useUpdateMerchantProfile) ONLY while the merchant is in the draft window
// (`status === 'REGISTERED' || onboardingStep === 'NEEDS_CHANGES'` -
// src/api/merchant/shared.ts `isDraftWindow`); once live it MUST route through the
// governed edit-request lane (POST /merchant/profile/edit-request via
// useCreateMerchantEditRequest) so an admin reviews it before it reaches customers.
// The predicate is duplicated client-side ONLY to pick which mutation to call -
// the backend re-checks the SAME predicate server-side and is the real boundary
// (a stale client read just gets a SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST /
// PENDING_EDIT_EXISTS error back, handled below).
//
// Only the CHANGED fields are ever sent, matching RegisteredDetailsCard /
// BranchDetailsEditModal. Description is validated exactly like the onboarding
// BusinessProfileForm (required, 600-char cap); businessName is required;
// tradingName has no format rule (clears to null when emptied).
import * as React from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FileUpload } from '@/components/ui/file-upload'
import { X } from '@/lib/icons'
import { useUpdateMerchantProfile } from '@/lib/business-profile/useUpdateMerchantProfile'
import { useCreateMerchantEditRequest } from '@/lib/business-profile/useMerchantEditRequest'
import {
  validatePublicIdentity,
  hasPublicIdentityErrors,
  DESCRIPTION_MAX,
  type PublicIdentityDraft,
  type PublicIdentityErrors,
} from '@/lib/business-profile/validatePublicIdentity'
import { ApiError } from '@/lib/api/client'
import type { MerchantProfile } from '@/lib/api/profile'

function val(v: string | null | undefined): string {
  return (v ?? '').trim()
}

/** D1 lane predicate - mirrors src/api/merchant/shared.ts `isDraftWindow` exactly. */
export function isDraftWindowProfile(profile: Pick<MerchantProfile, 'status' | 'onboardingStep'>): boolean {
  return profile.status === 'REGISTERED' || profile.onboardingStep === 'NEEDS_CHANGES'
}

const EMPTY_ERRORS: PublicIdentityErrors = { businessName: null, description: null }

export function PublicIdentityEditModal({
  profile,
  onClose,
}: {
  profile: MerchantProfile
  onClose: () => void
}) {
  const update = useUpdateMerchantProfile()
  const create = useCreateMerchantEditRequest()
  const isDraft = isDraftWindowProfile(profile)
  const isPending = isDraft ? update.isPending : create.isPending

  const [draft, setDraft] = React.useState<PublicIdentityDraft>({
    businessName: val(profile.businessName),
    tradingName: val(profile.tradingName),
    description: val(profile.description),
  })
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = React.useState<string | null>(null)

  const [fieldErrors, setFieldErrors] = React.useState<PublicIdentityErrors>(EMPTY_ERRORS)
  const [modalError, setModalError] = React.useState<string | null>(null)
  const [pendingExists, setPendingExists] = React.useState(false)

  function field(key: keyof PublicIdentityDraft) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft((d) => ({ ...d, [key]: e.target.value }))
    }
  }

  // Build a body of ONLY the changed fields + any freshly uploaded image. Empty
  // tradingName clears to null (matches RegisteredDetailsCard's clear-on-empty
  // convention); businessName/description never send empty (validated first).
  function changedBody(): { businessName?: string; tradingName?: string | null; description?: string; logoUrl?: string; bannerUrl?: string } {
    const body: { businessName?: string; tradingName?: string | null; description?: string; logoUrl?: string; bannerUrl?: string } = {}
    const original = {
      businessName: val(profile.businessName),
      tradingName: val(profile.tradingName),
      description: val(profile.description),
    }
    const nextBusinessName = draft.businessName.trim()
    if (nextBusinessName !== original.businessName) body.businessName = nextBusinessName

    const nextTradingName = draft.tradingName.trim()
    if (nextTradingName !== original.tradingName) body.tradingName = nextTradingName.length > 0 ? nextTradingName : null

    const nextDescription = draft.description.trim()
    if (nextDescription !== original.description) body.description = nextDescription

    if (logoUrl) body.logoUrl = logoUrl
    if (bannerUrl) body.bannerUrl = bannerUrl
    return body
  }

  async function submit() {
    setModalError(null)
    setPendingExists(false)

    const errors = validatePublicIdentity(draft)
    if (hasPublicIdentityErrors(errors)) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors(EMPTY_ERRORS)

    const body = changedBody()
    if (Object.keys(body).length === 0) {
      setModalError('Change at least one detail before saving.')
      return
    }

    try {
      if (isDraft) {
        // Draft window: writes directly via the shared M2/M3 profile PATCH.
        await update.mutateAsync(body)
      } else {
        // Live: routes through the governed edit-request lane.
        await create.mutateAsync(body)
      }
      onClose()
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined
      if (code === 'PENDING_EDIT_EXISTS') {
        setPendingExists(true)
        return
      }
      setModalError(
        isDraft
          ? 'We could not save your changes. Please try again.'
          : 'We could not send your change for review. Please try again.',
      )
    }
  }

  const submitDisabled = isPending || pendingExists

  return (
    <Dialog
      label="Edit public identity"
      onClose={onClose}
      panelTestId="public-identity-edit-modal"
      scrimTestId="public-identity-edit-scrim"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-foreground">Edit public identity</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-[#6B7390] hover:text-[#010C35]"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      {!isDraft ? (
        <div
          className="mt-4 rounded-[14px] p-4 text-sm text-muted-foreground"
          style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
          data-testid="public-identity-modal-reviewed-notice"
        >
          <span className="font-semibold text-foreground">This change is reviewed by Redeemo.</span> Your
          current details stay live for customers until it is approved. You can withdraw before then.
        </div>
      ) : null}

      {pendingExists ? (
        <p
          role="alert"
          data-testid="public-identity-pending-exists-notice"
          className="mt-4 rounded-[10px] border px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          A change is already in review. Withdraw the pending change before sending a new one.
        </p>
      ) : null}

      {modalError ? (
        <p
          role="alert"
          data-testid="public-identity-modal-error"
          className="mt-4 rounded-[10px] border px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          {modalError}
        </p>
      ) : null}

      <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          <Label htmlFor="edit-public-identity-business-name">Business name</Label>
          <Input
            id="edit-public-identity-business-name"
            value={draft.businessName}
            onChange={field('businessName')}
          />
          {fieldErrors.businessName ? <FieldError message={fieldErrors.businessName} /> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-public-identity-trading-name">Trading name</Label>
          <Input
            id="edit-public-identity-trading-name"
            value={draft.tradingName}
            onChange={field('tradingName')}
          />
        </div>

        <div className="space-y-1.5">
          <Textarea
            id="edit-public-identity-description"
            label="Description"
            maxLength={DESCRIPTION_MAX}
            value={draft.description}
            onChange={field('description')}
          />
          {fieldErrors.description ? <FieldError message={fieldErrors.description} /> : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FileUpload
            kind="logo"
            label="Upload a new logo"
            hint="Square, PNG or JPG, up to 2MB."
            onUploaded={setLogoUrl}
          />
          <FileUpload
            kind="banner"
            label="Upload a new banner"
            hint="Wide, PNG or JPG, up to 5MB."
            onUploaded={setBannerUrl}
          />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={submitDisabled}>
          {isPending ? 'Saving...' : isDraft ? 'Save' : 'Send for review'}
        </Button>
      </div>
    </Dialog>
  )
}

function FieldError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-xs font-medium" style={{ color: 'var(--destructive)' }}>
      {message}
    </p>
  )
}
