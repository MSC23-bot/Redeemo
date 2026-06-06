import React from 'react'
import { Redirect, Tabs, useSegments } from 'expo-router'
import { useAuthStore } from '@/stores/auth'
import { resolveRedirect } from '@/lib/routing'
import { color, spacing } from '@/design-system'
import { Home, Map, User, Wallet, Heart } from '@/design-system/icons'
import { LocationPermissionProvider } from '@/lib/location/LocationPermissionProvider'
import { BrandedTabShelf } from '@/features/navigation/BrandedTabShelf'
import { BrandedTabIcon } from '@/features/navigation/BrandedTabIcon'
import { NAV_LABEL_FONT_SIZE, NAV_LABEL_TRACKING } from '@/features/navigation/navTokens'

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
        // replaces the red gradient, brand colour lives ONLY on the active tab.
        // Routes/order/hidden/detail-hide are untouched.
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
        // Active = brand-red, inactive = warm-ink — applied to BOTH the label
        // (here) and the icon (BrandedTabIcon), so they stay consistent.
        tabBarActiveTintColor: color.brandRose,
        tabBarInactiveTintColor: color.text.secondary,
        tabBarLabelStyle: { fontFamily: 'Lato-Medium', fontSize: NAV_LABEL_FONT_SIZE, letterSpacing: NAV_LABEL_TRACKING },
        tabBarItemStyle: { paddingTop: spacing[2], paddingBottom: spacing[7] },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <BrandedTabIcon Icon={Home} name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ focused }) => <BrandedTabIcon Icon={Map} name="map" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="favourites"
        options={{
          title: 'Favourites',
          tabBarIcon: ({ focused }) => <BrandedTabIcon Icon={Heart} name="favourites" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          title: 'Savings',
          // Owner-locked: Wallet (cleaner than the piggy bank).
          tabBarIcon: ({ focused }) => <BrandedTabIcon Icon={Wallet} name="savings" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <BrandedTabIcon Icon={User} name="profile" focused={focused} />,
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
