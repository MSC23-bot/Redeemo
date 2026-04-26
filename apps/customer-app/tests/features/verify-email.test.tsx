import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { VerifyEmailScreen } from '@/features/auth/screens/VerifyEmailScreen'
import { authApi } from '@/lib/api/auth'

jest.mock('@/lib/api/auth')
jest.mock('@/features/auth/hooks/useVerifyEmail', () => ({ useVerifyEmail: () => {} }))
jest.mock('@/stores/auth', () => ({ useAuthStore: jest.fn((sel: any) => sel({ user: { email: 'test@x.com' }, signOut: jest.fn() })) }))
jest.mock('@/design-system/motion/Toast', () => ({ useToast: () => ({ show: jest.fn() }) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }))
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }), router: { back: jest.fn() } }))

describe('VerifyEmailScreen', () => {
  it('disables resend button while countdown is active after tap', async () => {
    ;(authApi.resendEmailVerification as jest.Mock).mockResolvedValue({ ok: true })
    const { getByText } = render(<VerifyEmailScreen />)
    fireEvent.press(getByText('Resend email'))
    await waitFor(() => expect(getByText('Resend email').parent?.props.accessibilityState?.disabled).toBe(true))
  })
})
