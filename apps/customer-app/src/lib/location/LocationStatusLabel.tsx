import React from 'react'
import { StyleSheet, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Text, color, spacing, radius, elevation } from '@/design-system'
import { MapPin, MapPinOff, ChevronRight } from '@/design-system/icons'
import { useUserLocation } from '@/hooks/useLocation'
import type { LocationContext } from '@/lib/api/shared/location'

/**
 * `<LocationStatusLabel>` — compact location identity affordance mounted at
 * the top of Home / Search / Map.  Always-visible per spec §6.4 + §8.
 *
 * Locked spec / plan:
 *   - Spec: docs/superpowers/specs/2026-05-26-locationcontext-parity-design.md
 *     §7 (component) + §10 (device-QA matrix).
 *   - Plan: docs/superpowers/plans/2026-05-26-locationcontext-parity.md Task 8.
 *
 * Locked state matrix (spec §7.2):
 *   - source='coordinates'           → "Using current location"
 *   - source='profile' + city        → "Using profile location · {city}"
 *   - source='profile' + city null   → "Using profile location"  (D8 fallback)
 *   - source='none' + denied/unavail → "No GPS · Set location ›"
 *   - source='none' + undetermined   → "Set location ›"
 *   - source='none' + granted        → "Set location ›" (edge: granted but
 *                                       coords not yet received — backend
 *                                       returned source='none', so we
 *                                       surface the "set location" CTA
 *                                       until coords arrive and the next
 *                                       wire-envelope round shifts source
 *                                       to 'coordinates')
 *   - locationContext === undefined  → renders null (initial load / unauth)
 *
 * Tap target: every renderable state routes to `/saved-area`.
 *
 * Variant (spec §7.3 + amendment 5; final shipped state):
 *   - `strip` (default) → consumed by:
 *       • Search — mounted below <SearchBar> ONLY when results render
 *         (Task 13 Round 2: hidden in idle / empty / loading where
 *         <SearchEmptyState> copy already carries the location
 *         identity).  Default chrome (cream tint + bottom hairline).
 *       • Home — mounted INSIDE <HomeHeader>'s left column at the
 *         GPS-row rhythm (Task 13 Round 3) with `flush=true` so the
 *         cream chrome is dropped and the label sits inline with the
 *         existing greeting + location row.
 *   - `chip`            → Map — pill-shaped overlay floating above the
 *                                map view; positioned by the mount
 *                                parent (the chip itself is layout-
 *                                agnostic).
 *
 * Owner-locked copy migration: ALL `source='profile'` text uses "profile
 * location" wording (NOT "saved area" / "saved location").  See D8 in
 * the spec.  Applies to label, honesty hint, Your Location screen, and
 * any future surface.
 *
 * Voucher Detail / Merchant Profile / Profile tab / Your Location screen
 * do NOT mount this component (per D4 lock).  Future §DF-v2-o may re-open
 * the D4 lock for Voucher Detail; until then this component is for
 * Discovery surfaces only (Home / Search / Map).
 */

export type LocationStatusLabelVariant = 'strip' | 'chip'

export type LocationStatusLabelProps = {
  // `| undefined` is intentional — Tasks 9 / 10 / 11 mount this with
  // values like `feed?.locationContext` that resolve to `undefined`
  // during the React Query loading window.  Under
  // `exactOptionalPropertyTypes`, the bare `?` form rejects explicit
  // `undefined`, so the union opt-out is required.
  locationContext?: LocationContext | undefined
  variant?:         LocationStatusLabelVariant | undefined
  // `flush=true` drops the strip variant's cream-tint background +
  // bottom hairline so the label can sit inline with a parent
  // component's existing layout rhythm (Task 13 Round 3 — Home uses
  // this to render the label inside HomeHeader's location-row slot
  // next to the greeting).  Search uses `flush=false` (default) so
  // the cream pill chrome demarcates the label as its own banner
  // above the results below.  Chip variant ignores this prop (chip
  // styling is unchanged).
  flush?:           boolean | undefined
}

// Internal derived state.  The state machine is exhaustive — every
// (locationContext, permission) tuple lands in exactly one of these
// kinds.  `kind: 'hidden'` is the only way to render null.
type RenderState =
  | { kind: 'coordinates' }
  | { kind: 'profile-with-city'; city: string }
  | { kind: 'profile-no-city' }
  | { kind: 'no-gps' }
  | { kind: 'undetermined' }
  | { kind: 'hidden' }

type Permission = 'granted' | 'denied' | 'unavailable' | 'undetermined'

/**
 * Pure state derivation — exported for unit-test reach when needed.  The
 * runtime path only uses it internally inside <LocationStatusLabel>.
 */
export function deriveLocationStatusState(
  locationContext: LocationContext | undefined,
  permission: Permission,
): RenderState {
  if (!locationContext) return { kind: 'hidden' }
  if (locationContext.source === 'coordinates') return { kind: 'coordinates' }
  if (locationContext.source === 'profile') {
    if (locationContext.city) return { kind: 'profile-with-city', city: locationContext.city }
    return { kind: 'profile-no-city' }
  }
  // source === 'none'.  Per spec §7.2: only 'denied' and 'unavailable'
  // get the "No GPS" prefix.  'undetermined' and the granted-without-
  // coords edge case both render the bare "Set location ›".
  if (permission === 'denied' || permission === 'unavailable') return { kind: 'no-gps' }
  return { kind: 'undetermined' }
}

