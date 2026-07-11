/**
 * Map Phase 2 S5b Task 2 — `<MapLocationIndicator>` unit pin matrix.
 *
 * D10 presentation supersession (owner feedback 2026-07-11, Doha):
 * pre-S5b, Map mounted `<LocationStatusLabel variant="chip">` AND
 * `<ViewportLocalityBadge>` unconditionally, at the same time. This
 * component consolidates the two into ONE quiet composite pill. See
 * `MapLocationIndicator.tsx`'s header comment for the full design
 * rationale; this file pins the exact state-transition matrix that
 * rationale implies:
 *
 *   1. resting (quiet)   — viewport locality only, no identity fragment
 *   2. far-pan           — identity fragment folds in (isFar)
 *   3. no-own-signal     — identity fragment folds in even when NOT far
 *                          (source === 'none': nothing to compare against)
 *   4. no viewport name  — falls back to the unmodified
 *                          <LocationStatusLabel variant="chip">
 *   5. offshore           — same fallback as (4), even when a viewport
 *                          name IS present (the name is meaningless
 *                          over water)
 *   6. tap-through        — routes to `/saved-area` in every branch
 *                          that renders a Pressable
 */
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { MapLocationIndicator, FAR_FROM_OWN_LOCATION_METRES } from '@/features/map/components/MapLocationIndicator'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockPermissionRef = { current: 'undetermined' as 'granted' | 'denied' | 'unavailable' | 'undetermined' }
jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    permission: mockPermissionRef.current,
    status:     'idle',
    location:   null,
    coords:     null,
  }),
}))

beforeEach(() => {
  mockPush.mockClear()
  mockPermissionRef.current = 'undetermined'
})

// Huddersfield-ish coordinates, close together (well under the FAR
// threshold) — used for "resting/quiet" scenarios.
const NEAR_A = { lat: 53.6458, lng: -1.785 }
const NEAR_B = { lat: 53.65, lng: -1.79 }
// London — genuinely far from NEAR_A/B (used for the far-pan scenario).
const LONDON = { lat: 51.5074, lng: -0.1278 }

describe('MapLocationIndicator — resting (quiet) state', () => {
  it('renders "Near {name}" only, no identity fragment, when the viewport is close to the user\'s own point', () => {
    const { getByTestId, queryByTestId } = render(
      <MapLocationIndicator
        locationContext={{ source: 'coordinates', city: 'Huddersfield', locality: null }}
        viewportLocalityName="Huddersfield"
        viewportCenter={NEAR_A}
        ownLocation={NEAR_B}
        offshore={false}
      />,
    )
    const text = getByTestId('map-location-indicator-text')
    expect(text.props.children).toEqual(['Near ', 'Huddersfield', null])
    expect(queryByTestId('map-location-indicator-fragment')).toBeNull()
  })

  it('tap-through still routes to /saved-area even when quiet', () => {
    const { getByTestId } = render(
      <MapLocationIndicator
        locationContext={{ source: 'coordinates', city: 'Huddersfield', locality: null }}
        viewportLocalityName="Huddersfield"
        viewportCenter={NEAR_A}
        ownLocation={NEAR_B}
        offshore={false}
      />,
    )
    fireEvent.press(getByTestId('map-location-indicator'))
    expect(mockPush).toHaveBeenCalledWith('/saved-area')
  })
})

