/**
 * §DF-v2-j Task 11 — MapScreen integration pin for <LocationStatusLabel> chip.
 *
 * Spec: docs/superpowers/specs/2026-05-26-locationcontext-parity-design.md
 *   §8.3 (mount, chip variant) + D10 (separate from ViewportLocalityBadge)
 *   + §9.3 (surface integration pin scope).
 * Plan: docs/superpowers/plans/2026-05-26-locationcontext-parity.md Task 11.
 *
 * Asserts:
 *   - <LocationStatusLabel variant='chip'> mounts on MapScreen.
 *   - It reads from inAreaResponse.locationContext (Task 5 emit).
 *   - It is rendered as a chip (borderRadius=9999) — proves the
 *     `variant="chip"` prop reached the component.
 *   - <ViewportLocalityBadge> coexists with the chip when
 *     meta.effectiveLocality is also present — D10 lock: the two
 *     fields are NEVER collapsed.
 */
import React from 'react'
import { render } from '@testing-library/react-native'
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

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
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
})

import { MapScreen } from '@/features/map/screens/MapScreen'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('§DF-v2-j Task 11 — MapScreen mounts <LocationStatusLabel variant=chip>', () => {
  it('§LSL-Map — chip renders from inAreaResponse.locationContext with chip styling (radius=9999); coexists with ViewportLocalityBadge per D10', () => {
    const { getByTestId, getByText } = render(<MapScreen />, { wrapper })

    // 1. Chip is mounted.
    const label = getByTestId('location-status-label')
    expect(label).toBeTruthy()

    // 2. Chip styling proves the `variant="chip"` prop reached the
    //    component (borderRadius=9999 is the unique chip discriminator
    //    vs strip's borderRadius=0 — pinned in §LSL-10).
    const flatten = Array.isArray(label.props.style)
      ? Object.assign({}, ...label.props.style.filter(Boolean))
      : (label.props.style ?? {})
    expect(flatten.borderRadius).toBe(9999)
    expect(flatten.borderWidth).toBe(1)

    // 3. Copy derived from inAreaResponse.locationContext envelope.
    const city = getByTestId('location-status-city')
    expect(city.props.children).toBe('Huddersfield')

    // 4. D10 coexistence: ViewportLocalityBadge still renders alongside
    //    the chip when meta.effectiveLocality is present.  The two
    //    fields are SEMANTICALLY separate (user-context vs viewport-
    //    locality) and visually distinct.
    expect(getByText('Map centred near Huddersfield')).toBeTruthy()
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

    // Chip (the post-overlay location identity affordance) IS visible
    // — Map opened directly into the user's profile-bbox experience.
    expect(getByTestId('location-status-label')).toBeTruthy()
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
