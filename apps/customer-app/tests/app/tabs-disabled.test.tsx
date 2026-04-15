jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((sel: any) => sel({
    status: 'authed',
    user: { emailVerified: true, phoneVerified: true },
    onboarding: { profileCompletion: 'completed', furthestStep: 'done', phoneVerifiedAtLeastOnce: true },
  })),
}))
jest.mock('@/lib/routing', () => ({ resolveRedirect: jest.fn(() => null) }))
const MockTabsScreen = () => null
const MockTabs = ({ children }: any) => <>{children}</>
MockTabs.Screen = MockTabsScreen
jest.mock('expo-router', () => {
  const MockTabsScreenInner = () => null
  const MockTabsInner = ({ children }: any) => <>{children}</>
  MockTabsInner.Screen = MockTabsScreenInner
  return {
    Tabs: MockTabsInner,
    Redirect: () => null,
    useSegments: () => ['(app)', 'index'],
    router: { push: jest.fn() },
  }
})

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import AppLayout from '@/../app/(app)/_layout'

describe('AppLayout tabs', () => {
  it('disabled tab has accessibilityState.disabled and no onPress', () => {
    const { getByLabelText } = render(<AppLayout />)
    const discover = getByLabelText('Discover')
    expect(discover.props.accessibilityState?.disabled).toBe(true)
    expect(discover.props.onPress).toBeUndefined()
  })
})
