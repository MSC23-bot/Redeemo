/**
 * §DF-v2-j Task 9 — HomeScreen integration pin for <LocationStatusLabel>.
 *
 * Spec: docs/superpowers/specs/2026-05-26-locationcontext-parity-design.md
 *   §8.1 (mount) + §9.3 (surface integration pin scope).
 * Plan: docs/superpowers/plans/2026-05-26-locationcontext-parity.md Task 9.
 *
 * Asserts:
 *   - <LocationStatusLabel variant='strip'> mounts on HomeScreen.
 *   - It reads from the same `feed.locationContext` envelope the surface
 *     already receives (no duplicate client-side derivation).
 *   - <SavedAreaHonestyHint> coexists with the label per D6 — both
 *     render when source='profile' + city resolves.  The label is NOT
 *     a replacement.
 */
import React from 'react'
import { render, within } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { HomeScreen } from '@/features/home/screens/HomeScreen'

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status:            'idle',
    location:          null,
    coords:            null,
    permission:        'denied',
    request:           jest.fn(),
    requestPermission: jest.fn(),
    openSettings:      jest.fn(),
  }),
}))

// Synthetic Home feed with `source='profile'` so D6 coexistence
// (label + honesty hint) is exercised.  The hint requires a resolvable
// areaName — locality.name OR city — so we ship Huddersfield in both
// fields to match a real saved-profile payload.
jest.mock('@/hooks/useHomeFeed', () => ({
  useHomeFeed: () => ({
    data: {
      locationContext: {
        source:   'profile',
        city:     'Huddersfield',
        locality: { id: 'l-huddersfield', name: 'Huddersfield' },
      },
      featured: [],
      trending: [],
      campaigns: [],
      nearbyByCategory: [],
      featuredBranches: [],
      trendingBranches: [],
      nearbyByCategoryBranches: [],
      featuredRail: { branches: [], meta: null },
      trendingRail: { branches: [], meta: null },
      popularRail:  { branches: [], meta: null },
      nearbyByCategoryRails: [],
    },
    isLoading: false,
    isError:   false,
    refetch:   jest.fn(),
  }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: { categories: [{ id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, parentId: null }] },
    isLoading: false,
  }),
}))

jest.mock('@/hooks/useMe', () => ({
  useMe: () => ({
    data: { firstName: 'Shebin', profileImageUrl: null },
  }),
}))

jest.mock('expo-router', () => ({
  useRouter:            () => ({ push: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect:       jest.fn(),
}))

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated/mock')
  return {
    ...actual,
    useReducedMotion: () => true,
  }
})

function wrapper({ children }: { children: React.ReactNode }) {
  const qc     = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const frame  = { x: 0, y: 0, width: 390, height: 844 } as const
  const insets = { top: 47, right: 0, bottom: 34, left: 0 } as const
  return React.createElement(
    SafeAreaProvider,
    { initialMetrics: { frame, insets } },
    React.createElement(QueryClientProvider, { client: qc }, children),
  )
}

describe('§DF-v2-j Task 9 + Task 13 Round 3 — HomeScreen mounts <LocationStatusLabel variant=strip> INSIDE HomeHeader', () => {
  it('§LSL-Home — strip label renders alongside SavedAreaHonestyHint (D6 coexistence) when source=profile', () => {
    const { getByTestId } = render(<HomeScreen />, { wrapper })
    // 1. Label is mounted.
    const label = getByTestId('location-status-label')
    expect(label).toBeTruthy()
    // 2. Label rendered the "Using profile location · Huddersfield" copy
    //    derived from feed.locationContext (no duplicate client-side
    //    derivation in HomeScreen — confirms the surface reads the
    //    envelope directly).
    const text = getByTestId('location-status-text')
    expect(text).toBeTruthy()
    const city = getByTestId('location-status-city')
    expect(city.props.children).toBe('Huddersfield')
    // 3. D6 coexistence: SavedAreaHonestyHint MUST also be mounted when
    //    source='profile' + city resolves.  The label is NOT a
    //    replacement; both surface different affordances.
    expect(getByTestId('saved-area-honesty-hint')).toBeTruthy()
  })

  // Round 3 device-QA regression pin — placement invariant.
  it('§LSL-Home-inside-header — label is rendered INSIDE <HomeHeader>, NOT as a standalone strip below it (Round 3 owner-locked product decision: label must sit at HomeHeader\'s GPS-row rhythm, not as a detached banner)', () => {
    const { getByTestId } = render(<HomeScreen />, { wrapper })
    // The HomeHeader root view carries `testID="home-header"`.  The
    // label MUST be a descendant of that root — proves the Round 3
    // placement (inside HomeHeader's left column, next to the
    // greeting) cannot drift back to the standalone strip mount that
    // shipped in Round 1+2.
    const header = getByTestId('home-header')
    const labelInsideHeader = within(header).getByTestId('location-status-label')
    expect(labelInsideHeader).toBeTruthy()
    // City emphasis still applied — flush variant doesn't strip the
    // typography contract from §LSL-2.
    const city = within(header).getByTestId('location-status-city')
    expect(city.props.children).toBe('Huddersfield')
  })
})
