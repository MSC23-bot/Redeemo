// Mutable params object so individual tests can swap the URL params
// the screen reads via useLocalSearchParams. The mock factory captures
// `mockParams` by reference, so reassigning it before render takes
// effect for the next render.
let mockParams: Record<string, string | undefined> = {}

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
}))
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

describe('SubscribePromptScreen — onboarding source (no source param)', () => {
  let alertSpy: jest.SpyInstance

  beforeEach(() => {
    mockParams = {}  // no source/plan/return params → onboarding default
    ;(router.replace as jest.Mock).mockClear()
    ;(router.back as jest.Mock).mockClear()
    ;(profileApi.markSubscriptionPromptSeen as jest.Mock).mockClear()
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  })

  afterEach(() => { alertSpy.mockRestore() })

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

  it('with no plan param, plan selector defaults to annual (existing onboarding behaviour)', () => {
    const { queryByText } = render(<SubscribePromptScreen />)
    // Onboarding labels — "Explore full access" present, voucher
    // labels absent.
    expect(queryByText('Explore full access')).toBeTruthy()
    expect(queryByText('Continue with Annual')).toBeNull()
    expect(queryByText('Continue with Monthly')).toBeNull()
  })
})

describe('SubscribePromptScreen — voucher source (round 21)', () => {
  let alertSpy: jest.SpyInstance

  beforeEach(() => {
    ;(router.replace as jest.Mock).mockClear()
    ;(router.back as jest.Mock).mockClear()
    ;(profileApi.markSubscriptionPromptSeen as jest.Mock).mockClear()
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  })

  afterEach(() => { alertSpy.mockRestore() })

  it('voucher source + plan=annual → primary CTA reads "Continue with Annual"', () => {
    mockParams = {
      source: 'voucher', plan: 'annual',
      returnVoucherId: 'v1', branch: 'b1', returnMerchantId: 'm1', tab: 'vouchers',
    }
    const { getByText, queryByText } = render(<SubscribePromptScreen />)
    expect(getByText('Continue with Annual')).toBeTruthy()
    expect(queryByText('Explore full access')).toBeNull()
  })

  it('voucher source + plan=monthly → primary CTA reads "Continue with Monthly"', () => {
    mockParams = {
      source: 'voucher', plan: 'monthly',
      returnVoucherId: 'v1', branch: 'b1', returnMerchantId: 'm1', tab: 'vouchers',
    }
    const { getByText } = render(<SubscribePromptScreen />)
    expect(getByText('Continue with Monthly')).toBeTruthy()
  })

  it('voucher source → secondary CTA reads "Continue with Free Account" (not "Start with free access")', () => {
    mockParams = {
      source: 'voucher', plan: 'monthly',
      returnVoucherId: 'v1', branch: 'b1', returnMerchantId: 'm1', tab: 'vouchers',
    }
    const { getByText, queryByText } = render(<SubscribePromptScreen />)
    expect(getByText('Continue with Free Account')).toBeTruthy()
    expect(queryByText('Start with free access')).toBeNull()
  })

  it('voucher source → "Continue with Free Account" routes BACK to the voucher detail (not /(app)/), no markSubscriptionPromptSeen', async () => {
    mockParams = {
      source: 'voucher', plan: 'monthly',
      returnVoucherId: 'v1', branch: 'b1', returnMerchantId: 'm1', tab: 'vouchers',
    }
    const { getByText } = render(<SubscribePromptScreen />)
    fireEvent.press(getByText('Continue with Free Account'))
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        '/voucher/v1?branch=b1&from=merchant&returnMerchantId=m1&tab=vouchers',
      ),
    )
    // Secondary path must NOT route to Discovery in voucher-origin mode.
    expect(router.replace).not.toHaveBeenCalledWith('/(app)/')
    // Voucher-origin must NOT stamp subscriptionPromptSeenAt — user is
    // already past onboarding.
    expect(profileApi.markSubscriptionPromptSeen).not.toHaveBeenCalled()
  })

  it('voucher source — primary CTA still shows the coming-soon alert (payment stubbed), does NOT mark prompt seen, does NOT route home', () => {
    mockParams = {
      source: 'voucher', plan: 'annual',
      returnVoucherId: 'v1', branch: 'b1', returnMerchantId: 'm1', tab: 'vouchers',
    }
    const { getByText } = render(<SubscribePromptScreen />)
    fireEvent.press(getByText('Continue with Annual'))
    expect(alertSpy).toHaveBeenCalledTimes(1)
    expect(alertSpy.mock.calls[0]![0]).toBe('Coming soon')
    expect(profileApi.markSubscriptionPromptSeen).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('voucher source — missing return-context params fall back to router.back() (defensive)', () => {
    mockParams = { source: 'voucher', plan: 'monthly' }  // no returnVoucherId/branch/returnMerchantId
    const { getByText } = render(<SubscribePromptScreen />)
    fireEvent.press(getByText('Continue with Free Account'))
    expect(router.back).toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })
})
