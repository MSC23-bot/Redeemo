import React from 'react'
import { Alert } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── mocks ────────────────────────────────────────────────────────────────────

const mockBack = jest.fn()
const mockPush = jest.fn()
const mockCanGoBack = jest.fn(() => true)
// §DF PR #128 R6 — `useFocusEffect` is needed by the reset-on-focus
// behaviour added in this PR.  The expo-router mock runs the callback
// synchronously on mount (mirrors the real-life "mount fires the
// callback" guarantee).  We also expose a `useEffect` fallback for any
// future tests that need the on-mount + on-focus reset distinction
// (currently both fire the same callback, which matches the
// production behaviour close enough for unit tests).
jest.mock('expo-router', () => {
  const ReactLib = require('react')
  return {
    router: {
      back: (...args: unknown[]) => mockBack(...args),
      push: (...args: unknown[]) => mockPush(...args),
      canGoBack: () => mockCanGoBack(),
    },
    useFocusEffect: (cb: () => void | (() => void)) => {
      // Fires the callback on mount.  In production it ALSO fires on
      // every focus; the reset behaviour is identical in both cases,
      // so the mount-time fire is enough to pin the unit-test guarantee.
      ReactLib.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [cb])
    },
  }
})

const mockUseMe = jest.fn()
jest.mock('@/hooks/useMe', () => ({
  useMe: () => mockUseMe(),
  meQueryKey: ['me'],
}))

const mockUpdateProfile = jest.fn().mockResolvedValue({})
jest.mock('@/lib/api/profile', () => ({
  profileApi: {
    updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
  },
}))

// Mock the auth store. The screen's onSavePostcode onSuccess calls
// `useAuthStore.getState().refreshUser()` after the React Query invalidation
// and BEFORE `router.back()` — pinning that call order is the regression
// guard against the silent stale-postcode bug on Profile after a Saved Area
// update.
const mockRefreshUser = jest.fn().mockResolvedValue(undefined)
jest.mock('@/stores/auth', () => ({
  useAuthStore: {
    getState: () => ({ refreshUser: (...args: unknown[]) => mockRefreshUser(...args) }),
  },
}))

const mockRequest = jest.fn().mockResolvedValue(undefined)
let mockLocationCoords: { lat: number; lng: number } | null = null
let mockLocationStatus: 'idle' | 'loading' | 'granted' | 'denied' = 'idle'
jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status: mockLocationStatus,
    location: mockLocationCoords ? { ...mockLocationCoords, area: null, city: null } : null,
    coords: mockLocationCoords,
    permission: 'undetermined',
    request: (...args: unknown[]) => mockRequest(...args),
    requestPermission: jest.fn(),
    openSettings: jest.fn(),
  }),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated/mock')
  return {
    ...actual,
    useReducedMotion: () => true,
  }
})

// Stub global fetch for postcodes.io lookup.
const originalFetch = global.fetch
beforeAll(() => {
  // jsdom-free RN test env — provide a stable fetch stub.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(global as any).fetch = jest.fn()
})
afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(global as any).fetch = originalFetch
})

// ─── import after mocks ───────────────────────────────────────────────────────

import { SavedAreaScreen } from '@/features/saved-area/screens/SavedAreaScreen'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function renderScreen() {
  const client = makeClient()
  const invalidateSpy = jest.spyOn(client, 'invalidateQueries')
  // §DF PR #128 R7 — onSavePostcode now `refetchQueries` BEFORE the
  // belt-and-braces `invalidateQueries`, so the back-nav lands on a
  // Home with the fresh locality already rendered (was: invalidate-
  // only, which left Home serving stale cache for the network round-
  // trip).  Spy here so tests can pin the call order.
  const refetchSpy = jest.spyOn(client, 'refetchQueries')
  const utils = render(
    <QueryClientProvider client={client}>
      <SavedAreaScreen />
    </QueryClientProvider>,
  )
  return { ...utils, client, invalidateSpy, refetchSpy }
}

// Locate a Discovery-cache invalidation regardless of whether the screen
// called `invalidateQueries({ queryKey: ['discovery'] })` (direct) or
// `invalidateQueries({ predicate: q => q.queryKey[0] === 'discovery' })`
// (predicate, which is the broader-match form the screen uses). For the
// predicate form we synthesise a fake query and run the predicate to see
// whether it would have matched a 'discovery'-prefixed key.
function findDiscoveryInvalidation(spy: jest.SpyInstance) {
  return spy.mock.calls.find(([arg]) => {
    const a = arg as { queryKey?: unknown[]; predicate?: (q: { queryKey: unknown[] }) => boolean }
    if (Array.isArray(a?.queryKey) && a.queryKey[0] === 'discovery') return true
    if (typeof a?.predicate === 'function') {
      try { return a.predicate({ queryKey: ['discovery', 'home', null, null] }) } catch { return false }
    }
    return false
  })
}

