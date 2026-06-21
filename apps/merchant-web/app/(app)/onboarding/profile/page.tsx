'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BusinessProfileForm, type ProfileFormValues } from '@/components/onboarding/profile/BusinessProfileForm'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'
import { updateMerchantProfile, type MerchantProfileUpdateBody } from '@/lib/api/profile'
import { ApiError } from '@/lib/api/client'

// M2 F3 (D4): the Tier-1 business-profile onboarding step. Prefills the form from the
// merchant profile (the lifecycle source), then on save PATCHes the Tier-1 fields to
// /merchant/profile, invalidates the profile + onboarding reads, and routes back to
// the F1 staircase hub. The description write is the F1 profile-done signal.
//
// Two save paths:
//   - "Save and continue": the form validates required fields (description +
//     businessName) before firing; PATCHes the full Tier-1 set; routes to the hub.
//   - "Save and finish later": PATCHes whatever is filled (partial), keeps progress,
//     routes to the hub. No required-field gate.
// Sensitive fields write directly in the draft window (B1). Defensively map the
// SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST code (should not occur in onboarding).

const HUB = '/'

// Defensive backend-error -> user-message map. The backend already returns a
// human-readable message; mapping known codes keeps copy consistent.
function profileErrorMessage(err: unknown): string {
  const code = err instanceof ApiError ? err.code : undefined
  switch (code) {
    case 'SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST':
      return 'These details can only be changed directly while your application is in draft. Submit an edit request instead.'
    case 'MERCHANT_NOT_FOUND':
      return 'We could not find your business. Please reload and try again.'
    default:
      return 'We could not save your profile just now. Please try again.'
  }
}

// Map the form values to the PATCH body. "Save and continue" sends the full Tier-1
// set; "Save and finish later" sends only the filled keys (a true partial save). VAT
// is folded: registered=No clears vatNumber (sent as null), Yes sends the trimmed
// number. Empty optional strings are sent as null so a clear sticks.
function buildBody(values: ProfileFormValues, partial: boolean): MerchantProfileUpdateBody {
  const body: MerchantProfileUpdateBody = {}
  const set = (cond: boolean, apply: () => void) => {
    if (!partial || cond) apply()
  }

  set(values.businessName.trim().length > 0, () => {
    body.businessName = values.businessName.trim()
  })
  set(values.tradingName.trim().length > 0, () => {
    body.tradingName = values.tradingName.trim() || null
  })
  set(values.description.trim().length > 0, () => {
    body.description = values.description.trim()
  })
  set(values.websiteUrl.trim().length > 0, () => {
    body.websiteUrl = values.websiteUrl.trim() || null
  })
  set(values.companyNumber.trim().length > 0, () => {
    body.companyNumber = values.companyNumber.trim() || null
  })
  set(values.logoUrl.length > 0, () => {
    if (values.logoUrl) body.logoUrl = values.logoUrl
  })
  set(values.bannerUrl.length > 0, () => {
    if (values.bannerUrl) body.bannerUrl = values.bannerUrl
  })
  // VAT: only meaningful when registered. Registered=Yes sends the number; No sends
  // null to clear any stale value. On a partial save we only touch VAT when the user
  // has engaged it (registered=Yes with a number, OR a non-empty number present).
  if (values.vatRegistered) {
    set(values.vatNumber.trim().length > 0, () => {
      body.vatNumber = values.vatNumber.trim() || null
    })
  } else {
    set(values.vatNumber.trim().length > 0, () => {
      body.vatNumber = null
    })
  }

  return body
}

export default function ProfilePage() {
  const session = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const profile = useMerchantProfile(session.isAuthenticated)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function goBack() {
    router.push(HUB)
  }

  if (profile.isError) {
    return (
      <div className="space-y-6" role="alert">
        <h1 className="font-display text-2xl font-semibold text-foreground">Something went wrong</h1>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">We could not load your profile</CardTitle>
            <CardDescription>
              There was a problem reaching Redeemo. Check your connection and try again.
            </CardDescription>
          </CardHeader>
        </Card>
        <Button onClick={() => profile.refetch?.()}>Try again</Button>
      </div>
    )
  }

  if (profile.isLoading || !profile.data) {
    return (
      <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
        Loading your profile...
      </div>
    )
  }

  // Prefill from the lifecycle source. businessName always present; the rest nullable.
  const initialValues: ProfileFormValues = {
    businessName: profile.data.businessName ?? '',
    tradingName: profile.data.tradingName ?? '',
    description: profile.data.description ?? '',
    websiteUrl: profile.data.websiteUrl ?? '',
    companyNumber: profile.data.companyNumber ?? '',
    vatRegistered: !!profile.data.vatNumber,
    vatNumber: profile.data.vatNumber ?? '',
    logoUrl: profile.data.logoUrl ?? '',
    bannerUrl: profile.data.bannerUrl ?? '',
  }

  async function persist(values: ProfileFormValues, partial: boolean) {
    setSaving(true)
    setSaveError(null)
    try {
      await updateMerchantProfile(buildBody(values, partial))
      // Refetch the lifecycle source + onboarding reads so the hub re-derives the
      // profile step as done (description is the profile-done signal).
      await Promise.all([
        profile.refetch?.(),
        queryClient.invalidateQueries({ queryKey: ['merchantProfile'] }),
        queryClient.invalidateQueries({ queryKey: ['onboardingChecklist'] }),
      ])
      router.push(HUB)
    } catch (err) {
      setSaveError(profileErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <BusinessProfileForm
      initialValues={initialValues}
      onSaveContinue={(values) => persist(values, false)}
      onSaveLater={(values) => persist(values, true)}
      onBack={goBack}
      saving={saving}
      saveError={saveError}
    />
  )
}
