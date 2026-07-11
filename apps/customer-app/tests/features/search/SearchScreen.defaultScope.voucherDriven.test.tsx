// §CD v1 PR #125 device-QA follow-up (2026-05-22) — voucher-driven
// supply-aware default scope regression pins.
//
// Owner-flagged: "voucher-driven searches must obey the same default
// scope rule as the rest of Search.  For some voucher-title/description
// searches, the results appear correctly, but the default selected pill
// does not always start at the closest available bucket."
//
// Verification (backend probe `prisma/_probe-cd-supply-scope.ts`, run
// then deleted): the backend correctly classifies voucher-driven matches
// into rung counts identical to how name/tag/category matches are
// classified.  `branchMeta.nearbyCount` increments when the voucher-
// matched merchant has a nearby branch; `distantCount` increments for
// far ones; `scopeExpanded` cascades correctly.  No bug.
//
// These customer-app pins mirror the existing `SearchScreen.defaultScope`
// regression file but ALSO populate `matchContext` on the mocked tile —
// proving the customer-app's `effectiveScopeFromCounts` and priority
// derivation are blind to `matchContext` (they read only the three
// bucket counts + `scopeExpanded` + `requestedScope`).
//
// If a future change accidentally couples scope derivation to
// `matchContext` (e.g. routing voucher-driven matches through a
// different code path), these pins fail.

import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { makeBranchTile } from '../../fixtures/branchTile'

// Voucher-driven tile — matchContext populated with the locked
// `Found in "<title>" voucher` copy that backend `computeVoucherMatchContext`
// emits when voucher is the driving signal (§0.2 / §0.6).
// Prefix `mock` so the babel-jest jest.mock factory exemption applies.
const mockVoucherDrivenTile = makeBranchTile({
  id: 'brn_voucher_driven',
  merchant: {
    id: 'm_voucher_driven',
    businessName: 'Karaara',
    voucherCount: 1,
    maxEstimatedSaving: 5,
  },
  matchContext: 'Found in "Free Samosa with Any Chai" voucher',
})

const mockBaseMeta = {
  scope:            'city' as const,
  resolvedArea:     'Your city',
  scopeExpanded:    false,
  emptyStateReason: 'none' as const,
}

const mockState = {
  nearbyCount:  0,
  cityCount:    0,
  distantCount: 0,
  backendScope:  'city' as 'nearby' | 'city' | 'region' | 'platform',
  scopeExpanded: false,
}

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (_params: any, enabled: boolean) => {
    if (!enabled) return { data: undefined, isLoading: false }
    return {
      data: {
        branches:      [mockVoucherDrivenTile],
        totalBranches: 1,
        branchMeta: {
          ...mockBaseMeta,
          scope:         mockState.backendScope,
          scopeExpanded: mockState.scopeExpanded,
          nearbyCount:   mockState.nearbyCount,
          cityCount:     mockState.cityCount,
          distantCount:  mockState.distantCount,
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

// Active pill detection — copied from SearchScreen.defaultScope.test.tsx
// to keep the two files independent.  Probes the styled background colour
// (brand-rose #E20C04 — owner override of DESIGN.md navy per PR #112
// fixup-4) on the active wrapper.
function findActivePillLabel(tree: any): string | null {
  const ACTIVE_BG = '#E20C04'
  function walk(node: any): string | null {
    if (!node || typeof node !== 'object') return null
    const style = node.props?.style
    const flat = Array.isArray(style)
      ? Object.assign({}, ...style.filter(Boolean))
      : (style ?? {})
    if (flat.backgroundColor === ACTIVE_BG) {
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

describe('SearchScreen — voucher-driven supply-aware default scope (PR #125 device-QA)', () => {
  beforeEach(() => {
    mockState.nearbyCount   = 0
    mockState.cityCount     = 0
    mockState.distantCount  = 0
    mockState.backendScope  = 'city'
    mockState.scopeExpanded = false
  })

  it('Voucher title match with nearby supply → default pill is "Nearby"', async () => {
    // Mirrors the owner's first scenario.  Voucher-driven match (matchContext
    // populated) classifies into NEARBY rung.  nearbyCount=1, scopeExpanded=
    // false → supply-aware default → "Nearby".
    mockState.nearbyCount  = 1
    mockState.cityCount    = 0
    mockState.distantCount = 0
    mockState.backendScope = 'city'
    const { getByPlaceholderText, UNSAFE_root } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'samosa')
    await waitFor(() => {
      expect(findActivePillLabel(UNSAFE_root)).toBe('Nearby')
    })
  })

  it('Voucher description match with city but no nearby supply → default pill is "Your city"', async () => {
    // Mirrors the owner's second scenario.  Voucher-driven description
    // match (matchContext populated) on a merchant whose branch ranks
    // CATCHMENT or POST_TOWN.  cityCount=1, nearbyCount=0, scopeExpanded=
    // false (NEARBY+CITY cascade has supply in CITY) → "Your city".
    mockState.nearbyCount  = 0
    mockState.cityCount    = 1
    mockState.distantCount = 0
    mockState.backendScope = 'city'
    const { getByPlaceholderText, UNSAFE_root } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'qzplv discount')
    await waitFor(() => {
      expect(findActivePillLabel(UNSAFE_root)).toBe('Your city')
    })
  })

  it('Voucher match with only wider/platform supply → default pill is "More places"', async () => {
    // Mirrors the owner's third scenario.  Voucher-only match where the
    // matched merchant's branch ranks COUNTY / REGION / COUNTRY etc. —
    // far from user's effLoc.  nearbyCount=0, cityCount=0, distantCount=1,
    // scopeExpanded=true (cascade widened NEARBY+CITY → DISTANT to find
    // supply), backend resolvedScope='platform'.  Priority logic routes
    // through `effectiveScopeFromMetaCascadedScope('platform')` → "More
    // places".
    mockState.nearbyCount   = 0
    mockState.cityCount     = 0
    mockState.distantCount  = 1
    mockState.backendScope  = 'platform'
    mockState.scopeExpanded = true
    const { getByPlaceholderText, UNSAFE_root } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'samosa')
    await waitFor(() => {
      expect(findActivePillLabel(UNSAFE_root)).toBe('More places')
    })
  })

  it('User-tapped pill overrides the voucher-driven supply-aware default', async () => {
    // Mirrors the owner's fourth scenario.  Voucher match has nearby
    // supply (nearbyCount=1) → initial default is "Nearby".  User taps
    // "More places" → requestedScope='platform' → priority logic returns
    // it.  Pre-fixup-5 (PR #124) the supply-aware derivation ignored
    // requestedScope; this pin guards against that regression in the
    // voucher-driven case.
    mockState.nearbyCount  = 1
    mockState.cityCount    = 0
    mockState.distantCount = 5
    mockState.backendScope = 'city'

    const { getByPlaceholderText, UNSAFE_root } =
      render(<SearchScreen />, { wrapper })
    await typeAndSettle(getByPlaceholderText, 'samosa')

    // Initial state: nearbyCount=1 → "Nearby".
    await waitFor(() => {
      expect(findActivePillLabel(UNSAFE_root)).toBe('Nearby')
    })

    // Simulate user tapping "More places".
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
    // default — even though the matched tile is voucher-driven.
    await waitFor(() => {
      expect(findActivePillLabel(UNSAFE_root)).toBe('More places')
    })
  })
})
