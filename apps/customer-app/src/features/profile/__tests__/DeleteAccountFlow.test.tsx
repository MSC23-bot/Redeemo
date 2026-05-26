import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('@/lib/api/auth', () => ({
  authApi: {
    sendDeleteAccountOtp: jest.fn().mockResolvedValue({}),
    verifyDeleteAccountOtp: jest.fn().mockResolvedValue({ actionToken: 'tok123' }),
    deleteAccount: jest.fn().mockResolvedValue({}),
  },
}))

jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((selector: any) => selector({
    clearLocalAuth: jest.fn().mockResolvedValue(undefined),
  })),
}))

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}))

jest.mock('@/design-system/motion/BottomSheet', () => {
  const { View } = require('react-native')
  return {
    BottomSheet: ({ visible, children }: any) =>
      visible ? <View>{children}</View> : null,
  }
})

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

import { DeleteAccountFlow } from '../components/DeleteAccountFlow'

describe('DeleteAccountFlow', () => {
  it('shows warning stage with consequences', () => {
    renderWithClient(<DeleteAccountFlow visible onDismiss={jest.fn()} />)
    expect(screen.getByText('Delete account?')).toBeTruthy()
    expect(screen.getByText('Send verification code')).toBeTruthy()
    expect(screen.getByText('Keep my account')).toBeTruthy()
  })

  it('calls sendDeleteAccountOtp and moves to otp stage', async () => {
    const { authApi } = require('@/lib/api/auth')
    renderWithClient(<DeleteAccountFlow visible onDismiss={jest.fn()} />)
    await act(async () => {
      fireEvent.press(screen.getByText('Send verification code'))
    })
    expect(authApi.sendDeleteAccountOtp).toHaveBeenCalled()
    expect(screen.getByText('Enter verification code')).toBeTruthy()
  })

  // Regression pin for the stale-closure bug: handleOtpComplete used to read
  // a captured `actionToken` from the prior render (always null), so
  // confirmDelete never ran and the account was never deleted. Now verifyOtp
  // returns the token synchronously and DeleteAccountFlow threads it
  // directly into confirmDelete(token). If anyone reverts to the
  // `if (actionToken) await confirmDelete()` pattern, this test fails.
  it('threads actionToken from verifyOtp into deleteAccount (no stale closure)', async () => {
    const { authApi } = require('@/lib/api/auth')
    authApi.verifyDeleteAccountOtp.mockResolvedValueOnce({ actionToken: 'tok-fresh' })
    authApi.deleteAccount.mockResolvedValueOnce({})

    renderWithClient(<DeleteAccountFlow visible onDismiss={jest.fn()} />)

    await act(async () => {
      fireEvent.press(screen.getByText('Send verification code'))
    })

    const otpInput = screen.getByPlaceholderText('• • • • • •')
    await act(async () => {
      fireEvent.changeText(otpInput, '123456')
    })

    expect(authApi.verifyDeleteAccountOtp).toHaveBeenCalledWith('123456')
    expect(authApi.deleteAccount).toHaveBeenCalledWith('tok-fresh')
  })
})
