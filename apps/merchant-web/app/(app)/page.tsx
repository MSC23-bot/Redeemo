'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StaircaseHub } from '@/components/onboarding/StaircaseHub'
import { LifecycleHome } from '@/components/onboarding/LifecycleHome'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'
import { deriveStatusPill } from '@/lib/auth/lifecycle'
import { deriveStepStates } from '@/lib/onboarding/stepState'
import {
  getOnboardingChecklist,
  getOnboardingStatus,
  countActiveRmvVouchers,
  submitOnboarding,
} from '@/lib/api/onboarding'
import { ApiError } from '@/lib/api/client'

// M2 F1: the merchant portal home. Replaces the M1 placeholder. CLIENT-DERIVES the
// guided onboarding staircase hub (setup / changes) + the read-only / live
// lifecycle homes from the merged backend reads (profile + checklist + status +
// rmv count). The granular OnboardingStep enum is never trusted for step state
// (spec 4.1) - step done-ness comes from the actual saved data.

export default function HomePage() {
  const session = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const profile = useMerchantProfile(session.isAuthenticated)

  // The onboarding reads. Fetched once the profile has loaded; they drive the hub
  // + the changes banner. Kept always-enabled-when-authed so a return to setup
  // after a NEEDS_CHANGES round-trip re-derives correctly. The data is only
  // consumed by the hub/changes states; the read-only homes ignore it.
  const enabled = session.isAuthenticated && !!profile.data
  const checklist = useQuery({ queryKey: ['onboardingChecklist'], queryFn: getOnboardingChecklist, enabled, staleTime: 30_000 })
  const status = useQuery({ queryKey: ['onboardingStatus'], queryFn: getOnboardingStatus, enabled, staleTime: 30_000 })
  const rmvCount = useQuery({ queryKey: ['rmvActiveCount'], queryFn: countActiveRmvVouchers, enabled, staleTime: 30_000 })

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  if (profile.isError) {
    return (
      <div className="space-y-6" role="alert">
        <h1 className="font-display text-2xl font-semibold text-foreground">Something went wrong</h1>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">We could not load your account</CardTitle>
            <CardDescription>
              There was a problem reaching Redeemo. Check your connection and try again.
            </CardDescription>
          </CardHeader>
        </Card>
        <Button onClick={() => profile.refetch()}>Try again</Button>
      </div>
    )
  }

  if (profile.isLoading || !profile.data) {
    return (
      <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
        Loading your account...
      </div>
    )
  }

  const state = deriveStatusPill(profile.data)
  const businessName = profile.data.businessName
  const statusData = status.data ?? null

  // Read-only + live homes (submitted / in_review / suspended / rejected / live).
  if (state === 'submitted' || state === 'in_review' || state === 'suspended' || state === 'rejected' || state === 'live' || state === 'live_new') {
    return <LifecycleHome state={state} businessName={businessName} status={statusData} />
  }

  // setup / changes -> the staircase hub. Derive from the merged reads.
  const staircase = deriveStepStates({
    profile: {
      status: profile.data.status,
      onboardingStep: profile.data.onboardingStep,
      primaryCategoryId: profile.data.primaryCategoryId ?? null,
      description: profile.data.description ?? null,
    },
    checklist: checklist.data ?? { branch_created: false, contract_signed: false, rmv_configured: false, all_complete: false },
    rmvActiveCount: rmvCount.data ?? 0,
  })

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitOnboarding()
      // Refetch the lifecycle source + onboarding reads so the page flips to the
      // submitted home.
      await Promise.all([
        profile.refetch(),
        queryClient.invalidateQueries({ queryKey: ['onboardingChecklist'] }),
        queryClient.invalidateQueries({ queryKey: ['onboardingStatus'] }),
      ])
    } catch (err) {
      // Defensive: the backend re-checks the gates and may throw
      // ONBOARDING_GATES_INCOMPLETE even though the client thought all were done.
      const code = err instanceof ApiError ? err.code : undefined
      setSubmitError(
        code === 'ONBOARDING_GATES_INCOMPLETE'
          ? 'Some steps are still incomplete. Please finish every step and try again.'
          : 'We could not submit your business just now. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <StaircaseHub
      businessName={businessName}
      staircase={staircase}
      state={state === 'changes' ? 'changes' : 'setup'}
      status={statusData}
      onNavigate={(href) => router.push(href)}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitError={submitError}
    />
  )
}
