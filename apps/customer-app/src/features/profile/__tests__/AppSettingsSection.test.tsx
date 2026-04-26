import React from 'react'
import { render, screen } from '@testing-library/react-native'

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

jest.mock('expo-router', () => ({ useFocusEffect: (_cb: unknown) => {} }))

jest.mock('@/features/profile/hooks/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }))

import { AppSettingsSection } from '../components/AppSettingsSection'

describe('AppSettingsSection', () => {
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
})
