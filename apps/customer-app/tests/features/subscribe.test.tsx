jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }))
jest.mock('react-native-svg', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: ({ children }: any) => React.createElement(View, null, children),
    Svg: ({ children }: any) => React.createElement(View, null, children),
    Path: () => null,
    Circle: () => null,
    Rect: () => null,
    Line: () => null,
    Polyline: () => null,
  }
})
jest.mock('@/lib/api/profile', () => ({
  profileApi: {
    markSubscriptionPromptSeen: jest.fn(async () => ({ ok: true })),
  },
}))
jest.mock('@/stores/auth', () => ({
  useAuthStore: Object.assign(
    (sel: any) => sel({ refreshUser: jest.fn(async () => {}), user: { firstName: 'Alex' } }),
    { getState: () => ({ refreshUser: jest.fn(async () => {}), user: { firstName: 'Alex' } }) },
  ),
}))

import React from 'react'
import { Alert } from 'react-native'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { SubscribePromptScreen } from '@/features/subscribe/screens/SubscribePromptScreen'
import { router } from 'expo-router'
import { profileApi } from '@/lib/api/profile'

describe('SubscribePromptScreen', () => {
  let alertSpy: jest.SpyInstance

  beforeEach(() => {
    ;(router.replace as jest.Mock).mockClear()
    ;(profileApi.markSubscriptionPromptSeen as jest.Mock).mockClear()
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  })

  afterEach(() => {
    alertSpy.mockRestore()
  })

  it('"Explore full access" shows coming-soon alert and does NOT mark prompt seen or navigate', () => {
    const { getByText } = render(<SubscribePromptScreen />)
    fireEvent.press(getByText('Explore full access'))
    expect(alertSpy).toHaveBeenCalledTimes(1)
    expect(alertSpy.mock.calls[0]![0]).toBe('Coming soon')
    expect(profileApi.markSubscriptionPromptSeen).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('"Start with free access" marks prompt seen and navigates to /(app)/', async () => {
    const { getByText } = render(<SubscribePromptScreen />)
    fireEvent.press(getByText('Start with free access'))
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(app)/'))
    expect(profileApi.markSubscriptionPromptSeen).toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
  })
})
