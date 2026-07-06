import type { LifecycleState } from '@/components/shell/StatusPill'

export type VerificationTone = 'success' | 'warning' | 'danger'

export interface VerificationBadge {
  label: string
  tone: VerificationTone
  bg: string
  fg: string
}

// Business Profile M2: derive the hero verification badge + the Compliance card's
// verification block from the SAME lifecycle source the sidebar StatusPill already
// uses (deriveStatusPill). Colour values are the exact hex pairs StatusPill defines
// for 'live' (success green) so the two surfaces never visually disagree; 'setup' /
// 'submitted' / 'in_review' / 'changes' all collapse to the single amber
// "Verification in progress" state per the locked screenshot copy (owner has not
// asked for a distinct in-app treatment per sub-state here); 'suspended' /
// 'rejected' get a red not-verified treatment (not in the reference screenshots,
// added defensively so the hero never renders a false "in progress" claim for a
// merchant that is actually suspended or rejected).
export function resolveVerificationBadge(state: LifecycleState): VerificationBadge {
  if (state === 'live' || state === 'live_new') {
    return { label: 'Verified by Redeemo', tone: 'success', bg: '#E9F7EF', fg: '#0F7A3E' }
  }
  if (state === 'suspended') {
    return { label: 'Suspended', tone: 'danger', bg: '#FEECEC', fg: '#B91C1C' }
  }
  if (state === 'rejected') {
    return { label: 'Not approved', tone: 'danger', bg: '#FEECEC', fg: '#B91C1C' }
  }
  return { label: 'Verification in progress', tone: 'warning', bg: '#FEF6EC', fg: '#B45309' }
}
