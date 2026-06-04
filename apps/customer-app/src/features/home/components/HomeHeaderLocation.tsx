import React from 'react'
import { View } from 'react-native'
import { MapPin } from 'lucide-react-native'
import { Text, color } from '@/design-system'
import { LocationStatusLabel } from '@/lib/location/LocationStatusLabel'
import type { LocationContext } from '@/lib/api/shared/location'

type Props = {
  area: string | null
  city: string | null
  locationContext?: LocationContext | undefined
}

/**
 * Shared Home location row. Extracted from HomeHeader so the expanded
 * header AND the collapsed sticky bar resolve location identically.
 * Owns NO outer margin — the consumer positions it.
 *
 *   1. GPS-on  → MapPin + "area, city"
 *   2. no GPS, context provided → <LocationStatusLabel> strip
 *   3. neither (loading) → null
 */
export function HomeHeaderLocation({ area, city, locationContext }: Props) {
  const showLocation = area !== null || city !== null
  const showStatusLabel = !showLocation && locationContext !== undefined

  if (showLocation) {
    const locationLabel = [area, city].filter(Boolean).join(', ')
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <MapPin size={12} color={color.brandRose} />
        <Text variant="body.sm" color="secondary" style={{ marginLeft: 4 }} numberOfLines={1}>
          {locationLabel}
        </Text>
      </View>
    )
  }
  if (showStatusLabel) {
    return <LocationStatusLabel variant="strip" flush locationContext={locationContext} />
  }
  return null
}
