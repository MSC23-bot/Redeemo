import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Text, color, spacing, radius, elevation } from '@/design-system'
import { MapPin, MapPinOff, ChevronRight } from '@/design-system/icons'
import { useUserLocation } from '@/hooks/useLocation'
import { deriveLocationStatusState, LocationStatusLabel } from '@/lib/location/LocationStatusLabel'
import { haversineMetres } from '@/design-system/utils/haversine'
import type { LocationContext } from '@/lib/api/shared/location'

/**
 * Map Phase 2 S5b Task 2 — consolidated top-of-map location indicator.
 *
 * ── D10 presentation supersession (owner feedback 2026-07-11, Doha) ──
 *
 * Pre-S5b, Map mounted TWO always-visible chips at once:
 *   - `<LocationStatusLabel variant="chip">` — user-CONTEXT identity
 *     ("Using current location" / "Using profile location · Huddersfield")
 *   - `<ViewportLocalityBadge>` — viewport LOCALITY ("Map centred near
 *     Huddersfield")
 * The owner found the pair cluttering. The D10 lock (§DF-v2-j, spec
 * 2026-05-26) that originally separated them is a SEMANTIC lock — the
 * two facts are genuinely different (who the user is vs. where the
 * camera happens to be pointed) and neither may be silently dropped —
 * but it never mandated two permanently-stacked rows. This component is
 * a PRESENTATION change on top of that lock, not a reversal of it:
 *
 *   1. Resting state shows the viewport locality ONLY, in a quieter
 *      form ("Near {name}") — this is what a user glancing at the map
 *      actually wants most of the time: "where am I looking?".
 *   2. The user-identity fact folds into the SAME pill (after a
 *      middot) only when it is genuinely INFORMATIVE — see
 *      `isIdentityInformative` below. Two triggers:
 *        a. the viewport is FAR from the user's own resolved point
 *           (GPS if granted, else saved-profile coords) — i.e. they are
 *           browsing somewhere other than where their identity would
 *           put them (the "browsing far from home" case the owner
 *           named, e.g. viewing Manchester while based in Doha).
 *        b. there is no positional identity to compare against at all
 *           (`source === 'none'`) — nothing to fall back on, so the
 *           "Set location" nudge is always worth the pixels.
 *   3. When GPS is off and a saved profile is quietly driving the map
 *      (`source === 'profile'`) but the viewport is STILL near that
 *      saved area, the pill stays quiet on purpose — the "honesty"
 *      affordance (which surface is actually driving the map) is not
 *      hidden, it is one tap away: the WHOLE pill still routes to
 *      `/saved-area`, exactly as `<LocationStatusLabel>` always has,
 *      where the fuller identity + honesty-hint copy already lives.
 *   4. When there is no viewport locality to anchor on at all (sparse-
 *      supply areas, `meta.effectiveLocality` absent, or the camera is
 *      offshore), the identity information must not be lost —
 *      falls back to rendering the UNMODIFIED
 *      `<LocationStatusLabel variant="chip">`, byte-identical to the
 *      pre-S5b render for that state.
 *
 * Every fact reachable pre-S5b stays reachable: tap-through to
 * `/saved-area` is unchanged; the identity copy strings are reused
 * VERBATIM via `deriveLocationStatusState` (the same derivation
 * `<LocationStatusLabel>` itself uses — single source of truth, no
 * forked state machine); the viewport locality name is still literally
 * `meta.effectiveLocality.name`, unchanged.
 *
 * Test relocation: `MapScreen.locality.test.tsx` and
 * `MapScreen.statusLabel.test.tsx` pinned the OLD two-row, always-both-
 * visible presentation (including the exact "Map centred near {name}"
 * string coexisting unconditionally with the identity chip). Both were
 * rewritten in place for S5b to assert the new composite's invariants
 * (quiet-by-default, identity folds in when informative, tap-through
 * preserved, offshore/permission-overlay suppression preserved) —
 * relocated, not deleted; see the S5b as-shipped addendum in
 * `docs/superpowers/plans/2026-07-10-map-phase-2-programme.md` §10 for
 * the full before/after mapping.
 */

// A pan further than this from the user's own resolved point counts as
// "browsing away from your own area" — roughly a different town/city
// over, not just a scroll across the same neighbourhood. Named constant
// so a future tuning pass doesn't have to go hunting for a magic number
// (same discipline as `mapNameChipGate.ts`'s CHIP_* constants).
export const FAR_FROM_OWN_LOCATION_METRES = 20_000

type IdentityState = ReturnType<typeof deriveLocationStatusState>

