import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OtpPage from '@/app/(auth)/otp/page'
import { ApiError } from '@/lib/api/client'

const mockReplace = jest.fn()
let mockNextParam: string | null = null
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({ get: (k: string) => (k === 'next' ? mockNextParam : null) }),
}))

const mockSetSession = jest.fn()
jest.mock('@/lib/auth/session', () => ({ useSession: () => ({ setSession: mockSetSession }) }))

const mockVerifyOtp = jest.fn()
jest.mock('@/lib/api/auth', () => ({ authApi: { verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a) } }))

const CHALLENGE_KEY = 'redeemo_merchant_otp_challenge'

describe('OtpPage (M1 Slice 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockNextParam = null
    window.sessionStorage.clear()
  })

  it('redirects to /sign-in when there is no stashed challenge', () => {
    render(<OtpPage />)
    expect(mockReplace).toHaveBeenCalledWith('/sign-in')
  })

  it('verifies the code, clears the challenge, setSession + replace(next)', async () => {
    window.sessionStorage.setItem(CHALLENGE_KEY, 'ch-1')
    mockNextParam = '/'
    mockVerifyOtp.mockResolvedValue({ accessToken: 'at', merchant: { id: 'm', businessName: 'Co', approvalStatus: 'ACTIVE' } })
    render(<OtpPage />)
    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /verify/i }))
    await waitFor(() => expect(mockSetSession).toHaveBeenCalled())
    expect(mockVerifyOtp).toHaveBeenCalledWith({ sessionChallenge: 'ch-1', code: '123456' })
    expect(window.sessionStorage.getItem(CHALLENGE_KEY)).toBeNull()
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('strips non-digits and caps the code at 6', () => {
    window.sessionStorage.setItem(CHALLENGE_KEY, 'ch-1')
    render(<OtpPage />)
    const input = screen.getByLabelText(/6-digit code/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '12ab3456789' } })
    expect(input.value).toBe('123456')
  })

  it('expired challenge (cap reached): clears it and shows the back-to-sign-in state', async () => {
    window.sessionStorage.setItem(CHALLENGE_KEY, 'ch-1')
    mockVerifyOtp.mockRejectedValue(new ApiError(400, { error: { code: 'ACTION_TOKEN_INVALID' } }))
    render(<OtpPage />)
    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: '111111' } })
    fireEvent.click(screen.getByRole('button', { name: /verify/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /back to sign in/i })).toBeInTheDocument())
    expect(window.sessionStorage.getItem(CHALLENGE_KEY)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /back to sign in/i }))
    expect(mockReplace).toHaveBeenCalledWith('/sign-in')
  })
})
