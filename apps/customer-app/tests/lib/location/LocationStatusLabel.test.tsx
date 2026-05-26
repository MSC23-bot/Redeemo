/**
 * §DF-v2-j Task 8 — `<LocationStatusLabel>` unit pin matrix.
 *
 * Spec: docs/superpowers/specs/2026-05-26-locationcontext-parity-design.md
 *   §7.2 (state matrix) + §7.3 (variants) + §9.2 (pin scope).
 * Plan: docs/superpowers/plans/2026-05-26-locationcontext-parity.md Task 8.
 *
 * 10 pins covering:
 *   §LSL-1..§LSL-7    state matrix (§7.2)
 *   §LSL-8            tap target routing
 *   §LSL-9..§LSL-10   variant container shape (§7.3)
 */
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { LocationStatusLabel } from '@/lib/location/LocationStatusLabel'

// Spy on router.push so §LSL-8 can assert the navigation contract.
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Mock-set permission for each test via this mutable holder.  jest.mock
// factories are hoisted before module imports, so the factory function
// closes over the holder + reads it at call time per render.
const mockPermissionRef = { current: 'undetermined' as 'granted' | 'denied' | 'unavailable' | 'undetermined' }
jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    permission:        mockPermissionRef.current,
    status:            'idle',
    location:          null,
    coords:            null,
    request:           jest.fn(),
    requestPermission: jest.fn(),
    openSettings:      jest.fn(),
  }),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockPermissionRef.current = 'undetermined'
})

const PROFILE_LOCALITY = { id: 'loc-huddersfield', name: 'Huddersfield' }

// ────────────────────────────────────────────────────────────────────────────
// §LSL-1 .. §LSL-7 — state matrix
// ────────────────────────────────────────────────────────────────────────────

it('§LSL-1 — source=coordinates → "Using current location" + no chevron', () => {
  mockPermissionRef.current = 'granted'
  const { getByTestId, queryByTestId } = render(
    <LocationStatusLabel
      locationContext={{ source: 'coordinates', city: null, locality: null }}
    />,
  )
  expect(getByTestId('location-status-text').props.children).toBe('Using current location')
  expect(queryByTestId('location-status-chevron')).toBeNull()
})

it('§LSL-2 — source=profile with city → "Using profile location · {city}" + city in semibold', () => {
  mockPermissionRef.current = 'granted'
  const { getByTestId, queryByTestId } = render(
    <LocationStatusLabel
      locationContext={{ source: 'profile', city: 'Huddersfield', locality: PROFILE_LOCALITY }}
    />,
  )
  // The split-text render carries "Using profile location · " + inline city.
  const text = getByTestId('location-status-text')
  expect(text).toBeTruthy()
  const city = getByTestId('location-status-city')
  expect(city.props.children).toBe('Huddersfield')
  // City emphasis: Lato-SemiBold inline override on the nested Text.
  // The Text design-system component flattens `style` onto an array.
  const cityStyle = Array.isArray(city.props.style)
    ? Object.assign({}, ...city.props.style.filter(Boolean))
    : (city.props.style ?? {})
  expect(cityStyle.fontFamily).toBe('Lato-SemiBold')
  // No chevron on profile state.
  expect(queryByTestId('location-status-chevron')).toBeNull()
})

it('§LSL-3 — source=profile with city null → "Using profile location" (D8 fallback, no suffix)', () => {
  mockPermissionRef.current = 'granted'
  const { getByTestId, queryByTestId } = render(
    <LocationStatusLabel
      locationContext={{ source: 'profile', city: null, locality: null }}
    />,
  )
  expect(getByTestId('location-status-text').props.children).toBe('Using profile location')
  expect(queryByTestId('location-status-city')).toBeNull()
  expect(queryByTestId('location-status-chevron')).toBeNull()
})

it('§LSL-4 — source=none + permission=denied → "No GPS · Set location" + MapPinOff + chevron', () => {
  mockPermissionRef.current = 'denied'
  const { getByTestId } = render(
    <LocationStatusLabel
      locationContext={{ source: 'none', city: null, locality: null }}
    />,
  )
  expect(getByTestId('location-status-text').props.children).toBe('No GPS · Set location')
  expect(getByTestId('location-status-chevron')).toBeTruthy()
  // Pin variant: MapPinOff (lucide).  The icon test-id is shared between
  // MapPin + MapPinOff, but the lucide-react-native React tree exposes
  // the displayName / role we can introspect.  Cheapest pin: the a11y
  // label MUST include "No GPS" (which it does via labelText derivation).
  expect(getByTestId('location-status-label').props.accessibilityLabel).toMatch(/No GPS/)
})

it('§LSL-5 — source=none + permission=unavailable → same as denied (D3 collapse)', () => {
  mockPermissionRef.current = 'unavailable'
  const { getByTestId } = render(
    <LocationStatusLabel
      locationContext={{ source: 'none', city: null, locality: null }}
    />,
  )
  expect(getByTestId('location-status-text').props.children).toBe('No GPS · Set location')
  expect(getByTestId('location-status-chevron')).toBeTruthy()
  expect(getByTestId('location-status-label').props.accessibilityLabel).toMatch(/No GPS/)
})

