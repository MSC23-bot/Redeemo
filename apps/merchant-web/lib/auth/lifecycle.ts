import type { MerchantProfile } from '@/lib/api/profile'
import type { LifecycleState } from '@/components/shell/StatusPill'

export type HomeKind = 'pre-live' | 'live'

// M1 Slice 5: derive the StatusPill state from GET /merchant/profile, per spec §10.
// Drivers are status (MerchantStatus) + onboardingStep (OnboardingStep). `live_new`
// is collapsed into `live` for M1 (no backend signal). SUSPENDED is barely reachable
// (login blocks it; mid-session surfaces as a hard-logout) but mapped for safety.
export function deriveStatusPill(profile: Pick<MerchantProfile, 'status' | 'onboardingStep'>): LifecycleState {
  const { status, onboardingStep } = profile
  if (status === 'SUSPENDED') return 'suspended'
  if (status === 'ACTIVE') return 'live' // onboardingStep APPROVED / LIVE
  if (onboardingStep === 'SUBMITTED') return 'submitted'
  if (onboardingStep === 'UNDER_REVIEW') return 'in_review'
  if (onboardingStep === 'NEEDS_CHANGES' || onboardingStep === 'REJECTED') return 'changes'
  if (status === 'PENDING_APPROVAL') return 'in_review' // pending without a more specific step
  // REGISTERED / BRANCH_ADDED / CONTRACT_SIGNED / RMV_CONFIGURED
  return 'setup'
}

export function homeFor(state: LifecycleState): HomeKind {
  return state === 'live' || state === 'live_new' ? 'live' : 'pre-live'
}
