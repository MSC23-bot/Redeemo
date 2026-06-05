import React from 'react'
import { View, Pressable } from 'react-native'
import { MapPin, ChevronDown } from '@/design-system/icons'
import { Text, color } from '@/design-system'
import { LocationStatusLabel } from '@/lib/location/LocationStatusLabel'
import { ON_BRAND_TEXT } from './HomeHeaderWave'
import type { LocationContext } from '@/lib/api/shared/location'

type Props = {
  area: string | null
  city: string | null
  locationContext?: LocationContext | undefined
  // 'sm' (expanded header, default) | 'md' (collapsed bar — slightly larger
  // icon + text so the pinned location reads clearly while scrolling).
  size?: 'sm' | 'md'
  // When provided, the GPS-on location row becomes a tappable affordance
  // (→ Your Location screen) with a ChevronDown "switch location" cue. The
  // profile <LocationStatusLabel> branch already routes to /saved-area on its
  // own, so it ignores onPress.
  onPress?: (() => void) | undefined
  // 'onBrand' renders white content for the brand-coloured header surface
  // (brand-header redesign). Threaded into <LocationStatusLabel> too.
  tone?: 'default' | 'onBrand'
  // testID for the tappable location button. Defaults to the expanded-header
  // id; the collapsed bar passes a distinct id so the two location buttons are
  // individually addressable (they both mount on Home at once).
  testID?: string
}

/**
 * Shared Home location row. Extracted from HomeHeader so the expanded
 * header AND the collapsed sticky bar resolve location identically.
 * Owns NO outer margin — the consumer positions it.
 *
 *   1. GPS-on  → MapPin + "area, city" (+ ChevronDown when tappable)
 *   2. no GPS, context provided → <LocationStatusLabel> strip (self-routing)
 *   3. neither (loading) → null
 */
export function HomeHeaderLocation({ area, city, locationContext, size = 'sm', onPress, tone = 'default', testID = 'home-header-location-button' }: Props) {
  const showLocation = area !== null || city !== null
  const showStatusLabel = !showLocation && locationContext !== undefined
  const onBrand = tone === 'onBrand'

  if (showLocation) {
    const locationLabel = [area, city].filter(Boolean).join(', ')
    const iconSize     = size === 'md' ? 15 : 13
    const chevronSize  = size === 'md' ? 16 : 14
    const pinColor     = onBrand ? ON_BRAND_TEXT : color.brandRose
    const chevronColor = onBrand ? ON_BRAND_TEXT : color.text.tertiary
    const content = (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <MapPin size={iconSize} color={pinColor} strokeWidth={2.2} />
        <Text
          variant={size === 'md' ? 'body.md' : 'body.sm'}
          color="secondary"
          style={[{ marginLeft: 5, marginRight: onPress ? 3 : 0 }, onBrand ? { color: ON_BRAND_TEXT } : null]}
          numberOfLines={1}
        >
          {locationLabel}
        </Text>
        {onPress ? (
          <ChevronDown size={chevronSize} color={chevronColor} strokeWidth={2.2} />
        ) : null}
      </View>
    )
    if (onPress) {
      return (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Change location"
          testID={testID}
          hitSlop={8}
          style={({ pressed }) => [{ alignSelf: 'flex-start' }, pressed ? { opacity: 0.7 } : null]}
        >
          {content}
        </Pressable>
      )
    }
    return content
  }
  if (showStatusLabel) {
    return <LocationStatusLabel variant="strip" flush locationContext={locationContext} tone={tone} />
  }
  return null
}
