'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import {
  BranchStepForm,
  type BranchFormValues,
  type HeadOfficeAddress,
} from '@/components/onboarding/branch/BranchStepForm'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'
import {
  listBranches,
  createBranch,
  updateBranch,
  setBranchHours,
  getBranchAmenities,
  setBranchAmenities,
  getBranchPin,
  setBranchPin,
  requestBranchPhotoEdit,
  type Amenity,
  type Branch,
  type BranchCreateBody,
  type BranchUpdateBody,
} from '@/lib/api/branch'
import {
  defaultHoursState,
  hoursStateFromBranch,
  toHoursPayload,
} from '@/components/onboarding/branch/lib/hoursModel'
import { ApiError } from '@/lib/api/client'

// M2 F4 (B1 + B4 + B5): the "Add your main branch" onboarding step. It prefills from
// the existing main branch (if any) + the merchant profile, loads the category-scoped
// amenity catalog, then on save creates the branch (or reuses the existing one) and
// sets hours + amenities + PIN, and routes the branch photos through the governed
// photo edit-request lane. "Save and continue" requires the create-minimum (name +
// address); "Save and finish later" persists what exists once the minimum is present.

const HUB = '/'

function branchErrorMessage(err: unknown): string {
  const code = err instanceof ApiError ? err.code : undefined
  switch (code) {
    case 'OPENING_HOURS_INVALID':
      return 'Those opening hours are not valid. Check each open day has a start and end time.'
    case 'POSTCODE_NOT_FOUND':
      return 'We could not find that postcode. Check it and try again.'
    case 'GAZETTEER_UNAVAILABLE':
      return 'We could not look up that postcode just now. Please try again in a moment.'
    case 'INVALID_PIN_FORMAT':
      return 'The redemption PIN must be exactly 4 digits.'
    case 'SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST':
      return 'These details can only be changed directly while your application is in draft.'
    default:
      return 'We could not save your branch just now. Please try again.'
  }
}

// Build the create body from the form values, sending only filled keys (name +
// address are the required minimum; the rest are optional). The backend resolves
// location from the postcode itself, so we never send lat/lng.
function buildCreateBody(v: BranchFormValues): BranchCreateBody {
  const body: BranchCreateBody = {
    name: v.name.trim(),
    addressLine1: v.addressLine1.trim(),
    city: v.city.trim(),
    postcode: v.postcode.trim(),
  }
  if (v.addressLine2.trim()) body.addressLine2 = v.addressLine2.trim()
  if (v.phone.trim()) body.phone = v.phone.trim()
  if (v.email.trim()) body.email = v.email.trim()
  if (v.websiteUrl.trim()) body.websiteUrl = v.websiteUrl.trim()
  if (v.bannerUrl) body.bannerUrl = v.bannerUrl
  if (v.about.trim()) body.about = v.about.trim()
  // PR-6: the Google-pick token rides along on create (server resolves it to
  // admin-review metadata; never lat/lng). Omitted on a hand-typed address.
  if (v.candidateToken.trim()) body.candidateToken = v.candidateToken.trim()
  return body
}

// Build the PATCH body for an EXISTING (reused) branch, so the merchant's edited
// detail fields are persisted instead of silently dropped. Mirrors buildCreateBody's
// filtering: only provided values are sent. The backend persists these directly
// during the draft window (a postcode change re-resolves location server-side).
function buildUpdateBody(v: BranchFormValues): BranchUpdateBody {
  const body: BranchUpdateBody = {}
  if (v.name.trim()) body.name = v.name.trim()
  if (v.addressLine1.trim()) body.addressLine1 = v.addressLine1.trim()
  if (v.addressLine2.trim()) body.addressLine2 = v.addressLine2.trim()
  if (v.city.trim()) body.city = v.city.trim()
  if (v.postcode.trim()) body.postcode = v.postcode.trim()
  if (v.phone.trim()) body.phone = v.phone.trim()
  if (v.email.trim()) body.email = v.email.trim()
  if (v.websiteUrl.trim()) body.websiteUrl = v.websiteUrl.trim()
  if (v.bannerUrl) body.bannerUrl = v.bannerUrl
  if (v.about.trim()) body.about = v.about.trim()
  // PR-6: a Google-pick token on a draft-window reuse PATCH carries to the
  // direct sensitive-edit path (server resolves it to admin-review metadata; never
  // lat/lng). Omitted on a hand-typed address.
  if (v.candidateToken.trim()) body.candidateToken = v.candidateToken.trim()
  return body
}

