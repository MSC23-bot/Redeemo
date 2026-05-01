import { renderHook, act } from '@testing-library/react-native'
import { useLoginFlow } from '@/features/auth/hooks/useLoginFlow'
import { authApi } from '@/lib/api/auth'
import { profileApi } from '@/lib/api/profile'
import { router } from 'expo-router'

jest.mock('@/lib/api/auth')
jest.mock('@/lib/api/profile')
jest.mock('@/lib/api', () => ({
  setTokens: jest.fn(),
  ApiClientError: class ApiClientError extends Error {
    code: string
    field?: string
    constructor(code: string, message?: string, field?: string) {
      super(message ?? code); this.code = code
      if (field !== undefined) this.field = field
    }
  },
}))
jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((sel: any) =>
    sel({
      setTokens: jest.fn().mockResolvedValue(undefined),
      markProfileCompletion: jest.fn().mockResolvedValue(undefined),
      updateOnboarding: jest.fn().mockResolvedValue(undefined),
    }),
  ),
}))
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))

const meBase = {
  id: 'u1',
  firstName: 'Ada',
  lastName: null,
  email: 'a@x.com',
  phone: '+447700900000',
  profileImageUrl: null,
  dateOfBirth: null,
  gender: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  postcode: null,
  newsletterConsent: false,
  emailVerified: true,
  phoneVerified: true,
  interests: [],
  profileCompleteness: 100,
  createdAt: '2026-04-23T00:00:00.000Z',
}

describe('useLoginFlow', () => {
  beforeEach(() => {
    ;(router.replace as jest.Mock).mockClear()
  })

  it('does not redirect when email is unverified (email verification is no longer a login gate; resolveRedirect handles it)', async () => {
    ;(authApi.login as jest.Mock).mockResolvedValueOnce({ accessToken: 'at', refreshToken: 'rt', user: { id: 'u1' } })
    ;(profileApi.getMe as jest.Mock).mockResolvedValue({ ...meBase, emailVerified: false, phoneVerified: true })
    const { result } = renderHook(() => useLoginFlow())
    await act(async () => { await result.current.submit({ email: 'a@x.com', password: 'Passw0rd!' }) })
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('does not explicitly navigate when phoneVerified is false — resolveRedirect in AuthLayout owns routing', async () => {
    ;(authApi.login as jest.Mock).mockResolvedValueOnce({ accessToken: 'at', refreshToken: 'rt', user: { id: 'u1' } })
    ;(profileApi.getMe as jest.Mock).mockResolvedValueOnce({ ...meBase, phoneVerified: false })
    const { result } = renderHook(() => useLoginFlow())
    await act(async () => { await result.current.submit({ email: 'a@x.com', password: 'Passw0rd!' }) })
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('does not redirect when phoneVerified is true', async () => {
    ;(authApi.login as jest.Mock).mockResolvedValueOnce({ accessToken: 'at', refreshToken: 'rt', user: { id: 'u1' } })
    ;(profileApi.getMe as jest.Mock).mockResolvedValueOnce({ ...meBase, phoneVerified: true })
    const { result } = renderHook(() => useLoginFlow())
    await act(async () => { await result.current.submit({ email: 'a@x.com', password: 'Passw0rd!' }) })
    expect(router.replace).not.toHaveBeenCalled()
  })
})
