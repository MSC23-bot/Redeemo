import type { AuthStatus } from '@/stores/auth'

// Routing-relevant subset of the customer profile.
// Server is source of truth; local onboarding flags are no longer consulted here.
type MinUser = {
  emailVerified: boolean
  phoneVerified: boolean
  phone: string | null
  firstName: string | null
  lastName: string | null
  dateOfBirth: string | null
  gender: string | null
  postcode: string | null
  onboardingCompletedAt: string | null
  subscriptionPromptSeenAt: string | null
}

function nonEmpty(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

// PC1 = About (firstName, lastName, dateOfBirth, gender). PC2 = Address (postcode).
// PC3 (interests) and PC4 (avatar) are optional later nudges, not part of onboarding.
export function firstIncompleteRequiredStep(
  user: Pick<MinUser, 'firstName' | 'lastName' | 'dateOfBirth' | 'gender' | 'postcode'>,
): 'about' | 'address' | null {
  const pc1Complete =
    nonEmpty(user.firstName) &&
    nonEmpty(user.lastName) &&
    nonEmpty(user.dateOfBirth) &&
    nonEmpty(user.gender)
  if (!pc1Complete) return 'about'
  if (!nonEmpty(user.postcode)) return 'address'
  return null
}

export function resolveRedirect(input: {
  status: AuthStatus
  user: MinUser | null
  currentGroup: 'auth' | 'app'
  currentSegment?: string
}): string | null {
  const { status, user, currentGroup, currentSegment } = input

  // Password reset is accessed from email links — do not redirect, even unauthed.
  if (currentSegment === 'reset-password') return null
  if (currentSegment === 'forgot-password') return null

  if (status === 'unauthenticated') {
    if (currentGroup === 'app') return '/(auth)/welcome'
    // Public screens are fine unauthenticated; protected auth screens (verify, profile-completion, etc.) redirect to welcome
    const publicSegments = ['welcome', 'login', 'register', 'forgot-password', 'reset-password']
    if (currentSegment && !publicSegments.includes(currentSegment)) return '/(auth)/welcome'
    return null
  }
  if (status !== 'authed' || !user) return null

  // 1. Email verification (hard block)
  if (!user.emailVerified) {
    return currentSegment === 'verify-email' ? null : '/(auth)/verify-email'
  }

  // 2. Phone verification (hard block — includes entering a number if not yet set)
  if (!nonEmpty(user.phone) || !user.phoneVerified) {
    return currentSegment === 'verify-phone' ? null : '/(auth)/verify-phone'
  }

  // 3. Required profile fields (hard block). Cannot be skipped.
  const incompleteStep = firstIncompleteRequiredStep(user)
  if (incompleteStep) {
    // Allow any screen within the wizard — user may be navigating backwards to edit.
    // Only force-enter the wizard when the user is somewhere outside it entirely.
    if (currentSegment?.startsWith('profile-completion/')) return null
    return `/(auth)/profile-completion/${incompleteStep}`
  }

  // 4. Onboarding-success screen (one-shot, before subscription prompt)
  if (!user.onboardingCompletedAt) {
    // Allow profile-completion screens so optional steps (PC3 interests, PC4 avatar)
    // are not bypassed when required fields become complete mid-wizard.
    if (currentSegment?.startsWith('profile-completion/')) return null
    return currentSegment === 'onboarding-success' ? null : '/(auth)/onboarding-success'
  }

  // 5. Subscription prompt (soft, one-shot)
  if (!user.subscriptionPromptSeenAt) {
    return currentSegment === 'subscription-prompt' ? null : '/(auth)/subscription-prompt'
  }

  // 6. Fully onboarded — kick out of (auth) group
  if (currentGroup === 'auth') return '/(app)'
  return null
}
