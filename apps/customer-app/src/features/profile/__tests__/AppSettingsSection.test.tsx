import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((selector: any) => selector({
    hapticsEnabled: true,
    motionScale: 1,
    setHaptics: jest.fn(),
    setMotionScale: jest.fn(),
  })),
}))

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
}))

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (_cb: unknown) => {},
}))

jest.mock('@/features/profile/hooks/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }))

import { AppSettingsSection } from '../components/AppSettingsSection'
import { router } from 'expo-router'

describe('AppSettingsSection', () => {
  beforeEach(() => {
    ;(router.push as jest.Mock).mockClear()
  })

  it('shows haptic feedback toggle', () => {
    render(<AppSettingsSection />)
    expect(screen.getByRole('switch', { name: /haptic feedback/i })).toBeTruthy()
  })

  it('shows reduce motion toggle', () => {
    render(<AppSettingsSection />)
    expect(screen.getByRole('switch', { name: /reduce motion/i })).toBeTruthy()
  })

  it('shows location access row', () => {
    render(<AppSettingsSection />)
    expect(screen.getByText('Location access')).toBeTruthy()
  })

  it('routes Location access row to the in-app Your Location screen (/saved-area, not OS Settings)', () => {
    render(<AppSettingsSection />)
    fireEvent.press(screen.getByText('Location access'))
    expect(router.push).toHaveBeenCalledWith('/saved-area')
  })
})
