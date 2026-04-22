import type { OnboardingState, AuthStatus, ProfileStep } from '@/stores/auth'

const stepToRoute: Record<string, string> = {
  pc1: 'about',
  pc2: 'address',
  pc3: 'interests',
  pc4: 'avatar',
}

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
    if (onboarding.profileCompletion === 'completed' || onboarding.profileCompletion === 'dismissed') {
      if (currentGroup === 'auth') return '/(app)'
    }
    if (onboarding.profileCompletion === 'not_started' || onboarding.profileCompletion === 'in_progress') {
      const isOnProfileCompletion = currentSegment?.startsWith('profile-completion')
      if (currentGroup === 'auth' && !isOnProfileCompletion) {
        const step = onboarding.furthestStep === 'done' ? 'pc1' : onboarding.furthestStep
        const route = stepToRoute[step] ?? 'about'
        return `/(auth)/profile-completion/${route}`
      }
    }
  }
  return null
}
