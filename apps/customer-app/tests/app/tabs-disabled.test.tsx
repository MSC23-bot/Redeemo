jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((sel: any) => sel({
    status: 'authed',
    user: { emailVerified: true, phoneVerified: true },
    onboarding: { profileCompletion: 'completed', furthestStep: 'done', phoneVerifiedAtLeastOnce: true },
  })),
}))
jest.mock('@/lib/routing', () => ({ resolveRedirect: jest.fn(() => null) }))

jest.mock('expo-router', () => {
  const Screen = jest.fn(() => null)
  const Tabs = ({ children }: any) => <>{children}</>
  Tabs.Screen = Screen
  return {
    Tabs,
    Redirect: () => null,
    useSegments: () => ['(app)', 'index'],
    router: { push: jest.fn() },
  }
})

import React from 'react'
import { render } from '@testing-library/react-native'
import AppLayout from '@/../app/(app)/_layout'

describe('AppLayout tabs', () => {
  beforeEach(() => {
    const { Tabs } = jest.requireMock('expo-router') as any
    ;(Tabs.Screen as jest.Mock).mockClear()
  })

  it('renders without crashing when authenticated', () => {
    expect(() => render(<AppLayout />)).not.toThrow()
  })

  it('auth-gated tabs (Favourite, Savings, Profile) have href: null when unauthenticated', () => {
    const { useAuthStore } = jest.requireMock('@/stores/auth') as any
    useAuthStore.mockImplementation((sel: any) => sel({
      status: 'guest',
      user: null,
      onboarding: { profileCompletion: 'pending', furthestStep: 'pc1', phoneVerifiedAtLeastOnce: false },
    }))

    render(<AppLayout />)

    const { Tabs } = jest.requireMock('expo-router') as any
    const calls = (Tabs.Screen as jest.Mock).mock.calls.map((c: any[]) => c[0])
    for (const name of ['favourite', 'savings', 'profile']) {
      const screen = calls.find((c: any) => c.name === name)
      expect(screen?.options?.href).toBeNull()
    }
  })
})
