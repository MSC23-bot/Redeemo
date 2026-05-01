import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { VerifyEmailScreen } from '@/features/auth/screens/VerifyEmailScreen'
import { authApi } from '@/lib/api/auth'

jest.mock('@/lib/api/auth')
jest.mock('@/features/auth/hooks/useVerifyEmail', () => ({ useVerifyEmail: () => {} }))
const mockSignOut = jest.fn().mockResolvedValue(undefined)
jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((sel: any) =>
    sel({
      user: { email: 'test@x.com', firstName: 'Ada', lastName: 'L', phone: '+447700900000' },
      signOut: mockSignOut,
    })
  ),
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }))
let mockParams: Record<string, string | undefined> = {}
jest.mock('expo-router', () => {
  const back = jest.fn()
  const replace = jest.fn()
  return {
    useRouter: () => ({ back, replace }),
    router: { back, replace },
    useLocalSearchParams: () => mockParams,
  }
})
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { router: mockRouter } = require('expo-router') as { router: { back: jest.Mock; replace: jest.Mock } }

beforeEach(() => { mockParams = {} })

describe('VerifyEmailScreen', () => {
  it('renders inline success content — heading, email from user, caveat', () => {
    const { getByText } = render(<VerifyEmailScreen />)
    expect(getByText('Verify your email')).toBeTruthy()
    expect(getByText('test@x.com')).toBeTruthy()
    expect(getByText(/Check your spam folder if you don.t see it/)).toBeTruthy()
  })

  it('prefers email from route params (pre-auth login redirect)', () => {
    mockParams = { email: 'param@x.com' }
    const { getByText, queryByText } = render(<VerifyEmailScreen />)
    expect(getByText('param@x.com')).toBeTruthy()
    expect(queryByText('test@x.com')).toBeNull()
  })

  it('disables resend button while countdown is active after tap', async () => {
    ;(authApi.resendEmailVerification as jest.Mock).mockResolvedValue({ ok: true })
    const { getByLabelText } = render(<VerifyEmailScreen />)
    const btn = getByLabelText('Resend email')
    fireEvent.press(btn)
    await waitFor(() => {
      expect(getByLabelText('Resend email').props.accessibilityState?.disabled).toBe(true)
    })
  })

  it('back button signs out and navigates to register with pre-filled params', async () => {
    mockSignOut.mockClear()
    mockRouter.replace.mockClear()
    const { getByLabelText } = render(<VerifyEmailScreen />)
    fireEvent.press(getByLabelText('Go back'))
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled()
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/(auth)/register',
        params: { firstName: 'Ada', lastName: 'L', email: 'test@x.com', phone: '+447700900000' },
      })
    })
  })

  it('"use a different account" signs out and navigates to welcome', async () => {
    mockSignOut.mockClear()
    mockRouter.replace.mockClear()
    const { getByLabelText } = render(<VerifyEmailScreen />)
    fireEvent.press(getByLabelText('Use a different account'))
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled()
      expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/welcome')
    })
  })

  it('surfaces resend failure via inline error (no toast)', async () => {
    ;(authApi.resendEmailVerification as jest.Mock).mockRejectedValue(
      Object.assign(new Error('boom'), { code: 'NETWORK_ERROR' }),
    )
    const { getByLabelText, findByText } = render(<VerifyEmailScreen />)
    fireEvent.press(getByLabelText('Resend email'))
    expect(await findByText(/Connection lost/)).toBeTruthy()
  })
})
