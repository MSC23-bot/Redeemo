import React from 'react'
import { View, TouchableOpacity } from 'react-native'
import { Search, SlidersHorizontal, Bell, MapPin } from 'lucide-react-native'
import { Text, color, spacing, radius } from '@/design-system'

type Props = {
  firstName: string | null
  area: string | null
  city: string | null
  avatarUrl?: string | null
  onSearchPress: () => void
  onFilterPress: () => void
  onNotificationPress?: () => void
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function HomeHeader({
  firstName,
  area,
  city,
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

  const avatarLetter = firstName ? firstName.charAt(0).toUpperCase() : '?'

  return (
    <View
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
              <MapPin size={12} color={color.text.secondary} />
              <Text
                variant="body.sm"
                color="secondary"
                style={{ marginLeft: 4 }}
              >
                {locationLabel}
              </Text>
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
            <Search size={18} color={color.navy} />
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
            <SlidersHorizontal size={18} color={color.navy} />
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
              <Bell size={18} color={color.navy} />
            </TouchableOpacity>
          )}

          {/* Avatar circle */}
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: color.navy,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              variant="label.md"
              style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 14 }}
            >
              {avatarLetter}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}
