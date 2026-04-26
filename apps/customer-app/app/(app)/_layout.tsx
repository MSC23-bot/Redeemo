import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Redirect, Tabs, useSegments } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { useAuthStore } from '@/stores/auth'
import { resolveRedirect } from '@/lib/routing'
import { color, spacing } from '@/design-system'
import { Home } from '@/design-system/icons'

function HomeIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.iconWrapper}>
      {focused && <View style={styles.activeDot} />}
      <Home size={22} color={color.onBrand} style={{ opacity: focused ? 1 : 0.55 }} />
    </View>
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
    user: user ? {
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      onboardingCompletedAt: user.onboardingCompletedAt,
      subscriptionPromptSeenAt: user.subscriptionPromptSeenAt,
    } : null,
  })
  if (target) return <Redirect href={target as Parameters<typeof Redirect>[0]['href']} />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 80,
          borderTopWidth: 0,
          elevation: 0,
          backgroundColor: 'transparent',
        },
        tabBarBackground: () => (
          <LinearGradient
            colors={color.navGradient}
            locations={[0, 0.4, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ),
        tabBarActiveTintColor: color.onBrand,
        tabBarItemStyle: { paddingTop: spacing[2], paddingBottom: spacing[7] },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <HomeIcon focused={focused} />,
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  iconWrapper: { alignItems: 'center', justifyContent: 'center' },
  activeDot: {
    position: 'absolute',
    top: -8,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.onBrand,
  },
})
