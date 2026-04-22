import React from 'react'
import { render } from '@testing-library/react-native'
import { ResetPasswordScreen } from '@/features/auth/screens/ResetPasswordScreen'

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}))
jest.mock('@/design-system/motion/Toast', () => ({ useToast: () => ({ show: jest.fn() }) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }))

describe('ResetPasswordScreen', () => {
  it('shows error state when token param is missing', () => {
    const { getByText } = render(<ResetPasswordScreen />)
    expect(getByText(/link expired/i)).toBeTruthy()
    expect(getByText(/request a new reset link/i)).toBeTruthy()
  })
})
