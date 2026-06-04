import React from 'react'
import { View, TouchableOpacity, type LayoutChangeEvent } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Text, color, spacing } from '@/design-system'
import { HomeHeaderLocation } from './HomeHeaderLocation'
import { HomeSearchBar } from './HomeSearchBar'
import type { LocationContext } from '@/lib/api/shared/location'

type Props = {
  firstName: string | null
  area: string | null
  city: string | null
  avatarUrl?: string | null
  onSearchPress: () => void
  // Batch 2 M2 — avatar taps route to the Profile tab. Parent (HomeScreen)
  // owns the routing, mirroring `onSearchPress` (HomeHeader stays router-free).
  onAvatarPress: () => void
  // Task 13 Round 3 — `locationContext` from the Home feed envelope, passed
  // through to <HomeHeaderLocation> which renders <LocationStatusLabel> when
  // GPS-on `area/city` are absent AND a context is provided.
  locationContext?: LocationContext | undefined
  // PR A (sticky header) — reports the rendered header height so HomeScreen
  // can compute `fadeEndY` for the collapsed-header fade. Optional so the
  // component is still usable standalone (e.g. in unit tests).
  onHeightChange?: (height: number) => void
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Expanded Home header (PR A, Option A layout):
 *   • Top row    — greeting (Mustica display.sm, left) + avatar (36pt, right)
 *   • Location   — <HomeHeaderLocation> below the greeting
 *   • Search bar — full-width tap-through <HomeSearchBar> (routes to /search)
 *
 * The previous top-right search *icon* is gone — the full-width bar is now the
 * primary search affordance. When the user scrolls, <HomeCollapsedHeader>
 * (mounted by HomeScreen) takes over with the compact location + icon + avatar
 * row. This component stays router-free; HomeScreen owns navigation.
 */
export function HomeHeader({
  firstName, area, city, locationContext, avatarUrl,
  onSearchPress, onAvatarPress, onHeightChange,
}: Props) {
  const greeting = getGreeting()
  const displayName = firstName ?? 'there'
  const avatarLetter = firstName ? firstName.charAt(0).toUpperCase() : '?'

  const handleLayout = (e: LayoutChangeEvent) => onHeightChange?.(e.nativeEvent.layout.height)

  return (
    <View
      testID="home-header"
      onLayout={handleLayout}
      style={{ paddingHorizontal: 18, paddingVertical: spacing[3] }}
    >
      {/* Top row: greeting (left) + avatar (right) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, marginRight: spacing[2] }}>
          {/* The single Mustica display moment on Home (spec §9.1). */}
          <Text variant="display.sm" style={{ letterSpacing: -0.2 }}>
            {greeting}, {displayName}
          </Text>
          <View style={{ marginTop: spacing[1] }}>
            <HomeHeaderLocation area={area} city={city} locationContext={locationContext} />
          </View>
        </View>

        {/* Avatar — tappable, routes to the Profile tab via onAvatarPress
            (parent owns routing). Image when avatarUrl present; brand-rose→
            brand-coral gradient with the firstName initial otherwise. The
            avatarUrl image branch (PR #135) is preserved. */}
        <TouchableOpacity
          testID="home-header-avatar"
          onPress={onAvatarPress}
          accessibilityLabel="Profile"
          accessibilityRole="button"
          style={{ width: 36, height: 36, borderRadius: 18, overflow: 'hidden' }}
        >
          {avatarUrl ? (
            <Image
              testID="home-header-avatar-image"
              source={{ uri: avatarUrl }}
              style={{ width: 36, height: 36, borderRadius: 18 }}
              contentFit="cover"
              accessibilityLabel="Profile photo"
            />
          ) : (
            <LinearGradient
              colors={[color.brandRose, color.brandCoral]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text
                testID="home-header-avatar-initial"
                variant="label.md"
                style={{ color: '#FFFFFF', fontSize: 15, lineHeight: 15 }}
              >
                {avatarLetter}
              </Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
      </View>

      {/* Full-width tap-through search bar */}
      <View style={{ marginTop: spacing[3] }}>
        <HomeSearchBar onPress={onSearchPress} />
      </View>
    </View>
  )
}
