// Pins the 4-state `permission` enum, the `request(opts?)` callback
// wrapping, `openSettings()` cross-platform delegation, dev-override
// short-circuit, and back-compat with the existing call sites that
// read only `{ location, requestPermission }`.

import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import * as Location from 'expo-location'
import { Linking } from 'react-native'

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}))

jest.mock('@/lib/devLocationOverride', () => ({
  devLocationOverride: jest.fn(),
}))

import { useUserLocation } from '@/hooks/useLocation'
import { devLocationOverride } from '@/lib/devLocationOverride'

const mockGetPerms = Location.getForegroundPermissionsAsync as jest.Mock
const mockReqPerms = Location.requestForegroundPermissionsAsync as jest.Mock
const mockGetPos = Location.getCurrentPositionAsync as jest.Mock
const mockReverseGeocode = Location.reverseGeocodeAsync as jest.Mock
const mockOverride = devLocationOverride as jest.Mock

// `Linking.openSettings` is a method on the imported `Linking`
// singleton from react-native. Spy + restore per test so other
// suites that share the jest-expo runtime aren't affected.
let openSettingsSpy: jest.SpyInstance

beforeEach(() => {
  mockGetPerms.mockReset()
  mockReqPerms.mockReset()
  mockGetPos.mockReset()
  mockReverseGeocode.mockReset()
  mockOverride.mockReset()
  mockOverride.mockReturnValue(null)
  openSettingsSpy = jest
    .spyOn(Linking, 'openSettings')
    .mockResolvedValue(undefined as unknown as void)
})

afterEach(() => {
  openSettingsSpy.mockRestore()
})

describe('useUserLocation — mount permission probe', () => {
  it('reads initial permission via getForegroundPermissionsAsync (undetermined)', async () => {
    mockGetPerms.mockResolvedValue({ status: 'undetermined' })
    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('undetermined'))
    expect(mockReqPerms).not.toHaveBeenCalled()
  })

  it('reports permission "denied" when the OS reports denied on mount', async () => {
    mockGetPerms.mockResolvedValue({ status: 'denied' })
    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('denied'))
    expect(mockReqPerms).not.toHaveBeenCalled()
  })

  it('reports permission "unavailable" when the OS probe throws on mount', async () => {
    mockGetPerms.mockRejectedValue(new Error('no GPS hardware'))
    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('unavailable'))
  })

  it('auto-fetches when mount probe returns granted (existing back-compat behaviour)', async () => {
    mockGetPerms.mockResolvedValue({ status: 'granted' })
    mockReqPerms.mockResolvedValue({ status: 'granted' })
    mockGetPos.mockResolvedValue({ coords: { latitude: 51.5, longitude: -0.1 } })
    mockReverseGeocode.mockResolvedValue([{ city: 'London', subregion: 'Greater London', district: null }])
    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.status).toBe('granted'))
    expect(result.current.location).toEqual({ lat: 51.5, lng: -0.1, area: 'Greater London', city: 'London' })
    expect(result.current.coords).toEqual({ lat: 51.5, lng: -0.1 })
  })
})

