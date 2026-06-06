import React from 'react'
import { Redirect, Tabs, useSegments } from 'expo-router'
import { useAuthStore } from '@/stores/auth'
import { resolveRedirect } from '@/lib/routing'
import { LocationPermissionProvider } from '@/lib/location/LocationPermissionProvider'
import { BrandedTabShelf } from '@/features/navigation/BrandedTabShelf'
import { BrandedTabButton } from '@/features/navigation/BrandedTabButton'

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

  return (
    // LocationPermissionProvider mounts the branded pre-permission
    // explainer + recovery sheets ONCE at the (app) tree root. Every
    // screen that calls useUserLocation().request() with no opts
    // inherits them via context — no surface needs to wire its own
    // Modal. Reusable by Task 7's Saved Area screen.
    <LocationPermissionProvider>
    <Tabs
      screenOptions={{
        headerShown: false,
        // Calm branded SHELF nav (Option B, 2026-06-06). NON-floating, full-width,
        // SAME 80px footprint + bottom positioning as before — only the
        // presentation changes: a warm off-white shelf (<BrandedTabShelf>)
        // replaces the red gradient. Each visible tab renders via a custom
        // <BrandedTabButton> (icon + label + brand active state) — see that
        // component for WHY the default tab item can't show the label here.
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
        tabBarBackground: () => <BrandedTabShelf />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarButton: (props) => <BrandedTabButton {...props} name="home" label="Home" />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarButton: (props) => <BrandedTabButton {...props} name="map" label="Map" />,
        }}
      />
      <Tabs.Screen
        name="favourites"
        options={{
          title: 'Favourites',
          tabBarButton: (props) => <BrandedTabButton {...props} name="favourites" label="Favourites" />,
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          title: 'Savings',
          // Owner-locked: wallet metaphor (cleaner than the piggy bank); the
          // bespoke Redeemo wallet glyph lives in icons/navIconPaths `savings`.
          tabBarButton: (props) => <BrandedTabButton {...props} name="savings" label="Savings" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarButton: (props) => <BrandedTabButton {...props} name="profile" label="Profile" />,
        }}
      />
      {/* Hide non-tab routes from auto-discovery so they don't appear as default
          tabs. Each rebaselined surface (voucher, favourites) will land its
          own visible <Tabs.Screen> entry as part of its rebaseline PR.
          Merchant Profile is a per-merchant detail route — `tabBarStyle:
          display:'none'` hides the bottom tab bar while it's open so the
          screen owns the full viewport. */}
      <Tabs.Screen name="search"        options={{ href: null }} />
      <Tabs.Screen name="categories"    options={{ href: null }} />
      <Tabs.Screen name="category/[id]" options={{ href: null }} />
      <Tabs.Screen name="merchant/[id]"   options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="voucher/[id]"    options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="redemption/[id]" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="saved-area"      options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </Tabs>
    </LocationPermissionProvider>
  )
}
