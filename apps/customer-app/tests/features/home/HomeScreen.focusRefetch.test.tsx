/**
 * Phase 3C.1g Device-QA R1 Wave 6.6 (2026-05-31) — HomeScreen focus
 * refetch pin.
 *
 * Owner-reported symptom: "minutes" of stale Home rail hearts after
 * favourites mutated elsewhere.  Wave 6.4-C alone called
 * `invalidateQueries({ queryKey: ['discovery'] })` on focus — but
 * `invalidateQueries` only triggers refetch for ACTIVE observers.
 * If expo-router Tabs' focus/mount timing leaves the Home query in a
 * transient state where invalidate sees no active observer (e.g.
 * tab transition mid-flight), no refetch fires and the cache stays
 * stale indefinitely.
 *
 * Wave 6.6 belt-and-braces: also call `useHomeFeed().refetch()`
 * directly.  refetch() always fires regardless of observer state.
 * The invalidate still runs first so sibling discovery queries
 * (Map, Search, Category) also get refreshed.
 *
 * Pin: on focus, BOTH `invalidateQueries({ queryKey: ['discovery'] })`
 * AND `useHomeFeed.refetch()` fire.
 */

import React from 'react'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockInvalidateQueries = jest.fn()
const mockRefetch = jest.fn()

// expo-router mock — useFocusEffect fires synchronously on mount so
// the test can observe the focus-effect's invalidate + refetch calls.
jest.mock('expo-router', () => {
  const ReactInner = require('react') as typeof import('react')
  return {
    useRouter:            () => ({ push: jest.fn(), setParams: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => undefined | (() => void)) => {
      ReactInner.useEffect(() => cb(), [cb])
    },
  }
})

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query') as typeof import('@tanstack/react-query')
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
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
  useHomeFeed: () => ({ data: undefined, isLoading: false, refetch: mockRefetch }),
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
  mockInvalidateQueries.mockClear()
  mockRefetch.mockClear()
})

describe('HomeScreen — §W6.6 focus refetch', () => {
  it('fires invalidateQueries({ queryKey: [\'discovery\'] }) on focus', () => {
    render(<HomeScreen />, { wrapper: wrap })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['discovery'] })
  })

  it('§W6.6 — ALSO calls useHomeFeed.refetch() on focus (belt-and-braces for the stale-Home-heart minutes-long delay)', () => {
    render(<HomeScreen />, { wrapper: wrap })
    expect(mockRefetch).toHaveBeenCalled()
  })
})
