import { Redirect } from 'expo-router'
import { useAuthStore } from '@/stores/auth'
import { resolveRedirect } from '@/lib/routing'

export default function Index() {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const onboarding = useAuthStore((s) => s.onboarding)

  if (status === 'bootstrapping') return null

  const target = resolveRedirect({
    status,
    onboarding,
    user: user ? { emailVerified: user.emailVerified, phoneVerified: user.phoneVerified } : null,
    currentGroup: 'auth',
    currentSegment: 'welcome',
  })

  return <Redirect href={(target ?? '/(auth)/welcome') as any} />
}
