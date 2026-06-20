import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SignInPage from '@/app/(auth)/sign-in/page'
import { ApiError } from '@/lib/api/client'

const mockPush = jest.fn()
const mockReplace = jest.fn()
let mockNextParam: string | null = null
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => ({ get: (k: string) => (k === 'next' ? mockNextParam : null) }),
}))

const mockSetSession = jest.fn()
jest.mock('@/lib/auth/session', () => ({ useSession: () => ({ setSession: mockSetSession }) }))

const mockLogin = jest.fn()
jest.mock('@/lib/api/auth', () => ({ authApi: { login: (...a: unknown[]) => mockLogin(...a) } }))

jest.mock('@/lib/auth/deviceId', () => ({ getOrCreateDeviceId: () => 'dev-uuid' }))

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'owner@merchant.test' } })
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'pw' } })
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
}

describe('SignInPage (M1 Slice 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockNextParam = null
    window.sessionStorage.clear()
  })

  it('OTP_REQUIRED: stashes the challenge and routes to /otp (carrying next)', async () => {
    mockNextParam = '/foundations'
    mockLogin.mockResolvedValue({ status: 'OTP_REQUIRED', sessionChallenge: 'ch-1' })
    render(<SignInPage />)
    fillAndSubmit()
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/otp')))
    expect(mockPush.mock.calls[0][0]).toContain('next=%2Ffoundations')
    expect(window.sessionStorage.getItem('redeemo_merchant_otp_challenge')).toBe('ch-1')
    expect(mockSetSession).not.toHaveBeenCalled()
  })

  it('recognised device (tokens): setSession + replace(next)', async () => {
    mockNextParam = '/foundations'
    mockLogin.mockResolvedValue({ accessToken: 'at', merchant: { id: 'm', businessName: 'Co', approvalStatus: 'ACTIVE' } })
    render(<SignInPage />)
    fillAndSubmit()
    await waitFor(() => expect(mockSetSession).toHaveBeenCalledWith('at', expect.objectContaining({ id: 'm' })))
    expect(mockReplace).toHaveBeenCalledWith('/foundations')
  })

  it('ignores an open-redirect next and falls back to /', async () => {
    mockNextParam = '//evil.com'
    mockLogin.mockResolvedValue({ accessToken: 'at', merchant: { id: 'm', businessName: 'Co', approvalStatus: 'ACTIVE' } })
    render(<SignInPage />)
    fillAndSubmit()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  })

  it('surfaces the friendly error message on a failed sign-in', async () => {
    mockLogin.mockRejectedValue(new ApiError(401, { error: { code: 'INVALID_CREDENTIALS' } }))
    render(<SignInPage />)
    fillAndSubmit()
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/email or password/i))
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
