import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Redirect, Tabs, useSegments } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Home, Map, Heart, PiggyBank, User } from 'lucide-react-native'
import { useAuthStore } from '@/stores/auth'
import { resolveRedirect } from '@/lib/routing'
import { color, spacing, layer } from '@/design-system'

const TAB_ICONS = {
  index: Home,
  map: Map,
  favourite: Heart,
  savings: PiggyBank,
  profile: User,
} as const

function TabBarIcon({ route, focused }: { route: keyof typeof TAB_ICONS; focused: boolean }) {
  const Icon = TAB_ICONS[route]
  return (
    <View style={styles.iconWrapper}>
      {focused && <View style={styles.activeDot} />}
      <Icon size={22} color="#FFFFFF" style={{ opacity: focused ? 1 : 0.55 }} />
    </View>
  )
}

export default function AppLayout() {
  const segments = useSegments() as string[]
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const segment = segments.slice(1).join('/')
  const target = resolveRedirect({
    status,
    currentGroup: 'app',
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

  const isAuthenticated = status === 'authed'
  const hiddenHref = isAuthenticated ? ({} as object) : { href: null as null }

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
            colors={[color.brandRose, '#D10A03', color.brandCoral]}
            locations={[0, 0.4, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ),
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.55)',
        tabBarLabelStyle: { fontSize: 9.5, fontFamily: 'Lato-SemiBold', marginTop: -2 },
        tabBarItemStyle: { paddingTop: spacing[2], paddingBottom: 28 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabBarIcon route="index" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ focused }) => <TabBarIcon route="map" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="favourite"
        options={{
          title: 'Favourite',
          ...hiddenHref,
          tabBarIcon: ({ focused }) => <TabBarIcon route="favourite" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          title: 'Savings',
          ...hiddenHref,
          tabBarIcon: ({ focused }) => <TabBarIcon route="savings" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          ...hiddenHref,
          tabBarIcon: ({ focused }) => <TabBarIcon route="profile" focused={focused} />,
        }}
      />
      {/* Hide route files that aren't tabs */}
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="categories" options={{ href: null }} />
      <Tabs.Screen name="category/[id]" options={{ href: null }} />
      <Tabs.Screen name="discover" options={{ href: null }} />
      <Tabs.Screen name="merchant/[id]" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="voucher/[id]" options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  iconWrapper: { alignItems: 'center', gap: 4 },
  activeDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' },
})
