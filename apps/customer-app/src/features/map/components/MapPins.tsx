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
// when the marker's child content changes (selection toggle), the
// affected pin disappears briefly during the native-side bitmap
// rebuild. The mechanism here re-enables `tracksViewChanges` for
// `SELECTION_TRACK_MS` so the new bitmap captures cleanly.
const SELECTION_TRACK_MS = 250

// §BF — stable marker dimensions.
//
// On real iOS, §BC alone wasn't enough: the 34→42px size change on
// selection toggle caused the native bitmap regeneration to leave
// markers stuck-invisible after multiple tap interactions, only
// recovered by force-quitting the app. The fix is to keep the
// marker's outer layout-bounds CONSTANT across selected/unselected
// states. Selection emphasis is conveyed via a transform scale
// applied to the inner content — `transform: scale(...)` is a
// 2D affine compositing operation that doesn't change layout bounds,
// so the native marker bitmap dimensions stay the same and no
// regeneration is triggered.
//
// `MARKER_SIZE` is the constant outer circle dimension (used to be
// 42 for selected pins). `INNER_SCALE_UNSELECTED` reproduces the
// previous 34/42 visual ratio without resizing the marker bounds.
const MARKER_SIZE = 42
const MARKER_TAIL_HEIGHT = 10
const INNER_SCALE_UNSELECTED = 0.81 // ≈ 34/42 — preserves the old visual feel

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

// Exported for §BF stable-dimensions tests. Not part of the public
// component API.
export function CustomPin({
  merchant,
  selected,
}: {
  merchant: MerchantTile
  selected: boolean
}) {
  const pinColor = getPinColor(merchant)
  const letter = merchant.businessName.charAt(0).toUpperCase()
  // §BF — outer marker bounds stay constant (MARKER_SIZE × tail). The
  // inner content uses transform: scale to express the unselected
  // visual size. Layout bounds don't change → native marker bitmap
  // dimensions don't change → no regeneration trigger on selection
  // toggle.
  const innerScale = selected ? 1.0 : INNER_SCALE_UNSELECTED

  return (
    <View
      testID={`custom-pin-${merchant.id}`}
      style={styles.pinContainer}
    >
      {/* Circle with letter */}
      <View
        style={[
          styles.circle,
          {
            backgroundColor: pinColor,
            transform: [{ scale: innerScale }],
          },
        ]}
      >
        <Text
          variant="label.md"
          style={styles.pinLetter}
        >
          {letter}
        </Text>
      </View>
      {/* Pin tail triangle */}
      <View
        style={[
          styles.pinTail,
          {
            borderTopColor: pinColor,
            transform: [{ scale: innerScale }],
          },
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
  // §BF — explicit outer bounds. Total marker container is the
  // circle (MARKER_SIZE) stacked above the triangular tail
  // (MARKER_TAIL_HEIGHT). Stays constant across selected/unselected
  // states so native bitmap doesn't regenerate on selection toggle.
  pinContainer: {
    width: MARKER_SIZE,
    height: MARKER_SIZE + MARKER_TAIL_HEIGHT,
    alignItems: 'center',
  },
  circle: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
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
    fontSize: 16,
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopWidth: MARKER_TAIL_HEIGHT,
    marginTop: -1,
  },
})
