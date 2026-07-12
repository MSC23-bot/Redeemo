/**
 * §DF-v2-j Task 11 — MapScreen integration pin for <LocationStatusLabel> chip.
 *
 * Spec: docs/superpowers/specs/2026-05-26-locationcontext-parity-design.md
 *   §8.3 (mount, chip variant) + D10 (separate from ViewportLocalityBadge)
 *   + §9.3 (surface integration pin scope).
 * Plan: docs/superpowers/plans/2026-05-26-locationcontext-parity.md Task 11.
 *
 * Map Phase 2 S5b Task 2 (D10 presentation supersession, 2026-07-11) —
 * MapScreen now mounts ONE consolidated <MapLocationIndicator> instead
 * of the separate <LocationStatusLabel variant="chip"> +
 * <ViewportLocalityBadge> pair. The pre-S5b coexistence assertion below
 * ("both render, unconditionally, at once") is RELOCATED — not
 * deleted — to match the new quiet-by-default composite: in THIS
 * file's fixture (GPS granted at the SAME coords the camera cascades
 * to, so the viewport is NOT far from the user's own point), the
 * identity fact folds in QUIETLY (no separate always-visible row) but
 * both facts stay reachable: the viewport-locality text renders, and
 * the WHOLE pill still routes to `/saved-area` where the fuller
 * identity copy lives. `MapLocationIndicator.test.tsx` is the dedicated
 * unit-test file covering every informative-vs-quiet state transition
 * in isolation (far-pan, no-GPS-no-profile, offshore, no-viewport-name
 * fallback) — this file stays focused on proving the composite is
 * correctly WIRED to MapScreen's data + overlay-suppression rules.
 *
 * Asserts:
 *   - <MapLocationIndicator> mounts on MapScreen (testID
 *     'map-location-indicator', the same for both its viewport+identity
 *     merge branch and its viewport-only quiet branch).
 *   - It reads from inAreaResponse.locationContext (Task 5 emit) AND
 *     meta.effectiveLocality (Plan 4 M3b) — both original data sources
 *     are still consulted, unchanged.
 *   - It is rendered as a chip (borderRadius=9999) — proves the same
 *     chip visual language as the pre-S5b `variant="chip"` render.
 */
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── react-native-maps mock ──────────────────────────────────────────────────
const mockAnimateToRegion = jest.fn()
jest.mock('react-native-maps', () => {
  const ReactLib = require('react')
  const { View } = require('react-native')
  const MockMapView = ReactLib.forwardRef((props: any, ref: any) => {
    ReactLib.useImperativeHandle(ref, () => ({ animateToRegion: mockAnimateToRegion }))
    const { children, onRegionChangeComplete: _ignored, ...rest } = props
    return ReactLib.createElement(View, rest, children)
  })
  return {
    __esModule: true,
    default: MockMapView,
    Marker: (props: any) => ReactLib.createElement(View, props),
  }
})

const { makeBranchTile } = require('../../fixtures/branchTile')
const mockBranch = makeBranchTile({
  id: 'brn1', branchLatitude: 51.5, branchLongitude: -0.1,
  merchant: { id: 'm1', businessName: 'Test' },
})

const HUDDERSFIELD_LOCALITY = { id: 'loc-hud', name: 'Huddersfield' }

jest.mock('@/features/map/hooks/useInAreaBranches', () => ({
  useInAreaBranches: (_bbox: any, _params: any, enabled = true) => {
    if (!enabled) return { data: undefined, isLoading: false }
    return {
      data: {
        merchants: [],
        branches:  [mockBranch],
        total: 1,
        meta: {
          resolvedArea:     'Huddersfield',
          nearbyCount:      1,
          cityCount:        0,
          distantCount:     0,
          emptyStateReason: 'none' as const,
          // D10 — viewport-locality field stays present.  The integration
          // pin verifies BOTH the chip (user-context) AND the
          // ViewportLocalityBadge (viewport-context) render at once.
          effectiveLocality: HUDDERSFIELD_LOCALITY,
        },
        // §DF-v2-j Task 5 emit + Task 7 schema field.
        locationContext: {
          source:   'profile',
          city:     'Huddersfield',
          locality: HUDDERSFIELD_LOCALITY,
        },
      },
      isLoading: false,
      isFetching: false,
    }
  },
}))

jest.mock('@/hooks/useSearch', () => ({
  useSearch: () => ({ data: undefined, isLoading: false, isFetching: false }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: { categories: [] },
    isLoading: false,
  }),
}))

// Per-test override for useUserLocation's `status` field so pins can
// exercise the showLocationPermission gate's actual branches (the
// gate requires status === 'idle' to fire).  Default 'granted'
// preserves the existing §LSL-Map pin's setup.
const mockLocationStatusRef = { current: 'granted' as 'idle' | 'granted' | 'denied' | 'loading' }
jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    location:          { lat: 53.6458, lng: -1.785, area: null, city: null },
    coords:            { lat: 53.6458, lng: -1.785 },
    status:            mockLocationStatusRef.current,
    permission:        'denied',
    request:           jest.fn(),
    requestPermission: jest.fn(),
    openSettings:      jest.fn(),
  }),
}))

jest.mock('@/hooks/useEligibleAmenities', () => ({
  useEligibleAmenities: () => ({ data: { amenities: [] }, isLoading: false }),
}))

// Map Phase 2 S5b Task 2 — hoisted so tests can assert on the composite
// indicator's tap-through target (`/saved-area`), same route the pre-S5b
// <LocationStatusLabel> chip has always used.
const mockRouterPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush, back: jest.fn() }),
}))

