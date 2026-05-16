import React, { useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { Text, color } from '@/design-system'
import { MerchantTile } from '@/lib/api/discovery'

// §BC — track-then-freeze pattern for selection transitions.
//
// `tracksViewChanges={false}` is a perf-critical freeze that stops
// react-native-maps from re-rendering each marker's bitmap on every
// camera change. But it also caches the bitmap so aggressively that
// when the marker's child component resizes (selection toggles
// 34→42px), the affected pin disappears for ~2s during the native-
// side bitmap rebuild.
//
// Fix: per-marker `tracks` state that briefly flips back to `true`
// whenever `selected` toggles, then back to `false` after the new
// bitmap is captured. The freeze still applies in steady state, so
// camera-change perf is unchanged.
const SELECTION_TRACK_MS = 250

type Props = {
  merchants: MerchantTile[]
  selectedId: string | null
  onPress: (merchant: MerchantTile) => void
}

function getPinColor(merchant: MerchantTile): string {
  const catName = merchant.primaryCategory?.name?.toLowerCase() ?? ''
  if (catName.includes('food') || catName.includes('drink')) return color.pin.foodDrink
  if (catName.includes('beauty') || catName.includes('wellness')) return color.pin.beautyWellness
  if (catName.includes('fitness') || catName.includes('sport')) return color.pin.fitnessSport
  if (catName.includes('shopping')) return color.pin.shopping
  return color.pin.default
}

function CustomPin({
  merchant,
  selected,
}: {
  merchant: MerchantTile
  selected: boolean
}) {
  const pinColor = getPinColor(merchant)
  const size = selected ? 42 : 34
  const letter = merchant.businessName.charAt(0).toUpperCase()

  return (
    <View style={styles.pinContainer}>
      {/* Circle with letter */}
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: pinColor,
          },
        ]}
      >
        <Text
          variant="label.md"
          style={[styles.pinLetter, { fontSize: selected ? 16 : 13 }]}
        >
          {letter}
        </Text>
      </View>
      {/* Pin tail triangle */}
      <View
        style={[
          styles.pinTail,
          { borderTopColor: pinColor, borderTopWidth: selected ? 10 : 8 },
        ]}
      />
    </View>
  )
}

function MapPinMarker({
  merchant,
  selected,
  onPress,
}: {
  merchant: MerchantTile
  selected: boolean
  onPress: (m: MerchantTile) => void
}) {
  const { latitude, longitude } = merchant
  // Initial render captures the first bitmap (tracks=true). After the
  // capture settles, freeze for perf. The effect re-enables tracking
  // every time `selected` toggles so the resize is captured cleanly
  // without an unmount/remount flicker on the affected pin.
  const [tracks, setTracks] = useState(true)
  useEffect(() => {
    if (latitude === null || longitude === null) return
    setTracks(true)
    const t = setTimeout(() => setTracks(false), SELECTION_TRACK_MS)
    return () => clearTimeout(t)
  }, [selected, latitude, longitude])

  // Backend surfaces nearest-branch lat/lng on the tile only when
  // the merchant has a MANUALLY_CONFIRMED branch (PR #81 redaction
  // contract preserved at the tile boundary). When either coord is
  // null the merchant gets no pin — POSTCODE_CENTROID / NEEDS_REVIEW /
  // ADDRESS_GEOCODED branches must never appear as exact map markers.
  if (latitude === null || longitude === null) return null

  return (
    <Marker
      identifier={merchant.id}
      coordinate={{ latitude, longitude }}
      onPress={() => onPress(merchant)}
      tracksViewChanges={tracks}
    >
      <CustomPin merchant={merchant} selected={selected} />
    </Marker>
  )
}

export function MapPins({ merchants, selectedId, onPress }: Props) {
  return (
    <>
      {merchants.map((merchant) => (
        <MapPinMarker
          key={merchant.id}
          merchant={merchant}
          selected={selectedId === merchant.id}
          onPress={onPress}
        />
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  pinContainer: {
    alignItems: 'center',
  },
  circle: {
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pinLetter: {
    color: '#FFFFFF',
    fontFamily: 'Lato-Bold',
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
})