function hasCreateMinimum(v: BranchFormValues): boolean {
  return (
    v.name.trim().length > 0 &&
    v.addressLine1.trim().length > 0 &&
    v.city.trim().length > 0 &&
    v.postcode.trim().length > 0
  )
}

export default function BranchPage() {
  const session = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const profile = useMerchantProfile(session.isAuthenticated)

  const [loadingBranch, setLoadingBranch] = useState(true)
  const [existingBranch, setExistingBranch] = useState<Branch | null>(null)
  // Synchronous mirror of the branch that has been created/loaded this session. We
  // consult this BEFORE React flushes setExistingBranch so a retry that happens
  // after a successful create but a failed sub-step (hours/amenities/pin) reuses the
  // SAME branch and never fires a duplicate createBranch (the backend has no
  // duplicate guard). Kept in sync with existingBranch in the load effect + persist.
  const persistedBranchRef = useRef<Branch | null>(null)
  const [existingPin, setExistingPin] = useState<string | null>(null)
  const [amenities, setAmenities] = useState<Amenity[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const categoryId = profile.data?.primaryCategoryId ?? null

  // Load the existing main branch + its PIN (prefill), and the amenity catalog.
  useEffect(() => {
    if (!session.isAuthenticated || !profile.data) return
    let cancelled = false
    ;(async () => {
      setLoadingBranch(true)
      try {
        const branches = await listBranches()
        const main = branches.find((b) => b.isMainBranch) ?? branches[0] ?? null
        if (cancelled) return
        persistedBranchRef.current = main
        setExistingBranch(main)
        if (main) {
          try {
            const { pin } = await getBranchPin(main.id)
            if (!cancelled) setExistingPin(pin)
          } catch {
            // PIN read is best-effort prefill; ignore a transient failure.
          }
        }
      } catch {
        // A branch-list failure is non-fatal; the merchant can still create one.
      } finally {
        if (!cancelled) setLoadingBranch(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session.isAuthenticated, profile.data])

  // Load the category-scoped amenity catalog (the OPEN customer endpoint), keyed by
  // the merchant's primaryCategoryId (the subcategory id; the backend unions parent
  // rules). Empty when the category has no amenity rules.
  useEffect(() => {
    if (!categoryId) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await getBranchAmenities(categoryId)
        if (!cancelled) setAmenities(list)
      } catch {
        if (!cancelled) setAmenities([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [categoryId])

  function goBack() {
    router.push(HUB)
  }

  if (profile.isError) {
    return (
      <div className="space-y-6" role="alert">
        <h1 className="font-display text-2xl font-semibold text-foreground">Something went wrong</h1>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">We could not load your branch</CardTitle>
            <CardDescription>
              There was a problem reaching Redeemo. Check your connection and try again.
            </CardDescription>
          </CardHeader>
        </Card>
        <Button onClick={() => profile.refetch?.()}>Try again</Button>
      </div>
    )
  }

  if (profile.isLoading || !profile.data || loadingBranch) {
    return (
      <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
        Loading your branch...
      </div>
    )
  }

  const headOffice: HeadOfficeAddress | null = null

  const initialValues: BranchFormValues = {
    name: existingBranch?.name ?? '',
    about: existingBranch?.about ?? '',
    addressLine1: existingBranch?.addressLine1 ?? '',
    addressLine2: existingBranch?.addressLine2 ?? '',
    city: existingBranch?.city ?? '',
    postcode: existingBranch?.postcode ?? '',
    phone: existingBranch?.phone ?? '',
    email: existingBranch?.email ?? '',
    websiteUrl: existingBranch?.websiteUrl ?? '',
    bannerUrl: existingBranch?.bannerUrl ?? '',
    photos: existingBranch?.photos?.map((p) => p.url) ?? [],
    pin: existingPin ?? '',
    hours: existingBranch?.openingHours?.length
      ? hoursStateFromBranch(existingBranch.openingHours)
      : defaultHoursState(),
    amenityIds: existingBranch?.amenities?.map((a) => a.amenity.id) ?? [],
    // PR-6: starts empty; set only when the merchant picks a Google location result.
    candidateToken: '',
  }

  async function persist(values: BranchFormValues, partial: boolean) {
    // The branch we already hold this session: the loaded main branch OR one created
    // on a prior (sub-step-failed) attempt. The ref is the synchronous authority so a
    // fast retry reuses it before React flushes setExistingBranch.
    const alreadyPersisted = persistedBranchRef.current ?? existingBranch

    // Save and finish later with nothing to persist yet: surface a note, do not POST.
    if (partial && !alreadyPersisted && !hasCreateMinimum(values)) {
      setSaveError('Add a branch name and address before saving, or use Save and continue.')
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      // 1. Create the branch (or reuse the one already persisted this session). The
      //    backend requires name + address; the create-minimum was validated for the
      //    continue path, and the finish-later path is gated above. After a successful
      //    create we PIN the branch (ref + state) immediately, so a retry triggered by
      //    a later sub-step failure REUSES it and never creates a duplicate. When the
      //    branch already exists (loaded main branch OR a prior-attempt create), we
      //    PATCH the edited detail fields first so those edits are not silently dropped
      //    by going straight to the hours/amenities/pin/photos sub-steps.
      let branch = alreadyPersisted
      if (!branch) {
        branch = await createBranch(buildCreateBody(values))
        persistedBranchRef.current = branch
        setExistingBranch(branch)
      } else {
        branch = await updateBranch(branch.id, buildUpdateBody(values))
        persistedBranchRef.current = branch
        setExistingBranch(branch)
      }

      // 2. Set hours (single-period; closed days OMIT times via toHoursPayload).
      await setBranchHours(branch.id, toHoursPayload(values.hours))

      // 3. Amenities (full replace).
      await setBranchAmenities(branch.id, values.amenityIds)

      // 4. PIN (only when set to a valid 4-digit value).
      if (/^\d{4}$/.test(values.pin.trim())) {
        await setBranchPin(branch.id, values.pin.trim())
      }

      // 5. Branch photos via the governed edit-request lane (NEW photos only - any
      //    already on the branch are excluded). Best-effort: a photo-lane failure
      //    must not undo the saved branch. Only fires when there are NEW photos.
      const existingPhotoUrls = new Set(existingBranch?.photos?.map((p) => p.url) ?? [])
      const newPhotos = values.photos.filter((url) => !existingPhotoUrls.has(url))
      if (newPhotos.length > 0) {
        try {
          await requestBranchPhotoEdit(branch.id, newPhotos)
          toast({ message: 'Your photos were sent for a quick review.', variant: 'success' })
        } catch {
          toast({
            message: 'Your branch saved, but we could not submit your photos for review. Try the photos again later.',
            variant: 'error',
          })
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['merchantProfile'] }),
        queryClient.invalidateQueries({ queryKey: ['onboardingChecklist'] }),
        queryClient.invalidateQueries({ queryKey: ['branches'] }),
      ])
      router.push(HUB)
    } catch (err) {
      setSaveError(branchErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <BranchStepForm
      initialValues={initialValues}
      amenities={amenities}
      onSaveContinue={(values) => persist(values, false)}
      onSaveLater={(values) => persist(values, true)}
      onBack={goBack}
      saving={saving}
      saveError={saveError}
      businessDescription={profile.data.description ?? null}
      headOffice={headOffice}
    />
  )
}
