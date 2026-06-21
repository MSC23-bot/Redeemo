import type { StepState } from '@/components/ui/stepper'

// M2 F1: the client-derived 6-step staircase. Pure function over the merged
// backend reads. The GATING LOGIC lives here (the <Stepper> primitive is purely
// presentational). Mirrors the prototype gating chain verbatim:
//
//   account (always done)
//     -> category (categoryDone = primaryCategoryId != null)
//        -> profile (profileUnlocked = categoryDone; profileDone = description present)
//           -> { branch, vouchers, agreement } ALL share ONE gate:
//                downstreamUnlocked = categoryDone && profileDone
//
// There is NO ordering among branch/vouchers/agreement: once the single
// downstream gate opens, all three are reachable in any order.

// The subset of the merchant profile read (GET /merchant/profile) the hub needs.
// `description` is the profile-complete signal we can read WITHOUT a backend change
// (it mirrors what F3 will require at minimum; spec 4.3 + the conflict ledger F3
// scope). primaryCategoryId is the category-done signal.
export interface OnboardingProfile {
  status: string
  onboardingStep: string
  primaryCategoryId: string | null
  description: string | null
}

export interface OnboardingChecklistInput {
  branch_created: boolean
  contract_signed: boolean
  rmv_configured: boolean
  all_complete: boolean
}

export interface OnboardingInputs {
  profile: OnboardingProfile
  checklist: OnboardingChecklistInput
  /** Count of flagship RMVs in PENDING_APPROVAL/ACTIVE (drives the "1 of 2" partial). */
  rmvActiveCount: number
}

// Each step's identity + the destination route its action navigates to (the
// onboarding sub-route pages land in F2-F6).
export type StepId = 'account' | 'category' | 'profile' | 'branch' | 'vouchers' | 'agreement'

export interface DerivedStep {
  id: StepId
  label: string
  /** Helper line under the label (the prototype "why" copy). */
  description: string
  state: StepState
  done: boolean
  locked: boolean
  /** The current (first-reachable not-done) step. */
  current: boolean
  /** Action button label (absent when locked or done-with-no-edit). */
  action: string
  /** Route the action navigates to (F2-F6 sub-routes). */
  href: string
  /** Shown on locked rows in place of an action. */
  lockedHint: string
  /** "1 of 2" / "2 of 2" / "" for the vouchers step only. */
  progress: string
}

export interface DerivedStaircase {
  steps: DerivedStep[]
  submitEnabled: boolean
  doneCount: number
  totalCount: number
}

const DOWNSTREAM_HINT = 'Available once your category and business profile are done.'
const PROFILE_HINT = 'Available once you have chosen your category.'

const ROUTE: Record<StepId, string> = {
  account: '/account',
  category: '/onboarding/category',
  profile: '/onboarding/profile',
  branch: '/onboarding/branch',
  vouchers: '/onboarding/vouchers',
  agreement: '/onboarding/contract',
}

