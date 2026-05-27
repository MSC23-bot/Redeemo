import React from 'react'
import { View, TouchableOpacity } from 'react-native'
import { Image } from 'expo-image'
import { Search, SlidersHorizontal, Bell, MapPin } from 'lucide-react-native'
import { Text, color, spacing, radius } from '@/design-system'
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
  onFilterPress: () => void
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
  onFilterPress,
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
          <Text variant="heading.md">
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

          <TouchableOpacity
            onPress={onFilterPress}
            accessibilityLabel="Filter"
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: color.surface.neutral,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SlidersHorizontal size={20} color={color.navy} />
          </TouchableOpacity>

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

          {/* Avatar circle — Image when avatarUrl present, initial
              fallback otherwise. Pre-fix the avatar always rendered the
              initial: the `avatarUrl` prop was plumbed through from
              HomeScreen but the render branch was never built, so users
              who uploaded a profile photo still saw the navy "J" circle
              on Home. Mirrors the ProfileHeader image pattern (expo-image
              with `contentFit="cover"` + circular borderRadius). */}
          <View
            testID="home-header-avatar"
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: color.navy,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {avatarUrl ? (
              <Image
                testID="home-header-avatar-image"
                source={{ uri: avatarUrl }}
                style={{ width: 32, height: 32, borderRadius: 16 }}
                contentFit="cover"
                accessibilityLabel="Profile photo"
              />
            ) : (
              <Text
                testID="home-header-avatar-initial"
                variant="label.md"
                style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 14 }}
              >
                {avatarLetter}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  )
}
