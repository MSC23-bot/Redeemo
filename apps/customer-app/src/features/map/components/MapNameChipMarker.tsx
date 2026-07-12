import React, { memo, useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Marker } from 'react-native-maps'
import { Text, color, radius, elevation } from '@/design-system'
import { formatGbpCompact } from '@/design-system/utils/formatters'

// Map Phase 2 Slice S3 (pin v2, owner-approved Option A, 2026-07-10) —
// name chip: white pill (category-colour dot + merchant/branch name)
// shown beside a pin at close zoom in a sparse viewport (density-gated
// — see `mapNameChipGate.ts`).
//
// Rendered as a SEPARATE, always-frozen Marker (per the task brief's
// explicit "separate frozen label markers" option) rather than as
// extra content inside the pin's own Marker: appending it to
// <CustomPin> would require growing that marker's outer bounds
// per-chip-visibility, which would violate the §BF constant-outer-
// bounds contract (bounds must be a fixed constant independent of any
// state, and "does this pin currently have a chip" is exactly the
// kind of per-render state that contract exists to keep OUT of the
// bounds calculation). A standalone marker sidesteps that entirely —
// its own bounds are simply constant for its own lifetime.
//
// Content never changes after mount (branch name + category colour are
// static for a given branch), so this captures ONCE on mount and
// freezes for good — no re-open condition needed (unlike the pin,
// which re-opens on selection toggle, or the cluster, which re-opens
// on count change). The freeze window duplicates MapPins.tsx's
// `SELECTION_TRACK_MS` (1000ms, §BI) — see that file's header comment;
// duplicated rather than imported for the same module-scope-coupling
// reason documented in MapClusterMarker.tsx.
const CHIP_TRACK_MS = 1000

// Map P2 W1 (F3 + F4) revised by W1.1 (F15, 2026-07-12) — chip tether
// geometry.
//
// The chip is a SEPARATE Marker at the SAME coordinate as the pin, both
// bottom-anchored (react-native-maps default `{x:0.5,y:1}`), so both are
// horizontally centred on the coordinate and rise upward from it.
//
// History: the pre-W1 offset (`translateX: 22, translateY: -44`) pushed
// the chip up-and-right into the pin's then-voucher-badge zone (F3) and
// read as detached (F4). W1 centred it (`translateX: 0`) but lifted it
// clear of the ENTIRE 63pt pin container: the container's upper band is
// mostly pulse-ring headroom, so the owner still found the chip floating
// (F15). The badge is now REMOVED (F14, owner W2-D6), so there is no
// badge zone to clear at all.
//
// W1.1 fix: lift the chip so it sits JUST ABOVE the VISIBLE resting
// (unselected) head top with a small pocket of air, derived from the
// pin's actual scaled geometry (constants duplicated from MapPins.tsx
// for the same module-scope-decoupling reason CHIP_TRACK_MS is
// duplicated above).
//
// Derivation (container coords, y grows downward; the pin container is
// 60x63 with the teardrop tip at the bottom-centre anchor):
//   TEARDROP_TOP     = CONTAINER_HEIGHT - PIN_HEIGHT = 63 - 54 = 9
//   wrapper centre y = TEARDROP_TOP + PIN_HEIGHT / 2 = 9 + 27  = 36
//   (RN `transform: scale` scales a view about its OWN centre)
//   unscaled head top y = TEARDROP_TOP = 9
//   scaled head top y   = centre + (top - centre) * scale
//                       = 36 + (9 - 36) * 0.81 = 14.13
// The chip's BOTTOM sits CHIP_GAP_ABOVE_HEAD above that, at container
// y = 14.13 - 6 = 8.13, which gives:
//   - 6pt of visual air above the resting head (the F15 ask: ~4-6pt);
//   - chip bottom still ABOVE the SELECTED (scale 1) head top (y = 9),
//     so the chip never overlaps the teardrop itself in either state; it
//     sits close to (fractionally over) the faint OUTER ring circle when
//     selected, which the owner explicitly accepted;
// so the lift from the anchor is CONTAINER_HEIGHT - 8.13 = 54.87.
const PIN_CONTAINER_HEIGHT    = 63
const PIN_HEIGHT              = 54
const PIN_TEARDROP_TOP        = PIN_CONTAINER_HEIGHT - PIN_HEIGHT // 9
const PIN_INNER_SCALE_RESTING = 0.81
const PIN_WRAP_CENTER_Y       = PIN_TEARDROP_TOP + PIN_HEIGHT / 2 // 36
// Exported for the F15 geometry tests (not part of the runtime API).
export const PIN_SCALED_HEAD_TOP =
  PIN_WRAP_CENTER_Y + (PIN_TEARDROP_TOP - PIN_WRAP_CENTER_Y) * PIN_INNER_SCALE_RESTING // 14.13
