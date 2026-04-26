import { renderHook, act } from '@testing-library/react-native'
import { useLoginFlow } from '@/features/auth/hooks/useLoginFlow'
import { authApi } from '@/lib/api/auth'
import { router } from 'expo-router'

jest.mock('@/lib/api/auth')
jest.mock('@/stores/auth', () => ({ useAuthStore: jest.fn((sel: any) => sel({ setTokens: jest.fn() })) }))
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))
jest.mock('@/design-system/motion/Toast', () => ({ useToast: () => ({ show: jest.fn() }) }))

describe('useLoginFlow', () => {
  it('routes unverified accounts to verify-email', async () => {
    ;(authApi.login as jest.Mock).mockRejectedValueOnce({ code: 'ACCOUNT_NOT_VERIFIED', status: 403 })
    const { result } = renderHook(() => useLoginFlow())
    await act(async () => { await result.current.submit({ email: 'a@x.com', password: 'Passw0rd!' }) })
    expect(router.replace).toHaveBeenCalledWith('/(auth)/verify-email')
  })
})
