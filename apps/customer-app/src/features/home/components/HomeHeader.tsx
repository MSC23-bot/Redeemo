import React from 'react'
import { View, TouchableOpacity } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Search, Bell, MapPin } from 'lucide-react-native'
import { Text, color, spacing } from '@/design-system'
// Task 13 Round 3 (2026-05-26) — owner-locked: the Home location-
// status affordance must sit at the SAME visual rhythm as the
// existing GPS-on location row (marginTop: spacing[1]=4pt below the
// greeting), NOT as a separate strip below HomeHeader.  Mount the
// label INSIDE HomeHeader's left column so it occupies the
// header's natural location-row slot.  Standalone mount on
// HomeScreen is retired.
import { LocationStatusLabel } from '@/lib/location/LocationStatusLabel'
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
  onNotificationPress?: () => void
  // Task 13 Round 3 — `locationContext` from the Home feed envelope.
  // HomeHeader renders <LocationStatusLabel> in its location-row slot
  // when GPS-on `area/city` are absent AND a context is provided.
  // Undefined during the React Query loading window — the label
  // gracefully renders null in that state per §LSL-7.
  locationContext?: LocationContext | undefined
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function HomeHeader({
  firstName,
  area,
  city,
  locationContext,
  avatarUrl,
  onSearchPress,
  onAvatarPress,
  onNotificationPress,
}: Props) {
  const greeting = getGreeting()
  const displayName = firstName ?? 'there'
  const showLocation = area !== null || city !== null
  const locationParts = [area, city].filter(Boolean)
  const locationLabel = locationParts.join(', ')

  // Task 13 Round 3 — the LocationStatusLabel takes the GPS-row
  // slot when GPS-derived area/city aren't available AND the feed
  // provided a locationContext.  When GPS-on, the existing
  // area/city row wins (locked existing behaviour).  When both are
  // absent (no GPS + undefined locationContext during loading),
  // neither row renders.
  const showStatusLabel = !showLocation && locationContext !== undefined

  const avatarLetter = firstName ? firstName.charAt(0).toUpperCase() : '?'

  return (
    <View
      testID="home-header"
      style={{
        paddingHorizontal: 18,
        paddingVertical: spacing[3],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Left: greeting + location */}
        <View style={{ flex: 1, marginRight: spacing[2] }}>
          {/* Batch 2 M2 — the single Mustica display moment on Home
              (spec §9.1): greeting promoted heading.md → display.sm
              (MusticaPro-SemiBold 22/26) with -0.2px tracking. */}
          <Text variant="display.sm" style={{ letterSpacing: -0.2 }}>
            {greeting}, {displayName}
          </Text>
          {showLocation && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing[1] }}>
              <MapPin size={12} color={color.brandRose} />
              <Text
                variant="body.sm"
                color="secondary"
                style={{ marginLeft: 4 }}
              >
                {locationLabel}
              </Text>
            </View>
          )}
          {showStatusLabel && (
            <View style={{ marginTop: spacing[1] }}>
              <LocationStatusLabel
                variant="strip"
                flush
                locationContext={locationContext}
              />
            </View>
          )}
        </View>

        {/* Right: icon buttons + avatar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <TouchableOpacity
            onPress={onSearchPress}
            accessibilityLabel="Search"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: color.surface.neutral,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Search size={20} color={color.navy} />
          </TouchableOpacity>

          {/* Batch 2 M2 — dead Filter button removed (spec §9.1; it had a
              no-op handler). Notifications bell stays absent until the
              notifications system exists. */}

          {onNotificationPress && (
            <TouchableOpacity
              onPress={onNotificationPress}
              accessibilityLabel="Notifications"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: color.surface.neutral,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bell size={20} color={color.navy} />
            </TouchableOpacity>
          )}

          {/* Avatar — Batch 2 M2: now TAPPABLE, routes to the Profile tab
              via `onAvatarPress` (parent owns routing). Image when avatarUrl
              present; brand-rose→brand-coral gradient with the firstName
              initial otherwise (spec §9.1). 36pt per the Batch 2 header
              scale. The `avatarUrl` image branch (Profile Stabilisation
              Hotfix, PR #135) is preserved. */}
          <TouchableOpacity
            testID="home-header-avatar"
            onPress={onAvatarPress}
            accessibilityLabel="Profile"
            accessibilityRole="button"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              overflow: 'hidden',
            }}
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
                style={{
                  width: 36,
                  height: 36,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
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
      </View>
    </View>
  )
}