describe('useUserLocation — request(opts) explainer/recovery callbacks', () => {
  it('fires onBeforePrompt BEFORE the native permission prompt when permission is undetermined', async () => {
    mockGetPerms.mockResolvedValue({ status: 'undetermined' })
    mockReqPerms.mockResolvedValue({ status: 'granted' })
    mockGetPos.mockResolvedValue({ coords: { latitude: 51.5, longitude: -0.1 } })
    mockReverseGeocode.mockResolvedValue([])
    const order: string[] = []
    const onBeforePrompt = jest.fn(() => { order.push('before') })
    mockReqPerms.mockImplementation(async () => { order.push('prompt'); return { status: 'granted' } })

    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('undetermined'))
    await act(async () => { await result.current.request({ onBeforePrompt }) })

    expect(onBeforePrompt).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['before', 'prompt'])
  })

  it('SKIPS onBeforePrompt when permission is already granted (no native prompt fires)', async () => {
    mockGetPerms.mockResolvedValue({ status: 'granted' })
    mockReqPerms.mockResolvedValue({ status: 'granted' })
    mockGetPos.mockResolvedValue({ coords: { latitude: 51.5, longitude: -0.1 } })
    mockReverseGeocode.mockResolvedValue([])

    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('granted'))
    mockReqPerms.mockClear()
    const onBeforePrompt = jest.fn()

    await act(async () => { await result.current.request({ onBeforePrompt }) })

    expect(onBeforePrompt).not.toHaveBeenCalled()
  })

  it('fires onDenied when the permission request ends up denied', async () => {
    mockGetPerms.mockResolvedValue({ status: 'undetermined' })
    mockReqPerms.mockResolvedValue({ status: 'denied' })
    const onDenied = jest.fn()

    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('undetermined'))
    await act(async () => { await result.current.request({ onDenied }) })

    expect(onDenied).toHaveBeenCalledTimes(1)
    expect(result.current.permission).toBe('denied')
    expect(result.current.status).toBe('denied')
  })

  it('does NOT fire onDenied when the permission request ends up granted', async () => {
    mockGetPerms.mockResolvedValue({ status: 'undetermined' })
    mockReqPerms.mockResolvedValue({ status: 'granted' })
    mockGetPos.mockResolvedValue({ coords: { latitude: 51.5, longitude: -0.1 } })
    mockReverseGeocode.mockResolvedValue([])
    const onDenied = jest.fn()

    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('undetermined'))
    await act(async () => { await result.current.request({ onDenied }) })

    expect(onDenied).not.toHaveBeenCalled()
    expect(result.current.permission).toBe('granted')
  })
})

describe('useUserLocation — openSettings()', () => {
  it('delegates to Linking.openSettings cross-platform', async () => {
    mockGetPerms.mockResolvedValue({ status: 'denied' })
    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('denied'))

    await act(async () => { await result.current.openSettings() })

    expect(openSettingsSpy).toHaveBeenCalledTimes(1)
  })
})

describe('useUserLocation — §AU dev override mode', () => {
  beforeEach(() => {
    mockOverride.mockReturnValue({ lat: 53.6458, lng: -1.785 })
  })

  it('reports permission granted + coords from override on mount', async () => {
    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('granted'))
    expect(result.current.coords).toEqual({ lat: 53.6458, lng: -1.785 })
    expect(result.current.location).toEqual({ lat: 53.6458, lng: -1.785, area: null, city: null })
    expect(mockGetPerms).not.toHaveBeenCalled()
    expect(mockReqPerms).not.toHaveBeenCalled()
  })

  it('request(opts) short-circuits — no explainer, no native prompt, no onDenied', async () => {
    const onBeforePrompt = jest.fn()
    const onDenied = jest.fn()

    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('granted'))
    await act(async () => { await result.current.request({ onBeforePrompt, onDenied }) })

    expect(onBeforePrompt).not.toHaveBeenCalled()
    expect(onDenied).not.toHaveBeenCalled()
    expect(mockReqPerms).not.toHaveBeenCalled()
    expect(result.current.permission).toBe('granted')
  })

  it('openSettings() no-ops in override mode', async () => {
    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('granted'))
    await act(async () => { await result.current.openSettings() })

    expect(openSettingsSpy).not.toHaveBeenCalled()
  })
})

describe('useUserLocation — single-flight request() guard', () => {
  it('two parallel request() calls share a single in-flight promise (one prompt, one onBeforePrompt)', async () => {
    mockGetPerms.mockResolvedValue({ status: 'undetermined' })
    mockReqPerms.mockResolvedValue({ status: 'granted' })
    mockGetPos.mockResolvedValue({ coords: { latitude: 51.5, longitude: -0.1 } })
    mockReverseGeocode.mockResolvedValue([])
    const onBeforePrompt = jest.fn()

    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('undetermined'))

    let p1: Promise<void> | undefined
    let p2: Promise<void> | undefined
    await act(async () => {
      p1 = result.current.request({ onBeforePrompt })
      p2 = result.current.request({ onBeforePrompt })
      await Promise.all([p1, p2])
    })

    expect(onBeforePrompt).toHaveBeenCalledTimes(1)
    expect(mockReqPerms).toHaveBeenCalledTimes(1)
  })

  it('a fresh request() AFTER an in-flight call resolves prompts a new native dialog', async () => {
    mockGetPerms.mockResolvedValue({ status: 'undetermined' })
    mockReqPerms.mockResolvedValue({ status: 'granted' })
    mockGetPos.mockResolvedValue({ coords: { latitude: 51.5, longitude: -0.1 } })
    mockReverseGeocode.mockResolvedValue([])

    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('undetermined'))

    await act(async () => { await result.current.request() })
    // Permission has flipped to granted; the next request() takes the
    // already-granted path (no prompt), but it must still resolve fresh
    // (not return the cached in-flight promise from the first call).
    mockReqPerms.mockClear()
    await act(async () => { await result.current.request() })
    expect(mockReqPerms).toHaveBeenCalledTimes(1)
  })
})