export function LocationStatusLabel({
  locationContext,
  variant = 'strip',
  flush = false,
}: LocationStatusLabelProps): React.ReactElement | null {
  const router = useRouter()
  const { permission } = useUserLocation()
  const state = deriveLocationStatusState(locationContext, permission as Permission)

  if (state.kind === 'hidden') return null

  const showChevron = state.kind === 'no-gps' || state.kind === 'undetermined'
  const Icon = state.kind === 'no-gps' ? MapPinOff : MapPin

  // Visible label text — single string per state so test pins can
  // assert `text.props.children` directly without array-of-false dancing
  // around React's conditional-render shape.
  const labelText: string | null = (() => {
    switch (state.kind) {
      case 'coordinates':        return 'Using current location'
      case 'profile-no-city':    return 'Using profile location'
      case 'no-gps':             return 'No GPS · Set location'
      case 'undetermined':       return 'Set location'
      // profile-with-city renders as a nested-Text composition — see
      // the JSX branch below.  Returning null here is dead-code-safe.
      default:                   return null
    }
  })()

  // Accessibility label mirrors the visible string + the action affordance,
  // so screen-reader announcements match what sighted users see.  Used
  // for tap pins too — see §LSL-8.
  const a11yLabel = (() => {
    switch (state.kind) {
      case 'coordinates':        return 'Using current location, opens your location'
      case 'profile-with-city':  return `Using profile location · ${state.city}, opens your location`
      case 'profile-no-city':    return 'Using profile location, opens your location'
      case 'no-gps':             return 'No GPS · Set location, opens your location'
      case 'undetermined':       return 'Set location, opens your location'
    }
  })()

  // Task 13 Round 1 item 1 — `flush=true` on the strip variant drops
  // the cream background + bottom hairline + full-width container, so
  // the label can sit inline under <HomeHeader> without feeling like a
  // detached strip.  Chip variant ignores `flush` (its own styling is
  // unchanged).
  const containerStyle =
    variant === 'chip'
      ? styles.chip
      : flush
        ? styles.stripFlush
        : styles.strip

  return (
    <Pressable
      testID="location-status-label"
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={() => router.push('/saved-area' as any)}
      style={({ pressed }) => [containerStyle, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <Icon
          size={14}
          color={color.brandRose}
          strokeWidth={2.2}
        />
        <View style={styles.copyWrap}>
          {state.kind === 'profile-with-city' ? (
            <Text variant="label.md" numberOfLines={1} testID="location-status-text">
              Using profile location ·{' '}
              <Text variant="label.md" style={styles.cityEmphasis} testID="location-status-city">
                {state.city}
              </Text>
            </Text>
          ) : (
            <Text variant="label.md" numberOfLines={1} testID="location-status-text">
              {labelText}
            </Text>
          )}
        </View>
        {showChevron ? (
          <View testID="location-status-chevron">
            <ChevronRight
              size={14}
              color={color.text.tertiary}
              strokeWidth={2.2}
            />
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // Strip variant (Search default) — full-width row, bottom hairline only.
  // Spec §7.3 strip.  No border radius; no elevation; sits as an in-flow
  // row that scrolls with content (the parent owns vertical placement).
  strip: {
    width:             '100%',
    height:            36,
    paddingHorizontal: spacing[4],
    paddingVertical:   spacing[1],
    backgroundColor:   color.surface.tint,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
    borderRadius:      0,
    justifyContent:    'center',
  },
  // Task 13 Round 3 (2026-05-26) — strip "flush" sub-style used by
  // <HomeHeader> when it renders the label in its own location-row
  // slot (next to the greeting).  Parent provides positioning via
  // `marginTop: spacing[1]=4pt` (matching HomeHeader's GPS-on row
  // rhythm) and the column's `flex: 1` width, so flush style only
  // strips the cream-pill chrome from the default strip variant.
  // No negative margin (Round 2's outside-HomeHeader workaround is
  // retired); no horizontal padding (parent column's paddingHorizontal
  // owns it).
  stripFlush: {
    width:             '100%',
    paddingHorizontal: 0,
    paddingVertical:   0,
    backgroundColor:   'transparent',
    borderBottomWidth: 0,
    borderRadius:      0,
    justifyContent:    'flex-start',
  },
  // Chip variant (Map) — pill-shaped overlay floating over the map view.
  // Spec §7.3 chip.  Subtle cream tint over a translucent base gives
  // legibility against satellite + dense map tiles per spec §10 row 6.
  // Positioning (top + alignSelf etc.) is the mount parent's job — the
  // chip itself is layout-agnostic.
  chip: {
    height:            32,
    paddingHorizontal: spacing[3],
    paddingVertical:   6,
    backgroundColor:   'rgba(254, 246, 245, 0.96)', // color.surface.tint @ 96% alpha
    borderWidth:       1,
    borderColor:       color.border.subtle,
    borderRadius:      radius.pill,
    alignSelf:         'center',
    justifyContent:    'center',
    ...elevation.sm,
  },
  pressed: {
    opacity: 0.85,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing[2],
  },
  // Task 13 Round 1 item 4 — `flex: 1` collapses to 0 width inside an
  // intrinsic-sized parent (the chip variant is `alignSelf: 'center'`
  // with no explicit width).  Result: chip rendered as an icon-only
  // pill because the text wrapper claimed zero remaining space.  Drop
  // `flex: 1` and let the text size to its natural content width;
  // strip variants (width: 100%) still render the same because the
  // parent has plenty of horizontal space.  `flexShrink: 1` keeps the
  // text shrinking via numberOfLines={1} ellipsis when the chip ever
  // gets squeezed (e.g. very long city names on small phones).
  copyWrap: {
    flexShrink: 1,
  },
  // §7.3 — city emphasis: when source='profile' the city renders in
  // Lato-Semibold inline override (parent label.md keeps the size +
  // letterSpacing; only the font family flips).
  cityEmphasis: {
    fontFamily: 'Lato-SemiBold',
  },
})
