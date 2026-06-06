// Config pins for the bottom-tab nav. Renders the (app) layout with a captured
// Tabs mock and locks the structural contract so the nav can't silently
// regress: visible tabs + order, hidden href:null routes, detail routes hiding
// the bar, per-tab custom button + title, and the 80px footprint.

type Captured = {
  screenOptions?: Record<string, unknown>
  screens: Array<{ name: string; options: Record<string, unknown> }>
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
  Tabs.Screen = ({ name, options }: { name: string; options: Record<string, unknown> }) => {
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
const HIDDEN_ROUTES = ['search', 'categories', 'category/[id]', 'merchant/[id]', 'voucher/[id]', 'redemption/[id]', 'saved-area']
// Detail routes additionally hide the tab bar while open.
const DETAIL_ROUTES = ['merchant/[id]', 'voucher/[id]', 'redemption/[id]', 'saved-area']

const screen = (name: string) => mockCaptured.screens.find((s) => s.name === name)

describe('(app) tab bar — config pins', () => {
  beforeAll(() => {
    render(React.createElement(AppLayout))
  })

  it('declares the visible tabs + every route in the exact expected order', () => {
    expect(mockCaptured.screens.map((s) => s.name)).toEqual([...VISIBLE_TABS, ...HIDDEN_ROUTES])
  })

  it('every visible tab renders via a custom tabBarButton (draws icon + label) with a title', () => {
    const expectedTitles: Record<string, string> = {
      index: 'Home',
      map: 'Map',
      favourites: 'Favourites',
      savings: 'Savings',
      profile: 'Profile',
    }
    for (const name of VISIBLE_TABS) {
      const s = screen(name)
      expect(typeof s?.options.tabBarButton).toBe('function')
      expect(s?.options.title).toBe(expectedTitles[name])
    }
  })

  it('hidden routes are href:null (not shown as tabs)', () => {
    for (const name of HIDDEN_ROUTES) {
      expect(screen(name)?.options.href).toBeNull()
    }
  })

  it('detail routes hide the tab bar while open', () => {
    for (const name of DETAIL_ROUTES) {
      const tabBarStyle = screen(name)?.options.tabBarStyle as { display?: string } | undefined
      expect(tabBarStyle?.display).toBe('none')
    }
  })

  it('keeps the 80px bar footprint', () => {
    const tabBarStyle = mockCaptured.screenOptions?.tabBarStyle as { height?: number }
    expect(tabBarStyle.height).toBe(80)
  })
})
