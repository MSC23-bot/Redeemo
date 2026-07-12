// PR #124 fixup-3 (2026-05-22) — supply-aware default scope regression pins.
//
// Owner-locked rule:
//   "If Nearby has results, default to Nearby.
//    Else if Your city has results, default to Your city.
//    Else default to More places."
//
// Pre-fixup: `effectiveScope` was derived from `branchMeta.scope`.  When the
// backend's LOCAL/MIXED-intent default kept NEARBY+CITY tiers with
// `nearbyCount=1, cityCount=0`, scope='city' on the wire and the pill
// highlighted "Your city" even though all the supply was on the NEARBY rung.
//
// Post-fixup: `effectiveScopeFromCounts` reads RAW bucket counts and picks
// the narrowest scope where supply exists.  ScopePillRow renders the
// active-pill highlight from `selectedScope`; the locked branding rule is
// active = brand-rose (PR #112 fixup-4 owner override of DESIGN.md navy).
//
// The pin asserts the BRAND-ROSE active-pill colour appears at the correct
// position in the rendered tree — which is the same DOM signal the user sees.

import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { makeBranchTile } from '../../fixtures/branchTile'

const mockTile = makeBranchTile({
  id: 'brn1',
  merchant: { id: 'm1', businessName: 'Some Merchant', voucherCount: 1, maxEstimatedSaving: 5 },
})

const baseMeta = {
  scope:            'city' as const,
  resolvedArea:     'Your city',
  scopeExpanded:    false,
  emptyStateReason: 'none' as const,
}

const mockState = {
  nearbyCount:  0,
  cityCount:    0,
  distantCount: 0,
  backendScope: 'city' as 'nearby' | 'city' | 'region' | 'platform',
}

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (_params: any, enabled: boolean) => {
    if (!enabled) return { data: undefined, isLoading: false }
    return {
      data: {
        branches:      [mockTile],
        totalBranches: 1,
        branchMeta: {
          ...baseMeta,
          scope:        mockState.backendScope,
          nearbyCount:  mockState.nearbyCount,
          cityCount:    mockState.cityCount,
          distantCount: mockState.distantCount,
        },
      },
      isLoading: false,
    }
  },
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status: 'granted',
    location: { lat: 53.6458, lng: -1.785, area: null, city: null },
    requestPermission: jest.fn(),
  }),
}))

// Map Phase 2 S5a (D2) — SearchScreen now mounts a FilterSheet, which
// calls useCategories() + useEligibleAmenities() internally. Mocked here
// so these tests don't trigger real network fetches (none of them
// exercise the FilterSheet itself; see SearchScreen.filterSheet.test.tsx
// for that coverage).
jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({ data: { categories: [] } }),
}))

jest.mock('@/hooks/useEligibleAmenities', () => ({
  useEligibleAmenities: () => ({ data: { amenities: [] }, isLoading: false }),
}))

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  useRouter:            () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

import { SearchScreen } from '@/features/search/screens/SearchScreen'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const frame  = { x: 0, y: 0, width: 390, height: 844 } as const
  const insets = { top: 47, right: 0, bottom: 34, left: 0 } as const
  return React.createElement(
    SafeAreaProvider,
    { initialMetrics: { frame, insets } },
    React.createElement(QueryClientProvider, { client: qc }, children),
  )
}

async function typeAndSettle(getByPlaceholderText: any, term: string) {
  jest.useFakeTimers()
  fireEvent.changeText(getByPlaceholderText('Search merchants...'), term)
  await act(async () => { jest.advanceTimersByTime(300) })
  jest.useRealTimers()
}

/**
 * Find the active-pill label in the rendered tree.  ScopePillRow renders
 * one of the three labels ('Nearby' / 'Your city' / 'More places') with
 * the active styling (brand-rose `#E20C04` background).  We probe the
 * styled background colour on the active wrapper to disambiguate.
 */