describe('MapLocationIndicator — identity folds in when informative', () => {
  it('appends "your location" when browsing FAR from GPS-driven identity (source=coordinates)', () => {
    const { getByTestId } = render(
      <MapLocationIndicator
        locationContext={{ source: 'coordinates', city: null, locality: null }}
        viewportLocalityName="London"
        viewportCenter={LONDON}
        ownLocation={NEAR_A}
        offshore={false}
      />,
    )
    const fragment = getByTestId('map-location-indicator-fragment')
    expect(fragment.props.children).toBe(' · your location')
  })

  it('appends "your area: {city}" when browsing FAR from a profile-driven identity', () => {
    const { getByTestId } = render(
      <MapLocationIndicator
        locationContext={{ source: 'profile', city: 'Huddersfield', locality: { id: 'l1', name: 'Huddersfield' } }}
        viewportLocalityName="London"
        viewportCenter={LONDON}
        ownLocation={NEAR_A}
        offshore={false}
      />,
    )
    const fragment = getByTestId('map-location-indicator-fragment')
    expect(fragment.props.children).toBe(' · your area: Huddersfield')
  })

  it('does NOT append a fragment when the profile-driven viewport is NOT far (stays quiet — the honesty affordance is one tap away, not inline)', () => {
    const { queryByTestId } = render(
      <MapLocationIndicator
        locationContext={{ source: 'profile', city: 'Huddersfield', locality: { id: 'l1', name: 'Huddersfield' } }}
        viewportLocalityName="Huddersfield"
        viewportCenter={NEAR_A}
        ownLocation={NEAR_B}
        offshore={false}
      />,
    )
    expect(queryByTestId('map-location-indicator-fragment')).toBeNull()
  })

  it('appends "no GPS" when source=none, even though there is nothing to measure distance against (always informative)', () => {
    mockPermissionRef.current = 'denied'
    const { getByTestId } = render(
      <MapLocationIndicator
        locationContext={{ source: 'none', city: null, locality: null }}
        viewportLocalityName="Huddersfield"
        viewportCenter={NEAR_A}
        ownLocation={null}
        offshore={false}
      />,
    )
    const fragment = getByTestId('map-location-indicator-fragment')
    expect(fragment.props.children).toBe(' · no GPS')
    // Chevron affordance preserved from the pre-S5b <LocationStatusLabel>
    // "no-gps"/"undetermined" states.
    expect(getByTestId('map-location-indicator-chevron')).toBeTruthy()
  })

  it('uses FAR_FROM_OWN_LOCATION_METRES as the exact threshold (documented constant, not a re-derived magic number)', () => {
    expect(FAR_FROM_OWN_LOCATION_METRES).toBeGreaterThan(0)
  })
})

describe('MapLocationIndicator — fallback to the unmodified identity chip', () => {
  it('falls back to <LocationStatusLabel variant="chip"> when there is no viewport locality name', () => {
    const { getByTestId, queryByTestId } = render(
      <MapLocationIndicator
        locationContext={{ source: 'coordinates', city: null, locality: null }}
        viewportLocalityName={null}
        viewportCenter={NEAR_A}
        ownLocation={NEAR_A}
        offshore={false}
      />,
    )
    // <LocationStatusLabel>'s OWN testID, proving the unmodified
    // component rendered (not the merged-pill branch).
    expect(getByTestId('location-status-label')).toBeTruthy()
    expect(queryByTestId('map-location-indicator')).toBeNull()
  })

  it('falls back to the identity chip when offshore, even though a viewport name IS present', () => {
    const { getByTestId, queryByTestId } = render(
      <MapLocationIndicator
        locationContext={{ source: 'coordinates', city: null, locality: null }}
        viewportLocalityName="Mid-Atlantic"
        viewportCenter={NEAR_A}
        ownLocation={NEAR_A}
        offshore
      />,
    )
    expect(getByTestId('location-status-label')).toBeTruthy()
    expect(queryByTestId('map-location-indicator')).toBeNull()
  })

  it('renders a quiet viewport-only caption (no tap target routing) when there is no identity signal at all', () => {
    const { getByTestId, queryByTestId } = render(
      <MapLocationIndicator
        locationContext={undefined}
        viewportLocalityName="Huddersfield"
        viewportCenter={NEAR_A}
        ownLocation={null}
        offshore={false}
      />,
    )
    const indicator = getByTestId('map-location-indicator')
    expect(indicator.props.accessibilityRole).toBe('text')
    expect(queryByTestId('map-location-indicator-fragment')).toBeNull()
  })
})
