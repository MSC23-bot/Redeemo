/**
 * Phase 3C.1g Device-QA R1 (2026-05-30) — HomeScreen scroll-reset
 * after Favourites empty-state CTA.
 *
 * Owner-reported finding #7: "Discover merchants" CTA on an empty
 * Favourites tab should land the user on Home at the TOP of the feed.
 * The previous behaviour restored Home's prior scroll position.
 *
 * Fix: FavouritesScreen pushes `/(app)/?scrollTop=1`; HomeScreen reads
 * the marker via `useLocalSearchParams` and on `useFocusEffect` scrolls
 * its ScrollView to y:0 + scrubs the param via `router.setParams`.
 *
 * Pins (negative + positive):
 *   1. `?scrollTop=1` → `router.setParams({ scrollTop: undefined })` fires.
 *   2. No `scrollTop` param → `setParams` is NOT called (no-op branch).
 */

import React from 'react'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── mocks ────────────────────────────────────────────────────────────

const mockSetParams = jest.fn()
const mockUseLocalSearchParams = jest.fn<{ scrollTop?: string }, []>()

jest.mock('expo-router', () => {
  // Inline `require('react')` keeps the mock factory free of out-of-scope
  // identifiers per jest's hoist-safety rule.
  const ReactInner = require('react') as typeof import('react')
  return {
    useRouter:            () => ({ push: jest.fn(), setParams: mockSetParams }),
    useLocalSearchParams: () => mockUseLocalSearchParams(),
    // Synchronously invoke the focus-effect callback once on render so
    // the test exercises the same code path that fires when the screen
    // gains focus on-device.
    useFocusEffect: (cb: () => undefined | (() => void)) => {
      ReactInner.useEffect(() => cb(), [cb])
    },
  }
})

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({ location: null }),
}))
jest.mock('@/hooks/useMe', () => ({
  useMe: () => ({ data: null }),
}))
jest.mock('@/hooks/useHomeFeed', () => ({
  useHomeFeed: () => ({ data: undefined, isLoading: false, refetch: jest.fn() }),
}))
jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({ data: undefined }),
}))

import { HomeScreen } from '@/features/home/screens/HomeScreen'

function wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  mockSetParams.mockReset()
  mockUseLocalSearchParams.mockReset()
})

describe('HomeScreen — Device-QA R1 scroll-reset on `?scrollTop=1`', () => {
  it('scrubs the scrollTop param when present (Favourites empty-state CTA land)', () => {
    mockUseLocalSearchParams.mockReturnValue({ scrollTop: '1' })
    render(<HomeScreen />, { wrapper: wrap })
    expect(mockSetParams).toHaveBeenCalledWith({ scrollTop: undefined })
  })

  it('does NOT touch params when no scrollTop marker is set (tab-bar focus, deep-link, cold-start)', () => {
    mockUseLocalSearchParams.mockReturnValue({})
    render(<HomeScreen />, { wrapper: wrap })
    expect(mockSetParams).not.toHaveBeenCalled()
  })
})
