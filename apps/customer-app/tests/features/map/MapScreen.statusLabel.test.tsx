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

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    location:          { lat: 53.6458, lng: -1.785, area: null, city: null },
    coords:            { lat: 53.6458, lng: -1.785 },
    status:            'granted',
    permission:        'denied', // saved-profile fallback (Tracks §DF-v2-i tightened invariant)
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
})
