import React from 'react'
import { Alert } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── mocks ────────────────────────────────────────────────────────────────────

const mockBack = jest.fn()
const mockPush = jest.fn()
const mockCanGoBack = jest.fn(() => true)
jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    push: (...args: unknown[]) => mockPush(...args),
    canGoBack: () => mockCanGoBack(),
  },
}))

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
  const utils = render(
    <QueryClientProvider client={client}>
      <SavedAreaScreen />
    </QueryClientProvider>,
  )
  return { ...utils, client, invalidateSpy }
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
})
