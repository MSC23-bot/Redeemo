import React from 'react'
import { Redirect, Stack, useSegments } from 'expo-router'
import { useAuthStore } from '@/stores/auth'
import { resolveRedirect } from '@/lib/routing'

export default function AuthLayout() {
  const segments = useSegments() as string[]
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const segment = segments.slice(1).join('/')
  const target = resolveRedirect({
    status,
    currentGroup: 'auth',
    currentSegment: segment,
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
  })
  if (target) return <Redirect href={target as Parameters<typeof Redirect>[0]['href']} />
  // iOS swipe-from-left back gesture enabled globally. `fullScreenGestureEnabled`
  // lets the swipe start from anywhere on screen, not just the ~20px edge.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    />
  )
}
