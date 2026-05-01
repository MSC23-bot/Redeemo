import { renderHook, act } from '@testing-library/react-native'
import { useRegisterFlow } from '@/features/auth/hooks/useRegisterFlow'
import { authApi } from '@/lib/api/auth'
jest.mock('@/lib/api/auth')
jest.mock('@/stores/auth', () => ({ useAuthStore: jest.fn((sel: any) => sel({ setTokens: jest.fn() })) }))
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))
jest.mock('@/design-system/motion/Toast', () => ({ useToast: () => ({ show: jest.fn() }) }))

describe('useRegisterFlow', () => {
  it('surfaces EMAIL_ALREADY_EXISTS as a field-level error on email', async () => {
    ;(authApi.register as jest.Mock).mockRejectedValueOnce({ code: 'EMAIL_ALREADY_EXISTS', status: 409, field: 'email' })
    const { result } = renderHook(() => useRegisterFlow())
    await act(async () => {
      await result.current.submit({ firstName: 'Ada', lastName: 'L', email: 'ada@x.com', password: 'Passw0rd!!', phone: '+447700900000' })
    })
    expect(result.current.fieldErrors.email).toEqual({
      code: 'EMAIL_ALREADY_EXISTS',
      message: 'This email is already registered.',
    })
  })
})