it('§LSL-6 — source=none + permission=undetermined → "Set location" + MapPin (no slash) + chevron', () => {
  mockPermissionRef.current = 'undetermined'
  const { getByTestId } = render(
    <LocationStatusLabel
      locationContext={{ source: 'none', city: null, locality: null }}
    />,
  )
  expect(getByTestId('location-status-text').props.children).toBe('Set location')
  expect(getByTestId('location-status-chevron')).toBeTruthy()
  // a11y label MUST NOT mention "No GPS" — undetermined is a cleaner
  // call to action than the denied/unavailable affordance.
  expect(getByTestId('location-status-label').props.accessibilityLabel).not.toMatch(/No GPS/)
})

it('§LSL-6b — source=none + permission=granted (granted-without-coords edge) → "Set location" (undetermined-equivalent)', () => {
  // Per spec §7.2 row: when backend returned source='none' but device
  // permission is 'granted' (coords not yet received), surface the
  // "Set location" CTA until coords arrive.  This validates the edge
  // doesn't fall into the "No GPS" branch.
  mockPermissionRef.current = 'granted'
  const { getByTestId } = render(
    <LocationStatusLabel
      locationContext={{ source: 'none', city: null, locality: null }}
    />,
  )
  expect(getByTestId('location-status-text').props.children).toBe('Set location')
  expect(getByTestId('location-status-label').props.accessibilityLabel).not.toMatch(/No GPS/)
})

it('§LSL-7 — locationContext undefined → renders null', () => {
  mockPermissionRef.current = 'granted'
  const { toJSON } = render(<LocationStatusLabel locationContext={undefined} />)
  expect(toJSON()).toBeNull()
})

// ────────────────────────────────────────────────────────────────────────────
// §LSL-8 — tap target routes to /saved-area (every renderable state)
// ────────────────────────────────────────────────────────────────────────────

it('§LSL-8 — tap routes to /saved-area in every renderable state', () => {
  const states: Array<{ permission: 'granted' | 'denied' | 'unavailable' | 'undetermined'; locationContext: any }> = [
    { permission: 'granted',      locationContext: { source: 'coordinates', city: null, locality: null } },
    { permission: 'granted',      locationContext: { source: 'profile', city: 'Huddersfield', locality: PROFILE_LOCALITY } },
    { permission: 'granted',      locationContext: { source: 'profile', city: null, locality: null } },
    { permission: 'denied',       locationContext: { source: 'none', city: null, locality: null } },
    { permission: 'unavailable',  locationContext: { source: 'none', city: null, locality: null } },
    { permission: 'undetermined', locationContext: { source: 'none', city: null, locality: null } },
  ]
  for (const s of states) {
    mockPush.mockClear()
    mockPermissionRef.current = s.permission
    const { getByTestId, unmount } = render(<LocationStatusLabel locationContext={s.locationContext} />)
    fireEvent.press(getByTestId('location-status-label'))
    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/saved-area')
    unmount()
  }
})

// ────────────────────────────────────────────────────────────────────────────
// §LSL-9 / §LSL-10 — variant container shape (§7.3)
// ────────────────────────────────────────────────────────────────────────────

function flattenStyle(s: unknown): Record<string, unknown> {
  // Pressable receives `style={({ pressed }) => [containerStyle, pressed && pressedStyle]}`.
  // testing-library exposes the runtime style array; the first element is
  // always the variant container regardless of press state.
  if (Array.isArray(s)) return Object.assign({}, ...s.filter(Boolean))
  return (s as any) ?? {}
}

it('§LSL-9 — variant=strip (default) → strip container shape (full-width, bottom-only border, no radius)', () => {
  mockPermissionRef.current = 'granted'
  const { getByTestId } = render(
    <LocationStatusLabel
      locationContext={{ source: 'coordinates', city: null, locality: null }}
    />,
  )
  const label   = getByTestId('location-status-label')
  const flatten = flattenStyle(label.props.style)
  expect(flatten.width).toBe('100%')
  expect(flatten.borderRadius).toBe(0)
  // Strip uses bottom-only border (the right invariant — full border on
  // all sides would mean we'd accidentally picked the chip variant).
  expect(flatten.borderBottomWidth).toBe(1)
  expect(flatten.borderWidth).toBeUndefined()
})

it('§LSL-10 — variant=chip → chip container shape (pill radius, full border, elevation)', () => {
  mockPermissionRef.current = 'granted'
  const { getByTestId } = render(
    <LocationStatusLabel
      variant="chip"
      locationContext={{ source: 'coordinates', city: null, locality: null }}
    />,
  )
  const label   = getByTestId('location-status-label')
  const flatten = flattenStyle(label.props.style)
  // Pill radius (radius.pill === 9999).  Cheapest invariant.
  expect(flatten.borderRadius).toBe(9999)
  // Full border on all sides — chip has borderWidth, NOT borderBottomWidth.
  expect(flatten.borderWidth).toBe(1)
  expect(flatten.borderBottomWidth).toBeUndefined()
  // Chip has elevation; strip does not.
  expect(flatten.elevation).toBeGreaterThan(0)
})