export function deriveStepStates(input: OnboardingInputs): DerivedStaircase {
  const { profile, checklist, rmvActiveCount } = input

  const categoryDone = profile.primaryCategoryId !== null
  const profileDone = !!profile.description && profile.description.trim().length > 0
  const branchDone = checklist.branch_created
  const vouchersDone = checklist.rmv_configured
  const agreementDone = checklist.contract_signed

  // Gates (load-bearing): profile unlocks after category; branch/vouchers/agreement
  // share ONE gate that opens only when category AND profile are both done.
  const profileUnlocked = categoryDone
  const downstreamUnlocked = categoryDone && profileDone

  const voucherProgress = vouchersDone ? '2 of 2' : rmvActiveCount === 1 ? '1 of 2' : ''

  // Build each step's done/locked + copy, BEFORE deciding which is current.
  const raw: Array<Omit<DerivedStep, 'state' | 'current'>> = [
    {
      id: 'account',
      label: 'Create your account',
      description: 'Your login is set and your email is verified.',
      done: true,
      locked: false,
      action: '',
      href: ROUTE.account,
      lockedHint: '',
      progress: '',
    },
    {
      id: 'category',
      label: 'Choose your category',
      description: categoryDone
        ? 'Saved. This shapes the rest of your setup, including your flagship vouchers.'
        : 'Pick this first. It shapes the rest of your setup, including your flagship vouchers.',
      done: categoryDone,
      locked: false,
      action: categoryDone ? 'Edit category' : 'Choose a category',
      href: ROUTE.category,
      lockedHint: '',
      progress: '',
    },
    {
      id: 'profile',
      label: 'Complete your business profile',
      description: 'Registered name, company number, VAT, public description, logo, and public contact.',
      done: profileDone,
      locked: !profileDone && !profileUnlocked,
      action: profileDone ? 'Edit profile' : 'Open business profile',
      href: ROUTE.profile,
      lockedHint: PROFILE_HINT,
      progress: '',
    },
    {
      id: 'branch',
      label: 'Add your main branch',
      description: 'The branch customers will see, with address and opening hours.',
      done: branchDone,
      locked: !branchDone && !downstreamUnlocked,
      action: branchDone ? 'Edit branch' : 'Add a branch',
      href: ROUTE.branch,
      lockedHint: DOWNSTREAM_HINT,
      progress: '',
    },
    {
      id: 'vouchers',
      label: 'Set up your 2 flagship vouchers',
      description: vouchersDone
        ? 'Both flagship vouchers are saved and ready.'
        : voucherProgress === '1 of 2'
          ? 'Voucher 1 of 2 saved. One to go.'
          : 'Strong introductory vouchers bring people through the door.',
      done: vouchersDone,
      locked: !vouchersDone && !downstreamUnlocked,
      action: vouchersDone ? '' : voucherProgress === '1 of 2' ? 'Build the second voucher' : 'Set up vouchers',
      href: ROUTE.vouchers,
      lockedHint: DOWNSTREAM_HINT,
      progress: voucherProgress,
    },
    {
      id: 'agreement',
      label: 'Sign the merchant agreement',
      description: agreementDone ? 'Signed and dated. Owner only.' : 'A quick read and a tick. Owner only.',
      done: agreementDone,
      locked: !agreementDone && !downstreamUnlocked,
      action: agreementDone ? 'View agreement' : 'Review and sign',
      href: ROUTE.agreement,
      // Shares the SAME downstream gate as branch/vouchers, so it carries the SAME
      // hint. (The empty string here was an oversight that rendered an empty pill.)
      lockedHint: DOWNSTREAM_HINT,
      progress: '',
    },
  ]

  // The current step is the FIRST item that is neither done nor locked. Locked
  // steps never get the highlighted "current" treatment.
  const firstReachable = raw.findIndex((s) => !s.done && !s.locked)

  const steps: DerivedStep[] = raw.map((s, i) => {
    const current = i === firstReachable
    let state: StepState
    if (s.done) state = 'done'
    else if (s.locked) state = 'locked'
    else if (current) state = 'current'
    else state = 'todo'
    // Locked steps expose no action.
    const action = s.locked ? '' : s.action
    return { ...s, current, state, action }
  })

  const doneCount = raw.filter((s) => s.done).length

  // Prototype-aligned submit gate: ALL 6 staircase steps must be `done` (this
  // includes category + profile, not just the backend 3-gate). This is STRICTER
  // than and IMPLIES checklist.all_complete (branch + contract + rmv are 3 of the
  // 6), so `POST /onboarding/submit` stays a correct server backstop and no
  // legitimate submit is ever blocked. It also makes the "N of 6" header, the
  // footer copy, and the Submit button AGREE. Do NOT revert to
  // checklist.all_complete: that re-opens the "5 of 6 yet Submit enabled" incoherence.
  const submitEnabled = steps.every((s) => s.state === 'done')

  return {
    steps,
    submitEnabled,
    doneCount,
    totalCount: raw.length,
  }
}