describe('useUserLocation — back-compat for existing 7 call sites', () => {
  it('exposes { status, location, requestPermission } with the legacy shape', async () => {
    mockGetPerms.mockResolvedValue({ status: 'undetermined' })
    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('undetermined'))

    expect(result.current).toHaveProperty('status')
    expect(result.current).toHaveProperty('location')
    expect(result.current).toHaveProperty('requestPermission')
    expect(typeof result.current.requestPermission).toBe('function')
    expect(result.current.status).toBe('idle')
    expect(result.current.location).toBeNull()
  })

  it('legacy requestPermission() delegates to request() (no opts) — same outcome', async () => {
    mockGetPerms.mockResolvedValue({ status: 'undetermined' })
    mockReqPerms.mockResolvedValue({ status: 'granted' })
    mockGetPos.mockResolvedValue({ coords: { latitude: 51.5, longitude: -0.1 } })
    mockReverseGeocode.mockResolvedValue([{ city: 'London', subregion: 'Greater London' }])

    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('undetermined'))
    await act(async () => { await result.current.requestPermission() })

    expect(result.current.status).toBe('granted')
    expect(result.current.location).toEqual({ lat: 51.5, lng: -0.1, area: 'Greater London', city: 'London' })
  })

  it('handles getCurrentPositionAsync throwing — status:denied, permission:unavailable', async () => {
    mockGetPerms.mockResolvedValue({ status: 'undetermined' })
    mockReqPerms.mockResolvedValue({ status: 'granted' })
    mockGetPos.mockRejectedValue(new Error('GPS read failed'))

    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('undetermined'))
    await act(async () => { await result.current.request() })

    expect(result.current.status).toBe('denied')
    expect(result.current.permission).toBe('unavailable')
  })
})

describe('useUserLocation — toPermission edge cases', () => {
  // `toPermission` maps anything that isn't granted/denied/undetermined to
  // 'unavailable' — iOS can return 'restricted' (parental controls, MDM).
  // The downstream branch must report permission='unavailable' and status=
  // 'denied' WITHOUT firing onDenied, because the spec contract is that
  // onDenied fires only when the user explicitly denied the prompt — not
  // when the platform rejected the request for a structural reason.
  it('maps raw "restricted" → permission:unavailable + status:denied, and does NOT fire onDenied', async () => {
    mockGetPerms.mockResolvedValue({ status: 'undetermined' })
    mockReqPerms.mockResolvedValue({ status: 'restricted' })
    const onDenied = jest.fn()

    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('undetermined'))
    await act(async () => { await result.current.request({ onDenied }) })

    expect(result.current.permission).toBe('unavailable')
    expect(result.current.status).toBe('denied')
    expect(onDenied).not.toHaveBeenCalled()
  })

  // The area-name ladder is `place?.subregion ?? place?.district ?? null`.
  // Existing tests cover level 1 (subregion set) and the all-null fallback;
  // pin level 2 (subregion explicitly null, district set) so a refactor that
  // drops the district fallback can't silently regress the area string.
  it('falls back to place.district when subregion is null', async () => {
    mockGetPerms.mockResolvedValue({ status: 'undetermined' })
    mockReqPerms.mockResolvedValue({ status: 'granted' })
    mockGetPos.mockResolvedValue({ coords: { latitude: 53.6458, longitude: -1.785 } })
    mockReverseGeocode.mockResolvedValue([
      { city: 'Huddersfield', subregion: null, district: 'Kirklees' },
    ])

    const { result } = renderHook(() => useUserLocation())
    await waitFor(() => expect(result.current.permission).toBe('undetermined'))
    await act(async () => { await result.current.request() })

    expect(result.current.location).toEqual({
      lat: 53.6458,
      lng: -1.785,
      area: 'Kirklees',
      city: 'Huddersfield',
    })
  })
})
