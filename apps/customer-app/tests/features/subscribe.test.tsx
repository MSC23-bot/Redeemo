jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }))
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, style }: any) => {
    const { View } = require('react-native')
    return <View style={style}>{children}</View>
  },
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }))

import { Alert } from 'react-native'
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { SubscribePromptScreen } from '@/features/subscribe/screens/SubscribePromptScreen'
import { router } from 'expo-router'
import { useAuthStore } from '@/stores/auth'

describe('SubscribePromptScreen — locked v1.0 CTA contract', () => {
  let alertSpy: jest.SpyInstance
  let markSubscriptionPromptSeenNow: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    markSubscriptionPromptSeenNow = jest.fn().mockResolvedValue(undefined)
    useAuthStore.setState({ markSubscriptionPromptSeenNow } as any)
  })

  afterEach(() => {
    alertSpy.mockRestore()
  })

  it('"Explore full access" shows Coming soon alert, does NOT mark prompt seen, does NOT navigate', () => {
    const { getByText } = render(<SubscribePromptScreen />)
    fireEvent.press(getByText('Explore full access'))
    expect(alertSpy).toHaveBeenCalledTimes(1)
    expect(alertSpy.mock.calls[0][0]).toBe('Coming soon')
    expect(markSubscriptionPromptSeenNow).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('"Start with free access" stamps subscriptionPromptSeenAt and navigates to /(app)/', async () => {
    const { getByText } = render(<SubscribePromptScreen />)
    fireEvent.press(getByText('Start with free access'))
    await waitFor(() => expect(markSubscriptionPromptSeenNow).toHaveBeenCalledTimes(1))
    expect(router.replace).toHaveBeenCalledWith('/(app)/')
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('"Start with free access" does NOT navigate when stamping fails', async () => {
    markSubscriptionPromptSeenNow.mockRejectedValueOnce(new Error('network'))
    const { getByText } = render(<SubscribePromptScreen />)
    fireEvent.press(getByText('Start with free access'))
    await waitFor(() => expect(markSubscriptionPromptSeenNow).toHaveBeenCalledTimes(1))
    expect(router.replace).not.toHaveBeenCalled()
  })
})
