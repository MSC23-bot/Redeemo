import React, { useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Marker } from 'react-native-maps'
import { Text, color, elevation } from '@/design-system'

// Map Phase 2 Slice S3 (pin v2, owner-approved Option A, 2026-07-10) —
// cluster marker. Spec §7.3 + brief: navy #010C35 44px circle, 3px
// white border, white count, drop shadow; tap zooms in to split.
//
// Mirrors the §BC/§BF track-then-freeze + constant-outer-bounds
// discipline from MapPins.tsx's <CustomPin>/<MapPinMarker> (LOCKED —
// see that file's header comment for the full incident history this
// protects against). This is a NEW marker type (no pre-existing
// contract to preserve), but there is no reason to invent a different
// safety pattern: the SAME proven approach applies unchanged.
//
// The freeze window duplicates MapPins.tsx's `SELECTION_TRACK_MS`
// (1000ms, §BI) rather than importing it, to avoid coupling this file
// to MapPins' internal module scope (that constant is part of the
// LOCKED §BC/§BF/§BI block there and is deliberately left untouched).
const CLUSTER_TRACK_MS = 1000

const CLUSTER_SIZE = 44

type Props = {
  id: string
  latitude: number
  longitude: number
  count: number
  onPress: () => void
}

export function MapClusterMarker({ id, latitude, longitude, count, onPress }: Props) {
  // Re-capture the bitmap whenever the CONTENT changes (the count —
  // clusters don't have a "selected" state, but their member count can
  // change across a data refresh even while the marker id is stable,
  // e.g. a branch enters/leaves the confirmed-location set). Bounds
  // never change (CLUSTER_SIZE is a fixed constant regardless of
  // digit count), so this mirrors the pin's constant-bounds contract.
  const [tracks, setTracks] = useState(true)
  useEffect(() => {
    setTracks(true)
    const t = setTimeout(() => setTracks(false), CLUSTER_TRACK_MS)
    return () => clearTimeout(t)
  }, [count])

  return (
    <Marker
      identifier={id}
      coordinate={{ latitude, longitude }}
      onPress={onPress}
      tracksViewChanges={tracks}
    >
      <View testID={`map-cluster-${id}`} style={styles.circle}>
        <Text variant="label.md" style={styles.count}>{count}</Text>
      </View>
    </Marker>
  )
}

const styles = StyleSheet.create({
  circle: {
    width:           CLUSTER_SIZE,
    height:          CLUSTER_SIZE,
    borderRadius:    CLUSTER_SIZE / 2,
    backgroundColor: color.navy,
    borderWidth:     3,
    borderColor:     '#FFFFFF',
    alignItems:      'center',
    justifyContent:  'center',
    ...elevation.md,
  },
  count: {
    color:      '#FFFFFF',
    fontFamily: 'Lato-Bold',
    fontSize:   15,
  },
})
