import type { OnboardingState, AuthStatus } from '@/stores/auth'

type MinUser = { emailVerified: boolean; phoneVerified: boolean }

export function resolveRedirect(input: {
  status: AuthStatus
  onboarding: OnboardingState | null
  user: MinUser | null
  currentGroup: 'auth' | 'app'
  currentSegment?: string
}): string | null {
  const { status, onboarding, user, currentGroup, currentSegment } = input
  if (currentSegment === 'reset-password') return null
  if (status === 'unauthenticated') {
    return currentGroup === 'app' ? '/(auth)/welcome' : null
  }
  if (status === 'authed' && user && onboarding) {
    if (!user.emailVerified) return currentSegment === 'verify-email' ? null : '/(auth)/verify-email'
    if (!user.phoneVerified) return currentSegment === 'verify-phone' ? null : '/(auth)/verify-phone'
    if (onboarding.profileCompletion === 'in_progress') {
      const step = onboarding.furthestStep === 'done' ? 'pc1' : onboarding.furthestStep
      return currentSegment?.endsWith(step) ? null : `/(auth)/profile-completion/${step}`
    }
    if (onboarding.profileCompletion === 'completed' || onboarding.profileCompletion === 'dismissed') {
      if (currentGroup === 'auth') return '/(app)/'
    }
  }
  return null
}