export const PIN_SELECTED_HEAD_TOP = PIN_TEARDROP_TOP // scale 1: head top = teardrop top
export const CHIP_GAP_ABOVE_HEAD = 6
export const CHIP_LIFT = PIN_CONTAINER_HEIGHT - PIN_SCALED_HEAD_TOP + CHIP_GAP_ABOVE_HEAD // 54.87
export const PIN_CONTAINER_HEIGHT_FOR_TESTS = PIN_CONTAINER_HEIGHT

type Props = {
  id: string
  latitude: number
  longitude: number
  label: string
  dotColor: string
  /**
   * Map Phase 2 S5b Task 4b — the branch's best available saving
   * (`merchant.maxEstimatedSaving`, the SAME field `<BranchTile>`'s
   * default `savingsDisplay="max"` reads). Formatted here via the same
   * `formatGbpCompact` util `<BranchTile>` uses, so "Save £X" matches
   * the app-wide compact-currency convention exactly (pence kept for
   * sub-pound savings, dropped for whole pounds). `null`/`undefined`
   * (no active saving) omits the suffix entirely. Content is static
   * for this marker's LIFETIME (same freeze discipline as
   * `label`/`dotColor` — see the header comment above): it does not
   * change after mount, so it doesn't need its own re-track window.
   */
  maxEstimatedSaving?: number | null
}

// Map P2 W1 (F1, 2026-07-12) — memoized. Name chips are frozen Markers
// too (tracksViewChanges freezes after the mount capture), so the same
// iOS "frozen annotation re-renders -> teleports to origin" hazard that
// hit the pins applies here. Every prop is a value-stable primitive
// (id / latitude / longitude / label / dotColor / maxEstimatedSaving) —
// no function props — so the default shallow compare bails out on a pure
// pan/zoom re-render of <MapPins>, and a chip that stays on screen never
// re-renders (hence never teleports). A chip only re-mounts/re-renders
// when it genuinely enters/leaves the density-gated candidate set.
function MapNameChipMarkerBase({ id, latitude, longitude, label, dotColor, maxEstimatedSaving }: Props) {
  const saveLabel = maxEstimatedSaving != null && maxEstimatedSaving > 0
    ? formatGbpCompact(maxEstimatedSaving)
    : null
  const [tracks, setTracks] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setTracks(false), CHIP_TRACK_MS)
    return () => clearTimeout(t)
    // Mount-only — content is static for this marker's lifetime (see
    // header comment), so there is no re-open dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Marker
      identifier={`chip:${id}`}
      coordinate={{ latitude, longitude }}
      tracksViewChanges={tracks}
      // Chips are decorative labels, not tap targets — taps pass
      // through to the pin underneath. `anchor` keeps the SAME
      // coordinate-to-content relationship as an ordinary pin
      // (bottom-anchored); the visual nudge up-and-right of the pin
      // happens via the inline transform below, not via `anchor`, so
      // this stays a plain, unremarkable Marker as far as
      // react-native-maps' own positioning math is concerned.
    >
      <View testID={`map-name-chip-${id}`} style={styles.offsetWrap}>
        <View style={styles.pill}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <Text variant="label.md" numberOfLines={1} style={styles.label}>
            {label}
            {saveLabel ? (
              <Text
                variant="label.md"
                style={styles.saveLabel}
                testID={`map-name-chip-save-${id}`}
              >
                {` · Save ${saveLabel}`}
              </Text>
            ) : null}
          </Text>
        </View>
      </View>
    </Marker>
  )
}

export const MapNameChipMarker = memo(MapNameChipMarkerBase)

const styles = StyleSheet.create({
  // Map P2 W1.1 (F15) — centre the chip over the pin (translateX 0, so
  // the pill grows symmetrically for any name length) and lift it so its
  // bottom sits CHIP_GAP_ABOVE_HEAD above the VISIBLE resting head top
  // (full derivation in the CHIP_LIFT comment above): a tight, tethered
  // label directly above the pin head rather than floating in the
  // container's ring-headroom band.
  offsetWrap: {
    transform: [{ translateY: -CHIP_LIFT }],
  },
  pill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   '#FFFFFF',
    borderRadius:      radius.pill,
    paddingHorizontal: 10,
    paddingVertical:   5,
    // Map Phase 2 S5b Task 4b — widened from 160 to fit the optional
    // "· Save £X" suffix without immediately ellipsizing the branch
    // name it follows. `numberOfLines={1}` on the label still
    // ellipsizes gracefully for genuinely long name+saving combos.
    maxWidth:          220,
    ...elevation.sm,
  },
  dot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  label: {
    color:      color.navy,
    fontFamily: 'Lato-Bold',
    fontSize:   12,
  },
  // Map Phase 2 S5b Task 4b — SAME Mustica green (#15803D) as
  // `<BranchTile>`'s `valueSave`/`savingAmount` styles and Home's
  // NearbyCard/PopularCard — one consistent "saving" colour app-wide,
  // not a fresh token — so the saving reads as a distinct, positive
  // fact rather than part of the branch name.
  saveLabel: {
    color:      '#15803D',
    fontFamily: 'Lato-Bold',
    fontSize:   12,
  },
})
