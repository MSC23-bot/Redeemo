import type { MerchantProfile } from '@/lib/api/profile'
import type { LifecycleState } from '@/components/shell/StatusPill'

export type HomeKind = 'pre-live' | 'live'

// M1 Slice 5 / M2 F1: derive the StatusPill state from GET /merchant/profile, per
// spec §10 + §4.1. Drivers are status (MerchantStatus) + onboardingStep
// (OnboardingStep). `live_new` is collapsed into `live` (no backend signal).
// SUSPENDED is barely reachable (login blocks it; mid-session surfaces as a
// hard-logout) but mapped for safety. F1 SPLITS OUT `rejected` (onboardingStep
// REJECTED) into its own lifecycle state - it was previously collapsed into
// `changes` - so the merchant sees a distinct read-only "not approved" home
// rather than the editable changes hub.
export function deriveStatusPill(profile: Pick<MerchantProfile, 'status' | 'onboardingStep'>): LifecycleState {
  const { status, onboardingStep } = profile
  if (status === 'SUSPENDED') return 'suspended'
  if (onboardingStep === 'REJECTED') return 'rejected'
  if (status === 'ACTIVE') return 'live' // onboardingStep APPROVED / LIVE
  if (onboardingStep === 'SUBMITTED') return 'submitted'
  if (onboardingStep === 'UNDER_REVIEW') return 'in_review'
  if (onboardingStep === 'NEEDS_CHANGES') return 'changes'
  if (status === 'PENDING_APPROVAL') return 'in_review' // pending without a more specific step
  // REGISTERED / BRANCH_ADDED / CONTRACT_SIGNED / RMV_CONFIGURED
  return 'setup'
}

export function homeFor(state: LifecycleState): HomeKind {
  return state === 'live' || state === 'live_new' ? 'live' : 'pre-live'
}
