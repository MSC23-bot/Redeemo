// Pins the bottom-tab LABEL configuration so labels can't silently regress to
// hidden/untinted. Renders the (app) layout with a captured Tabs mock and reads
// back the screenOptions + per-screen titles.

type Captured = {
  screenOptions?: Record<string, unknown>
  screens: Array<{ name: string; options?: { title?: string } }>
}
const mockCaptured: Captured = { screens: [] }

jest.mock('expo-router', () => {
  const Tabs = ({
    screenOptions,
    children,
  }: {
    screenOptions: Record<string, unknown>
    children?: React.ReactNode
  }) => {
    mockCaptured.screenOptions = screenOptions
    return children
  }
  Tabs.Screen = ({ name, options }: { name: string; options: { title?: string } }) => {
    mockCaptured.screens.push({ name, options })
    return null
  }
  return { __esModule: true, Tabs, Redirect: () => null, useSegments: () => ['(app)'] }
})

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}))

jest.mock('@/lib/location/LocationPermissionProvider', () => ({
  LocationPermissionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((sel: (s: unknown) => unknown) =>
    sel({
      status: 'authed',
      user: {
        emailVerified: true,
        phoneVerified: true,
        phone: '+447700900000',
        firstName: 'Ada',
        lastName: 'Lovelace',
        dateOfBirth: '1990-01-01',
        gender: 'female',
        postcode: 'SW1A 1AA',
        onboardingCompletedAt: '2026-04-23T00:00:00.000Z',
        subscriptionPromptSeenAt: '2026-04-23T00:00:00.000Z',
      },
    }),
  ),
}))

import React from 'react'
import { render } from '@testing-library/react-native'
import AppLayout from '@/../app/(app)/_layout'
import { NAV_INK, NAV_ACTIVE_INK } from '@/features/navigation/navTokens'

describe('(app) tab bar — label configuration', () => {
  beforeAll(() => {
    render(React.createElement(AppLayout))
  })

  it('labels are enabled (tabBarShowLabel: true, not false)', () => {
    expect(mockCaptured.screenOptions?.tabBarShowLabel).toBe(true)
  })

  it('active label = brand red, inactive label = warm navy ink', () => {
    expect(mockCaptured.screenOptions?.tabBarActiveTintColor).toBe(NAV_ACTIVE_INK)
    expect(mockCaptured.screenOptions?.tabBarInactiveTintColor).toBe(NAV_INK)
  })

  it('label style declares an explicit lineHeight (so labels are not clipped)', () => {
    const labelStyle = mockCaptured.screenOptions?.tabBarLabelStyle as { lineHeight?: number }
    expect(typeof labelStyle.lineHeight).toBe('number')
  })

  it('all five visible tabs carry a title (the label text)', () => {
    const titleFor = (name: string) =>
      mockCaptured.screens.find((s) => s.name === name)?.options?.title
    expect(titleFor('index')).toBe('Home')
    expect(titleFor('map')).toBe('Map')
    expect(titleFor('favourites')).toBe('Favourites')
    expect(titleFor('savings')).toBe('Savings')
    expect(titleFor('profile')).toBe('Profile')
  })
})