// Task 13 Round 1 item 3 — MapScreen reads `me.data?.latitude/longitude`
// to gate the showLocationPermission overlay (skipped when the user
// has saved-profile coords).  Mock useMe with a holder so the new pin
// can swap in profile coords without rewriting the factory.
// PR #131 pre-merge fix #2 (2026-05-26) — Map's permission-overlay
// gate now reads `localityId + latitude + longitude` (mirrors
// §DF-v2-i exactly).  Extend the mock to expose all three so the
// pin can pin both the complete-profile happy path AND the negative
// case where lat/lng exist without localityId.
const mockMeRef = {
  current: null as null | {
    latitude:   number | null
    longitude:  number | null
    localityId: string | null
  },
}
jest.mock('@/hooks/useMe', () => ({
  useMe: () => ({ data: mockMeRef.current }),
  meQueryKey: () => ['me'],
}))

beforeEach(() => {
  mockMeRef.current             = null
  mockLocationStatusRef.current = 'granted'
  mockRouterPush.mockClear()
})

import { MapScreen } from '@/features/map/screens/MapScreen'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('§DF-v2-j Task 11 — MapScreen mounts <MapLocationIndicator> (S5b consolidation)', () => {
  it('§LSL-Map — composite renders from inAreaResponse.locationContext + meta.effectiveLocality, chip styling (radius=9999)', () => {
    const { getByTestId } = render(<MapScreen />, { wrapper })

    // 1. Composite is mounted.
    const indicator = getByTestId('map-location-indicator')
    expect(indicator).toBeTruthy()

    // 2. Chip styling — same visual language as the pre-S5b
    //    <LocationStatusLabel variant="chip"> (borderRadius=9999,
    //    borderWidth=1).
    const flatten = Array.isArray(indicator.props.style)
      ? Object.assign({}, ...indicator.props.style.filter(Boolean))
      : (indicator.props.style ?? {})
    expect(flatten.borderRadius).toBe(9999)
    expect(flatten.borderWidth).toBe(1)

    // 3. Resting-state copy: this fixture's GPS location (53.6458,
    //    -1.785) is the SAME point the initial-camera cascade centres
    //    on, so the viewport is NOT "far" from the user's own point —
    //    the identity fact stays quiet (D10 presentation supersession)
    //    but the viewport-locality fact (sourced from
    //    meta.effectiveLocality, unchanged data source) is always
    //    shown.
    const text = getByTestId('map-location-indicator-text')
    expect(text.props.children).toEqual(['Near ', 'Huddersfield', null])

    // 4. Tap-through preserved — the WHOLE pill still routes to
    //    `/saved-area`, exactly as the pre-S5b chip did, so the fuller
    //    identity + honesty-hint copy is one tap away even when quiet.
    fireEvent.press(indicator)
    expect(mockRouterPush).toHaveBeenCalledWith('/saved-area')
  })

  // Round 1 device-QA item 3 regression pin (extended in PR #131 fix #2).
  it('§LSL-Map-permission-overlay-skip — Map does NOT show the blocking "Enable Location" overlay when the user has a COMPLETE saved profile (localityId + lat + lng) AND GPS is idle', () => {
    // Owner-reported bug: profile-location users (Brightlingsea
    // backfilled per §DF v1) were being blocked by the
    // "Find merchants near you / Enable Location / Browse without
    // location" overlay before the map could open.  Round 1 fix:
    // `showLocationPermission` is gated on the ABSENCE of saved-
    // profile coords too — users with NEITHER GPS NOR saved profile
    // still see the overlay (kept for the genuine no-location case).
    //
    // PR #131 pre-merge fix #2 — the gate now requires ALL THREE of
    // localityId + latitude + longitude (mirrors §DF-v2-i exactly).
    // Test sets status='idle' so the gate's `status === 'idle'`
    // first arm actually fires — otherwise the gate short-circuits
    // before the profile predicate is evaluated, making the test
    // pass for the wrong reason.
    mockLocationStatusRef.current = 'idle'
    mockMeRef.current = {
      latitude:   51.825,
      longitude:  1.027,
      localityId: 'l-brightlingsea',
    }

    const { queryByText, getByTestId } = render(<MapScreen />, { wrapper })

    // Overlay text MUST NOT be visible.  The "Find merchants near you"
    // heading + "Enable Location" CTA are the strings the user sees.
    expect(queryByText('Find merchants near you')).toBeNull()
    expect(queryByText('Enable Location')).toBeNull()

    // Composite indicator (the post-overlay location identity
    // affordance) IS visible — Map opened directly into the user's
    // profile-bbox experience.
    expect(getByTestId('map-location-indicator')).toBeTruthy()
  })

  // PR #131 pre-merge fix #2 (2026-05-26) — §DF-v2-i alignment
  // negative pin.  Lat/lng without a localityId is an incomplete
  // profile post-§DF-v2-i; backend `resolveLocationContext` returns
  // `source='none'` for this cohort, so Map must NOT suppress the
  // overlay (the user IS a true no-location user from backend's POV).
  it('§LSL-Map-permission-overlay-shown-when-localityId-missing — Map DOES show the overlay when lat/lng exist but localityId is null AND GPS is idle', () => {
    mockLocationStatusRef.current = 'idle'
    mockMeRef.current = {
      latitude:   51.825,
      longitude:  1.027,
      localityId: null, // ← incomplete profile per §DF-v2-i
    }

    const { getByText } = render(<MapScreen />, { wrapper })

    // Overlay copy MUST be visible — user is treated as no-location,
    // matching backend `source='none'` for the same fixture shape.
    expect(getByText('Find merchants near you')).toBeTruthy()
  })
})
