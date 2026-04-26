import { renderHook, act } from '@testing-library/react-native'
import { usePhoneVerify } from '@/features/auth/hooks/usePhoneVerify'
import { authApi } from '@/lib/api/auth'

jest.mock('@/lib/api/auth')
jest.mock('@/stores/auth', () => ({ useAuthStore: jest.fn((sel: any) => sel({ syncVerificationState: jest.fn(), markPhoneVerifiedOnce: jest.fn() })) }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }))
jest.mock('@/design-system/haptics', () => ({ haptics: { success: jest.fn(), warning: jest.fn() } }))

describe('usePhoneVerify', () => {
  it('surfaces OTP_INVALID as error', async () => {
    ;(authApi.confirmPhoneOtp as jest.Mock).mockRejectedValueOnce({ code: 'OTP_INVALID', status: 400 })
    const { result } = renderHook(() => usePhoneVerify())
    await act(async () => { await result.current.verify('123456') })
    expect(result.current.error).toMatch(/incorrect/i)
  })
})