// Short fragments for the MERGED pill only — deliberately terser than
// <LocationStatusLabel>'s own standalone copy ("Using current
// location" etc.) since here they're appended after a viewport-locality
// clause, not carrying the whole sentence alone.
function shortIdentityFragment(state: IdentityState): string | null {
  switch (state.kind) {
    case 'coordinates':       return 'your location'
    case 'profile-with-city': return `your area: ${state.city}`
    case 'profile-no-city':   return 'your saved area'
    case 'no-gps':            return 'no GPS'
    case 'undetermined':      return 'set location'
    case 'hidden':            return null
    default:                  return null
  }
}

export type MapLocationIndicatorProps = {
  locationContext:      LocationContext | undefined
  viewportLocalityName: string | null | undefined
  /** Live camera centre — used only to measure "far from own location". */
  viewportCenter:       { lat: number; lng: number } | null
  /** The user's own resolved point: GPS if granted, else saved-profile
   *  coords, else null (mirrors MapScreen's own recentre cascade). */
  ownLocation:          { lat: number; lng: number } | null
  /** Camera is over water / outside the UK extent — the viewport
   *  locality clause is meaningless there (mirrors the old
   *  `<ViewportLocalityBadge>` offshore suppression); identity alone
   *  still renders via the fallback path (mirrors the old
   *  `<LocationStatusLabel>` NOT suppressing on offshore). */
  offshore:             boolean
}

export function MapLocationIndicator({
  locationContext,
  viewportLocalityName,
  viewportCenter,
  ownLocation,
  offshore,
}: MapLocationIndicatorProps) {
  const router = useRouter()
  const { permission } = useUserLocation()
  const state = deriveLocationStatusState(
    locationContext,
    permission as 'granted' | 'denied' | 'unavailable' | 'undetermined',
  )

  const effectiveViewportName = offshore ? null : viewportLocalityName
  const hasViewportName = !!effectiveViewportName && effectiveViewportName.trim() !== ''

  // No viewport locality to anchor on (sparse area / offshore / not yet
  // resolved) — identity must stay reachable, so fall back to the
  // unmodified pre-S5b chip rather than rendering nothing.
  if (!hasViewportName) {
    return <LocationStatusLabel variant="chip" locationContext={locationContext} />
  }

  if (state.kind === 'hidden') {
    // No identity signal at all (unauth / initial load) — quiet
    // viewport-only text, no tap target beyond a plain caption.
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Map centred near ${effectiveViewportName}`}
        testID="map-location-indicator"
        style={styles.chip}
      >
        <MapPin size={14} color={color.navy} />
        <Text variant="label.lg" style={styles.text} numberOfLines={1} testID="map-location-indicator-text">
          Near {effectiveViewportName}
        </Text>
      </View>
    )
  }

  const distance = haversineMetres(
    viewportCenter?.lat, viewportCenter?.lng, ownLocation?.lat, ownLocation?.lng,
  )
  const isFar = distance !== null && distance > FAR_FROM_OWN_LOCATION_METRES
  const noOwnSignal = state.kind === 'no-gps' || state.kind === 'undetermined'
  const informative = isFar || noOwnSignal

  const fragment = informative ? shortIdentityFragment(state) : null
  const showChevron = state.kind === 'no-gps' || state.kind === 'undetermined'
  const Icon = state.kind === 'no-gps' ? MapPinOff : MapPin

  const a11yLabel = fragment
    ? `Map centred near ${effectiveViewportName}, ${fragment}, opens your location`
    : `Map centred near ${effectiveViewportName}, opens your location`

  return (
    <Pressable
      testID="map-location-indicator"
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={() => router.push('/saved-area' as any)}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
    >
      <Icon size={14} color={color.navy} />
      <Text variant="label.lg" style={styles.text} numberOfLines={1} testID="map-location-indicator-text">
        Near {effectiveViewportName}
        {fragment ? (
          <Text variant="label.lg" style={styles.fragment} testID="map-location-indicator-fragment">
            {` · ${fragment}`}
          </Text>
        ) : null}
      </Text>
      {showChevron ? (
        <View testID="map-location-indicator-chevron">
          <ChevronRight size={14} color={color.text.tertiary} strokeWidth={2.2} />
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // Mirrors <LocationStatusLabel>'s own chip styling so the merged pill
  // and the identity-only fallback are visually indistinguishable —
  // one consistent chip language at the top of Map, whichever branch
  // renders.
  chip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing[2],
    height:            32,
    paddingHorizontal: spacing[3],
    backgroundColor:   'rgba(254, 246, 245, 0.96)',
    borderWidth:       1,
    borderColor:       color.border.subtle,
    borderRadius:      radius.pill,
    alignSelf:         'center',
    ...elevation.sm,
  },
  pressed: {
    opacity: 0.85,
  },
  text: {
    color:      color.navy,
    flexShrink: 1,
  },
  fragment: {
    color:      color.text.secondary,
    fontFamily: 'Lato-Regular',
  },
})
