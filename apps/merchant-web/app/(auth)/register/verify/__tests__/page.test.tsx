import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import RegisterVerifyPage from '@/app/(auth)/register/verify/page'
import { ApiError } from '@/lib/api/client'

const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace }) }))
const mockSetSession = jest.fn()
jest.mock('@/lib/auth/session', () => ({ useSession: () => ({ setSession: mockSetSession }) }))
const mockVerifyEmail = jest.fn()
const mockResend = jest.fn()
jest.mock('@/lib/api/auth', () => ({
  authApi: {
    verifyEmail: (...a: unknown[]) => mockVerifyEmail(...a),
    resendVerification: (...a: unknown[]) => mockResend(...a),
  },
}))

const KEY = 'redeemo_merchant_verify_challenge'

describe('RegisterVerifyPage (M1 Slice 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    window.sessionStorage.clear()
  })

  it('redirects to /register when there is no stashed challenge', () => {
    render(<RegisterVerifyPage />)
    expect(mockReplace).toHaveBeenCalledWith('/register')
  })

  it('verifies the code: auto-login (setSession) + replace to the portal, clearing the challenge', async () => {
    window.sessionStorage.setItem(KEY, 'vch')
    mockVerifyEmail.mockResolvedValue({ accessToken: 'at', merchant: { id: 'm', businessName: 'C', approvalStatus: 'REGISTERED' } })
    render(<RegisterVerifyPage />)
    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /verify and continue/i }))
    await waitFor(() => expect(mockVerifyEmail).toHaveBeenCalledWith({ sessionChallenge: 'vch', code: '123456' }))
    await waitFor(() => expect(mockSetSession).toHaveBeenCalledWith('at', expect.objectContaining({ id: 'm' })))
    expect(mockReplace).toHaveBeenCalledWith('/')
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it('expired/exhausted challenge: clears it and shows the back-to-sign-up state', async () => {
    window.sessionStorage.setItem(KEY, 'vch')
    mockVerifyEmail.mockRejectedValue(new ApiError(400, { error: { code: 'VERIFICATION_TOKEN_INVALID' } }))
    render(<RegisterVerifyPage />)
    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: '111111' } })
    fireEvent.click(screen.getByRole('button', { name: /verify and continue/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /back to sign up/i })).toBeInTheDocument())
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it('resend re-issues a code and starts the cooldown', async () => {
    window.sessionStorage.setItem(KEY, 'vch')
    mockResend.mockResolvedValue({ message: 'ok' })
    render(<RegisterVerifyPage />)
    fireEvent.click(screen.getByRole('button', { name: /^resend code$/i }))
    await waitFor(() => expect(mockResend).toHaveBeenCalledWith({ sessionChallenge: 'vch' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /resend code in/i })).toBeInTheDocument())
  })

  it('guards resend against a double-submit while one request is in flight', async () => {
    window.sessionStorage.setItem(KEY, 'vch')
    let resolveResend: (v: unknown) => void = () => {}
    mockResend.mockImplementation(() => new Promise((r) => { resolveResend = r }))
    render(<RegisterVerifyPage />)
    const btn = screen.getByRole('button', { name: /^resend code$/i })
    fireEvent.click(btn)
    fireEvent.click(btn) // second click while the first is still pending
    expect(mockResend).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveResend({ message: 'ok' })
    })
    await waitFor(() => expect(screen.getByRole('button', { name: /resend code in/i })).toBeInTheDocument())
  })
})
