import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Alert } from 'react-native'

jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  requestReview: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('expo-router', () => ({ useFocusEffect: (_cb: unknown) => {} }))

jest.mock('@/design-system/motion/Toast', () => ({
  useToast: jest.fn(() => ({ show: jest.fn() })),
}))

jest.mock('@/lib/config/links', () => ({
  LINKS: {
    merchantPortal: 'https://merchant.redeemo.com',
    appStoreIos: 'https://apps.apple.com/app/redeemo/id0000000000',
    appStoreAndroid: 'https://play.google.com/store/apps/details?id=com.redeemo',
  },
}))

import { RedeemoSection } from '../components/RedeemoSection'

describe('RedeemoSection', () => {
  it('shows all four rows', () => {
    render(<RedeemoSection />)
    expect(screen.getByText('Become a merchant')).toBeTruthy()
    expect(screen.getByText('Request a merchant')).toBeTruthy()
    expect(screen.getByText(/Rate Redeemo/)).toBeTruthy()
    expect(screen.getByText('Share Redeemo')).toBeTruthy()
  })

  it('tapping Request a merchant fires Alert stub (Sub-PR 2 deferred)', () => {
    const alertSpy = jest.spyOn(Alert, 'alert')
    render(<RedeemoSection />)
    fireEvent.press(screen.getByText('Request a merchant'))
    expect(alertSpy).toHaveBeenCalledWith('Coming soon', expect.any(String))
  })
})
