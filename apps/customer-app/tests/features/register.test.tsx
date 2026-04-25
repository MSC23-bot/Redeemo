import { renderHook, act } from '@testing-library/react-native'
import { useRegisterFlow } from '@/features/auth/hooks/useRegisterFlow'
import { authApi } from '@/lib/api/auth'
jest.mock('@/lib/api/auth')
jest.mock('@/stores/auth', () => ({ useAuthStore: jest.fn((sel: any) => sel({ setTokens: jest.fn() })) }))
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))
jest.mock('@/design-system/motion/Toast', () => ({ useToast: () => ({ show: jest.fn() }) }))

describe('useRegisterFlow', () => {
  it('surfaces EMAIL_TAKEN as a field-level error on email', async () => {
    ;(authApi.register as jest.Mock).mockRejectedValueOnce({ code: 'EMAIL_TAKEN', status: 409 })
    const { result } = renderHook(() => useRegisterFlow())
    await act(async () => {
      await result.current.submit({ firstName: 'Ada', lastName: 'L', email: 'ada@x.com', password: 'Passw0rd!!', phone: '+447700900000' })
    })
    expect(result.current.fieldErrors.email).toBe('That email is already in use.')
  })
})
