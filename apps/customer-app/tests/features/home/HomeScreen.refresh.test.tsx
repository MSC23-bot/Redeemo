import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { HomeScreen } from '@/features/home/screens/HomeScreen'
// IMPORTANT: do NOT mock RedeemoLoader here — the duplicate-loader assertion
// counts RedeemoLoader instances via UNSAFE_getAllByType (the removed
// above-header refreshBrand loader being gone is what makes the count 1).
import { RedeemoLoader } from '@/design-system/motion/RedeemoLoader'

// §HSH.1 — HomeScreen refresh behaviour: native RefreshControl props (iOS
// spinner hidden / Android branded), the branded wave-seam loader entering and
// exiting around the refetch, and no duplicate indicator.

const mockRefetch = jest.fn().mockResolvedValue(undefined)
const mockMediumHaptic = jest.fn()

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status:            'granted',
    location:          { lat: 51.5, lng: -0.1, area: 'Shoreditch', city: 'London' },
    requestPermission: jest.fn(),
  }),
}))

jest.mock('@/hooks/useHomeFeed', () => ({
  useHomeFeed: () => ({
    data: {
      locationContext: { city: 'London', source: 'coordinates' },
      campaigns:             [],
      featuredRail:          { branches: [], meta: null },
      trendingRail:          { branches: [], meta: null },
      popularRail:           { branches: [], meta: null },
      nearbyByCategoryRails: [],
    },
    isLoading: false,
    isError:   false,
    refetch:   mockRefetch,
  }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: {
      categories: [
        { id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, parentId: null },
      ],
    },
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

jest.mock('@/design-system/haptics', () => ({
  haptics: {
    touch:     { light: jest.fn(), medium: () => mockMediumHaptic() },
    success:   jest.fn(),
    warning:   jest.fn(),
    error:     jest.fn(),
    selection: jest.fn(),
  },
  lightHaptic:       jest.fn(),
  errorHaptic:       jest.fn(),
  successHaptic:     jest.fn(),
  setHapticsEnabled: jest.fn(),
}))

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

// The repo's reanimated jest mock stubs Animated.ScrollView as a plain View, so
// the `refreshControl` element is a PROP on that View (not a tree node). Read it
// off the props — it's the `<RefreshControl>` React element, so `.props` carries
// tintColor / colors / progressBackgroundColor / onRefresh.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRefreshControl(root: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node = root.findAll((n: any) => n.props && n.props.refreshControl != null)[0]
  return node.props.refreshControl
}

// onLayout does NOT fire in jest — fire it manually so HomeScreen measures
// headerHeight → seamY > 0 (the seam loader is guarded off until measured).
function measureHeader(getByTestId: (id: string) => unknown) {
  fireEvent(getByTestId('home-header') as never, 'layout', {
    nativeEvent: { layout: { height: 320, width: 390, x: 0, y: 0 } },
  })
}

beforeEach(() => {
  mockRefetch.mockReset().mockResolvedValue(undefined)
  mockMediumHaptic.mockReset()
})

describe('HomeScreen — §HSH.1 refresh', () => {
  it('RefreshControl: iOS spinner hidden (transparent); Android branded (colors + warm progress bg)', () => {
    const { UNSAFE_root } = render(<HomeScreen />, { wrapper })
    const rc = getRefreshControl(UNSAFE_root)
    expect(rc.props.tintColor).toBe('transparent')
    expect(rc.props.colors).toEqual([expect.any(String)])          // [color.brandRose]
    expect(typeof rc.props.progressBackgroundColor).toBe('string') // warm surface (color.surface.body)
    expect(typeof rc.props.onRefresh).toBe('function')
  })

  // AMENDMENT 1 — prove the refreshing state actually ENTERS and EXITS via the
  // observable seam loader, NOT by reading `refreshing` off a STALE RefreshControl
  // element captured before the state changed (that would falsely pass).
  it('refresh ENTERS and EXITS: seam loader appears while refetch is pending, disappears after it resolves (+ haptic + refetch)', async () => {
    let resolveRefetch!: () => void
    mockRefetch.mockImplementationOnce(() => new Promise<void>((r) => { resolveRefetch = () => r() }))

    const { UNSAFE_root, getByTestId, queryByTestId } = render(<HomeScreen />, { wrapper })
    measureHeader(getByTestId)                               // seamY > 0 so the loader may mount
    expect(queryByTestId('home-refresh-loader')).toBeNull()  // not refreshing yet

    getRefreshControl(UNSAFE_root).props.onRefresh()         // do NOT await — keep refetch pending
    expect(mockMediumHaptic).toHaveBeenCalledTimes(1)        // haptic fires synchronously, before the await
    expect(mockRefetch).toHaveBeenCalledTimes(1)

    // ENTER: loader visible while the refetch promise is pending.
    await waitFor(() => expect(getByTestId('home-refresh-loader')).toBeTruthy())

    // EXIT: resolve the refetch → refreshing clears → loader gone.
    resolveRefetch()
    await waitFor(() => expect(queryByTestId('home-refresh-loader')).toBeNull())
  })

  // AMENDMENT 4 — no fake historical testID. Assert exactly ONE RedeemoLoader
  // (the seam overlay) while refreshing; the removed above-header refreshBrand
  // loader being gone is what makes the count 1, not 2.
  it('no duplicate indicator: exactly ONE RedeemoLoader (the seam) while refreshing', async () => {
    let resolveRefetch!: () => void
    mockRefetch.mockImplementationOnce(() => new Promise<void>((r) => { resolveRefetch = () => r() }))

    const { UNSAFE_root, UNSAFE_getAllByType, getByTestId, queryByTestId } = render(<HomeScreen />, { wrapper })
    measureHeader(getByTestId)
    getRefreshControl(UNSAFE_root).props.onRefresh()

    await waitFor(() => expect(getByTestId('home-refresh-loader')).toBeTruthy())
    expect(UNSAFE_getAllByType(RedeemoLoader)).toHaveLength(1) // seam loader only; no above-header one

    // Drain the refetch so the trailing setRefreshing(false)/setDemoToken updates
    // flush inside act (no dangling state warning / cross-test bleed).
    resolveRefetch()
    await waitFor(() => expect(queryByTestId('home-refresh-loader')).toBeNull())
  })
})
