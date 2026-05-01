import { Redirect } from 'expo-router'
import { useAuthStore } from '@/stores/auth'
import { resolveRedirect } from '@/lib/routing'

export default function Index() {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)

  if (status === 'bootstrapping') return null

  const target = resolveRedirect({
    status,
    user: user
      ? {
          emailVerified: user.emailVerified,
          phoneVerified: user.phoneVerified,
          phone: user.phone || null,
          firstName: user.firstName || null,
          lastName: user.lastName || null,
          dateOfBirth: user.dateOfBirth,
          gender: user.gender,
          postcode: user.postcode,
          onboardingCompletedAt: user.onboardingCompletedAt,
          subscriptionPromptSeenAt: user.subscriptionPromptSeenAt,
        }
      : null,
    currentGroup: 'auth',
    currentSegment: 'welcome',
  })

  return <Redirect href={(target ?? '/(auth)/welcome') as any} />
}
