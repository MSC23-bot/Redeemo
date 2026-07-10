/**
 * leadsFormat : pure display-derivation helpers for the Leads & Onboarding hub
 * (C1). No JSX, kept separate from the components so every label/format
 * mapping is unit-testable without rendering (mirrors features/queue/rowHelpers.ts).
 */

// Friendly labels for the OnboardingStep enum (prisma/schema.prisma). The
// merchant summary's `onboardingStep` field is a drift-resilient `z.string()`
// (see lib/api/merchants.ts), so this map falls back to the raw value for any
// step it does not yet know about, rather than throwing.
const ONBOARDING_STEP_LABELS: Record<string, string> = {
  REGISTERED: 'Registered',
  BRANCH_ADDED: 'Branch added',
  CONTRACT_SIGNED: 'Contract signed',
  RMV_CONFIGURED: 'Vouchers configured',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  NEEDS_CHANGES: 'Changes requested',
  REJECTED: 'Rejected',
  APPROVED: 'Approved',
  LIVE: 'Live',
  SUSPENDED: 'Suspended',
}

export function onboardingStepLabel(step: string): string {
  return ONBOARDING_STEP_LABELS[step] ?? step
}

/** "10 Jul 2026" : matches the format MerchantsTable already uses for Created. */
export function formatCreatedDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
