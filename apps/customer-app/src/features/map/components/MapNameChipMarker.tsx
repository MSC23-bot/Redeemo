import React, { useEffect, useState } from 'react'
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

export function MapNameChipMarker({ id, latitude, longitude, label, dotColor, maxEstimatedSaving }: Props) {
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

const styles = StyleSheet.create({
  // Nudges the chip up and to the right of its anchor coordinate (the
  // same coordinate the pin below it renders at) so it doesn't sit
  // directly on top of the pin. Approximate — a coarse, decorative
  // offset, not a pixel-measured layout (no MapView projection
  // dependency; consistent with `mapNameChipGate.ts`'s own
  // viewport-relative-unit approach rather than real screen pixels).
  offsetWrap: {
    transform: [{ translateX: 22 }, { translateY: -44 }],
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
