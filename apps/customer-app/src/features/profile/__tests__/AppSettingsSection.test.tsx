import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

const setMotionScaleMock = jest.fn()
const mockAuthState: {
  hapticsEnabled: boolean
  motionScale: number
  setHaptics: jest.Mock
  setMotionScale: jest.Mock
} = {
  hapticsEnabled: true,
  motionScale: 1,
  setHaptics: jest.fn(),
  setMotionScale: setMotionScaleMock,
}

jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((selector: any) => selector(mockAuthState)),
}))

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
}))

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (_cb: unknown) => {},
}))

jest.mock('@/features/profile/hooks/useReduceMotion', () => ({
  useReduceMotion: jest.fn(() => false),
  useOsReduceMotion: jest.fn(() => false),
}))

import { AppSettingsSection } from '../components/AppSettingsSection'
import { router } from 'expo-router'
import { useOsReduceMotion } from '../hooks/useReduceMotion'

describe('AppSettingsSection', () => {
  beforeEach(() => {
    ;(router.push as jest.Mock).mockClear()
    setMotionScaleMock.mockClear()
    // Reset to default — in-app motionScale=1, OS reduce-motion OFF.
    mockAuthState.motionScale = 1
    ;(useOsReduceMotion as jest.Mock).mockReturnValue(false)
  })

  it('shows haptic feedback toggle', () => {
    render(<AppSettingsSection />)
    expect(screen.getByRole('switch', { name: /haptic feedback/i })).toBeTruthy()
  })

  it('shows reduce motion toggle', () => {
    render(<AppSettingsSection />)
    expect(screen.getByRole('switch', { name: /reduce motion/i })).toBeTruthy()
  })

  // Regression pin for the Profile Stabilisation Hotfix:
  // When the user enables reduce-motion via the in-app toggle (motionScale=0)
  // with the OS setting OFF, the toggle MUST remain enabled (not disabled).
  // Pre-fix `AppSettingsSection` read `useReduceMotion()` (the combined
  // signal) and treated it as the OS-only signal, so flipping the in-app
  // toggle self-engaged the lock and the user could never turn it back off.
  // The fix swapped to `useOsReduceMotion()` — OS-only — so the lock
  // engages only when the OS is the one forcing reduce motion.
  it('does NOT lock the reduce-motion toggle when only the in-app toggle is on (OS off)', () => {
    mockAuthState.motionScale = 0
    ;(useOsReduceMotion as jest.Mock).mockReturnValue(false)
    render(<AppSettingsSection />)
    const sw = screen.getByRole('switch', { name: /reduce motion/i })
    expect(sw.props.value).toBe(true)
    expect(sw.props.disabled).toBeFalsy()
    // Toggling off must reach the store setter.
    fireEvent(sw, 'valueChange', false)
    expect(setMotionScaleMock).toHaveBeenCalledWith(1)
  })

  it('LOCKS the reduce-motion toggle when the OS is forcing reduce motion (OS on + in-app on)', () => {
    mockAuthState.motionScale = 0
    ;(useOsReduceMotion as jest.Mock).mockReturnValue(true)
    render(<AppSettingsSection />)
    const sw = screen.getByRole('switch', { name: /reduce motion/i })
    expect(sw.props.value).toBe(true)
    expect(sw.props.disabled).toBe(true)
  })

  it('shows the Location row with the friendly user-facing label "Location"', () => {
    render(<AppSettingsSection />)
    // Profile Stabilisation Hotfix — was "Location access". The "access"
    // word read as a permission technicality; "Location" + a friendly
    // status preview ("Off"/"On"/"Set up") is clearer.
    expect(screen.getByText('Location')).toBeTruthy()
    expect(screen.queryByText('Location access')).toBeNull()
  })

  it('routes Location row to the in-app Your Location screen with ?from=profile', () => {
    render(<AppSettingsSection />)
    fireEvent.press(screen.getByText('Location'))
    // ?from=profile drives SavedAreaScreen.handleBack to route back to
    // Profile instead of falling to Home via the Tabs.Screen default.
    expect(router.push).toHaveBeenCalledWith('/saved-area?from=profile')
  })
})
