import React from 'react'
import { Redirect, Stack, useSegments } from 'expo-router'
import { useAuthStore } from '@/stores/auth'
import { resolveRedirect } from '@/lib/routing'

export default function AuthLayout() {
  const segments = useSegments() as string[]
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const onboarding = useAuthStore((s) => s.onboarding)
  const segment = segments.slice(1).join('/')
  const target = resolveRedirect({
    status,
    onboarding,
    currentGroup: 'auth',
    currentSegment: segment,
    user: user ? {
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      onboardingCompletedAt: user.onboardingCompletedAt,
      subscriptionPromptSeenAt: user.subscriptionPromptSeenAt,
    } : null,
  })
  if (target) return <Redirect href={target as Parameters<typeof Redirect>[0]['href']} />
  return <Stack screenOptions={{ headerShown: false }} />
}
