// Plan 4 M3b follow-up — ViewportLocalityBadge (Map only).
//
// Small white chip-with-icon mounted in the Map's top overlay to tell
// the user which UK locality the camera is centred near. Driven by
// `meta.effectiveLocality.name` on the active in-area or search-with-
// bbox response — i.e. the locality at the VIEWPORT CENTRE, not the
// user's saved-profile area.
//
// Visually distinct from the navy `LocationBadge` (which represents a
// USER-PICKED remote city filter). Both can appear at once; they
// answer different questions.
//
// Renders `null` when:
//   - `localityName` is null/undefined
//   - `localityName` trims to empty string
//
// Suppression around `offshore` / `showLocationPermission` lives at
// the screen level — those are MapScreen concerns, not component
// concerns. Keep this component purely render-by-prop.

import React from 'react'
import { View, StyleSheet } from 'react-native'
import { MapPin } from 'lucide-react-native'
import { Text, color, spacing, radius, elevation } from '@/design-system'

export type ViewportLocalityBadgeProps = {
  localityName: string | null | undefined
}

export function ViewportLocalityBadge({ localityName }: ViewportLocalityBadgeProps) {
  if (!localityName || localityName.trim() === '') return null
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Map centred near ${localityName}`}
      style={styles.badge}
    >
      <MapPin size={14} color={color.navy} />
      <Text variant="label.lg" style={styles.text} numberOfLines={1}>
        Map centred near {localityName}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1] + 2,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1] + 2,
    alignSelf: 'flex-start',
    ...elevation.sm,
  },
  text: {
    color: color.navy,
  },
})
