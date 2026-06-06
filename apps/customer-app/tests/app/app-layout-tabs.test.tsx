// Pins the bottom-tab wiring so labels can't silently regress. Each visible tab
// renders via a custom <BrandedTabButton> (which draws the icon + the label —
// the default react-navigation item clips the label to nothing in our 80px
// bar). Renders the (app) layout with a captured Tabs mock and reads back the
// per-screen options + the bar footprint.

type Captured = {
  screenOptions?: Record<string, unknown>
  screens: Array<{ name: string; options?: { title?: string; tabBarButton?: unknown } }>
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
  Tabs.Screen = ({
    name,
    options,
  }: {
    name: string
    options: { title?: string; tabBarButton?: unknown }
  }) => {
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

const VISIBLE_TABS = ['index', 'map', 'favourites', 'savings', 'profile']

describe('(app) tab bar — label wiring', () => {
  beforeAll(() => {
    render(React.createElement(AppLayout))
  })

  it('every visible tab renders via a custom tabBarButton (draws icon + label)', () => {
    for (const name of VISIBLE_TABS) {
      const screen = mockCaptured.screens.find((s) => s.name === name)
      expect(typeof screen?.options?.tabBarButton).toBe('function')
    }
  })

  it('all five visible tabs carry a title (a11y + label source)', () => {
    const titleFor = (name: string) =>
      mockCaptured.screens.find((s) => s.name === name)?.options?.title
    expect(titleFor('index')).toBe('Home')
    expect(titleFor('map')).toBe('Map')
    expect(titleFor('favourites')).toBe('Favourites')
    expect(titleFor('savings')).toBe('Savings')
    expect(titleFor('profile')).toBe('Profile')
  })

  it('keeps the 80px bar footprint', () => {
    const tabBarStyle = mockCaptured.screenOptions?.tabBarStyle as { height?: number }
    expect(tabBarStyle.height).toBe(80)
  })
})