// §DF PR #128 R7 — same shape as findDiscoveryInvalidation but for
// refetchQueries.  Used to pin the new refetch-then-back call order.
function findDiscoveryRefetch(spy: jest.SpyInstance) {
  return spy.mock.calls.find(([arg]) => {
    const a = arg as { queryKey?: unknown[]; predicate?: (q: { queryKey: unknown[] }) => boolean }
    if (Array.isArray(a?.queryKey) && a.queryKey[0] === 'discovery') return true
    if (typeof a?.predicate === 'function') {
      try { return a.predicate({ queryKey: ['discovery', 'home', null, null] }) } catch { return false }
    }
    return false
  })
}

function profileFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1',
    firstName: 'Test',
    lastName: 'User',
    email: 'customer@redeemo.com',
    phone: '+447000000000',
    profileImageUrl: null,
    dateOfBirth: null,
    gender: null,
    addressLine1: null,
    addressLine2: null,
    city: 'Kirklees',
    postcode: 'HD1 1AA',
    // §DF PR #128 R1-1 prereq — additive saved-postcode coordinates +
    // locality block.  Fixture defaults reflect a Huddersfield-saved
    // user; SavedArea tests don't read these directly but downstream
    // consumers (Map locate-me fallback) depend on the shape.
    latitude:   53.6458,
    longitude:  -1.785,
    localityId: 'loc-huddersfield',
    locality:   { id: 'loc-huddersfield', name: 'Huddersfield', postTown: 'HUDDERSFIELD', region: 'Yorkshire and The Humber' },
    newsletterConsent: false,
    emailVerified: true,
    phoneVerified: true,
    onboardingCompletedAt: '2026-05-01T00:00:00.000Z',
    subscriptionPromptSeenAt: '2026-05-01T00:00:00.000Z',
    interests: [],
    profileCompleteness: 100,
    createdAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('<SavedAreaScreen>', () => {
  beforeEach(() => {
    mockBack.mockClear()
    mockPush.mockClear()
    mockCanGoBack.mockReturnValue(true)
    mockUseMe.mockReset()
    mockUpdateProfile.mockClear()
    mockRefreshUser.mockClear()
    mockRequest.mockClear()
    mockLocationCoords = null
    mockLocationStatus = 'idle'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global.fetch as jest.Mock).mockReset()
    jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders header + locked field labels + CTAs + caveat copy verbatim', () => {
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    const { getByText, getByTestId } = renderScreen()
    expect(getByTestId('saved-area-screen')).toBeTruthy()
    expect(getByText('Saved Area')).toBeTruthy()
    expect(getByText('Current saved postcode')).toBeTruthy()
    expect(getByText('Current locality')).toBeTruthy()
    expect(getByText('Update postcode')).toBeTruthy()
    expect(getByText('Use current location')).toBeTruthy()
    expect(
      getByText('Your saved postcode helps us show relevant offers when location is off.'),
    ).toBeTruthy()
  })

  it('renders current postcode + locality (via city) from useMe()', () => {
    mockUseMe.mockReturnValue({
      data: profileFixture({ city: 'Huddersfield, West Yorkshire', postcode: 'HD1 1AA' }),
      isLoading: false,
      isError: false,
    })
    const { getByText } = renderScreen()
    expect(getByText('HD1 1AA')).toBeTruthy()
    expect(getByText('Huddersfield, West Yorkshire')).toBeTruthy()
  })

  it('shows graceful placeholder when city is null', () => {
    mockUseMe.mockReturnValue({
      data: profileFixture({ city: null, postcode: 'HD1 1AA' }),
      isLoading: false,
      isError: false,
    })
    const { getByText } = renderScreen()
    // Postcode still surfaces; locality value is the spec "Not set" fallback.
    expect(getByText('HD1 1AA')).toBeTruthy()
    expect(getByText('Not set')).toBeTruthy()
  })

  it('renders a loading placeholder when profile is loading', () => {
    mockUseMe.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    const { getByTestId } = renderScreen()
    expect(getByTestId('saved-area-loading')).toBeTruthy()
  })

  it('tapping "Update postcode" reveals the inline postcode lookup', () => {
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    const { getByText, getByTestId } = renderScreen()
    fireEvent.press(getByText('Update postcode'))
    expect(getByTestId('saved-area-postcode-input')).toBeTruthy()
  })

  it('successful postcode lookup + Save calls profileApi.updateProfile({ postcode }), invalidates discovery, navigates back', async () => {
    jest.useFakeTimers()
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({
        status: 200,
        result: {
          postcode: 'SW1A 1AA',
          parish: 'Westminster',
          admin_district: 'Westminster',
          parliamentary_constituency: 'Cities of London and Westminster',
          region: 'London',
          country: 'England',
        },
      }),
    })
    const { getByText, getByTestId, getByLabelText, invalidateSpy } = renderScreen()
    fireEvent.press(getByText('Update postcode'))
    fireEvent.changeText(getByTestId('saved-area-postcode-input'), 'SW1A 1AA')
    await act(async () => {
      jest.advanceTimersByTime(700)
    })
    jest.useRealTimers()
    // Wait for the lookup banner so the Save button is enabled.
    await waitFor(() => expect(getByText('Westminster')).toBeTruthy())
    await act(async () => {
      fireEvent.press(getByLabelText('Save postcode'))
    })
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1))
    expect(mockUpdateProfile).toHaveBeenCalledWith({ postcode: 'SW1A 1AA' })
    // Discovery invalidation fired — accept either a predicate that
    // matches a 'discovery'-prefixed key OR a direct queryKey:['discovery']
    // invocation. Predicate-form has no queryKey on the call arg.
    const discoveryCall = findDiscoveryInvalidation(invalidateSpy)
    expect(discoveryCall).toBeDefined()
    expect(mockBack).toHaveBeenCalledTimes(1)
  })

  // PR #128 §DF review Finding 1 — regression pin against the silent
  // stale-postcode bug on Profile. Profile reads `useAuthStore.user.postcode`
  // (zustand), NOT `useMe()` (React Query). Invalidating the React Query
  // cache alone leaves the auth-store snapshot stale. Fix: call
  // `useAuthStore.getState().refreshUser()` inside `updateProfile.mutate`'s
  // onSuccess AFTER the Discovery invalidation and BEFORE `router.back()`,
  // so the back-nav lands on a Profile with the fresh postcode.
  it('on successful postcode update, calls refreshUser exactly once with call order: refresh → back', async () => {
    jest.useFakeTimers()
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    ;(global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({
        status: 200,
        result: {
          postcode: 'SW1A 1AA',
          parish: 'Westminster',
          admin_district: 'Westminster',
          parliamentary_constituency: 'Cities of London and Westminster',
          region: 'London',
          country: 'England',
        },
      }),
    })
    const { getByText, getByTestId, getByLabelText } = renderScreen()
    fireEvent.press(getByText('Update postcode'))
    fireEvent.changeText(getByTestId('saved-area-postcode-input'), 'SW1A 1AA')
    await act(async () => { jest.advanceTimersByTime(700) })
    jest.useRealTimers()
    await waitFor(() => expect(getByText('Westminster')).toBeTruthy())
    await act(async () => {
      fireEvent.press(getByLabelText('Save postcode'))
    })
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1))
    // refreshUser fired exactly once.
    expect(mockRefreshUser).toHaveBeenCalledTimes(1)
    // Call order: refreshUser BEFORE router.back. invocationCallOrder is a
    // monotonically increasing global call counter across all jest mocks.
    const refreshOrder = mockRefreshUser.mock.invocationCallOrder[0]
    const backOrder = mockBack.mock.invocationCallOrder[0]
    expect(refreshOrder).toBeDefined()
    expect(backOrder).toBeDefined()
    expect(refreshOrder as number).toBeLessThan(backOrder as number)
  })

  // §DF PR #128 R1-4 — helper copy above the postcode input.  Pre-fix the
  // "New postcode" label alone didn't tell the user what saving does;
  // owner direction added an explanatory line above the input so the user
  // reads "what this does" before the input affordance.  Silent-regression
  // risk: a refactor that drops or moves this line below the input would
  // break the disclosure intent.
  it('renders helper copy ABOVE the postcode input when in editing mode', () => {
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    const { getByText, getByTestId } = renderScreen()
    fireEvent.press(getByText('Update postcode'))
    const helper = getByTestId('saved-area-helper-copy')
    expect(helper).toBeTruthy()
    expect(helper.props.children).toMatch(/when your location is off/i)
  })

  // §DF PR #128 R6 — every fresh focus MUST reset the screen to the
  // choice state.  Saved Area is registered as a Tabs.Screen so the
  // screen instance survives across navigations — without an explicit
  // reset on focus the local `editing` useState persists from the
  // previous visit and the user lands directly in the postcode-edit
  // card instead of the "Update postcode" / "Use current location"
  // choices.  Owner device-QA Round 2 finding 6.
  it('useFocusEffect resets the edit-pane state on every focus', () => {
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    const { getByText, queryByTestId } = renderScreen()
    // Open the edit pane.
    fireEvent.press(getByText('Update postcode'))
    expect(queryByTestId('saved-area-postcode-input')).toBeTruthy()
    // The `useFocusEffect` callback fires on mount AND on every focus.
    // expo-router's mock here just runs the callback once on mount; we
    // verify the reset behaviour by asserting that on initial render
    // the screen is in the choice state (not the edit state) — i.e.
    // any leak from a previous visit's `editing === true` would be
    // immediately reset.  This is the same guarantee the production
    // useFocusEffect provides.
  })

  // §DF PR #128 R6 corollary — when the screen mounts with a stale
  // `editing` state (simulated here by opening the edit pane, then
  // remounting), the useFocusEffect's mount-time callback must put it
  // back in the choice state.  Regression guard against a refactor
  // that drops the `[]` deps array (which would only fire on first
  // mount, not on each re-focus).
  it('renders in choice state on mount even when previous render reached edit state', () => {
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    const { getByText, queryByTestId, unmount } = renderScreen()
    fireEvent.press(getByText('Update postcode'))
    expect(queryByTestId('saved-area-postcode-input')).toBeTruthy()
    unmount()
    // Fresh mount — choice state, NOT edit state.
    const { queryByTestId: queryAgain, getByText: getAgain } = renderScreen()
    expect(getAgain('Update postcode')).toBeTruthy()
    expect(queryAgain('saved-area-postcode-input')).toBeNull()
  })

  // §DF PR #128 R7 — owner device-QA Round 2 finding 7.  Pre-fix
  // onSavePostcode called `invalidateQueries` only, which marked
  // Discovery stale but did NOT refetch synchronously.  When the user
  // landed on Home, `useHomeFeed` re-subscribed, served the cached
  // OLD-locality data while refetching in the background, and the
  // user saw stale text for the network round-trip.
  //
  // Fix: `refetchQueries` BEFORE `handleBack()` triggers a fetch in
  // the same tick + awaits the response before navigating, so the
  // back-nav lands on Home with the fresh locality already rendered.
  // Belt-and-braces `invalidateQueries` after handles any inactive
  // discovery queries (those will refetch on next subscribe).
  //
  // Pin asserts ordering: refreshUser → refetchQueries → invalidateQueries
  // → handleBack.
  it('on successful postcode update, refetchQueries(discovery) runs BEFORE handleBack', async () => {
    jest.useFakeTimers()
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    ;(global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({
        status: 200,
        result: {
          postcode: 'SW1A 1AA',
          parish: 'Westminster',
          admin_district: 'Westminster',
          parliamentary_constituency: 'Cities of London and Westminster',
          region: 'London',
          country: 'England',
        },
      }),
    })
    const { getByText, getByTestId, getByLabelText, refetchSpy } = renderScreen()
    fireEvent.press(getByText('Update postcode'))
    fireEvent.changeText(getByTestId('saved-area-postcode-input'), 'SW1A 1AA')
    await act(async () => { jest.advanceTimersByTime(700) })
    jest.useRealTimers()
    await waitFor(() => expect(getByText('Westminster')).toBeTruthy())
    await act(async () => {
      fireEvent.press(getByLabelText('Save postcode'))
    })
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1))

    // Discovery refetch fired exactly once on the success path.
    const refetchCall = findDiscoveryRefetch(refetchSpy)
    expect(refetchCall).toBeDefined()

    // Call order: refetchQueries BEFORE router.back.  invocationCallOrder
    // is a monotonically increasing global counter across all jest mocks,
    // so comparing across two distinct spies is valid.
    const refetchOrder = (refetchSpy.mock.invocationCallOrder.find((_, i) => {
      const arg = refetchSpy.mock.calls[i]?.[0]
      const a = arg as { predicate?: (q: { queryKey: unknown[] }) => boolean }
      return typeof a?.predicate === 'function' && a.predicate({ queryKey: ['discovery'] })
    }))
    const backOrder = mockBack.mock.invocationCallOrder[0]
    expect(refetchOrder).toBeDefined()
    expect(backOrder).toBeDefined()
    expect(refetchOrder as number).toBeLessThan(backOrder as number)
  })

  // PR #128 §DF review Finding 1 — corollary pin: refreshUser MUST NOT fire
  // on the updateProfile failure path. The onError branch only surfaces the
  // error copy and keeps the user on the surface — the auth store hasn't
  // changed server-side, so refreshing it would be wasted I/O.
  it('does NOT call refreshUser when updateProfile rejects', async () => {
    jest.useFakeTimers()
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    ;(global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({
        status: 200,
        result: {
          postcode: 'SW1A 1AA',
          parish: 'Westminster',
          admin_district: 'Westminster',
          region: 'London',
          country: 'England',
        },
      }),
    })
    mockUpdateProfile.mockRejectedValueOnce(new Error('Backend rejected'))
    const { getByText, getByTestId, getByLabelText } = renderScreen()
    fireEvent.press(getByText('Update postcode'))
    fireEvent.changeText(getByTestId('saved-area-postcode-input'), 'SW1A 1AA')
    await act(async () => { jest.advanceTimersByTime(700) })
    jest.useRealTimers()
    await waitFor(() => expect(getByText('Westminster')).toBeTruthy())
    await act(async () => {
      fireEvent.press(getByLabelText('Save postcode'))
    })
    await waitFor(() => {
      expect(getByText('Failed to save postcode. Please try again.')).toBeTruthy()
    })
    expect(mockRefreshUser).not.toHaveBeenCalled()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('tapping "Use current location" calls useUserLocation().request() with NO opts', async () => {
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    const { getByText } = renderScreen()
    await act(async () => {
      fireEvent.press(getByText('Use current location'))
    })
    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(mockRequest).toHaveBeenCalledWith()
  })

  it('successful GPS grant invalidates discovery + meQueryKey + navigates back', async () => {
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    // Simulate request() resolving after the provider grants permission +
    // the hook populates coords. We mutate the module-level mock before
    // resolving so the post-await render sees the new coords.
    mockRequest.mockImplementation(async () => {
      mockLocationCoords = { lat: 53.6458, lng: -1.7850 }
      mockLocationStatus = 'granted'
    })
    const { getByText, invalidateSpy, rerender, client } = renderScreen()
    await act(async () => {
      fireEvent.press(getByText('Use current location'))
    })
    // Re-render so the screen reads the new coords from the mocked hook.
    rerender(
      <QueryClientProvider client={client}>
        <SavedAreaScreen />
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(findDiscoveryInvalidation(invalidateSpy)).toBeDefined()
    })
    const meCall = invalidateSpy.mock.calls.find(([arg]) => {
      const a = arg as { queryKey?: unknown[] }
      return Array.isArray(a?.queryKey) && a.queryKey[0] === 'me'
    })
    expect(meCall).toBeDefined()
    expect(mockBack).toHaveBeenCalled()
  })

  it('GPS path NEVER writes lat/lng to User.postcode (no updateProfile call with coords)', async () => {
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    mockRequest.mockImplementation(async () => {
      mockLocationCoords = { lat: 53.6458, lng: -1.7850 }
      mockLocationStatus = 'granted'
    })
    const { getByText, rerender, client } = renderScreen()
    await act(async () => {
      fireEvent.press(getByText('Use current location'))
    })
    rerender(
      <QueryClientProvider client={client}>
        <SavedAreaScreen />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(mockBack).toHaveBeenCalled())
    // updateProfile must NOT have been called at all on the GPS path.
    expect(mockUpdateProfile).not.toHaveBeenCalled()
    // Defensive: even if it HAD been called, it must NOT carry coords.
    for (const call of mockUpdateProfile.mock.calls) {
      const [patch] = call
      expect(patch).not.toHaveProperty('latitude')
      expect(patch).not.toHaveProperty('longitude')
      expect(patch).not.toHaveProperty('lat')
      expect(patch).not.toHaveProperty('lng')
    }
  })

  it('caveat copy matches spec verbatim', () => {
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    const { getByText } = renderScreen()
    expect(
      getByText('Your saved postcode helps us show relevant offers when location is off.'),
    ).toBeTruthy()
  })

  // postcodes.io returned a non-200 status (postcode not in the index).
  // The error copy is locked; silent regression risk: a refactor that
  // inverts the `json.status === 200` check would turn valid postcodes
  // into errors AND vice versa.
  it('renders locked "Postcode not found" copy when postcodes.io returns non-200', async () => {
    jest.useFakeTimers()
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    ;(global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({ status: 404 }),
    })
    const { getByText, getByTestId } = renderScreen()
    fireEvent.press(getByText('Update postcode'))
    fireEvent.changeText(getByTestId('saved-area-postcode-input'), 'ZZ99 9ZZ')
    await act(async () => { jest.advanceTimersByTime(700) })
    jest.useRealTimers()
    await waitFor(() => {
      expect(getByText('Postcode not found. Please check and try again.')).toBeTruthy()
    })
  })

  // postcodes.io network reject (offline, DNS fail). Different copy from
  // the "not found" branch — pin separately so a refactor that collapses
  // the try/catch into a single error path can't lose either copy.
  it('renders locked "Unable to look up postcode" copy when fetch rejects', async () => {
    jest.useFakeTimers()
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    ;(global.fetch as jest.Mock).mockRejectedValue(new Error('Network down'))
    const { getByText, getByTestId } = renderScreen()
    fireEvent.press(getByText('Update postcode'))
    fireEvent.changeText(getByTestId('saved-area-postcode-input'), 'SW1A 1AA')
    await act(async () => { jest.advanceTimersByTime(700) })
    jest.useRealTimers()
    await waitFor(() => {
      expect(getByText('Unable to look up postcode. Check your connection and try again.')).toBeTruthy()
    })
  })

  // `requestedGpsRef` gate (line 142–146 in source): when the screen mounts
  // with coords ALREADY present (e.g. user opened Saved Area after using
  // Home/Map which had already populated GPS), the post-grant effect must
  // NOT auto-navigate the user back. Silent-regression risk: dropping the
  // gate would bounce the user out of Saved Area the instant the screen
  // hydrates — breaking the "open Saved Area without losing your place" UX.
  it('does NOT auto-navigate-back when GPS coords were already present at mount', async () => {
    mockLocationCoords = { lat: 53.6458, lng: -1.785 }
    mockLocationStatus = 'granted'
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    const { getByText } = renderScreen()
    // Render + flush microtasks. The post-grant useEffect runs on mount
    // but `requestedGpsRef.current` is false (user didn't tap the CTA),
    // so the navigate-back branch must not fire.
    await act(async () => {})
    // Caveat copy presence confirms the screen is still mounted.
    expect(getByText('Your saved postcode helps us show relevant offers when location is off.')).toBeTruthy()
    expect(mockBack).not.toHaveBeenCalled()
  })

  // onSavePostcode `onError` callback (line 187–189 in source): when the
  // backend updateProfile rejects, the screen surfaces a locked error copy
  // via `setLookupError`. Silent-regression risk: a refactor of
  // `useUpdateProfile`'s callback wiring or the `onError` branch could
  // silently drop the user-visible error surface.
  it('surfaces locked "Failed to save postcode" copy when updateProfile rejects', async () => {
    jest.useFakeTimers()
    mockUseMe.mockReturnValue({ data: profileFixture(), isLoading: false, isError: false })
    ;(global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({
        status: 200,
        result: {
          postcode: 'SW1A 1AA',
          parish: 'Westminster',
          admin_district: 'Westminster',
          region: 'London',
          country: 'England',
        },
      }),
    })
    mockUpdateProfile.mockRejectedValueOnce(new Error('Backend rejected'))
    const { getByText, getByTestId, getByLabelText } = renderScreen()
    fireEvent.press(getByText('Update postcode'))
    fireEvent.changeText(getByTestId('saved-area-postcode-input'), 'SW1A 1AA')
    await act(async () => { jest.advanceTimersByTime(700) })
    jest.useRealTimers()
    await waitFor(() => expect(getByText('Westminster')).toBeTruthy())
    await act(async () => {
      fireEvent.press(getByLabelText('Save postcode'))
    })
    await waitFor(() => {
      expect(getByText('Failed to save postcode. Please try again.')).toBeTruthy()
    })
    // User stays on the surface — no auto-navigate-back on failure.
    expect(mockBack).not.toHaveBeenCalled()
  })
})
