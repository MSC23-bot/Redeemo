'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingStatus, SkeletonKpiRow, SkeletonChartBlock } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { StaircaseHub } from '@/components/onboarding/StaircaseHub'
import { LifecycleHome } from '@/components/onboarding/LifecycleHome'
import HomeDashboard from '@/components/home/HomeDashboard'
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
  const { toast } = useToast()
  const profile = useMerchantProfile(session.isAuthenticated)

  // The onboarding reads. Fetched once the profile has loaded; they drive the hub
  // + the changes banner. Kept always-enabled-when-authed so a return to setup
  // after a NEEDS_CHANGES round-trip re-derives correctly. The data is only
  // consumed by the hub/changes states; the read-only homes ignore it.
  const enabled = session.isAuthenticated && !!profile.data
  // WF8: getOnboardingChecklist/getOnboardingStatus already catch the expected
  // INSUFFICIENT_PERMISSIONS (403) case and resolve to null (see lib/api/onboarding.ts)
  // rather than throwing, so this query never errors for a non-owner viewer -
  // `retry: false` is belt-and-suspenders so a genuinely non-retryable auth outcome
  // never triggers react-query's default retry/backoff regardless.
  const checklist = useQuery({ queryKey: ['onboardingChecklist'], queryFn: getOnboardingChecklist, enabled, staleTime: 30_000, retry: false })
  const status = useQuery({ queryKey: ['onboardingStatus'], queryFn: getOnboardingStatus, enabled, staleTime: 30_000, retry: false })
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
      <LoadingStatus label="Loading your account...">
        <div className="flex flex-col gap-6">
          <SkeletonKpiRow />
          <SkeletonChartBlock />
        </div>
      </LoadingStatus>
    )
  }

  const state = deriveStatusPill(profile.data)
  const businessName = profile.data.businessName
  const statusData = status.data ?? null

  // Read-only pre-live homes (submitted / in_review / suspended / rejected) stay on the
  // existing LifecycleHome, untouched.
  if (state === 'submitted' || state === 'in_review' || state === 'suspended' || state === 'rejected') {
    return <LifecycleHome state={state} businessName={businessName} status={statusData} />
  }

  // LIVE (live / live_new): the Home dashboard. It gates the full insights dashboard on
  // canViewInsights (OWNER / BRANCH_MANAGER) and renders a lean live home for STAFF.
  if (state === 'live' || state === 'live_new') {
    return <HomeDashboard profile={profile.data} />
  }

  // setup / changes: a non-owner (BRANCH_MANAGER / STAFF) is denied BOTH onboarding
  // reads with INSUFFICIENT_PERMISSIONS (WF8) - getOnboardingChecklist/
  // getOnboardingStatus resolve that to `null` rather than throwing (see
  // lib/api/onboarding.ts), which is distinct from `undefined` (still loading /
  // disabled). The staircase hub needs REAL step-completion data - a non-owner must
  // never be shown a false "0 of N complete" for steps the owner may have already
  // finished, and cannot act on Submit anyway - so it activates ONLY once a genuine
  // read has landed; a denied non-owner instead sees a calm read-only notice here.
  // Untouched for the OWNER path: an owner's reads never resolve to null.
  const onboardingReadsDeniedForViewer = checklist.data === null && status.data === null
  if (onboardingReadsDeniedForViewer) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold text-foreground">Welcome back, {businessName}</h1>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Your business is still being set up</CardTitle>
            <CardDescription>
              The business owner is completing onboarding. Check back once your business is live, or ask the
              owner for an update.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
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
      // Make the state change unmistakable before the page flips to the submitted
      // home: the refetches below can take a moment, and a silent transition left
      // the merchant unsure whether the click registered.
      toast({ message: 'Application submitted for review.', variant: 'success' })
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