function findActivePillLabel(tree: any): string | null {
  const ACTIVE_BG = '#E20C04'
  function walk(node: any): string | null {
    if (!node || typeof node !== 'object') return null
    const style = node.props?.style
    const flat = Array.isArray(style)
      ? Object.assign({}, ...style.filter(Boolean))
      : (style ?? {})
    if (flat.backgroundColor === ACTIVE_BG) {
      // Walk descendants for a Text node carrying the label.
      const children = Array.isArray(node.children) ? node.children : []
      for (const c of children) {
        if (typeof c === 'object' && c?.type) {
          const txt = extractText(c)
          if (txt) return txt
        }
      }
    }
    const children = Array.isArray(node.children) ? node.children : []
    for (const c of children) {
      const found = walk(c)
      if (found) return found
    }
    return null
  }
  function extractText(node: any): string | null {
    if (typeof node === 'string') return node
    if (!node?.children) return null
    const kids = Array.isArray(node.children) ? node.children : [node.children]
    for (const k of kids) {
      if (typeof k === 'string') return k
      const r = extractText(k)
      if (r) return r
    }
    return null
  }
  return walk(tree)
}

describe('SearchScreen — supply-aware default scope (PR #124 fixup-3)', () => {
  beforeEach(() => {
    mockState.nearbyCount  = 0
    mockState.cityCount    = 0
    mockState.distantCount = 0
    mockState.backendScope = 'city'
  })

  it('Nearby has results → "Nearby" is the default active pill (even if backend resolvedScope=city)', async () => {
    // Mirrors the device-observed bug: q=Indian, nearbyCount=1, but
    // backend resolved scope='city' because LOCAL intent kept NEARBY+CITY.
    // Pre-fixup the pill highlighted "Your city"; post-fixup it must
    // highlight "Nearby" because all supply is on the NEARBY rung.
    mockState.nearbyCount  = 1
    mockState.cityCount    = 0
    mockState.distantCount = 3
    mockState.backendScope = 'city'
    const { getByPlaceholderText, UNSAFE_root } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'Indian')
    await waitFor(() => {
      expect(findActivePillLabel(UNSAFE_root)).toBe('Nearby')
    })
  })

  it('Only city has results → "Your city" is the default active pill', async () => {
    mockState.nearbyCount  = 0
    mockState.cityCount    = 2
    mockState.distantCount = 5
    mockState.backendScope = 'city'
    const { getByPlaceholderText, UNSAFE_root } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'somequery')
    await waitFor(() => {
      expect(findActivePillLabel(UNSAFE_root)).toBe('Your city')
    })
  })

  it('Only distant has results → "More places" is the default active pill', async () => {
    mockState.nearbyCount  = 0
    mockState.cityCount    = 0
    mockState.distantCount = 14
    mockState.backendScope = 'platform'
    const { getByPlaceholderText, UNSAFE_root } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'somequery')
    await waitFor(() => {
      expect(findActivePillLabel(UNSAFE_root)).toBe('More places')
    })
  })

  it('User tapping a pill updates the active visual state immediately (PR #124 fixup-5 blocker 2)', async () => {
    // Pre-fixup-5: my fixup-3 supply-aware derivation IGNORED
    // `requestedScope`.  When the user tapped "Your city" or "More places"
    // on a query with Nearby supply, the result list changed but the red
    // selected pill stayed on "Nearby" — owner-flagged as "feels
    // unresponsive/confusing".
    //
    // Post-fixup-5 derivation:
    //   scopeExpanded → backend resolvedScope (cascade case)
    //   requestedScope set → user tap wins
    //   else                → supply-aware narrowest-with-supply default
    mockState.nearbyCount  = 1
    mockState.cityCount    = 0
    mockState.distantCount = 5
    mockState.backendScope = 'city'  // backend retained NEARBY+CITY tiers

    const { getByPlaceholderText, UNSAFE_root } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'somequery')

    // Initial state: supply-aware default → "Nearby" (nearbyCount=1).
    await waitFor(() => {
      expect(findActivePillLabel(UNSAFE_root)).toBe('Nearby')
    })

    // Simulate user tapping "More places" — find the pill by accessibility
    // label (matches `Filter to More places, N merchants`).  Walk all pills
    // and pick the one whose label starts with the More places prefix.
    const allPills = UNSAFE_root.findAll((n: any) =>
      typeof n.props?.accessibilityLabel === 'string' &&
      n.props.accessibilityLabel.startsWith('Filter to ')
    )
    const platformPill = allPills.find((p: any) =>
      p.props.accessibilityLabel.startsWith('Filter to More places'),
    )
    expect(platformPill).toBeTruthy()
    await act(async () => {
      platformPill.props.onPress()
    })

    // Active pill MUST now reflect the user's tap, not the supply-aware
    // default.  Pre-fixup-5 this assertion failed — "Nearby" stayed
    // selected.
    await waitFor(() => {
      expect(findActivePillLabel(UNSAFE_root)).toBe('More places')
    })
  })
})
