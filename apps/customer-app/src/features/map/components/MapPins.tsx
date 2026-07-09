import React, { useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Marker } from 'react-native-maps'
import { Text, color } from '@/design-system'
import { BranchTile } from '@/lib/api/discovery'

// §BC — track-then-freeze pattern for selection transitions.
//
// `tracksViewChanges={false}` is a perf-critical freeze that stops
// react-native-maps from re-rendering each marker's bitmap on every
// camera change. But it also caches the bitmap so aggressively that
// when the marker's child content changes (selection toggle), the
// affected pin disappears briefly during the native-side bitmap
// rebuild. The mechanism here re-enables `tracksViewChanges` for
// `SELECTION_TRACK_MS` so the new bitmap captures cleanly.
//
// §BI 2026-05-16 — bumped from 250ms to 1000ms. EAS preview QA
// post-§BF showed an intermittent missing-pin case on cold-mount /
// zoom-transition (e.g. London → Huddersfield → London, the Wagtail
// Hackney pin sometimes failed to render). Hypothesis: 250ms was
// enough for selection-transition recaptures but NOT always enough
// for the FIRST bitmap commit on cold mount under heavy frames
// (camera animation + N markers mounting simultaneously + JS thread
// under load). 1000ms gives iOS a wider safety margin to commit the
// first bitmap before the freeze restores. The perf cost is N extra
// frames of bitmap-tracking per marker on cold mount only — once
// the bitmap is captured, the freeze still applies for the rest of
// the session.
const SELECTION_TRACK_MS = 1000

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
  branches: BranchTile[]
  selectedId: string | null
  onPress: (branch: BranchTile) => void
}

// Fold 1 (PR-3 Phase B) — read the backend-emitted
// `branch.merchant.primaryCategory.pinColour` first and only fall
// through to the hardcoded palette when that field is null/undefined.
// Closes the §7.2 visual-correctness gap where non-Big-Four
// categories all defaulted to `color.pin.default` (brandRose).
function getPinColor(branch: BranchTile): string {
  const backendPinColour = branch.merchant.primaryCategory?.pinColour
  if (backendPinColour) return backendPinColour
  const catName = branch.merchant.primaryCategory?.name?.toLowerCase() ?? ''
  if (catName.includes('food') || catName.includes('drink')) return color.pin.foodDrink
  if (catName.includes('beauty') || catName.includes('wellness')) return color.pin.beautyWellness
  if (catName.includes('fitness') || catName.includes('sport')) return color.pin.fitnessSport
  if (catName.includes('shopping')) return color.pin.shopping
  return color.pin.default
}

// Exported for §BF stable-dimensions tests. Not part of the public
// component API.
export function CustomPin({
  branch,
  selected,
}: {
  branch: BranchTile
  selected: boolean
}) {
  const pinColor = getPinColor(branch)
  const letter = branch.merchant.businessName.charAt(0).toUpperCase()
  // §BF — outer marker bounds stay constant (MARKER_SIZE × tail). The
  // inner content uses transform: scale to express the unselected
  // visual size. Layout bounds don't change → native marker bitmap
  // dimensions don't change → no regeneration trigger on selection
  // toggle.
  const innerScale = selected ? 1.0 : INNER_SCALE_UNSELECTED

  return (
    <View
      testID={`custom-pin-${branch.id}`}
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
  branch,
  selected,
  onPress,
}: {
  branch: BranchTile
  selected: boolean
  onPress: (b: BranchTile) => void
}) {
  const { branchLatitude, branchLongitude } = branch
  // Initial render captures the first bitmap (tracks=true). After the
  // capture settles, freeze for perf. The effect re-enables tracking
  // every time `selected` toggles so the resize is captured cleanly
  // without an unmount/remount flicker on the affected pin.
  const [tracks, setTracks] = useState(true)
  useEffect(() => {
    if (branchLatitude === null || branchLongitude === null) return
    setTracks(true)
    const t = setTimeout(() => setTracks(false), SELECTION_TRACK_MS)
    return () => clearTimeout(t)
  }, [selected, branchLatitude, branchLongitude])

  // Defensive client-side null-coord filter (PR-3 plan §6.3).
  // Backend `getInAreaBranches` is CONFIRMED_LOCATION_SET-only
  // (MANUALLY_CONFIRMED + ADDRESS_GEOCODED; Branch Location Trust Slice 1
  // spec 2026-07-09 §2.3) at the SQL predicate — POSTCODE_CENTROID /
  // NEEDS_REVIEW branches never leave the database on this route, so
  // `branchLatitude` / `branchLongitude` arrive non-null in practice.
  // This guard is belt-and-braces
  // against (a) a future backend predicate regression, (b) a fixture
  // mistake injecting null-coord rows directly into <MapPins>,
  // (c) malformed wire data from a serialization bug.
  if (branchLatitude === null || branchLongitude === null) return null

  return (
    <Marker
      identifier={branch.id}
      coordinate={{ latitude: branchLatitude, longitude: branchLongitude }}
      onPress={() => onPress(branch)}
      tracksViewChanges={tracks}
    >
      <CustomPin branch={branch} selected={selected} />
    </Marker>
  )
}

export function MapPins({ branches, selectedId, onPress }: Props) {
  return (
    <>
      {branches.map((branch) => (
        <MapPinMarker
          key={branch.id}
          branch={branch}
          selected={selectedId === branch.id}
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
