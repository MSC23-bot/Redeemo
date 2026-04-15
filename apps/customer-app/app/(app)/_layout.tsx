import React from 'react'
import { View } from 'react-native'
import { Redirect, Tabs, useSegments } from 'expo-router'
import { useAuthStore } from '@/stores/auth'
import { resolveRedirect } from '@/lib/routing'
import { color } from '@/design-system'

function DisabledTabButton({ label }: { label: string }) {
  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: true }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }}
    />
  )
}

export default function AppLayout() {
  const segments = useSegments() as string[]
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const onboarding = useAuthStore((s) => s.onboarding)
  const segment = segments.slice(1).join('/')
  const target = resolveRedirect({
    status,
    onboarding,
    currentGroup: 'app',
    currentSegment: segment,
    user: user ? { emailVerified: user.emailVerified, phoneVerified: user.phoneVerified } : null,
  })
  if (target) return <Redirect href={target as Parameters<typeof Redirect>[0]['href']} />
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: color.brandRose,
          tabBarInactiveTintColor: color.text.secondary,
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="discover" options={{ title: 'Discover', href: null }} />
        <Tabs.Screen name="savings" options={{ title: 'Savings', href: null }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', href: null }} />
      </Tabs>
      <View style={{ flexDirection: 'row', backgroundColor: color.surface.page, borderTopWidth: 1, borderTopColor: color.border.subtle }}>
        <DisabledTabButton label="Discover" />
        <DisabledTabButton label="Savings" />
        <DisabledTabButton label="Profile" />
      </View>
    </View>
  )
}
