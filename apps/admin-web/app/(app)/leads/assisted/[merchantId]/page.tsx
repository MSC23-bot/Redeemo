'use client'

/**
 * Assisted onboarding wizard route: /leads/assisted/[merchantId] (C2).
 *
 * Design contract: docs/superpowers/specs/2026-07-10-admin-panel-module-specs/
 * leads-onboarding-spec.md (ASSISTED 9-STEP WIZARD) + plan Phase C/C2.
 *
 * Entered from the Leads & Onboarding hub: create a draft first (the shipped
 * create-draft form), then "Start assisted onboarding" on the new draft; also
 * resumable from the hub's in-progress list. The wizard reuses ONLY the shipped
 * admin on-behalf routes; steps with no admin route (staff, contract) are
 * honestly gated. See AssistedWizard for the full contract.
 *
 * The wizard reads `?step=` (URL-addressable, free movement) via
 * useSearchParams, which requires a Suspense boundary or `next build` fails to
 * prerender this route.
 */
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { AssistedWizard } from '@/features/leads/assisted/AssistedWizard'

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center py-20" data-testid="assisted-route-loading">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

export default function AssistedOnboardingPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AssistedWizard />
    </Suspense>
  )
}
